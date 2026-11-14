-- =====================================================================
-- Warung Sembako: skema database
-- Jalankan seluruh file ini di Supabase > SQL Editor (sekali saja).
-- Semua stok disimpan dalam SATUAN DASAR produk (pcs, liter, gram, batang).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Pengguna & peran
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'kasir' check (role in ('owner', 'kasir')),
  created_at timestamptz not null default now()
);

-- Pengguna pertama otomatis jadi owner, berikutnya kasir.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles) then 'kasir' else 'owner' end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'owner');
$$;

-- ---------------------------------------------------------------------
-- Master barang
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid references public.categories (id) on delete set null,
  base_unit text not null default 'pcs',          -- pcs, liter, gram, batang, galon, tabung
  allow_decimal boolean not null default false,    -- true untuk bensin, beras curah, dll.
  stock numeric(14, 3) not null default 0,
  min_stock numeric(14, 3) not null default 0,
  cost_price numeric(14, 2) not null default 0,    -- harga modal rata-rata per satuan dasar
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Satuan jual. Satu produk bisa dijual dalam beberapa satuan/varian:
--   Rokok: Batang (konversi 1), Bungkus (16), Slop (160)
--   Gas 3kg: Tukar tabung (1, kembalikan 1 tabung kosong), Tabung baru (1)
create table if not exists public.product_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null,
  conversion numeric(14, 3) not null default 1 check (conversion > 0),
  price numeric(14, 2) not null check (price >= 0),
  barcode text unique,
  -- Jika diisi: setiap 1 satuan terjual, stok produk ini BERTAMBAH 1
  -- (dipakai untuk tabung gas / galon kosong yang ditukar pelanggan).
  returns_product_id uuid references public.products (id) on delete set null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists product_units_product_idx on public.product_units (product_id);

-- ---------------------------------------------------------------------
-- Pelanggan & kasbon
-- ---------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  debt_balance numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Penjualan
-- ---------------------------------------------------------------------
create sequence if not exists public.invoice_seq;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'expired')),
  payment_method text not null check (payment_method in ('cash', 'qris', 'kasbon')),
  total numeric(14, 2) not null default 0,
  cash_received numeric(14, 2),
  change_amount numeric(14, 2),
  customer_id uuid references public.customers (id) on delete set null,
  midtrans_order_id text unique,
  qr_url text,
  cashier_id uuid references auth.users (id),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists sales_created_idx on public.sales (created_at desc);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  -- Kosong jika barangnya sudah dihapus; nama/satuan/harga/modal tetap tersimpan di baris ini.
  product_id uuid references public.products (id) on delete set null,
  product_unit_id uuid references public.product_units (id) on delete set null,
  product_name text not null,
  unit_name text not null,
  qty numeric(14, 3) not null check (qty > 0),
  conversion numeric(14, 3) not null,
  price numeric(14, 2) not null,
  subtotal numeric(14, 2) not null,
  cost_total numeric(14, 2) not null default 0,   -- diisi saat transaksi lunas
  returns_product_id uuid
);
create index if not exists sale_items_sale_idx on public.sale_items (sale_id);

-- ---------------------------------------------------------------------
-- Riwayat stok (setiap perubahan stok tercatat di sini)
-- ---------------------------------------------------------------------
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  qty_change numeric(14, 3) not null,
  stock_after numeric(14, 3) not null,
  type text not null check (type in ('in', 'sale', 'adjust', 'container_return')),
  unit_cost numeric(14, 2),
  sale_id uuid references public.sales (id) on delete set null,
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id, created_at desc);

-- =====================================================================
-- Row Level Security
-- Penjualan, stok, dan kasbon TIDAK boleh ditulis langsung dari browser:
-- semuanya lewat fungsi RPC di bawah supaya selalu konsisten.
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_units enable row level security;
alter table public.customers enable row level security;
alter table public.debt_payments enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "profil sendiri atau owner" on public.profiles;
create policy "profil sendiri atau owner" on public.profiles
  for select using (id = auth.uid() or public.is_owner());

