import { NextResponse } from "next/server";
import { applyStatus, isValidSignature, mapStatus } from "@/lib/midtrans";
import { supabaseAdmin } from "@/lib/supabase/server";

// Webhook Midtrans. Atur URL ini di Midtrans > Settings > Payment > Notification URL:
//   https://domain-kamu/api/midtrans/notification
export async function POST(request: Request) {
  const n = await request.json().catch(() => null);
  if (!n?.order_id || !n?.signature_key || !n?.status_code || !n?.gross_amount) {
    return NextResponse.json({ error: "Payload tidak lengkap" }, { status: 400 });
  }
  if (!isValidSignature(n)) {
    return NextResponse.json({ error: "Tanda tangan tidak valid" }, { status: 403 });
  }

  const { data: sale, error } = await supabaseAdmin()
    .from("sales")
    .select("id, total, status")
    .eq("midtrans_order_id", n.order_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Order lama/tidak dikenal: jawab 200 supaya Midtrans berhenti mengirim ulang.
  if (!sale) return NextResponse.json({ ok: true, ignored: "order tidak dikenal" });

  if (Math.round(Number(n.gross_amount)) !== Math.round(Number(sale.total))) {
    return NextResponse.json({ error: "Nominal tidak cocok" }, { status: 400 });
  }

  try {
    await applyStatus(sale.id, mapStatus(n));
  } catch (e) {
    // Contoh: transaksi sudah dibatalkan kasir lalu pembayaran masuk. Dicatat untuk dicek manual.
    console.error("[midtrans] gagal menerapkan status", n.order_id, e);
    return NextResponse.json({ error: "Gagal memproses" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
