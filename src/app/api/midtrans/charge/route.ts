import { NextResponse } from "next/server";
import { loadSaleForUser } from "@/lib/api-auth";
import { chargeQris, createSnapQris, qrisMode } from "@/lib/midtrans";
import { supabaseAdmin } from "@/lib/supabase/server";

// Membuat QR Midtrans untuk penjualan QRIS yang masih menunggu bayar.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const sale = await loadSaleForUser(body.sale_id);
  if (sale instanceof NextResponse) return sale;

  if (sale.payment_method !== "qris" || sale.status !== "pending") {
    return NextResponse.json({ error: "Transaksi ini tidak menunggu pembayaran QRIS" }, { status: 409 });
  }
  if (Number(sale.total) < 1) {
    return NextResponse.json({ error: "Total belanja harus lebih dari Rp0" }, { status: 400 });
  }

  // order_id unik per percobaan, supaya QR bisa dibuat ulang jika gagal.
  const orderId = `${sale.invoice_no}-${Date.now().toString(36)}`;
  try {
    const save = async (url: string | null) => {
      const { error } = await supabaseAdmin()
        .from("sales")
        .update({ midtrans_order_id: orderId, qr_url: url })
        .eq("id", sale.id)
        .eq("status", "pending");
      if (error) throw error;
    };
    if (qrisMode() === "snap") {
      const snap = await createSnapQris(orderId, Number(sale.total));
      await save(snap.redirectUrl);
      return NextResponse.json({ mode: "snap", snap_token: snap.token, order_id: orderId });
    }
    const qr = await chargeQris(orderId, Number(sale.total));
    await save(qr.qrUrl);
    return NextResponse.json({ mode: "core", qr_url: qr.qrUrl, expiry_time: qr.expiryTime, order_id: orderId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal menghubungi Midtrans" }, { status: 502 });
  }
}
