-- Update untuk database yang sudah menjalankan schema.sql versi sebelumnya.
-- Jalankan sekali di Supabase > SQL Editor. Aman dijalankan ulang.
-- Mengizinkan pemilik menghapus barang yang belum pernah terjual.

drop policy if exists "owner hapus produk" on public.products;
create policy "owner hapus produk" on public.products for delete using (public.is_owner());