drop policy if exists "baca kategori" on public.categories;
create policy "baca kategori" on public.categories for select using (public.is_member());
drop policy if exists "owner kelola kategori" on public.categories;
create policy "owner kelola kategori" on public.categories for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "baca produk" on public.products;
create policy "baca produk" on public.products for select using (public.is_member());
drop policy if exists "owner tambah produk" on public.products;
create policy "owner tambah produk" on public.products for insert with check (public.is_owner());
drop policy if exists "owner ubah produk" on public.products;
create policy "owner ubah produk" on public.products for update
  using (public.is_owner()) with check (public.is_owner());
-- Hapus barang: riwayat penjualan tetap utuh karena sale_items menyimpan salinan nama, harga, dan modal.
drop policy if exists "owner hapus produk" on public.products;
create policy "owner hapus produk" on public.products for delete using (public.is_owner());

-- Tolak hapus barang yang masih ada di transaksi QRIS belum dibayar (stoknya akan dikurangi saat lunas).
create or replace function public.guard_product_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.sale_items i join public.sales s on s.id = i.sale_id
    where i.product_id = old.id and s.status = 'pending'
  ) then
    raise exception '% masih ada di transaksi QRIS yang belum dibayar. Selesaikan atau batalkan dulu.', old.name;
  end if;
  return old;
end $$;

drop trigger if exists guard_product_delete on public.products;
create trigger guard_product_delete before delete on public.products
  for each row execute function public.guard_product_delete();

drop policy if exists "baca satuan" on public.product_units;
create policy "baca satuan" on public.product_units for select using (public.is_member());
drop policy if exists "owner kelola satuan" on public.product_units;
create policy "owner kelola satuan" on public.product_units for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "baca pelanggan" on public.customers;
create policy "baca pelanggan" on public.customers for select using (public.is_member());
drop policy if exists "tambah pelanggan" on public.customers;
create policy "tambah pelanggan" on public.customers for insert
  with check (public.is_member() and debt_balance = 0);

drop policy if exists "baca pembayaran kasbon" on public.debt_payments;
create policy "baca pembayaran kasbon" on public.debt_payments for select using (public.is_member());

drop policy if exists "baca penjualan" on public.sales;
create policy "baca penjualan" on public.sales for select using (public.is_member());
drop policy if exists "baca item penjualan" on public.sale_items;
create policy "baca item penjualan" on public.sale_items for select using (public.is_member());
drop policy if exists "baca riwayat stok" on public.stock_movements;
create policy "baca riwayat stok" on public.stock_movements for select using (public.is_member());

-- Harga modal & laba hanya untuk owner: kolom cost dibaca lewat RPC laporan.
revoke select on public.products from anon, authenticated;
grant select (id, name, category_id, base_unit, allow_decimal, stock, min_stock, is_active, created_at)
  on public.products to authenticated;

-- =====================================================================
-- Fungsi transaksi
-- =====================================================================

