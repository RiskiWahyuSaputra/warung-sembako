"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { Checkout, type SaleLinePayload } from "@/components/checkout";
import { IconBarang, IconCari, IconHapus, IconKamera, IconKurang, IconTambah } from "@/components/icons";
import { RequireProfile } from "@/components/shell";
import { Empty, ErrorBox, Loading, Modal, ProductThumb } from "@/components/ui";
import { productImageUrl } from "@/lib/product-image";
import { useCatalog } from "@/lib/catalog";
import { initials, type TileColor } from "@/lib/category-color";
import { defaultUnit, lineValue, unitOf, type Line } from "@/lib/cart";
import { parseNumber, qty, rupiah } from "@/lib/format";
import type { Product, ProductUnit } from "@/lib/types";

let lineSeq = 0;

export default function KasirPage() {
  return (
    <RequireProfile>
      <KasirContent />
    </RequireProfile>
  );
}

function KasirContent() {
  const { products, categories, loading, error, reload, colorOf } = useCatalog();
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [paying, setPaying] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
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
    return active.filter((p) => (!category || p.category_id === category) && (!q || p.name.toLowerCase().includes(q)));
  }, [active, search, category]);

  const usedCategories = useMemo(
    () => categories.filter((c) => active.some((p) => p.category_id === c.id)),
    [categories, active],
  );

  const addUnit = useCallback((product: Product, unit: ProductUnit) => {
    setLines((ls) => {
      const same = ls.find((l) => l.unitId === unit.id && l.mode === "qty");
      if (same) {
        return ls.map((l) => (l === same ? { ...l, input: String((parseNumber(l.input) || 0) + 1) } : l));
      }
      return [...ls, { key: `l${++lineSeq}`, product, unitId: unit.id, mode: "qty", input: "1" }];
    });
    setNotice({ text: `${product.name} (${unit.name}) masuk keranjang`, tone: "ok" });
  }, []);

  const handleBarcode = useCallback(
    (code: string) => {
      const hit = byBarcode.get(code.trim());
      if (hit) addUnit(hit.product, hit.unit);
      else setNotice({ text: `Barcode ${code} belum terdaftar. Daftarkan di menu Barang.`, tone: "warn" });
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
    else
      return setNotice({
        text: results.length ? "Lebih dari satu barang cocok, pilih dari daftar." : "Barang tidak ditemukan.",
        tone: "warn",
      });
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
  const step = (l: Line, delta: number) => {
    const next = (parseNumber(l.input) || 0) + delta;
    if (next <= 0) remove(l.key);
    else update(l.key, { input: String(next) });
  };

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

  // Jumlah per produk di keranjang, untuk lencana di kartu barang.
  const countInCart = new Map<string, number>();
  lines.forEach((l) => countInCart.set(l.product.id, (countInCart.get(l.product.id) ?? 0) + 1));

  useEffect(() => {
    canPayRef.current = canPay;
  }, [canPay]);

  const onPaid = useCallback(() => {
    setLines([]);
    setCartOpen(false);
    reload();
  }, [reload]);

  function openPay() {
    setCartOpen(false);
    setPaying(true);
  }

  if (loading) return <Loading label="Memuat barang…" />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;

  // headingId null = dibuka sebagai lembar di HP, judulnya sudah dari dialog.
  const cart = (headingId: string | null) => (
    <CartPanel
      headingId={headingId}
      colorOf={colorOf}
      lines={lines}
      values={values}
      shortage={shortage}
      total={total}
      canPay={canPay}
      onClear={() => setLines([])}
      onRemove={remove}
      onStep={step}
      onUpdate={update}
      onPay={openPay}
    />
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <h1 className="sr-only">Kasir</h1>
      <section aria-label="Pilih barang" className="min-w-0">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="cari" className="sr-only">
              Scan barcode atau ketik nama barang (F2)
            </label>
            <IconCari className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" width={20} height={20} />
            <input
              ref={searchRef}
              id="cari"
              type="search"
              autoFocus
              autoComplete="off"
              placeholder="Scan barcode atau cari barang…  (F2)"
              className="field h-12 pl-11 text-base shadow-card"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKey}
            />
          </div>
          <button
            type="button"
            className={`btn h-12 shadow-card ${cameraOn ? "btn-primary" : "btn-ghost"}`}
            aria-pressed={cameraOn}
            onClick={() => setCameraOn((v) => !v)}
          >
            <IconKamera width={20} height={20} />
            <span className="hidden sm:inline">{cameraOn ? "Kamera aktif" : "Scan kamera"}</span>
            <span className="sm:hidden">{cameraOn ? "Tutup" : "Kamera"}</span>
          </button>
        </div>

        <p
          role="status"
          aria-live="polite"
          className={`mt-2 min-h-5 text-sm font-semibold ${notice?.tone === "warn" ? "text-danger" : "text-primary"}`}
        >
          {notice?.text}
        </p>

        {cameraOn && (
          <div className="panel mb-4 max-w-md p-3">
            <BarcodeScanner continuous onDetected={handleBarcode} />
          </div>
        )}

        {usedCategories.length > 0 && (
          <div className="-mx-4 mb-4 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0" role="group" aria-label="Filter kategori">
            <div className="flex w-max gap-2">
              <button type="button" className="chip" aria-pressed={category === null} onClick={() => setCategory(null)}>
                Semua
              </button>
              {usedCategories.map((c) => (
                <button key={c.id} type="button" className="chip" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
                  <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: colorOf(c.id).fg }} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {active.length === 0 ? (
          <Empty title="Belum ada barang aktif" icon={<IconBarang />}>
            Tambahkan barang di menu Barang dulu.
          </Empty>
        ) : results.length === 0 ? (
          <Empty title="Barang tidak ditemukan" icon={<IconCari />}>
            Coba kata lain atau pilih kategori Semua.
          </Empty>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {results.map((p) => {
              const u = defaultUnit(p);
              const out = p.stock < u.conversion;
              const color = colorOf(p.category_id);
              const inCart = countInCart.get(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addUnit(p, u)}
                    className={`group relative flex h-full w-full flex-col gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md active:translate-y-0 ${
                      out ? "opacity-60" : ""
                    }`}
                  >
                    <ProductPhoto name={p.name} imagePath={p.image_path} color={color} />
                    <span className="line-clamp-2 min-h-10 leading-snug font-semibold break-words">{p.name}</span>
                    <span className="mt-auto">
                      <span className="block text-lg font-extrabold">{rupiah(u.price)}</span>
                      <span className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted">per {u.name.toLowerCase()}</span>
                        <span className={out ? "font-bold text-danger" : "text-muted"}>
                          {out ? "Habis" : `Stok ${qty(p.stock)}`}
                        </span>
                      </span>
                    </span>
                    {inCart && (
                      <span className="absolute top-2.5 right-2.5 grid size-6 place-items-center rounded-full bg-accent text-xs font-extrabold text-ink">
                        <span aria-hidden="true">{inCart}</span>
                        <span className="sr-only">, {inCart} baris di keranjang</span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Panel pesanan: menempel di kanan pada layar lebar */}
      <section aria-labelledby="keranjang" className="hidden lg:block">
        <div className="panel sticky top-21 flex max-h-[calc(100dvh-6.5rem)] flex-col overflow-hidden">{cart("keranjang")}</div>
      </section>

      {/* HP/tablet: ringkasan menempel di atas navigasi bawah, pesanan dibuka sebagai lembar */}
      {lines.length > 0 && (
        <div className="no-print fixed inset-x-3 bottom-[4.75rem] z-20 lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-ink p-2.5 pl-4 text-white shadow-pop">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setCartOpen(true)}>
              <span className="block text-xs text-white/75">{lines.length} barang · lihat pesanan</span>
              <span className="block truncate text-lg font-extrabold">{rupiah(total)}</span>
            </button>
            <button type="button" className="btn btn-primary min-h-12 px-6" disabled={!canPay} onClick={openPay}>
              Bayar
            </button>
          </div>
        </div>
      )}

      <Modal open={cartOpen} onClose={() => setCartOpen(false)} title={`Pesanan (${lines.length})`}>
        <div className="-mx-5 -my-5 flex flex-col">{cart(null)}</div>
      </Modal>

      <Modal open={paying} onClose={() => setPaying(false)} title="Pembayaran" size="lg">
        <Checkout total={total} items={payload} onPaid={onPaid} onFinished={() => setPaying(false)} />
      </Modal>
    </div>
  );
}

function CartPanel({
  headingId,
  colorOf,
  lines,
  values,
  shortage,
  total,
  canPay,
  onClear,
  onRemove,
  onStep,
  onUpdate,
  onPay,
}: {
  headingId: string | null;
  colorOf: (categoryId: string | null) => TileColor;
  lines: Line[];
  values: ({ qty: number; subtotal: number } | null)[];
  shortage: Set<string>;
  total: number;
  canPay: boolean;
  onClear: () => void;
  onRemove: (key: string) => void;
  onStep: (l: Line, delta: number) => void;
  onUpdate: (key: string, change: Partial<Line>) => void;
  onPay: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
        {headingId ? (
          <h2 id={headingId} className="text-lg font-extrabold">
            Pesanan <span className="font-semibold text-muted">({lines.length})</span>
          </h2>
        ) : (
          <p className="text-sm text-muted">Ubah jumlah atau satuan, lalu bayar.</p>
        )}
        {lines.length > 0 && (
          <button type="button" className="btn btn-ghost min-h-9 px-3 text-sm" onClick={onClear}>
            Kosongkan
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center text-muted">
            <span className="mb-3 grid size-14 place-items-center rounded-full bg-canvas">
              <IconBarang width={26} height={26} />
            </span>
            <p className="font-semibold text-ink">Belum ada barang</p>
            <p className="text-sm">Scan barcode atau ketuk barang untuk mulai.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map((l, i) => {
              const u = unitOf(l);
              const v = values[i];
              const color = colorOf(l.product.category_id);
              const stepper = l.mode === "qty" && !l.product.allow_decimal;
              return (
                <li key={l.key} className="py-4">
                  <div className="flex items-start gap-3">
                    <ProductThumb imagePath={l.product.image_path} name={l.product.name} color={color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="leading-snug font-semibold break-words">{l.product.name}</p>
                      <p className="text-sm text-muted">
                        {rupiah(u.price)} / {u.name.toLowerCase()}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-icon btn-ghost shrink-0 text-muted hover:text-danger"
                      aria-label={`Hapus ${l.product.name}`}
                      onClick={() => onRemove(l.key)}
                    >
                      <IconHapus width={18} height={18} />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 pl-12">
                    {l.product.product_units!.length > 1 && (
                      <select
                        aria-label={`Satuan ${l.product.name}`}
                        className="field min-h-10 w-auto min-w-0 flex-1 py-1 text-sm"
                        value={l.unitId}
                        onChange={(e) => onUpdate(l.key, { unitId: e.target.value })}
                      >
                        {l.product.product_units!.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {l.product.allow_decimal && (
                      <div className="flex rounded-lg bg-canvas p-0.5 text-sm font-semibold" role="group" aria-label="Cara beli">
                        <button
                          type="button"
                          aria-pressed={l.mode === "qty"}
                          className={`min-h-9 rounded-md px-3 ${l.mode === "qty" ? "bg-surface shadow-card" : "text-muted"}`}
                          onClick={() => l.mode !== "qty" && onUpdate(l.key, { mode: "qty", input: "" })}
                        >
                          {u.name}
                        </button>
                        <button
                          type="button"
                          aria-pressed={l.mode === "amount"}
                          className={`min-h-9 rounded-md px-3 ${l.mode === "amount" ? "bg-surface shadow-card" : "text-muted"}`}
                          onClick={() => l.mode !== "amount" && onUpdate(l.key, { mode: "amount", input: "" })}
                        >
                          Nominal Rp
                        </button>
                      </div>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      {stepper && (
                        <button
                          type="button"
                          className="btn btn-icon btn-ghost"
                          aria-label={`Kurangi ${l.product.name}`}
                          onClick={() => onStep(l, -1)}
                        >
                          <IconKurang width={16} height={16} />
                        </button>
                      )}
                      <input
                        aria-label={l.mode === "amount" ? `Nominal rupiah ${l.product.name}` : `Jumlah ${l.product.name}`}
                        className={`field min-h-10 py-1 text-center font-bold ${stepper ? "w-14 px-1" : "w-28 text-right"} ${
                          v ? "" : "border-danger"
                        }`}
                        inputMode={l.product.allow_decimal ? "decimal" : "numeric"}
                        placeholder={l.mode === "amount" ? "10.000" : "0"}
                        value={l.input}
                        onChange={(e) => onUpdate(l.key, { input: e.target.value })}
                        onFocus={(e) => e.target.select()}
                      />
                      {stepper && (
                        <button
                          type="button"
                          className="btn btn-icon btn-ghost"
                          aria-label={`Tambah ${l.product.name}`}
                          onClick={() => onStep(l, 1)}
                        >
                          <IconTambah width={16} height={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 flex justify-between gap-2 pl-12 text-sm">
                    <span className="text-muted">
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
                    <p className="mt-1 rounded-lg bg-danger-soft px-3 py-1.5 pl-3 text-sm font-semibold text-danger">
                      Stok tidak cukup (sisa {qty(l.product.stock)} {l.product.base_unit})
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-line bg-surface px-5 py-4">
        <p className="flex items-baseline justify-between">
          <span className="font-semibold text-muted">Total</span>
          <span className="text-3xl font-extrabold tracking-tight">{rupiah(total)}</span>
        </p>
        <button type="button" className="btn btn-primary mt-4 min-h-14 w-full text-lg" disabled={!canPay} onClick={onPay}>
          Bayar <span className="hidden text-sm font-semibold text-white/80 lg:inline">(F9)</span>
        </button>
      </div>
    </>
  );
}

/** Area foto di kartu barang kasir; tanpa foto, inisial besar di atas warna kategori. */
function ProductPhoto({ name, imagePath, color }: { name: string; imagePath: string | null; color: TileColor }) {
  const url = productImageUrl(imagePath);
  return (
    <span
      aria-hidden="true"
      className="block aspect-[4/3] w-full overflow-hidden rounded-xl"
      style={url ? undefined : { background: color.bg, color: color.fg }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto dari Supabase Storage, sudah dikecilkan saat unggah
        <img src={url} alt="" width={320} height={240} loading="lazy" className="size-full bg-canvas object-cover" />
      ) : (
        <span className="grid size-full place-items-center text-3xl font-extrabold">{initials(name)}</span>
      )}
    </span>
  );
}
