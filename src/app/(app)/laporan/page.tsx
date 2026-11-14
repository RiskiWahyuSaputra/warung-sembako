"use client";

import { useEffect, useState } from "react";
import { OwnerOnly } from "@/components/owner-only";
import { RequireProfile } from "@/components/shell";
import { Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { errorMessage, qty, rupiah, todayJakarta } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { METHOD_LABEL, type PaymentMethod } from "@/lib/types";

type Report = {
  omzet: number;
  modal: number;
  transaksi: number;
  per_metode: Partial<Record<PaymentMethod, number>>;
  harian: { tanggal: string; omzet: number; modal: number }[];
  terlaris: { product_name: string; qty_dasar: number; omzet: number; laba: number }[];
  kasbon_beredar: number;
};

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T12:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

const PRESETS = [
  { label: "Hari ini", range: (t: string) => [t, t] },
  { label: "7 hari", range: (t: string) => [shiftDate(t, -6), t] },
  { label: "Bulan ini", range: (t: string) => [`${t.slice(0, 8)}01`, t] },
] as const;

export default function LaporanPage() {
  return (
    <RequireProfile>
      <OwnerOnly>
        <LaporanContent />
      </OwnerOnly>
    </RequireProfile>
  );
}

function LaporanContent() {
  const today = todayJakarta();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabaseBrowser()
      .rpc("report", { p_from: from, p_to: to })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) setError(errorMessage(error));
        else {
          setError(null);
          setReport(data as Report);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, attempt]);

  function pick(f: string, t: string) {
    setLoading(true);
    setFrom(f);
    setTo(t);
  }

  const laba = report ? Number(report.omzet) - Number(report.modal) : 0;

  return (
    <>
      <PageHeader title="Laporan" description="Penjualan lunas dan laba kotor pada rentang tanggal yang dipilih." />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Rentang cepat">
          {PRESETS.map((p) => {
            const [f, t] = p.range(today);
            const active = f === from && t === to;
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={active}
                className={`btn ${active ? "btn-primary" : "btn-ghost"}`}
                onClick={() => pick(f, t)}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div>
          <label htmlFor="dari" className="label">
            Dari
          </label>
          <input id="dari" type="date" className="field" value={from} max={to} onChange={(e) => e.target.value && pick(e.target.value, to)} />
        </div>
        <div>
          <label htmlFor="sampai" className="label">
            Sampai
          </label>
          <input id="sampai" type="date" className="field" value={to} min={from} max={today} onChange={(e) => e.target.value && pick(from, e.target.value)} />
        </div>
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={() => setAttempt((a) => a + 1)} />
      ) : loading || !report ? (
        <Loading label="Menghitung laporan…" />
      ) : (
        <div className="space-y-6">
          {/* Laba kotor jadi titik fokus: itu yang paling ingin diketahui pemilik warung */}
          <section aria-label="Ringkasan" className="grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr]">
            {/* Laba kotor jadi titik fokus (kartu gelap): itu yang paling ingin diketahui pemilik */}
            <div className="rounded-2xl bg-ink p-6 text-white shadow-card">
              <p className="text-sm font-semibold text-white/75">Laba kotor</p>
              <p className={`mt-1 text-4xl font-extrabold tracking-tight ${laba < 0 ? "text-[#ffb3b3]" : "text-[#86efac]"}`}>{rupiah(laba)}</p>
              <p className="mt-2 text-sm text-white/75">Omzet dikurangi harga modal barang terjual</p>
            </div>
            <div className="panel p-6">
              <p className="text-sm font-semibold text-muted">Omzet</p>
              <p className="mt-1 text-2xl font-extrabold">{rupiah(report.omzet)}</p>
              <p className="mt-2 text-sm text-muted">{report.transaksi} transaksi lunas</p>
            </div>
            <div className="panel p-6">
              <p className="text-sm font-semibold text-muted">Kasbon belum dibayar</p>
              <p className="mt-1 text-2xl font-extrabold text-danger">{rupiah(report.kasbon_beredar)}</p>
              <p className="mt-2 text-sm text-muted">Semua pelanggan, saat ini</p>
            </div>
          </section>

          {report.transaksi === 0 ? (
            <Empty title="Belum ada penjualan lunas di rentang ini" />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
              <section aria-labelledby="metode" className="panel p-5">
                <h2 id="metode" className="mb-2 font-extrabold">
                  Per cara bayar
                </h2>
                <ul className="divide-y divide-line">
                  {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                    <li key={m} className="flex justify-between py-2">
                      <span>{METHOD_LABEL[m]}</span>
                      <span className="font-bold">{rupiah(report.per_metode[m] ?? 0)}</span>
                    </li>
                  ))}
                </ul>
                <h2 className="mt-5 mb-2 font-extrabold">Per hari</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted">
                      <th scope="col" className="py-1 font-semibold">Tanggal</th>
                      <th scope="col" className="py-1 text-right font-semibold">Omzet</th>
                      <th scope="col" className="py-1 text-right font-semibold">Laba</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {report.harian.map((d) => (
                      <tr key={d.tanggal}>
                        <td className="py-2">
                          {new Date(`${d.tanggal}T12:00:00+07:00`).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })}
                        </td>
                        <td className="py-2 text-right">{rupiah(d.omzet)}</td>
                        <td className="py-2 text-right font-semibold">{rupiah(Number(d.omzet) - Number(d.modal))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section aria-labelledby="terlaris" className="panel min-w-0 p-5">
                <h2 id="terlaris" className="mb-2 font-extrabold">
                  10 barang terlaris
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="text-left text-muted">
                        <th scope="col" className="py-1 font-semibold">Barang</th>
                        <th scope="col" className="py-1 text-right font-semibold">Terjual</th>
                        <th scope="col" className="py-1 text-right font-semibold">Omzet</th>
                        <th scope="col" className="py-1 text-right font-semibold">Laba</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {report.terlaris.map((t) => (
                        <tr key={t.product_name}>
                          <td className="py-2 pr-2">{t.product_name}</td>
                          <td className="py-2 text-right">{qty(t.qty_dasar)}</td>
                          <td className="py-2 text-right">{rupiah(t.omzet)}</td>
                          <td className={`py-2 text-right font-semibold ${Number(t.laba) < 0 ? "text-danger" : ""}`}>{rupiah(t.laba)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-muted">Terjual dalam satuan dasar stok (batang, liter, gram, pcs).</p>
              </section>
            </div>
          )}
        </div>
      )}
    </>
  );
}
