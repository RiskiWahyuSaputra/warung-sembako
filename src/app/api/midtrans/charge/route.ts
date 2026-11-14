import { NextResponse } from "next/server";
import { loadSaleForUser } from "@/lib/api-auth";
import { chargeQris } from "@/lib/midtrans";
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
    const qr = await chargeQris(orderId, Number(sale.total));
    const { error } = await supabaseAdmin()
      .from("sales")
      .update({ midtrans_order_id: orderId, qr_url: qr.qrUrl })
      .eq("id", sale.id)
      .eq("status", "pending");
    if (error) throw error;
    return NextResponse.json({ qr_url: qr.qrUrl, expiry_time: qr.expiryTime, order_id: orderId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal menghubungi Midtrans" }, { status: 502 });
  }
}
