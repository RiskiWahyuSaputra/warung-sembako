"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductForm } from "@/components/product-form";
import { RequireProfile, useProfile } from "@/components/shell";
import { IconBarang, IconCari, IconHapus, IconTambah } from "@/components/icons";
import { Empty, ErrorBox, InitialTile, Loading, Modal, PageHeader } from "@/components/ui";
import { initials } from "@/lib/category-color";
import { isLowStock, useCatalog } from "@/lib/catalog";
import { errorMessage, qty, rupiah } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Product } from "@/lib/types";

export default function BarangPage() {
  return (
    <RequireProfile>
      <BarangContent />
    </RequireProfile>
  );
}

function BarangContent() {
  const profile = useProfile();
  const isOwner = profile.role === "owner";
  const { products, categories, loading, error, reload, colorOf } = useCatalog();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [costs, setCosts] = useState<Map<string, number>>(new Map());

  // Harga modal hanya bisa dibaca owner (lewat RPC), kasir tidak melihatnya.
  useEffect(() => {
    if (!isOwner) return;
    supabaseBrowser()
      .rpc("product_costs")
      .then(({ data }) => {
        if (data) setCosts(new Map((data as { product_id: string; cost_price: number }[]).map((r) => [r.product_id, Number(r.cost_price)])));
      });
  }, [isOwner, products]);

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!category || p.category_id === category) &&
        (!lowOnly || isLowStock(p)) &&
        (!q || p.name.toLowerCase().includes(q) || p.product_units?.some((u) => u.barcode === q)),
    );
  }, [products, search, category, lowOnly]);

  const lowCount = products.filter((p) => p.is_active && isLowStock(p)).length;

  return (
    <>
      <PageHeader title="Barang" description={`${products.length} barang · ${lowCount} stok menipis`}>
        {isOwner && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
            <IconTambah width={18} height={18} />
            Tambah barang
          </button>
        )}
      </PageHeader>

      <div className="panel mb-5 grid gap-3 p-4 sm:grid-cols-[2fr_1fr_auto]">
        <div className="relative">
          <label htmlFor="cari" className="sr-only">
            Cari nama atau barcode
          </label>
          <IconCari className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" width={20} height={20} />
          <input id="cari" type="search" placeholder="Cari nama atau barcode" className="field pl-11" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label htmlFor="kat" className="sr-only">
            Kategori
          </label>
          <select id="kat" className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="chip h-11" aria-pressed={lowOnly} onClick={() => setLowOnly((v) => !v)}>
          Stok menipis
          {lowCount > 0 && (
            <span className={`rounded-full px-2 text-xs font-extrabold ${lowOnly ? "bg-white text-ink" : "bg-danger-soft text-danger"}`}>{lowCount}</span>
          )}
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : products.length === 0 ? (
        <Empty title="Belum ada barang" icon={<IconBarang />}>
          {isOwner ? "Tekan \"Tambah barang\" untuk mulai, atau jalankan supabase/seed.sql untuk contoh." : "Minta pemilik warung menambahkan barang."}
        </Empty>
      ) : shown.length === 0 ? (
        <Empty title="Tidak ada barang yang cocok" icon={<IconCari />}>
          Ubah kata kunci atau filter.
        </Empty>
      ) : (
        <div className="panel overflow-hidden">
          <div className="hidden grid-cols-[2fr_1.1fr_2fr_auto] gap-4 border-b border-line bg-canvas px-5 py-3 text-sm font-semibold text-muted md:grid">
            <span>Barang</span>
            <span>Stok</span>
            <span>Harga jual</span>
            <span className="w-28" />
          </div>
          <ul className="divide-y divide-line">
            {shown.map((p) => {
              const low = isLowStock(p);
              const color = colorOf(p.category_id);
              return (
                <li key={p.id} className="grid gap-3 px-5 py-4 md:grid-cols-[2fr_1.1fr_2fr_auto] md:items-center md:gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <InitialTile text={initials(p.name)} bg={color.bg} fg={color.fg} />
                    <div className="min-w-0">
                      <p className="font-bold break-words">
                        {p.name}
                        {!p.is_active && <span className="ml-2 rounded-md bg-canvas px-1.5 py-0.5 text-xs font-semibold text-muted">Nonaktif</span>}
                      </p>
                      <p className="text-sm text-muted">{(p.category_id && categoryName.get(p.category_id)) || "Tanpa kategori"}</p>
                    </div>
                  </div>
                  <div className="pl-14 md:pl-0">
                    <p className="font-bold">
                      {qty(p.stock)} <span className="font-medium text-muted">{p.base_unit}</span>
                    </p>
                    <p className="text-sm">
                      {low ? (
                        <span className="rounded-md bg-danger-soft px-1.5 py-0.5 text-xs font-bold text-danger">Stok menipis</span>
                      ) : (
                        <span className="text-muted">Batas {qty(p.min_stock)}</span>
                      )}
                      {isOwner && costs.has(p.id) && <span className="text-muted"> · modal {rupiah(costs.get(p.id))}/{p.base_unit}</span>}
                    </p>
                  </div>
                  <ul className="flex flex-wrap gap-1.5 pl-14 text-sm md:pl-0">
                    {p.product_units?.map((u) => (
                      <li key={u.id} className="rounded-lg bg-canvas px-2.5 py-1">
                        <span className="text-muted">{u.name}</span> <span className="font-bold">{rupiah(u.price)}</span>
                      </li>
                    ))}
                  </ul>
                  {isOwner ? (
                    <div className="ml-14 flex w-28 gap-2 md:ml-0">
                      <button type="button" className="btn btn-ghost flex-1" onClick={() => setEditing(p)}>
                        Ubah
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-icon min-h-11 min-w-11"
                        aria-label={`Hapus ${p.name}`}
                        onClick={() => setDeleting(p)}
                      >
                        <IconHapus width={18} height={18} />
                      </button>
                    </div>
                  ) : (
                    <span className="hidden w-28 md:block" />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Tambah barang" : "Ubah barang"} wide>
        {editing !== null && (
          <ProductForm
            key={editing === "new" ? "new" : editing.id}
            product={editing === "new" ? undefined : editing}
            categories={categories}
            products={products}
            onSaved={() => {
              setEditing(null);
              reload();
            }}
          />
        )}
      </Modal>

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title="Hapus barang">
        {deleting && (
          <DeleteProduct
            key={deleting.id}
            product={deleting}
            products={products}
            onClose={() => setDeleting(null)}
            onDone={() => {
              setDeleting(null);
              reload();
            }}
          />
        )}
      </Modal>
    </>
  );
}

/**
 * Konfirmasi hapus. Barang benar-benar dihapus; struk & laporan lama tetap utuh karena
 * setiap baris penjualan menyimpan salinan nama, satuan, harga, dan modal barang.
 */
function DeleteProduct({
  product,
  products,
  onClose,
  onDone,
}: {
  product: Product;
  products: Product[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Satuan barang lain yang memakai barang ini sebagai wadah tukar (mis. tabung gas kosong).
  const usedAsContainer = products.flatMap((p) =>
    (p.product_units ?? []).filter((u) => u.returns_product_id === product.id).map((u) => `${p.name} (${u.name})`),
  );

  async function remove() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser().from("products").delete().eq("id", product.id).select("id");
    setBusy(false);
    if (error) {
      // Database lama: penjualan masih mengunci barangnya.
      if (error.code === "23503") {
        return setError("Database belum diperbarui. Jalankan supabase/update-002-hapus-barang-terjual.sql di SQL Editor.");
      }
      return setError(errorMessage(error));
    }
    if (!data?.length) {
      return setError(
        "Database belum mengizinkan hapus barang. Jalankan supabase/update-001-hapus-barang.sql dan update-002-hapus-barang-terjual.sql di SQL Editor.",
      );
    }
    onDone();
  }

  return (
    <div className="space-y-4">
      <p>
        Hapus <strong>{product.name}</strong> beserta satuan jual dan riwayat stoknya? Tindakan ini tidak bisa dibatalkan.
      </p>
      <p className="rounded-xl bg-canvas p-4 text-sm text-muted">
        Struk dan laporan penjualan lama tetap aman: nama, harga, dan modal barang ini sudah tersimpan di setiap transaksi.
      </p>
      {product.stock > 0 && (
        <p className="rounded-xl bg-[#fff4d6] px-4 py-3 text-sm text-[#7a4b00]">
          Masih ada stok {qty(product.stock)} {product.base_unit}.
        </p>
      )}
      {usedAsContainer.length > 0 && (
        <p className="rounded-xl bg-[#fff4d6] px-4 py-3 text-sm text-[#7a4b00]">
          Barang ini dipakai sebagai wadah tukar untuk {usedAsContainer.join(", ")}. Setelah dihapus, penukaran tidak lagi
          menambah stok wadah kosong.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-ghost" onClick={onClose} autoFocus>
          Batal
        </button>
        <button type="button" className="btn btn-danger border-danger bg-danger text-white hover:bg-[#a11f25]" onClick={remove} disabled={busy}>
          {busy ? "Menghapus…" : "Hapus barang"}
        </button>
      </div>
    </div>
  );
}
