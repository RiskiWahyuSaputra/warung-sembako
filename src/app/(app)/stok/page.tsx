"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { useProfile } from "@/components/shell";
import { Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { isLowStock, useCatalog } from "@/lib/catalog";
import { dateTime, errorMessage, parseNumber, qty, rupiah } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Product } from "@/lib/types";

type Movement = {
  id: string;
  qty_change: number;
  stock_after: number;
  type: "in" | "sale" | "adjust" | "container_return";
  unit_cost: number | null;
  note: string | null;
  created_at: string;
  products: { name: string; base_unit: string } | null;
};

const TYPE_LABEL: Record<Movement["type"], string> = {
  in: "Barang masuk",
  sale: "Terjual",
  adjust: "Stok opname",
  container_return: "Wadah ditukar",
};

export default function StokPage() {
  const profile = useProfile();
  const { products, loading, error, reload } = useCatalog();
  const [historyVersion, setHistoryVersion] = useState(0);
  const refresh = () => {
    reload();
    setHistoryVersion((v) => v + 1);
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (products.length === 0) {
    return (
      <>
        <PageHeader title="Stok" />
        <Empty title="Belum ada barang">Tambahkan barang di menu Barang sebelum mencatat stok.</Empty>
      </>
    );
  }

  const low = products.filter((p) => p.is_active && isLowStock(p));

  return (
    <>
      <PageHeader title="Stok" />
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <StockInForm products={products} onSaved={refresh} />
        <div className="space-y-5">
          <section aria-labelledby="perlu-beli" className="panel p-4">
            <h2 id="perlu-beli" className="text-lg font-extrabold">
              Perlu dibeli
            </h2>
            {low.length === 0 ? (
              <p className="mt-2 text-ink-soft">Semua stok masih di atas batas.</p>
            ) : (
              <ul className="mt-2 divide-y divide-dashed divide-line">
                {low.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3 py-2">
                    <span className="min-w-0 break-words">{p.name}</span>
                    <span className="shrink-0 font-bold text-brick">
                      {qty(p.stock)} {p.base_unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {profile.role === "owner" && <AdjustForm products={products} onSaved={refresh} />}
        </div>
      </div>
      <History products={products} version={historyVersion} />
    </>
  );
}

function ProductSelect({
  id,
  products,
  value,
  onChange,
}: {
  id: string;
  products: Product[];
  value: string;
  onChange: (id: string, unitId?: string) => void;
}) {
  const [scan, setScan] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={id} className="label">
        Barang
      </label>
      <div className="flex gap-2">
        <select id={id} className="field min-w-0" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Pilih barang</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-ghost shrink-0" aria-expanded={scan} onClick={() => setScan((v) => !v)}>
          {scan ? "Tutup" : "Scan"}
        </button>
      </div>
      {scan && (
        <div className="mt-2">
          <BarcodeScanner
            onDetected={(code) => {
              const p = products.find((x) => x.product_units?.some((u) => u.barcode === code));
              if (p) {
                onChange(p.id, p.product_units!.find((u) => u.barcode === code)!.id);
                setMsg(null);
                setScan(false);
              } else setMsg(`Barcode ${code} belum terdaftar.`);
            }}
          />
        </div>
      )}
      {msg && <p role="alert" className="mt-1 text-sm text-brick">{msg}</p>}
    </div>
  );
}

function StockInForm({ products, onSaved }: { products: Product[]; onSaved: () => void }) {
  const [productId, setProductId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [amount, setAmount] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const product = products.find((p) => p.id === productId);
  const unit = product?.product_units?.find((u) => u.id === unitId);
  const conversion = unit ? unit.conversion : 1;
  const amountNum = parseNumber(amount);
  const baseQty = amountNum > 0 ? amountNum * conversion : 0;
  const costNum = parseNumber(totalCost);
  const unitCost = baseQty > 0 && costNum >= 0 ? costNum / baseQty : NaN;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (!product) return setError("Pilih barang dulu.");
    if (!(baseQty > 0)) return setError("Jumlah harus lebih dari 0.");
    if (Number.isNaN(unitCost)) return setError("Isi total harga beli (boleh 0 jika tidak dicatat).");
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("stock_in", {
      p_product_id: product.id,
      p_qty: baseQty,
      p_unit_cost: Math.round(unitCost * 100) / 100,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setDone(`Stok ${product.name} bertambah ${qty(baseQty)} ${product.base_unit}.`);
    setAmount("");
    setTotalCost("");
    setNote("");
    onSaved();
  }

  return (
    <section aria-labelledby="barang-masuk" className="panel p-4">
      <h2 id="barang-masuk" className="text-lg font-extrabold">
        Barang masuk
      </h2>
      <p className="mb-4 text-sm text-ink-soft">Catat belanja dari supplier atau agen. Harga modal dihitung rata-rata otomatis.</p>
      <form onSubmit={submit} className="space-y-4">
        <ProductSelect
          id="in-product"
          products={products}
          value={productId}
          onChange={(id, u) => {
            setProductId(id);
            // Satuan berisi 1 sama dengan satuan dasar (opsi kosong di daftar).
            const scanned = products.find((p) => p.id === id)?.product_units?.find((x) => x.id === u);
            setUnitId(scanned && scanned.conversion !== 1 ? scanned.id : "");
          }}
        />
        {product && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="in-unit" className="label">
                  Dihitung per
                </label>
                <select id="in-unit" className="field" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                  <option value="">{product.base_unit}</option>
                  {product.product_units
                    ?.filter((u) => u.conversion !== 1)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({qty(u.conversion)} {product.base_unit})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label htmlFor="in-amount" className="label">
                  Jumlah
                </label>
                <input id="in-amount" className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
            <div>
              <label htmlFor="in-cost" className="label">
                Total harga beli (Rp)
              </label>
              <input id="in-cost" className="field" inputMode="numeric" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} />
              {baseQty > 0 && !Number.isNaN(unitCost) && (
                <p className="mt-1 text-sm text-ink-soft">
                  = {qty(baseQty)} {product.base_unit}, modal {rupiah(unitCost)}/{product.base_unit}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="in-note" className="label">
                Catatan (opsional)
              </label>
              <input id="in-note" className="field" placeholder="mis. Agen gas Pak Budi" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </>
        )}
        {error && <p role="alert" className="font-semibold text-brick">{error}</p>}
        {done && <p role="status" className="font-semibold text-green">{done}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || !product}>
          {busy ? "Menyimpan…" : "Tambah stok"}
        </button>
      </form>
    </section>
  );
}

function AdjustForm({ products, onSaved }: { products: Product[]; onSaved: () => void }) {
  const [productId, setProductId] = useState("");
  const [count, setCount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const product = products.find((p) => p.id === productId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    const n = parseNumber(count);
    if (!product) return setError("Pilih barang dulu.");
    if (Number.isNaN(n) || n < 0) return setError("Isi hasil hitung fisik (0 atau lebih).");
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("stock_adjust", {
      p_product_id: product.id,
      p_new_stock: n,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    const diff = n - product.stock;
    setDone(`Stok ${product.name} jadi ${qty(n)} (${diff >= 0 ? "+" : ""}${qty(diff)}).`);
    setCount("");
    setNote("");
    onSaved();
  }

  return (
    <section aria-labelledby="opname" className="panel p-4">
      <h2 id="opname" className="text-lg font-extrabold">
        Stok opname
      </h2>
      <p className="mb-4 text-sm text-ink-soft">Samakan stok di aplikasi dengan hasil hitung di rak. Selisihnya tercatat di riwayat.</p>
      <form onSubmit={submit} className="space-y-4">
        <ProductSelect id="adj-product" products={products} value={productId} onChange={(id) => setProductId(id)} />
        {product && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="adj-count" className="label">
                Hitung fisik ({product.base_unit})
              </label>
              <input id="adj-count" className="field" inputMode="decimal" value={count} onChange={(e) => setCount(e.target.value)} />
              <p className="mt-1 text-sm text-ink-soft">
                Di aplikasi: {qty(product.stock)} {product.base_unit}
              </p>
            </div>
            <div>
              <label htmlFor="adj-note" className="label">
                Alasan
              </label>
              <input id="adj-note" className="field" placeholder="mis. rusak, hilang" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        )}
        {error && <p role="alert" className="font-semibold text-brick">{error}</p>}
        {done && <p role="status" className="font-semibold text-green">{done}</p>}
        <button type="submit" className="btn btn-ghost w-full" disabled={busy || !product}>
          {busy ? "Menyimpan…" : "Simpan hasil opname"}
        </button>
      </form>
    </section>
  );
}

function History({ products, version }: { products: Product[]; version: number }) {
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<Movement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let q = supabaseBrowser()
      .from("stock_movements")
      .select("id, qty_change, stock_after, type, unit_cost, note, created_at, products(name, base_unit)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (filter) q = q.eq("product_id", filter);
    q.then(({ data, error }) => {
      if (cancelled) return;
      if (error) setError(errorMessage(error));
      else {
        setError(null);
        setRows(data as unknown as Movement[]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filter, version, attempt]);

  return (
    <section aria-labelledby="riwayat" className="mt-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 id="riwayat" className="text-lg font-extrabold">
          Riwayat stok
        </h2>
        <div className="w-full sm:w-72">
          <label htmlFor="hist-filter" className="label">
            Tampilkan barang
          </label>
          <select id="hist-filter" className="field" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Semua barang</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? (
        <ErrorBox message={error} onRetry={() => setAttempt((a) => a + 1)} />
      ) : !rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty title="Belum ada pergerakan stok" />
      ) : (
        <ul className="panel divide-y divide-dashed divide-line">
          {rows.map((m) => (
            <li key={m.id} className="grid gap-1 p-3 sm:grid-cols-[1.5fr_1fr_1fr_1fr] sm:items-center">
              <div className="min-w-0">
                <p className="font-semibold break-words">{m.products?.name ?? "Barang terhapus"}</p>
                <p className="text-xs text-ink-soft">{dateTime(m.created_at)}</p>
              </div>
              <p className="text-sm">
                {TYPE_LABEL[m.type]}
                {m.note && <span className="text-ink-soft"> · {m.note}</span>}
              </p>
              <p className={`font-bold ${Number(m.qty_change) < 0 ? "text-brick" : "text-green"}`}>
                {Number(m.qty_change) > 0 ? "+" : ""}
                {qty(m.qty_change)} {m.products?.base_unit}
              </p>
              <p className="text-sm text-ink-soft">
                Sisa {qty(m.stock_after)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
