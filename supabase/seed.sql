-- =====================================================================
-- Data contoh (opsional). Jalankan SETELAH schema.sql.
-- Harga di bawah hanya contoh untuk mencoba aplikasi: ubah sesuai harga warung kamu.
-- Stok awal sengaja 0; isi lewat menu Stok > Barang masuk supaya harga modal tercatat.
-- =====================================================================

insert into public.categories (name) values
  ('Bensin'), ('Gas & Galon'), ('Rokok'), ('Sembako'), ('Kebutuhan harian')
on conflict (name) do nothing;

do $$
declare
  c_bensin uuid := (select id from public.categories where name = 'Bensin');
  c_gas uuid := (select id from public.categories where name = 'Gas & Galon');
  c_rokok uuid := (select id from public.categories where name = 'Rokok');
  c_sembako uuid := (select id from public.categories where name = 'Sembako');
  p_pertalite uuid; p_gas uuid; p_tabung uuid; p_air uuid; p_galon uuid; p_rokok uuid; p_beras uuid;
begin
  -- Bensin eceran: satuan dasar liter, boleh desimal, bisa dibeli per nominal
  insert into public.products (name, category_id, base_unit, allow_decimal, min_stock)
  values ('Pertalite eceran', c_bensin, 'liter', true, 10) returning id into p_pertalite;
  insert into public.product_units (product_id, name, conversion, price, is_default)
  values (p_pertalite, 'Liter', 1, 12000, true);

  -- Gas LPG 3kg: tukar tabung mengembalikan 1 tabung kosong ke stok
  insert into public.products (name, category_id, base_unit, min_stock)
  values ('Tabung gas 3kg kosong', c_gas, 'tabung', 0) returning id into p_tabung;
  insert into public.product_units (product_id, name, conversion, price, is_default)
  values (p_tabung, 'Tabung', 1, 150000, true);

  insert into public.products (name, category_id, base_unit, min_stock)
  values ('Gas LPG 3kg', c_gas, 'tabung', 3) returning id into p_gas;
  insert into public.product_units (product_id, name, conversion, price, returns_product_id, is_default)
  values (p_gas, 'Tukar tabung', 1, 22000, p_tabung, true),
         (p_gas, 'Beli + tabung baru', 1, 175000, null, false);

  -- Galon: isi ulang (tukar) dan galon baru
  insert into public.products (name, category_id, base_unit, min_stock)
  values ('Galon kosong', c_gas, 'galon', 0) returning id into p_galon;
  insert into public.product_units (product_id, name, conversion, price, is_default)
  values (p_galon, 'Galon', 1, 40000, true);

  insert into public.products (name, category_id, base_unit, min_stock)
  values ('Air galon isi ulang', c_gas, 'galon', 3) returning id into p_air;
  insert into public.product_units (product_id, name, conversion, price, returns_product_id, is_default)
  values (p_air, 'Tukar galon', 1, 6000, p_galon, true),
         (p_air, 'Beli + galon baru', 1, 45000, null, false);

  -- Rokok: stok dalam batang, dijual per batang / bungkus / slop
  insert into public.products (name, category_id, base_unit, min_stock)
  values ('Rokok kretek filter 16', c_rokok, 'batang', 32) returning id into p_rokok;
  insert into public.product_units (product_id, name, conversion, price, is_default)
  values (p_rokok, 'Batang', 1, 2000, false),
         (p_rokok, 'Bungkus', 16, 30000, true),
         (p_rokok, 'Slop', 160, 295000, false);

  -- Beras curah: stok dalam gram
  insert into public.products (name, category_id, base_unit, allow_decimal, min_stock)
  values ('Beras medium curah', c_sembako, 'gram', true, 5000) returning id into p_beras;
  insert into public.product_units (product_id, name, conversion, price, is_default)
  values (p_beras, 'Kg', 1000, 14000, true),
         (p_beras, 'Liter (±800 g)', 800, 11500, false);
end $$;
