import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "./supabase/server";
import type { Sale } from "./types";

/**
 * Memastikan pemanggil sudah login dan boleh melihat penjualan ini (lewat RLS).
 * Mengembalikan penjualan, atau NextResponse error untuk langsung dikembalikan.
 */
export async function loadSaleForUser(saleId: unknown): Promise<Sale | NextResponse> {
  if (typeof saleId !== "string" || !/^[0-9a-f-]{36}$/i.test(saleId)) {
    return NextResponse.json({ error: "sale_id tidak valid" }, { status: 400 });
  }
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Belum login" }, { status: 401 });

  const { data, error } = await sb.from("sales").select("*").eq("id", saleId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
  return data as Sale;
}
