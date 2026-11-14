"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType, type FormEvent, type SVGProps } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { errorMessage, parseNumber, rupiah } from "@/lib/format";
import type { Customer, PaymentMethod, Sale } from "@/lib/types";
import { IconKasbon, IconQris, IconTunai } from "./icons";
import { Receipt } from "./receipt";

export type SaleLinePayload = { unit_id: string; qty: number } | { unit_id: string; amount: number };

type Stage =
  | { kind: "form" }
  | { kind: "qris"; sale: Sale; qrUrl: string | null; snapToken: string | null; expiresAt: number; error: string | null }
  | { kind: "done"; saleId: string };

const METHODS: { id: PaymentMethod; label: string; hint: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: "cash", label: "Tunai", hint: "Uang pas / kembalian", icon: IconTunai },
  { id: "qris", label: "QRIS", hint: "Scan e-wallet / m-banking", icon: IconQris },
  { id: "kasbon", label: "Kasbon", hint: "Dicatat sebagai utang", icon: IconKasbon },
];

/** Pecahan uang yang biasa diterima, untuk tombol cepat. */
function quickCash(total: number) {
  const options = new Set<number>([total]);
  for (const step of [5000, 10000, 20000, 50000, 100000]) {
    const v = Math.ceil(total / step) * step;
    if (v > total) options.add(v);
  }
  return [...options].sort((a, b) => a - b).slice(0, 6);
}

