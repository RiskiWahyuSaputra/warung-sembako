import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "./supabase/server";

const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
const BASE_URL = isProduction ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";

function serverKey() {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error("MIDTRANS_SERVER_KEY belum diisi di .env.local");
  return key;
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${serverKey()}:`).toString("base64")}`,
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  return (await res.json()) as T;
}

type MidtransResponse = {
  status_code: string;
  status_message?: string;
  transaction_status?: string;
  fraud_status?: string;
  order_id?: string;
  gross_amount?: string;
  qr_string?: string;
  expiry_time?: string;
  actions?: { name: string; method: string; url: string }[];
};

/** Membuat tagihan QRIS. QR berlaku 15 menit. */
export async function chargeQris(orderId: string, amount: number) {
  const r = await call<MidtransResponse>("/v2/charge", {
    method: "POST",
    body: {
      payment_type: "qris",
      transaction_details: { order_id: orderId, gross_amount: Math.round(amount) },
      // Penyedia QRIS yang aktif di akun Midtrans: "gopay" (bawaan) atau "airpay shopee".
      qris: { acquirer: process.env.MIDTRANS_QRIS_ACQUIRER || "gopay" },
      custom_expiry: { expiry_duration: 15, unit: "minute" },
    },
  });
  if (r.status_code !== "201") {
    if (r.status_code === "402" || /not activated/i.test(r.status_message ?? "")) {
      throw new Error(
        "QRIS belum aktif di akun Midtrans. Aktifkan di Midtrans > Settings > Payment, atau ganti MIDTRANS_QRIS_ACQUIRER.",
      );
    }
    throw new Error(`Midtrans menolak tagihan: ${r.status_message ?? r.status_code}`);
  }
  const qrUrl = r.actions?.find((a) => a.name === "generate-qr-code")?.url;
  if (!qrUrl) throw new Error("Midtrans tidak mengirim gambar QR");
  return { qrUrl, qrString: r.qr_string ?? null, expiryTime: r.expiry_time ?? null };
}

/**
 * Cara bayar QRIS: "snap" (bawaan) memakai halaman Snap yang ditanam di dialog kasir,
 * "core" menampilkan gambar QR langsung (butuh Core API diaktifkan Midtrans untuk akunmu).
 */
export const qrisMode = (): "snap" | "core" => (process.env.MIDTRANS_QRIS_MODE === "core" ? "core" : "snap");

/** Membuat transaksi Snap yang hanya menawarkan QRIS. Berlaku 15 menit. */
export async function createSnapQris(orderId: string, amount: number) {
  const host = isProduction ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
  const res = await fetch(`${host}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${serverKey()}:`).toString("base64")}`,
    },
    body: JSON.stringify({
      transaction_details: { order_id: orderId, gross_amount: Math.round(amount) },
      enabled_payments: ["other_qris"],
      expiry: { unit: "minute", duration: 15 },
    }),
    cache: "no-store",
  });
  const r = (await res.json()) as { token?: string; redirect_url?: string; error_messages?: string[]; error?: string };
  if (!res.ok || !r.token) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Server key belum diberi izin Snap Checkout. Ubah izinnya di Midtrans > Settings > Access Keys.");
    }
    throw new Error(`Midtrans menolak tagihan: ${r.error_messages?.join(", ") ?? r.error ?? res.status}`);
  }
  return { token: r.token, redirectUrl: r.redirect_url ?? null };
}

export const getStatus = (orderId: string) => call<MidtransResponse>(`/v2/${encodeURIComponent(orderId)}/status`);
export const cancelCharge = (orderId: string) =>
  call<MidtransResponse>(`/v2/${encodeURIComponent(orderId)}/cancel`, { method: "POST" });

export type LocalStatus = "pending" | "paid" | "expired" | "cancelled";

/** Status Midtrans -> status penjualan. */
export function mapStatus(r: Pick<MidtransResponse, "transaction_status" | "fraud_status">): LocalStatus {
  switch (r.transaction_status) {
    case "settlement":
      return "paid";
    case "capture":
      return r.fraud_status === "accept" ? "paid" : "pending";
    case "expire":
      return "expired";
    case "cancel":
    case "deny":
    case "failure":
      return "cancelled";
    default:
      return "pending";
  }
}

/** Tanda tangan webhook: SHA512(order_id + status_code + gross_amount + server_key). */
export function isValidSignature(n: { order_id: string; status_code: string; gross_amount: string; signature_key: string }) {
  const expected = createHash("sha512")
    .update(n.order_id + n.status_code + n.gross_amount + serverKey())
    .digest();
  const given = Buffer.from(String(n.signature_key), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Menerapkan status pembayaran ke database (stok berkurang saat lunas). */
export async function applyStatus(saleId: string, status: LocalStatus) {
  const admin = supabaseAdmin();
  if (status === "paid") {
    const { error } = await admin.rpc("finalize_sale", { p_sale_id: saleId });
    if (error) throw error;
  } else if (status === "expired" || status === "cancelled") {
    const { error } = await admin.rpc("cancel_pending_sale", { p_sale_id: saleId, p_status: status });
    if (error) throw error;
  }
}
