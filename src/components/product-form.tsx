"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { errorMessage, parseNumber } from "@/lib/format";
import type { Category, Product } from "@/lib/types";
import { compressImage, productImageUrl, removeProductImage, uploadProductImage } from "@/lib/product-image";
import { BarcodeScanner } from "./barcode-scanner";
import { IconHapus, IconKamera } from "./icons";

type ImageDraft = { kind: "keep" } | { kind: "new"; blob: Blob; preview: string } | { kind: "remove" };

type UnitDraft = {
  key: string;
  id?: string;
  name: string;
  conversion: string;
  price: string;
  barcode: string;
  returns_product_id: string;
  is_default: boolean;
};

const BASE_UNITS = ["pcs", "batang", "liter", "gram", "ml", "tabung", "galon", "sachet"];

let keySeq = 0;
const newKey = () => `u${++keySeq}`;

function draftFrom(p?: Product): UnitDraft[] {
  if (!p?.product_units?.length) {
    return [{ key: newKey(), name: "Pcs", conversion: "1", price: "", barcode: "", returns_product_id: "", is_default: true }];
  }
  return p.product_units.map((u) => ({
    key: newKey(),
    id: u.id,
    name: u.name,
    conversion: String(u.conversion),
    price: String(u.price),
    barcode: u.barcode ?? "",
    returns_product_id: u.returns_product_id ?? "",
    is_default: u.is_default,
  }));
}

