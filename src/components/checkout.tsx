"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { errorMessage, parseNumber, rupiah } from "@/lib/format";
import type { Customer, PaymentMethod, Sale } from "@/lib/types";
import { Receipt } from "./receipt";

export type SaleLinePayload = { unit_id: string; qty: number } | { unit_id: string; amount: number };

type Stage =
  | { kind: "form" }
  | { kind: "qris"; sale: Sale; qrUrl: string | null; expiresAt: number; error: string | null }
  | { kind: "done"; saleId: string };

/** Pecahan uang yang biasa diterima, untuk tombol cepat. */
function quickCash(total: number) {
  const options = new Set<number>([total]);
  for (const step of [5000, 10000, 20000, 50000, 100000]) {
    const v = Math.ceil(total / step) * step;
    if (v > total) options.add(v);
  }
  return [...options].sort((a, b) => a - b).slice(0, 5);
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
      qrUrl: res.ok ? body.qr_url : null,
      expiresAt: Date.now() + 15 * 60_000,
      error: res.ok ? null : body.error || "Gagal membuat QR",
    });
  }

  if (stage.kind === "done") {
    return (
      <div>
        <p role="status" className="mb-3 rounded-lg bg-green-tint p-3 text-center font-bold text-green">
          Transaksi lunas
        </p>
        <Receipt saleId={stage.saleId} />
        <div className="no-print mt-6 grid grid-cols-2 gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
            Cetak struk
          </button>
          <button type="button" className="btn btn-primary" onClick={onFinished} autoFocus>
            Transaksi baru
          </button>
        </div>
      </div>
    );
  }

  if (stage.kind === "qris") {
    return <QrisWait stage={stage} onPaid={() => finish(stage.sale.id)} onClosed={onFinished} />;
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="perforated flex items-baseline justify-between rounded-lg border-2 p-4">
        <span className="font-semibold">Total belanja</span>
        <span className="text-3xl font-extrabold text-brick">{rupiah(total)}</span>
      </div>

      <fieldset>
        <legend className="label">Cara bayar</legend>
        <div className="grid grid-cols-3 gap-2">
          {(["cash", "qris", "kasbon"] as const).map((m) => (
            <label
              key={m}
              className={`flex min-h-12 items-center justify-center rounded-lg border-2 font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus)] ${
                method === m ? "border-green bg-green-tint text-green" : "border-line bg-card hover:border-ink-soft"
              }`}
            >
              <input
                type="radio"
                name="method"
                value={m}
                className="sr-only"
                checked={method === m}
                onChange={() => {
                  setMethod(m);
                  setError(null);
                }}
              />
              {m === "cash" ? "Tunai" : m === "qris" ? "QRIS" : "Kasbon"}
            </label>
          ))}
        </div>
      </fieldset>

      {method === "cash" && (
        <div>
          <label htmlFor="cash" className="label">
            Uang diterima
          </label>
          <input
            id="cash"
            className="field text-xl font-bold"
            inputMode="numeric"
            autoFocus
            value={cash}
            onChange={(e) => setCash(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {quickCash(total).map((v) => (
              <button key={v} type="button" className="btn btn-ghost min-h-10 text-sm" onClick={() => setCash(String(v))}>
                {v === total ? "Uang pas" : rupiah(v)}
              </button>
            ))}
          </div>
          <p className="mt-3 flex justify-between text-lg">
            <span>Kembalian</span>
            <span className={`font-extrabold ${change !== null && change < 0 ? "text-brick" : ""}`}>
              {change === null ? "-" : change < 0 ? `kurang ${rupiah(-change)}` : rupiah(change)}
            </span>
          </p>
        </div>
      )}

      {method === "qris" && (
        <p className="text-sm text-ink-soft">
          QR Midtrans akan muncul di layar. Pelanggan scan dengan e-wallet atau m-banking, stok berkurang otomatis setelah
          pembayaran masuk.
        </p>
      )}

      {method === "kasbon" && <CustomerPicker value={customerId} onChange={setCustomerId} />}

      {error && (
        <p role="alert" className="font-semibold text-brick">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary min-h-12 w-full text-lg" disabled={busy}>
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
    if (status !== "pending" || !stage.qrUrl) return;
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

  if (status === "expired" || status === "cancelled") {
    return (
      <div className="space-y-4 text-center">
        <p role="status" className="font-bold text-brick">
          {status === "expired" ? "QR kedaluwarsa, pembayaran tidak masuk." : "Pembayaran QRIS dibatalkan."}
        </p>
        <p className="text-sm text-ink-soft">Keranjang masih tersimpan. Tutup lalu pilih cara bayar lain.</p>
        <button type="button" className="btn btn-primary w-full" onClick={onClosed}>
          Kembali ke keranjang
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-ink-soft">{stage.sale.invoice_no}</p>
      <p className="text-3xl font-extrabold text-brick">{rupiah(stage.sale.total)}</p>
      {stage.qrUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- gambar QR dari server Midtrans, bukan aset lokal
        <img src={stage.qrUrl} alt={`QRIS untuk membayar ${rupiah(stage.sale.total)}`} width={280} height={280} className="mx-auto rounded-lg border border-line bg-white p-2" />
      ) : null}
      {error ? (
        <p role="alert" className="font-semibold text-brick">
          {error}
        </p>
      ) : (
        <p role="status" className="font-semibold">
          Menunggu pembayaran… sisa {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </p>
      )}
      <button type="button" className="btn btn-danger w-full" onClick={cancel} disabled={busy}>
        {busy ? "Membatalkan…" : "Batalkan QRIS"}
      </button>
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

  if (error && !customers) return <p role="alert" className="text-brick">Gagal memuat pelanggan: {error}</p>;
  if (!customers) return <p role="status" className="text-ink-soft">Memuat pelanggan…</p>;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="cust-search" className="label">
          Pelanggan
        </label>
        <input id="cust-search" type="search" className="field" placeholder="Cari nama" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-ink-soft">{customers.length ? "Tidak ada nama yang cocok." : "Belum ada pelanggan."}</p>
      ) : (
        <ul className="space-y-1" role="radiogroup" aria-label="Pilih pelanggan">
          {shown.map((c) => (
            <li key={c.id}>
              <label
                className={`flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 ${
                  value === c.id ? "border-green bg-green-tint" : "border-line hover:border-ink-soft"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input type="radio" name="customer" className="size-4 accent-green" checked={value === c.id} onChange={() => onChange(c.id)} />
                  {c.name}
                </span>
                {Number(c.debt_balance) > 0 && <span className="text-sm text-brick">utang {rupiah(c.debt_balance)}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="space-y-2 rounded-lg border border-line p-3">
          <label htmlFor="new-cust" className="label">
            Nama pelanggan baru
          </label>
          <input id="new-cust" className="field" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <label htmlFor="new-phone" className="label">
            No. HP (opsional)
          </label>
          <input id="new-phone" className="field" inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={add}>
              Simpan pelanggan
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>
              Batal
            </button>
          </div>
          {error && <p role="alert" className="text-sm text-brick">{error}</p>}
        </div>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => setAdding(true)}>
          Pelanggan baru
        </button>
      )}
    </div>
  );
}
