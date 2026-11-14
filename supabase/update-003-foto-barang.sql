-- Update untuk database yang sudah menjalankan schema.sql versi sebelumnya.
-- Jalankan sekali di Supabase > SQL Editor. Aman dijalankan ulang.
-- Menambah foto barang: kolom image_path + bucket storage "product-images".

alter table public.products add column if not exists image_path text;
grant select (image_path) on public.products to authenticated;

-- =====================================================================
-- Foto barang (Supabase Storage). Bucket publik: siapa pun bisa melihat
-- lewat URL publik, tapi hanya pemilik yang boleh mengunggah/mengganti/menghapus.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

-- select dibutuhkan API storage untuk menghapus/mengganti file.
drop policy if exists "owner lihat foto barang" on storage.objects;
create policy "owner lihat foto barang" on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and public.is_owner());
drop policy if exists "owner unggah foto barang" on storage.objects;
create policy "owner unggah foto barang" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_owner());
drop policy if exists "owner ubah foto barang" on storage.objects;
create policy "owner ubah foto barang" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_owner());
drop policy if exists "owner hapus foto barang" on storage.objects;
create policy "owner hapus foto barang" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_owner());