-- Menyelesaikan penjualan: kurangi stok, catat riwayat, tambah tabung/galon kosong.
-- Hanya dipanggil oleh create_sale (tunai/kasbon) atau server Midtrans (QRIS).
create or replace function public.finalize_sale(p_sale_id uuid)
returns public.sales language plpgsql security definer set search_path = public as $$
declare
  v_sale public.sales;
  v_item record;
  v_base numeric;
  v_new_stock numeric;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;
  if v_sale.status = 'paid' then return v_sale; end if;   -- idempoten (webhook bisa datang 2x)
  if v_sale.status <> 'pending' then raise exception 'Transaksi sudah %', v_sale.status; end if;

  for v_item in select * from public.sale_items where sale_id = p_sale_id loop
    v_base := v_item.qty * v_item.conversion;

    update public.products set stock = stock - v_base
      where id = v_item.product_id
      returning stock into v_new_stock;

    update public.sale_items
      set cost_total = round(v_base * (select cost_price from public.products where id = v_item.product_id), 2)
      where id = v_item.id;

    insert into public.stock_movements (product_id, qty_change, stock_after, type, sale_id, created_by)
    values (v_item.product_id, -v_base, v_new_stock, 'sale', p_sale_id, v_sale.cashier_id);

    if v_item.returns_product_id is not null then
      update public.products set stock = stock + v_item.qty
        where id = v_item.returns_product_id
        returning stock into v_new_stock;
      insert into public.stock_movements (product_id, qty_change, stock_after, type, sale_id, note, created_by)
      values (v_item.returns_product_id, v_item.qty, v_new_stock, 'container_return', p_sale_id,
              'Tukar dari pelanggan', v_sale.cashier_id);
    end if;
  end loop;

  if v_sale.payment_method = 'kasbon' then
    update public.customers set debt_balance = debt_balance + v_sale.total where id = v_sale.customer_id;
  end if;

  update public.sales set status = 'paid', paid_at = now() where id = p_sale_id returning * into v_sale;
  return v_sale;
end $$;

revoke execute on function public.finalize_sale(uuid) from public, anon, authenticated;

-- Membuat penjualan dari keranjang kasir.
-- p_items: [{ "unit_id": uuid, "qty": number }] atau [{ "unit_id": uuid, "amount": number }]
--   "amount" = beli berdasarkan nominal rupiah (bensin Rp10.000), hanya untuk produk desimal.
-- Harga selalu diambil dari database, bukan dari browser.
create or replace function public.create_sale(
  p_items jsonb,
  p_method text,
  p_customer_id uuid default null,
  p_cash_received numeric default null
) returns public.sales language plpgsql security definer set search_path = public as $$
declare
  v_sale public.sales;
  v_line jsonb;
  v_unit record;
  v_qty numeric;
  v_subtotal numeric;
  v_total numeric := 0;
  v_need record;
begin
  if not public.is_member() then raise exception 'Tidak punya akses'; end if;
  if p_method not in ('cash', 'qris', 'kasbon') then raise exception 'Metode bayar tidak dikenal'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang kosong';
  end if;
  if p_method = 'kasbon' and p_customer_id is null then
    raise exception 'Pilih pelanggan untuk kasbon';
  end if;

  insert into public.sales (invoice_no, payment_method, customer_id, cashier_id)
  values (
    'INV-' || to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD') || '-' || lpad(nextval('public.invoice_seq')::text, 5, '0'),
    p_method, p_customer_id, auth.uid()
  ) returning * into v_sale;

  for v_line in select * from jsonb_array_elements(p_items) loop
    select u.id, u.name as unit_name, u.conversion, u.price, u.returns_product_id,
           p.id as product_id, p.name as product_name, p.allow_decimal, p.is_active
      into v_unit
      from public.product_units u join public.products p on p.id = u.product_id
      where u.id = (v_line ->> 'unit_id')::uuid;
    if not found or not v_unit.is_active then raise exception 'Barang tidak ditemukan atau nonaktif'; end if;

    if v_line ? 'amount' then
      if not v_unit.allow_decimal then raise exception '% tidak bisa dibeli per nominal', v_unit.product_name; end if;
      if v_unit.price <= 0 then raise exception 'Harga % belum diisi', v_unit.product_name; end if;
      v_subtotal := round((v_line ->> 'amount')::numeric, 0);
      v_qty := round(v_subtotal / v_unit.price, 3);
    else
      v_qty := (v_line ->> 'qty')::numeric;
      if not v_unit.allow_decimal and v_qty <> trunc(v_qty) then
        raise exception 'Jumlah % harus bilangan bulat', v_unit.product_name;
      end if;
      v_subtotal := round(v_qty * v_unit.price, 0);
    end if;
    if v_qty is null or v_qty <= 0 then raise exception 'Jumlah % tidak valid', v_unit.product_name; end if;

    insert into public.sale_items (sale_id, product_id, product_unit_id, product_name, unit_name,
                                   qty, conversion, price, subtotal, returns_product_id)
    values (v_sale.id, v_unit.product_id, v_unit.id, v_unit.product_name, v_unit.unit_name,
            v_qty, v_unit.conversion, v_unit.price, v_subtotal, v_unit.returns_product_id);
    v_total := v_total + v_subtotal;
  end loop;

  -- Cek stok cukup (dijumlahkan per produk, karena satu produk bisa beda satuan di keranjang)
  for v_need in
    select i.product_id, i.product_name, sum(i.qty * i.conversion) as need, p.stock, p.base_unit
      from public.sale_items i join public.products p on p.id = i.product_id
      where i.sale_id = v_sale.id
      group by i.product_id, i.product_name, p.stock, p.base_unit
  loop
    if v_need.need > v_need.stock then
      raise exception 'Stok % tidak cukup (sisa % %)', v_need.product_name, trim_scale(v_need.stock), v_need.base_unit;
    end if;
  end loop;

  if p_method = 'cash' then
    if p_cash_received is null or p_cash_received < v_total then
      raise exception 'Uang diterima kurang dari total';
    end if;
    update public.sales set total = v_total, cash_received = p_cash_received,
           change_amount = p_cash_received - v_total
      where id = v_sale.id;
  else
    update public.sales set total = v_total where id = v_sale.id;
  end if;

  if p_method in ('cash', 'kasbon') then
    v_sale := public.finalize_sale(v_sale.id);
  else
    select * into v_sale from public.sales where id = v_sale.id;
  end if;
  return v_sale;