export function ProductForm({
  product,
  categories,
  products,
  onSaved,
}: {
  product?: Product;
  categories: Category[];
  products: Product[];
  onSaved: () => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.category_id ?? "");
  const [newCategory, setNewCategory] = useState("");
  const [baseUnit, setBaseUnit] = useState(product?.base_unit ?? "pcs");
  const [allowDecimal, setAllowDecimal] = useState(product?.allow_decimal ?? false);
  const [minStock, setMinStock] = useState(String(product?.min_stock ?? 0));
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [units, setUnits] = useState<UnitDraft[]>(() => draftFrom(product));
  const [scanFor, setScanFor] = useState<string | null>(null);
  const [image, setImage] = useState<ImageDraft>({ kind: "keep" });
  const [imageNote, setImageNote] = useState<string | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Lepas URL pratinjau lama supaya memori browser tidak menumpuk.
  useEffect(() => () => {
    if (image.kind === "new") URL.revokeObjectURL(image.preview);
  }, [image]);

  const oldImagePath = product?.image_path ?? null;
  const previewUrl = image.kind === "new" ? image.preview : image.kind === "keep" ? productImageUrl(oldImagePath) : null;

  async function pickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageNote("Mengecilkan foto…");
    try {
      const blob = await compressImage(file);
      setImage({ kind: "new", blob, preview: URL.createObjectURL(blob) });
      setImageNote(`Siap diunggah (${Math.max(1, Math.round(blob.size / 1024))} KB)`);
    } catch (err) {
      setImageNote(errorMessage(err));
    }
  }
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const containerOptions = products.filter((p) => p.id !== product?.id);

  const patch = (key: string, change: Partial<UnitDraft>) =>
    setUnits((list) =>
      list.map((u) => (u.key === key ? { ...u, ...change } : change.is_default ? { ...u, is_default: false } : u)),
    );

  function addUnit() {
    setUnits((list) => [
      ...list,
      { key: newKey(), name: "", conversion: "1", price: "", barcode: "", returns_product_id: "", is_default: false },
    ]);
  }

  function removeUnit(key: string) {
    setUnits((list) => {
      const next = list.filter((u) => u.key !== key);
      if (next.length && !next.some((u) => u.is_default)) next[0] = { ...next[0], is_default: true };
      return next;
    });
  }

  function validate() {
    if (!name.trim()) return "Nama barang wajib diisi.";
    if (!baseUnit.trim()) return "Satuan dasar wajib diisi.";
    const min = parseNumber(minStock);
    if (Number.isNaN(min) || min < 0) return "Batas stok menipis harus angka 0 atau lebih.";
    if (!units.length) return "Tambahkan minimal satu satuan jual.";
    const barcodes = new Set<string>();
    for (const u of units) {
      if (!u.name.trim()) return "Setiap satuan jual harus punya nama.";
      const conv = parseNumber(u.conversion);
      if (!(conv > 0)) return `Isi "${u.name}" harus lebih dari 0.`;
      const price = parseNumber(u.price);
      if (Number.isNaN(price) || price < 0) return `Harga "${u.name}" belum diisi dengan benar.`;
      const bc = u.barcode.trim();
      if (bc) {
        if (barcodes.has(bc)) return `Barcode ${bc} dipakai dua kali.`;
        barcodes.add(bc);
      }
    }
    return null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const sb = supabaseBrowser();
    try {
      let catId: string | null = categoryId || null;
      if (newCategory.trim()) {
        const { data, error } = await sb
          .from("categories")
          .upsert({ name: newCategory.trim() }, { onConflict: "name" })
          .select("id")
          .single();
        if (error) throw error;
        catId = data.id;
      }

      // Foto diunggah dulu: kalau gagal, barang belum tersimpan sama sekali.
      let imagePath = oldImagePath;
      if (image.kind === "new") imagePath = await uploadProductImage(image.blob);
      if (image.kind === "remove") imagePath = null;

      const row = {
        image_path: imagePath,
        name: name.trim(),
        category_id: catId,
        base_unit: baseUnit.trim(),
        allow_decimal: allowDecimal,
        min_stock: parseNumber(minStock),
        is_active: isActive,
      };
      let productId = product?.id;
      if (productId) {
        const { error } = await sb.from("products").update(row).eq("id", productId);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from("products").insert(row).select("id").single();
        if (error) throw error;
        productId = data.id as string;
      }

      const keptIds = new Set(units.filter((u) => u.id).map((u) => u.id));
      const removed = (product?.product_units ?? []).filter((u) => !keptIds.has(u.id)).map((u) => u.id);
      if (removed.length) {
        const { error } = await sb.from("product_units").delete().in("id", removed);
        if (error) throw error;
      }
      // Kosongkan dulu barcode yang berubah, supaya barcode bisa dipindah antar satuan tanpa bentrok unik.
      const original = new Map((product?.product_units ?? []).map((u) => [u.id, u.barcode ?? ""]));
      const changed = units.filter((u) => u.id && original.get(u.id) !== u.barcode.trim()).map((u) => u.id!);
      if (changed.length) {
        const { error } = await sb.from("product_units").update({ barcode: null }).in("id", changed);
        if (error) throw error;
      }
      for (const u of units) {
        const data = {
          product_id: productId,
          name: u.name.trim(),
          conversion: parseNumber(u.conversion),
          price: parseNumber(u.price),
          barcode: u.barcode.trim() || null,
          returns_product_id: u.returns_product_id || null,
          is_default: u.is_default,
        };
        const { error } = u.id
          ? await sb.from("product_units").update(data).eq("id", u.id)
          : await sb.from("product_units").insert(data);
        if (error) throw error;
      }
      if (oldImagePath && oldImagePath !== imagePath) await removeProductImage(oldImagePath);
      onSaved();
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg.includes("product_units_barcode_key") ? "Barcode sudah dipakai barang lain." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-canvas text-center text-xs text-muted">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- pratinjau lokal / foto Supabase Storage
            <img src={previewUrl} alt={`Foto ${name || "barang"}`} width={96} height={96} className="size-full object-cover" />
          ) : (
            <span className="px-2">Belum ada foto</span>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <p className="label mb-0">Foto barang</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ghost min-h-10 text-sm" onClick={() => cameraRef.current?.click()}>
              <IconKamera width={18} height={18} />
              Foto
            </button>
            <button type="button" className="btn btn-ghost min-h-10 text-sm" onClick={() => galleryRef.current?.click()}>
              Pilih file
            </button>
            {previewUrl && (
              <button
                type="button"
                className="btn btn-danger btn-icon min-h-10 min-w-10"
                aria-label="Hapus foto"
                onClick={() => {
                  setImage({ kind: "remove" });
                  setImageNote(null);
                }}
              >
                <IconHapus width={16} height={16} />
              </button>
            )}
          </div>
          <p role="status" className="text-xs text-muted">
            {imageNote ?? "Opsional. Foto otomatis dikecilkan supaya hemat kuota."}
          </p>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickImage} />
          <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickImage} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="p-name">
          Nama barang
        </label>
        <input id="p-name" className="field" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="p-cat">
            Kategori
          </label>
          <select id="p-cat" className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Tanpa kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="p-newcat">
            Atau kategori baru
          </label>
          <input
            id="p-newcat"
            className="field"
            placeholder="mis. Minuman"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="p-base">
            Satuan dasar stok
          </label>
          <input
            id="p-base"
            className="field"
            list="base-units"
            value={baseUnit}
            onChange={(e) => setBaseUnit(e.target.value)}
            aria-describedby="p-base-help"
            required
          />
          <datalist id="base-units">
            {BASE_UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <p id="p-base-help" className="mt-1 text-xs text-muted">
            Satuan terkecil yang dihitung. Rokok: batang. Bensin: liter. Beras curah: gram.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="p-min">
            Ingatkan jika stok ≤ ({baseUnit || "satuan dasar"})
          </label>
          <input id="p-min" className="field" inputMode="decimal" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5 accent-primary" checked={allowDecimal} onChange={(e) => setAllowDecimal(e.target.checked)} />
          Boleh jual pecahan / per nominal (bensin, curah)
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5 accent-primary" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Aktif dijual
        </label>
      </div>

      <fieldset className="rounded-2xl border border-line bg-canvas/60 p-4">
        <legend className="px-1 font-bold">Satuan jual & harga</legend>
        <p className="mb-3 text-sm text-muted">
          &quot;Isi&quot; = berapa {baseUnit || "satuan dasar"} dalam satu satuan jual. Contoh rokok: Batang 1, Bungkus 16, Slop 160.
        </p>
        <ul className="space-y-3">
          {units.map((u, i) => (
            <li key={u.key} className="rounded-xl border border-line bg-surface p-4 shadow-card">
              <div className="grid gap-3 sm:grid-cols-[1.4fr_0.8fr_1fr]">
                <div>
                  <label className="label" htmlFor={`un-${u.key}`}>
                    Nama satuan {i + 1}
                  </label>
                  <input
                    id={`un-${u.key}`}
                    className="field"
                    placeholder="Bungkus / Tukar tabung"
                    value={u.name}
                    onChange={(e) => patch(u.key, { name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`uc-${u.key}`}>
                    Isi
                  </label>
                  <input
                    id={`uc-${u.key}`}
                    className="field"
                    inputMode="decimal"
                    value={u.conversion}
                    onChange={(e) => patch(u.key, { conversion: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`up-${u.key}`}>
                    Harga jual (Rp)
                  </label>
                  <input
                    id={`up-${u.key}`}
                    className="field"
                    inputMode="numeric"
                    value={u.price}
                    onChange={(e) => patch(u.key, { price: e.target.value })}
                  />
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`ub-${u.key}`}>
                    Barcode
                  </label>
                  <div className="flex gap-2">
                    <input
                      id={`ub-${u.key}`}
                      className="field"
                      placeholder="Scan atau ketik"
                      value={u.barcode}
                      onChange={(e) => patch(u.key, { barcode: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost shrink-0"
                      aria-expanded={scanFor === u.key}
                      onClick={() => setScanFor(scanFor === u.key ? null : u.key)}
                    >
                      {scanFor === u.key ? "Tutup kamera" : "Kamera"}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor={`ur-${u.key}`}>
                    Pelanggan menukar wadah kosong?
                  </label>
                  <select
                    id={`ur-${u.key}`}
                    className="field"
                    value={u.returns_product_id}
                    onChange={(e) => patch(u.key, { returns_product_id: e.target.value })}
                  >
                    <option value="">Tidak</option>
                    {containerOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        Ya, tambah stok: {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {scanFor === u.key && (
                <div className="mt-3">
                  <BarcodeScanner
                    onDetected={(code) => {
                      patch(u.key, { barcode: code });
                      setScanFor(null);
                    }}
                  />
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="default-unit"
                    className="size-5 accent-primary"
                    checked={u.is_default}
                    onChange={() => patch(u.key, { is_default: true })}
                  />
                  Satuan utama di kasir
                </label>
                <button
                  type="button"
                  className="btn btn-danger min-h-10 text-sm"
                  onClick={() => removeUnit(u.key)}
                  disabled={units.length === 1}
                >
                  Hapus satuan
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-ghost mt-3" onClick={addUnit}>
          Tambah satuan jual
        </button>
      </fieldset>

      {error && (
        <p role="alert" className="font-semibold text-danger">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Menyimpan…" : product ? "Simpan perubahan" : "Simpan barang"}
      </button>
    </form>
  );
}
