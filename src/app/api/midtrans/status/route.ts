import { NextResponse, type NextRequest } from "next/server";
import { loadSaleForUser } from "@/lib/api-auth";
import { applyStatus, getStatus, mapStatus } from "@/lib/midtrans";

// Cadangan webhook: layar kasir menanyakan status ke Midtrans setiap beberapa detik.
// Berguna saat development di localhost, karena webhook Midtrans tidak bisa menjangkau localhost.
export async function GET(request: NextRequest) {
  const sale = await loadSaleForUser(request.nextUrl.searchParams.get("sale_id"));
  if (sale instanceof NextResponse) return sale;

  if (sale.status !== "pending" || !sale.midtrans_order_id) {
    return NextResponse.json({ status: sale.status });
  }
  try {
    const r = await getStatus(sale.midtrans_order_id);
    if (r.status_code === "404") return NextResponse.json({ status: "pending" });
    const status = mapStatus(r);
    await applyStatus(sale.id, status);
    return NextResponse.json({ status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gagal cek status" }, { status: 502 });
  }
}