end $$;

grant execute on function public.create_sale(jsonb, text, uuid, numeric) to authenticated;

-- Barang masuk dari supplier. p_qty dalam satuan dasar, p_unit_cost per satuan dasar.
-- Harga modal dihitung ulang dengan rata-rata tertimbang.
create or replace function public.stock_in(
  p_product_id uuid, p_qty numeric, p_unit_cost numeric, p_note text default null
) returns public.products language plpgsql security definer set search_path = public as $$
declare v_p public.products;
begin
  if not public.is_member() then raise exception 'Tidak punya akses'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'Harga beli tidak valid'; end if;

  select * into v_p from public.products where id = p_product_id for update;
  if not found then raise exception 'Produk tidak ditemukan'; end if;

  update public.products set
    cost_price = case
      when greatest(v_p.stock, 0) + p_qty = 0 then p_unit_cost
      else round((greatest(v_p.stock, 0) * v_p.cost_price + p_qty * p_unit_cost) / (greatest(v_p.stock, 0) + p_qty), 2)
    end,
    stock = stock + p_qty
  where id = p_product_id returning * into v_p;

  insert into public.stock_movements (product_id, qty_change, stock_after, type, unit_cost, note, created_by)
  values (p_product_id, p_qty, v_p.stock, 'in', p_unit_cost, p_note, auth.uid());
  return v_p;
end $$;
grant execute on function public.stock_in(uuid, numeric, numeric, text) to authenticated;

-- Stok opname: set stok ke hasil hitung fisik (owner saja).
create or replace function public.stock_adjust(
  p_product_id uuid, p_new_stock numeric, p_note text default null
) returns public.products language plpgsql security definer set search_path = public as $$
declare v_p public.products; v_old numeric;
begin
  if not public.is_owner() then raise exception 'Hanya owner yang bisa stok opname'; end if;
  if p_new_stock is null or p_new_stock < 0 then raise exception 'Stok tidak valid'; end if;
  select stock into v_old from public.products where id = p_product_id for update;
  if not found then raise exception 'Produk tidak ditemukan'; end if;
  update public.products set stock = p_new_stock where id = p_product_id returning * into v_p;
  insert into public.stock_movements (product_id, qty_change, stock_after, type, note, created_by)
  values (p_product_id, p_new_stock - v_old, p_new_stock, 'adjust', coalesce(p_note, 'Stok opname'), auth.uid());
  return v_p;
