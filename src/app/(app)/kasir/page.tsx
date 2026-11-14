"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { Checkout, type SaleLinePayload } from "@/components/checkout";
import { Empty, ErrorBox, Loading, Modal } from "@/components/ui";
import { useCatalog } from "@/lib/catalog";
import { parseNumber, qty, rupiah } from "@/lib/format";
import type { Product, ProductUnit } from "@/lib/types";

type Line = {
  key: string;
  product: Product;
  unitId: string;
  /** "qty": jumlah satuan. "amount": beli per nominal rupiah (bensin Rp10.000). */
  mode: "qty" | "amount";
  input: string;
};

let lineSeq = 0;

const unitOf = (l: Line) => l.product.product_units!.find((u) => u.id === l.unitId)!;
const defaultUnit = (p: Product) => p.product_units!.find((u) => u.is_default) ?? p.product_units![0];

/** Jumlah satuan & subtotal sebuah baris, atau null jika input belum valid. */
function lineValue(l: Line): { qty: number; subtotal: number } | null {
  const u = unitOf(l);
  const n = parseNumber(l.input);
  if (!(n > 0)) return null;
  if (l.mode === "amount") {
    if (!(u.price > 0)) return null;
    return { qty: Math.round((n / u.price) * 1000) / 1000, subtotal: Math.round(n) };
  }
  if (!l.product.allow_decimal && !Number.isInteger(n)) return null;
  return { qty: n, subtotal: Math.round(n * u.price) };
}

