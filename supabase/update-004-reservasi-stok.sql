-- Update untuk database yang sudah menjalankan schema.sql versi sebelumnya.
-- Jalankan sekali di Supabase > SQL Editor. Aman dijalankan ulang.
-- Mencegah stok minus: produk dikunci saat dicek, dan barang di tagihan QRIS
-- yang belum dibayar dihitung sebagai stok yang sudah dipesan.

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

  -- Kunci baris produk (urut id supaya tidak deadlock): dua kasir yang menjual barang yang sama
  -- harus antre, jadi barang terakhir tidak bisa terjual dua kali.
  perform 1 from public.products
    where id in (select product_id from public.sale_items where sale_id = v_sale.id)
    order by id for update;

  -- Cek stok cukup (dijumlahkan per produk, karena satu produk bisa beda satuan di keranjang).
  -- Barang di tagihan QRIS lain yang belum dibayar ikut dihitung sebagai "dipesan": stoknya baru
  -- dipotong saat lunas, dan pembayaran yang sudah masuk tidak boleh ditolak. QR berlaku 15 menit,
  -- jadi tagihan yang lebih tua dari 20 menit dianggap kedaluwarsa walau webhook belum datang.
  for v_need in
    select i.product_id, i.product_name, sum(i.qty * i.conversion) as need, p.stock, p.base_unit,
           (select coalesce(sum(o.qty * o.conversion), 0)
              from public.sale_items o join public.sales os on os.id = o.sale_id
              where o.product_id = i.product_id and os.status = 'pending' and os.id <> v_sale.id
                and os.created_at > now() - interval '20 minutes') as reserved
      from public.sale_items i join public.products p on p.id = i.product_id
      where i.sale_id = v_sale.id
      group by i.product_id, i.product_name, p.stock, p.base_unit
  loop
    if v_need.need > v_need.stock - v_need.reserved then
      if v_need.reserved > 0 then
        raise exception 'Stok % tidak cukup (sisa % %, % % menunggu pembayaran QRIS)', v_need.product_name,
          trim_scale(greatest(v_need.stock - v_need.reserved, 0)), v_need.base_unit,
          trim_scale(v_need.reserved), v_need.base_unit;
      end if;
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