end $$;
grant execute on function public.stock_adjust(uuid, numeric, text) to authenticated;

-- Pelanggan membayar (sebagian) kasbon.
create or replace function public.pay_debt(
  p_customer_id uuid, p_amount numeric, p_note text default null
) returns public.customers language plpgsql security definer set search_path = public as $$
declare v_c public.customers;
begin
  if not public.is_member() then raise exception 'Tidak punya akses'; end if;
  select * into v_c from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Pelanggan tidak ditemukan'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;
  if p_amount > v_c.debt_balance then raise exception 'Nominal melebihi sisa kasbon'; end if;
  insert into public.debt_payments (customer_id, amount, note, created_by)
  values (p_customer_id, p_amount, p_note, auth.uid());
  update public.customers set debt_balance = debt_balance - p_amount where id = p_customer_id returning * into v_c;
  return v_c;
end $$;
grant execute on function public.pay_debt(uuid, numeric, text) to authenticated;

-- Membatalkan transaksi QRIS yang belum dibayar.
create or replace function public.cancel_pending_sale(p_sale_id uuid, p_status text default 'cancelled')
returns public.sales language plpgsql security definer set search_path = public as $$
declare v_sale public.sales;
begin
  if p_status not in ('cancelled', 'expired') then raise exception 'Status tidak valid'; end if;
  update public.sales set status = p_status
    where id = p_sale_id and status = 'pending'
    returning * into v_sale;
  if not found then select * into v_sale from public.sales where id = p_sale_id; end if;
  return v_sale;
end $$;
revoke execute on function public.cancel_pending_sale(uuid, text) from public, anon, authenticated;

-- Harga modal per produk (owner saja), untuk halaman produk.
create or replace function public.product_costs()
returns table (product_id uuid, cost_price numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Hanya owner'; end if;
  return query select p.id, p.cost_price from public.products p;
end $$;
grant execute on function public.product_costs() to authenticated;

-- Laporan untuk owner. Tanggal dalam zona Asia/Jakarta, p_to inklusif.
create or replace function public.report(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_start timestamptz := (p_from::timestamp at time zone 'Asia/Jakarta');
  v_end timestamptz := ((p_to + 1)::timestamp at time zone 'Asia/Jakarta');
  v_result jsonb;
begin
  if not public.is_owner() then raise exception 'Laporan hanya untuk owner'; end if;

  with paid as (
    select * from public.sales where status = 'paid' and paid_at >= v_start and paid_at < v_end
  ), items as (
    select i.* from public.sale_items i join paid s on s.id = i.sale_id
  )
  select jsonb_build_object(
    'omzet', coalesce((select sum(total) from paid), 0),
    'modal', coalesce((select sum(cost_total) from items), 0),
    'transaksi', (select count(*) from paid),
    'per_metode', coalesce((select jsonb_object_agg(payment_method, jumlah) from
        (select payment_method, sum(total) as jumlah from paid group by payment_method) m), '{}'::jsonb),
    'harian', coalesce((select jsonb_agg(d order by d.tanggal) from (
        select (p.paid_at at time zone 'Asia/Jakarta')::date as tanggal,
               sum(p.total) as omzet,
               sum((select coalesce(sum(cost_total), 0) from public.sale_items x where x.sale_id = p.id)) as modal
        from paid p group by 1) d), '[]'::jsonb),
    'terlaris', coalesce((select jsonb_agg(t) from (
        select product_name, sum(qty * conversion) as qty_dasar, sum(subtotal) as omzet,
               sum(subtotal - cost_total) as laba
        from items group by product_id, product_name
        order by sum(subtotal) desc limit 10) t), '[]'::jsonb),
    'kasbon_beredar', (select coalesce(sum(debt_balance), 0) from public.customers)
  ) into v_result;
  return v_result;
end $$;
grant execute on function public.report(date, date) to authenticated;
