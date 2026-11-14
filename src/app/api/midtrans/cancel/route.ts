import { NextResponse } from "next/server";
import { loadSaleForUser } from "@/lib/api-auth";
import { applyStatus, cancelCharge, getStatus, mapStatus } from "@/lib/midtrans";

// Kasir membatalkan QRIS. Jika ternyata pelanggan sudah bayar, transaksi justru diselesaikan.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const sale = await loadSaleForUser(body.sale_id);
  if (sale instanceof NextResponse) return sale;
  if (sale.status !== "pending") return NextResponse.json({ status: sale.status });

  try {
    if (sale.midtrans_order_id) {
      const current = await getStatus(sale.midtrans_order_id);
      if (current.status_code !== "404" && mapStatus(current) === "paid") {
        await applyStatus(sale.id, "paid");
        return NextResponse.json({ status: "paid" });
      }
      await cancelCharge(sale.midtrans_order_id);
    }
    await applyStatus(sale.id, "cancelled");
    return NextResponse.json({ status: "cancelled" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal membatalkan" }, { status: 502 });
  }
}
