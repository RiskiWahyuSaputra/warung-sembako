"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { dateTime, errorMessage, qty, rupiah } from "@/lib/format";
import { METHOD_LABEL, STATUS_LABEL, type Sale, type SaleItem } from "@/lib/types";
import { ErrorBox, Loading } from "./ui";

const storeName = process.env.NEXT_PUBLIC_STORE_NAME || "Warung Sembako";
const storeAddress = process.env.NEXT_PUBLIC_STORE_ADDRESS || "";

type Loaded = { sale: Sale; items: SaleItem[]; customer: string | null };

/** Struk transaksi, siap dicetak ke printer thermal 58mm lewat dialog cetak browser. */
export function Receipt({ saleId }: { saleId: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabaseBrowser();
      const [s, i] = await Promise.all([
        sb.from("sales").select("*, customers(name)").eq("id", saleId).single(),
        sb.from("sale_items").select("id, sale_id, product_name, unit_name, qty, price, subtotal").eq("sale_id", saleId),
      ]);
      if (cancelled) return;
      if (s.error || i.error) return setError(errorMessage(s.error ?? i.error));
      const { customers, ...sale } = s.data as Sale & { customers: { name: string } | null };
      setError(null);
      setData({ sale, items: i.data as SaleItem[], customer: customers?.name ?? null });
    })();
    return () => {
      cancelled = true;
    };
  }, [saleId, attempt]);

  if (error) return <ErrorBox message={error} onRetry={() => setAttempt((a) => a + 1)} />;
  if (!data) return <Loading label="Menyiapkan struk…" />;
  const { sale, items, customer } = data;

  return (
    <div className="print-area mx-auto max-w-xs bg-surface px-4 pt-4 pb-6 text-sm">
      <p className="text-center text-base font-extrabold">{storeName}</p>
      {storeAddress && <p className="text-center text-xs">{storeAddress}</p>}
      <hr className="perforated my-3 border-t-2" />
      <p>{sale.invoice_no}</p>
      <p>{dateTime(sale.paid_at ?? sale.created_at)}</p>
      {sale.status !== "paid" && <p className="font-bold text-danger">{STATUS_LABEL[sale.status]}</p>}
      <hr className="perforated my-3 border-t-2" />
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id}>
            <p className="font-semibold">{it.product_name}</p>
            <p className="flex justify-between gap-2">
              <span>
                {qty(it.qty)} {it.unit_name} × {rupiah(it.price)}
              </span>
              <span>{rupiah(it.subtotal)}</span>
            </p>
          </li>
        ))}
      </ul>
      <hr className="perforated my-3 border-t-2" />
      <p className="flex justify-between text-base font-extrabold">
        <span>Total</span>
        <span>{rupiah(sale.total)}</span>
      </p>
      <p className="flex justify-between">
        <span>Bayar</span>
        <span>{METHOD_LABEL[sale.payment_method]}</span>
      </p>
      {sale.payment_method === "cash" && sale.cash_received != null && (
        <>
          <p className="flex justify-between">
            <span>Diterima</span>
            <span>{rupiah(sale.cash_received)}</span>
          </p>
          <p className="flex justify-between font-bold">
            <span>Kembali</span>
            <span>{rupiah(sale.change_amount)}</span>
          </p>
        </>
      )}
      {customer && (
        <p className="flex justify-between">
          <span>Pelanggan</span>
          <span>{customer}</span>
        </p>
      )}
      <p className="mt-4 text-center text-xs">Terima kasih sudah belanja</p>
    </div>
  );
}