export function Checkout({
  total,
  items,
  onFinished,
  onPaid,
}: {
  total: number;
  items: SaleLinePayload[];
  /** Tutup dialog dan mulai transaksi baru. */
  onFinished: () => void;
  /** Dipanggil sekali saat transaksi lunas: kosongkan keranjang, muat ulang stok. */
  onPaid: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cash, setCash] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cashNum = parseNumber(cash);
  const change = Number.isNaN(cashNum) ? null : cashNum - total;

  function finish(saleId: string) {
    setStage({ kind: "done", saleId });
    onPaid();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (method === "cash" && (change === null || change < 0)) return setError("Uang diterima kurang dari total.");
    if (method === "kasbon" && !customerId) return setError("Pilih pelanggan yang berutang.");

    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("create_sale", {
      p_items: items,
      p_method: method,
      p_customer_id: method === "kasbon" ? customerId : null,
      p_cash_received: method === "cash" ? cashNum : null,
    });
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    const sale = data as Sale;
    if (method !== "qris") {
      setBusy(false);
      return finish(sale.id);
    }

    const res = await fetch("/api/midtrans/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sale_id: sale.id }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setStage({
      kind: "qris",
      sale,
      qrUrl: res.ok ? (body.qr_url ?? null) : null,
      snapToken: res.ok ? (body.snap_token ?? null) : null,
      expiresAt: Date.now() + 15 * 60_000,
      error: res.ok ? null : body.error || "Gagal membuat QR",
    });
  }

  if (stage.kind === "done") {
    return (
      <div className="grid gap-6 sm:grid-cols-[1fr_1.1fr] sm:items-start">
        <div className="text-center sm:pt-6 sm:text-left">
          <span aria-hidden="true" className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-primary-soft text-primary sm:mx-0">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9.5 16.2 5.3 12l-1.8 1.8 6 6L21 8.3l-1.8-1.8z" />
            </svg>
          </span>
          <p role="status" className="text-2xl font-extrabold">
            Transaksi lunas
          </p>
          <p className="mt-1 text-muted">Stok sudah diperbarui. Cetak struk bila pelanggan minta.</p>
          <div className="no-print mt-6 grid gap-2">
            <button type="button" className="btn btn-primary min-h-12" onClick={onFinished} autoFocus>
              Transaksi baru
            </button>
            <button type="button" className="btn btn-ghost min-h-12" onClick={() => window.print()}>
              Cetak struk
            </button>
          </div>
        </div>
        <div className="rounded-2xl bg-canvas p-4">
          <Receipt saleId={stage.saleId} />
        </div>
      </div>
    );
  }

  if (stage.kind === "qris") {
    return <QrisWait stage={stage} onPaid={() => finish(stage.sale.id)} onClosed={onFinished} />;
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex items-center justify-between rounded-2xl bg-ink px-5 py-4 text-white">
        <span className="font-semibold text-white/80">Total belanja</span>
        <span className="text-3xl font-extrabold tracking-tight">{rupiah(total)}</span>
      </div>

      <fieldset>
        <legend className="label">Cara bayar</legend>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {METHODS.map((m) => {
            const on = method === m.id;
            return (
              <label
                key={m.id}
                className={`flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 p-2 text-center transition-colors has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] has-[:focus-visible]:outline ${
                  on ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface hover:border-[#cfd4dc]"
                }`}
              >
                <input
                  type="radio"
                  name="method"
                  value={m.id}
                  className="sr-only"
                  checked={on}
                  onChange={() => {
                    setMethod(m.id);
                    setError(null);
                  }}
                />
                <m.icon width={26} height={26} />
                <span className="font-extrabold">{m.label}</span>
                <span className={`hidden text-xs sm:block ${on ? "text-primary" : "text-muted"}`}>{m.hint}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {method === "cash" && (
        <div>
          <label htmlFor="cash" className="label">
            Uang diterima
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-lg font-bold text-muted">Rp</span>
            <input
              id="cash"
              className="field h-14 pl-12 text-2xl font-extrabold"
              inputMode="numeric"
              autoFocus
              placeholder="0"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {quickCash(total).map((v) => (
              <button key={v} type="button" className="btn btn-ghost min-h-11 px-2 text-sm" onClick={() => setCash(String(v))}>
                {v === total ? "Uang pas" : rupiah(v)}
              </button>
            ))}
          </div>
          <div
            className={`mt-4 flex items-center justify-between rounded-xl px-4 py-3 ${
              change !== null && change < 0 ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary"
            }`}
          >
            <span className="font-semibold">Kembalian</span>
            <span className="text-2xl font-extrabold">
              {change === null ? "-" : change < 0 ? `kurang ${rupiah(-change)}` : rupiah(change)}
            </span>
          </div>
        </div>
      )}

      {method === "qris" && (
        <div className="rounded-xl bg-canvas p-4 text-sm text-muted">
          QR akan tampil di layar ini. Pelanggan scan dengan e-wallet atau m-banking, lalu stok berkurang otomatis setelah
          pembayaran masuk.
        </div>
      )}

      {method === "kasbon" && <CustomerPicker value={customerId} onChange={setCustomerId} />}

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-danger">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary min-h-14 w-full text-lg" disabled={busy}>
        {busy ? "Memproses…" : method === "qris" ? "Tampilkan QR" : method === "kasbon" ? "Catat sebagai kasbon" : "Selesaikan"}
      </button>
    </form>
  );
}

function QrisWait({
  stage,
  onPaid,
  onClosed,
}: {
  stage: Extract<Stage, { kind: "qris" }>;
  onPaid: () => void;
  onClosed: () => void;
}) {
  const [status, setStatus] = useState<string>("pending");
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(stage.error);

  // Tanya status ke server tiap 3 detik sampai lunas / batal / kedaluwarsa.
  useEffect(() => {
    if (status !== "pending" || (!stage.qrUrl && !stage.snapToken)) return;
    const t = setInterval(async () => {
      setNow(Date.now());
      const res = await fetch(`/api/midtrans/status?sale_id=${stage.sale.id}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.status && body.status !== "pending") {
        setStatus(body.status);
        if (body.status === "paid") onPaid();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [status, stage, onPaid]);

  async function cancel() {
    setBusy(true);
    const res = await fetch("/api/midtrans/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sale_id: stage.sale.id }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error || "Gagal membatalkan");
    setStatus(body.status);
    if (body.status === "paid") onPaid();
  }

  const left = Math.max(0, Math.round((stage.expiresAt - now) / 1000));
  const pct = Math.min(100, (left / (15 * 60)) * 100);

  if (status === "expired" || status === "cancelled") {
    return (
      <div className="mx-auto max-w-sm space-y-4 py-6 text-center">
        <span aria-hidden="true" className="mx-auto grid size-14 place-items-center rounded-full bg-danger-soft text-2xl font-extrabold text-danger">
          !
        </span>
        <p role="status" className="text-xl font-extrabold">
          {status === "expired" ? "QR kedaluwarsa" : "Pembayaran QRIS dibatalkan"}
        </p>
        <p className="text-muted">Keranjang masih tersimpan. Kembali lalu pilih cara bayar lain.</p>
        <button type="button" className="btn btn-primary min-h-12 w-full" onClick={onClosed}>
          Kembali ke keranjang
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div>
        {stage.snapToken ? (
          <SnapEmbed token={stage.snapToken} />
        ) : stage.qrUrl ? (
          <div className="grid place-items-center rounded-2xl border border-line bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- gambar QR dari server Midtrans, bukan aset lokal */}
            <img src={stage.qrUrl} alt={`QRIS untuk membayar ${rupiah(stage.sale.total)}`} width={300} height={300} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-ink p-5 text-white">
          <p className="text-sm text-white/75">{stage.sale.invoice_no}</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight">{rupiah(stage.sale.total)}</p>
          {!error && (
            <>
              <p role="status" className="mt-4 flex items-center gap-2 text-sm font-semibold">
                <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-accent" />
                Menunggu pembayaran
                <span className="ml-auto tabular-nums">
                  {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
                </span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
                <div className="h-full rounded-full bg-accent transition-[width] duration-1000" style={{ width: `${pct}%` }} />
              </div>
            </>
          )}
        </div>
        {error ? (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 font-semibold text-danger">
            {error}
          </p>
        ) : (
          <ol className="space-y-2 text-sm text-muted">
            <li>1. Pelanggan buka e-wallet atau m-banking, pilih Scan/QRIS.</li>
            <li>2. Scan QR di layar ini dan bayar.</li>
            <li>3. Layar berganti otomatis setelah pembayaran masuk.</li>
          </ol>
        )}
        <button type="button" className="btn btn-danger mt-auto min-h-12 w-full" onClick={cancel} disabled={busy}>
          {busy ? "Membatalkan…" : "Batalkan QRIS"}
        </button>
      </div>
    </div>
  );
}

function CustomerPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  useEffect(() => {
    supabaseBrowser()
      .from("customers")
      .select("*")
      .order("name")
      .then(({ data, error }) => (error ? setError(errorMessage(error)) : setCustomers(data as Customer[])));
  }, []);

  const shown = useMemo(
    () => (customers ?? []).filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8),
    [customers, search],
  );

  async function add() {
    if (!newName.trim()) return setError("Nama pelanggan wajib diisi.");
    const { data, error } = await supabaseBrowser()
      .from("customers")
      .insert({ name: newName.trim(), phone: newPhone.trim() || null })
      .select("*")
      .single();
    if (error) return setError(errorMessage(error));
    setCustomers((list) => [...(list ?? []), data as Customer]);
    onChange((data as Customer).id);
    setAdding(false);
    setNewName("");
    setNewPhone("");
    setError(null);
  }

  if (error && !customers) return <p role="alert" className="text-danger">Gagal memuat pelanggan: {error}</p>;
  if (!customers) return <p role="status" className="text-muted">Memuat pelanggan…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="cust-search" className="label">
            Pelanggan
          </label>
          <input id="cust-search" type="search" className="field" placeholder="Cari nama" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {!adding && (
          <button type="button" className="btn btn-ghost" onClick={() => setAdding(true)}>
            + Baru
          </button>
        )}
      </div>
      {adding && (
        <div className="space-y-3 rounded-xl bg-canvas p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="new-cust" className="label">
                Nama pelanggan baru
              </label>
              <input id="new-cust" className="field" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="new-phone" className="label">
                No. HP (opsional)
              </label>
              <input id="new-phone" className="field" inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={add}>
              Simpan pelanggan
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
              Batal
            </button>
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-muted">{customers.length ? "Tidak ada nama yang cocok." : "Belum ada pelanggan."}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Pilih pelanggan">
          {shown.map((c) => (
            <li key={c.id}>
              <label
                className={`flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 py-2 ${
                  value === c.id ? "border-primary bg-primary-soft" : "border-line hover:border-[#cfd4dc]"
                }`}
              >
                <input type="radio" name="customer" className="sr-only" checked={value === c.id} onChange={() => onChange(c.id)} />
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-sm font-extrabold text-primary shadow-card">
                  {c.name.trim()[0]?.toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className={`block text-xs ${Number(c.debt_balance) > 0 ? "font-semibold text-danger" : "text-muted"}`}>
                    {Number(c.debt_balance) > 0 ? `Utang ${rupiah(c.debt_balance)}` : "Tidak ada utang"}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

declare global {
  interface Window {
    snap?: { embed: (token: string, options: Record<string, unknown>) => void };
  }
}

let snapScript: Promise<void> | null = null;

/** Memuat snap.js Midtrans sekali saja. */
function loadSnap(): Promise<void> {
  const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
  if (!clientKey) return Promise.reject(new Error("NEXT_PUBLIC_MIDTRANS_CLIENT_KEY belum diisi di .env.local"));
  snapScript ??= new Promise<void>((resolve, reject) => {
    const host = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true" ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
    const el = document.createElement("script");
    el.src = `${host}/snap/snap.js`;
    el.dataset.clientKey = clientKey;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      snapScript = null;
      reject(new Error("Gagal memuat Snap Midtrans. Periksa koneksi internet."));
    };
    document.head.appendChild(el);
  });
  return snapScript;
}

/** Halaman QRIS Snap ditanam di dialog kasir. Status lunas tetap dicek lewat server. */
function SnapEmbed({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "shown" | "closed">("loading");
  const [round, setRound] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | undefined;
    loadSnap()
      .then(() => {
        if (cancelled || !window.snap || !boxRef.current) return;
        // Semua handler wajib diisi: tanpa handler, Snap memindahkan seluruh halaman kasir
        // ke "Finish Redirect URL" di dashboard Midtrans. Status lunas tetap dicek lewat server.
        window.snap.embed(token, {
          embedId: "snap-embed",
          onSuccess: () => {},
          onPending: () => {},
          onClose: () => !cancelled && setState("closed"),
          onError: () => setError("Midtrans gagal menampilkan QRIS. Batalkan lalu coba lagi."),
        });
        setState("shown");
        // Tombol tutup bawaan Snap menghapus iframe-nya tanpa memanggil callback apa pun.
        observer = new MutationObserver(() => {
          if (!boxRef.current?.querySelector("iframe")) setState("closed");
        });
        observer.observe(boxRef.current, { childList: true, subtree: true });
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [token, round]);

  function showAgain() {
    if (boxRef.current) boxRef.current.innerHTML = "";
    setState("loading");
    setRound((r) => r + 1);
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-white">
        {state === "loading" && !error && (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted">Memuat QRIS…</div>
        )}
        {state === "closed" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="font-semibold">Tampilan QR tertutup</p>
            <p className="text-sm text-muted">Tagihan masih aktif. Tampilkan lagi untuk pelanggan, atau tekan “Batalkan QRIS”.</p>
            <button type="button" className="btn btn-primary" onClick={showAgain}>
              Tampilkan QR lagi
            </button>
          </div>
        )}
        <div id="snap-embed" ref={boxRef} className="h-[560px] w-full" />
      </div>
      {error && (
        <p role="alert" className="mt-2 font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