export default function KasirPage() {
  const { products, loading, error, reload } = useCatalog();
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [paying, setPaying] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const canPayRef = useRef(false);

  const active = useMemo(() => products.filter((p) => p.is_active && p.product_units?.length), [products]);
  const byBarcode = useMemo(() => {
    const m = new Map<string, { product: Product; unit: ProductUnit }>();
    for (const p of active) for (const u of p.product_units!) if (u.barcode) m.set(u.barcode, { product: p, unit: u });
    return m;
  }, [active]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? active.filter((p) => p.name.toLowerCase().includes(q)) : active;
    return list.slice(0, 30);
  }, [active, search]);

  const addUnit = useCallback((product: Product, unit: ProductUnit) => {
    setLines((ls) => {
      const same = ls.find((l) => l.unitId === unit.id && l.mode === "qty");
      if (same) {
        return ls.map((l) => (l === same ? { ...l, input: String((parseNumber(l.input) || 0) + 1) } : l));
      }
      return [...ls, { key: `l${++lineSeq}`, product, unitId: unit.id, mode: "qty", input: "1" }];
    });
    setNotice(`${product.name} (${unit.name}) masuk keranjang`);
  }, []);

  const handleBarcode = useCallback(
    (code: string) => {
      const hit = byBarcode.get(code.trim());
      if (hit) addUnit(hit.product, hit.unit);
      else setNotice(`Barcode ${code} belum terdaftar. Daftarkan di menu Barang.`);
    },
    [byBarcode, addUnit],
  );

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    // Scanner USB mengetik kode lalu Enter: cocokkan barcode dulu, lalu nama.
    if (byBarcode.has(q)) handleBarcode(q);
    else if (results.length === 1) addUnit(results[0], defaultUnit(results[0]));
    else if (/^\d{6,}$/.test(q)) handleBarcode(q);
    else return setNotice(results.length ? "Lebih dari satu barang cocok, pilih dari daftar." : "Barang tidak ditemukan.");
    setSearch("");
  }

  // Pintasan keyboard kasir: F2 = cari barang, F9 = bayar.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F9" && canPayRef.current) {
        e.preventDefault();
        setPaying(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const update = (key: string, change: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...change } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  const values = lines.map(lineValue);
  const total = values.reduce((s, v) => s + (v?.subtotal ?? 0), 0);
  const invalid = values.some((v) => v === null);

  // Stok yang dibutuhkan keranjang per produk (dalam satuan dasar), untuk peringatan dini.
  const need = new Map<string, number>();
  lines.forEach((l, i) => {
    const v = values[i];
    if (v) need.set(l.product.id, (need.get(l.product.id) ?? 0) + v.qty * unitOf(l).conversion);
  });
  const shortage = new Set(
    [...need].filter(([id, n]) => n > (products.find((p) => p.id === id)?.stock ?? 0)).map(([id]) => id),
  );

  const canPay = lines.length > 0 && !invalid && shortage.size === 0;
  const payload: SaleLinePayload[] = canPay
    ? lines.map((l, i) =>
        l.mode === "amount" ? { unit_id: l.unitId, amount: values[i]!.subtotal } : { unit_id: l.unitId, qty: values[i]!.qty },
      )
    : [];

  useEffect(() => {
    canPayRef.current = canPay;
  }, [canPay]);

  const onPaid = useCallback(() => {
    setLines([]);
    reload();
  }, [reload]);

  if (loading) return <Loading label="Memuat barang…" />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  return (
    <div className="grid gap-5 pb-24 lg:grid-cols-[1fr_400px] lg:pb-0">
      <h1 className="sr-only">Kasir</h1>
      <section aria-labelledby="cari-label" className="min-w-0">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-60">
            <label id="cari-label" htmlFor="cari" className="label">
              Scan barcode atau ketik nama barang <span className="font-normal text-ink-soft">(F2)</span>
            </label>
            <input
              ref={searchRef}
              id="cari"
              type="search"
              autoFocus
              autoComplete="off"
              className="field text-lg"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKey}
            />
          </div>
          <button type="button" className="btn btn-ghost" aria-expanded={cameraOn} onClick={() => setCameraOn((v) => !v)}>
            {cameraOn ? "Matikan kamera" : "Scan kamera"}
          </button>
        </div>
        <p role="status" aria-live="polite" className="mt-2 min-h-6 text-sm font-semibold text-green">
          {notice}
        </p>

        {cameraOn && (
          <div className="mt-2 max-w-sm">
            <BarcodeScanner continuous onDetected={handleBarcode} />
          </div>
        )}

        {active.length === 0 ? (
          <div className="mt-4">
            <Empty title="Belum ada barang aktif">Tambahkan barang di menu Barang dulu.</Empty>
          </div>
        ) : results.length === 0 ? (
          <div className="mt-4">
            <Empty title={`Tidak ada barang bernama "${search}"`} />
          </div>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {results.map((p) => {
              const u = defaultUnit(p);
              const out = p.stock < u.conversion;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addUnit(p, u)}
                    className="flex h-full min-h-24 w-full flex-col justify-between rounded-lg border border-line bg-card p-3 text-left hover:border-green active:bg-green-tint"
                  >
                    <span className="font-semibold break-words">{p.name}</span>
                    <span className="mt-2 text-sm">
                      <span className="font-bold">{rupiah(u.price)}</span>
                      <span className="text-ink-soft"> /{u.name.toLowerCase()}</span>
                    </span>
                    <span className={`text-xs ${out ? "font-bold text-brick" : "text-ink-soft"}`}>
                      {out ? "Stok habis" : `Stok ${qty(p.stock)} ${p.base_unit}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="keranjang" className="lg:sticky lg:top-20 lg:self-start">
        <div className="panel receipt-edge p-4">
          <div className="flex items-center justify-between">
            <h2 id="keranjang" className="text-lg font-extrabold">
              Keranjang
            </h2>
            {lines.length > 0 && (
              <button type="button" className="btn btn-ghost min-h-9 text-sm" onClick={() => setLines([])}>
                Kosongkan
              </button>
            )}
          </div>
          <hr className="perforated my-3 border-t-2" />
          {lines.length === 0 ? (
            <p className="py-8 text-center text-ink-soft">Scan atau pilih barang untuk mulai.</p>
          ) : (
            <ul className="max-h-[55vh] divide-y divide-dashed divide-line overflow-y-auto">
              {lines.map((l, i) => {
                const u = unitOf(l);
                const v = values[i];
                return (
                  <li key={l.key} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 font-semibold break-words">{l.product.name}</p>
                      <button
                        type="button"
                        className="btn btn-ghost min-h-9 shrink-0 px-2 text-sm"
                        aria-label={`Hapus ${l.product.name}`}
                        onClick={() => remove(l.key)}
                      >
                        Hapus
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-[1fr_1fr] gap-2">
                      {l.product.product_units!.length > 1 ? (
                        <select
                          aria-label={`Satuan ${l.product.name}`}
                          className="field min-h-10 py-1"
                          value={l.unitId}
                          onChange={(e) => update(l.key, { unitId: e.target.value })}
                        >
                          {l.product.product_units!.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name} · {rupiah(x.price)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="self-center text-sm text-ink-soft">
                          {u.name} · {rupiah(u.price)}
                        </span>
                      )}
                      <input
                        aria-label={l.mode === "amount" ? `Nominal rupiah ${l.product.name}` : `Jumlah ${l.product.name}`}
                        className={`field min-h-10 py-1 text-right font-bold ${v ? "" : "border-brick"}`}
                        inputMode={l.product.allow_decimal ? "decimal" : "numeric"}
                        value={l.input}
                        onChange={(e) => update(l.key, { input: e.target.value })}
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                    {l.product.allow_decimal && (
                      <button
                        type="button"
                        className="mt-1 min-h-9 text-sm font-semibold text-green underline underline-offset-2"
                        onClick={() => update(l.key, { mode: l.mode === "qty" ? "amount" : "qty", input: "" })}
                      >
                        {l.mode === "qty" ? "Beli per nominal Rp" : `Beli per ${u.name.toLowerCase()}`}
                      </button>
                    )}
                    <p className="mt-1 flex justify-between text-sm">
                      <span className="text-ink-soft">
                        {v
                          ? l.mode === "amount"
                            ? `= ${qty(v.qty)} ${u.name.toLowerCase()}`
                            : `${qty(v.qty)} × ${rupiah(u.price)}`
                          : l.mode === "amount"
                            ? "Isi nominal"
                            : l.product.allow_decimal
                              ? "Isi jumlah"
                              : "Jumlah harus bilangan bulat"}
                      </span>
                      <span className="font-bold">{v ? rupiah(v.subtotal) : "-"}</span>
                    </p>
                    {shortage.has(l.product.id) && (
                      <p className="text-sm font-semibold text-brick">
                        Stok tidak cukup (sisa {qty(l.product.stock)} {l.product.base_unit})
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <hr className="perforated my-3 border-t-2" />
          <p className="flex items-baseline justify-between">
            <span className="font-semibold">Total</span>
            <span className="text-3xl font-extrabold text-brick">{rupiah(total)}</span>
          </p>
          <button
            type="button"
            className="btn btn-primary mt-4 hidden min-h-12 w-full text-lg lg:flex"
            disabled={!canPay}
            onClick={() => setPaying(true)}
          >
            Bayar (F9)
          </button>
        </div>
      </section>

      {/* Bar bayar menempel di bawah layar ponsel/tablet */}
      <div className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card px-4 py-3 lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-soft">{lines.length} barang</p>
            <p className="truncate text-xl font-extrabold text-brick">{rupiah(total)}</p>
          </div>
          <button
            type="button"
            className="btn btn-primary min-h-12 px-6 text-lg"
            disabled={!canPay}
            onClick={() => setPaying(true)}
          >
            Bayar
          </button>
        </div>
      </div>

      <Modal open={paying} onClose={() => setPaying(false)} title="Pembayaran">
        <Checkout total={total} items={payload} onPaid={onPaid} onFinished={() => setPaying(false)} />
      </Modal>
    </div>
  );
}
