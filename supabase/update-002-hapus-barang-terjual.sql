-- Update untuk database yang sudah menjalankan schema.sql versi sebelumnya.
-- Jalankan sekali di Supabase > SQL Editor. Aman dijalankan ulang.
-- Barang yang sudah pernah terjual kini bisa dihapus; struk & laporan tetap utuh
-- karena sale_items menyimpan salinan nama, satuan, harga, dan modal.

drop policy if exists "owner hapus produk" on public.products;
create policy "owner hapus produk" on public.products for delete using (public.is_owner());

alter table public.sale_items alter column product_id drop not null;
alter table public.sale_items drop constraint if exists sale_items_product_id_fkey;
alter table public.sale_items
  add constraint sale_items_product_id_fkey
  foreign key (product_id) references public.products (id) on delete set null;

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
