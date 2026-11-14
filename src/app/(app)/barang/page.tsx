"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductForm } from "@/components/product-form";
import { useProfile } from "@/components/shell";
import { Empty, ErrorBox, Loading, Modal, PageHeader } from "@/components/ui";
import { isLowStock, useCatalog } from "@/lib/catalog";
import { qty, rupiah } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Product } from "@/lib/types";

export default function BarangPage() {
  const profile = useProfile();
  const isOwner = profile.role === "owner";
  const { products, categories, loading, error, reload } = useCatalog();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
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
      <PageHeader title="Barang">
        {isOwner && (
          <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
            Tambah barang
          </button>
        )}
      </PageHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
        <div>
          <label htmlFor="cari" className="label">
            Cari nama atau barcode
          </label>
          <input id="cari" type="search" className="field" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label htmlFor="kat" className="label">
            Kategori
          </label>
          <select id="kat" className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Semua</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex min-h-11 items-center gap-2 self-end font-semibold">
          <input type="checkbox" className="size-5 accent-green" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          Stok menipis{lowCount > 0 && <span className="text-brick">({lowCount})</span>}
        </label>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : products.length === 0 ? (
        <Empty title="Belum ada barang">
          {isOwner ? "Tekan \"Tambah barang\" untuk mulai, atau jalankan supabase/seed.sql untuk contoh." : "Minta pemilik warung menambahkan barang."}
        </Empty>
      ) : shown.length === 0 ? (
        <Empty title="Tidak ada barang yang cocok">Ubah kata kunci atau filter.</Empty>
      ) : (
        <ul className="panel divide-y divide-dashed divide-line">
          {shown.map((p) => {
            const low = isLowStock(p);
            return (
              <li key={p.id} className="grid gap-2 p-4 sm:grid-cols-[1.5fr_1fr_2fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="font-bold break-words">
                    {p.name}
                    {!p.is_active && <span className="ml-2 text-sm font-semibold text-ink-soft">(nonaktif)</span>}
                  </p>
                  <p className="text-sm text-ink-soft">{(p.category_id && categoryName.get(p.category_id)) || "Tanpa kategori"}</p>
                </div>
                <div>
                  <p className={`font-bold ${low ? "text-brick" : ""}`}>
                    {qty(p.stock)} {p.base_unit}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {low ? "Stok menipis" : `Batas ${qty(p.min_stock)}`}
                    {isOwner && costs.has(p.id) && ` · modal ${rupiah(costs.get(p.id))}/${p.base_unit}`}
                  </p>
                </div>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {p.product_units?.map((u) => (
                    <li key={u.id}>
                      <span className="text-ink-soft">{u.name}</span> <span className="font-semibold">{rupiah(u.price)}</span>
                    </li>
                  ))}
                </ul>
                {isOwner && (
                  <button type="button" className="btn btn-ghost justify-self-start" onClick={() => setEditing(p)}>
                    Ubah
                  </button>
                )}
              </li>
            );
          })}
        </ul>
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
    </>
  );
}
