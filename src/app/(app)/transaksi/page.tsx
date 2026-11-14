"use client";

import { RequireProfile } from "@/components/shell";
import { useEffect, useState } from "react";
import { Receipt } from "@/components/receipt";
import { Empty, ErrorBox, Loading, Modal, PageHeader } from "@/components/ui";
import { dateTime, errorMessage, rupiah, todayJakarta } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { METHOD_LABEL, STATUS_LABEL, type Sale, type SaleStatus } from "@/lib/types";

/** Rentang satu hari di Asia/Jakarta (UTC+7) dalam ISO UTC. */
function dayRange(date: string) {
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 3600_000);
  return [start.toISOString(), end.toISOString()] as const;
}

export default function TransaksiPage() {
  return (
    <RequireProfile>
      <TransaksiContent />
    </RequireProfile>
  );
}

function TransaksiContent() {
  const [date, setDate] = useState(todayJakarta);
  const [status, setStatus] = useState<SaleStatus | "">("");
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const [from, to] = dayRange(date);
    let q = supabaseBrowser()
      .from("sales")
      .select("*")
      .gte("created_at", from)
      .lt("created_at", to)
      .order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    q.then(({ data, error }) => {
      if (cancelled) return;
      if (error) setError(errorMessage(error));
      else {
        setError(null);
        setSales(data as Sale[]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [date, status, attempt]);

  const paid = (sales ?? []).filter((s) => s.status === "paid");
  const paidTotal = paid.reduce((sum, s) => sum + Number(s.total), 0);

  return (
    <>
      <PageHeader title="Transaksi" />
      <div className="mb-4 grid gap-3 sm:grid-cols-[auto_auto_1fr] sm:items-end">
        <div>
          <label htmlFor="tgl" className="label">
            Tanggal
          </label>
          <input id="tgl" type="date" className="field" value={date} max={todayJakarta()} onChange={(e) => {
              if (!e.target.value) return;
              setSales(null);
              setDate(e.target.value);
            }} />
        </div>
        <div>
          <label htmlFor="status" className="label">
            Status
          </label>
          <select id="status" className="field" value={status} onChange={(e) => {
              setSales(null);
              setStatus(e.target.value as SaleStatus | "");
            }}>
            <option value="">Semua</option>
            {(Object.keys(STATUS_LABEL) as SaleStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        {sales && (
          <p className="sm:justify-self-end">
            {paid.length} transaksi lunas · <span className="font-extrabold">{rupiah(paidTotal)}</span>
          </p>
        )}
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={() => setAttempt((a) => a + 1)} />
      ) : !sales ? (
        <Loading />
      ) : sales.length === 0 ? (
        <Empty title="Tidak ada transaksi pada tanggal ini" />
      ) : (
        <ul className="panel divide-y divide-dashed divide-line">
          {sales.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setOpenId(s.id)}
                className="grid w-full gap-1 px-4 py-3 text-left hover:bg-paper sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-center"
              >
                <span>
                  <span className="block font-semibold">{s.invoice_no}</span>
                  <span className="block text-xs text-ink-soft">{dateTime(s.created_at)}</span>
                </span>
                <span className="text-sm">{METHOD_LABEL[s.payment_method]}</span>
                <span className={`text-sm font-semibold ${s.status === "paid" ? "text-green" : s.status === "pending" ? "" : "text-brick"}`}>
                  {STATUS_LABEL[s.status]}
                </span>
                <span className="font-extrabold sm:text-right">{rupiah(s.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={openId !== null} onClose={() => setOpenId(null)} title="Detail transaksi">
        {openId && (
          <>
            <Receipt saleId={openId} />
            <button type="button" className="no-print btn btn-ghost mt-6 w-full" onClick={() => window.print()}>
              Cetak ulang struk
            </button>
          </>
        )}
      </Modal>
    </>
  );
}
