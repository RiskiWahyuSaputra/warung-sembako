import { createHash } from "node:crypto";
import { beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: vi.fn() }));

const SERVER_KEY = "SB-Mid-server-tes";
let midtrans: typeof import("@/lib/midtrans");

beforeAll(async () => {
  process.env.MIDTRANS_SERVER_KEY = SERVER_KEY;
  midtrans = await import("@/lib/midtrans");
});

describe("isValidSignature (webhook)", () => {
  const n = { order_id: "INV-261121-00001", status_code: "200", gross_amount: "36000.00" };
  const sign = (key: string) => createHash("sha512").update(n.order_id + n.status_code + n.gross_amount + key).digest("hex");

  test("tanda tangan asli diterima", () => {
    expect(midtrans.isValidSignature({ ...n, signature_key: sign(SERVER_KEY) })).toBe(true);
  });

  test("tanda tangan dari kunci lain ditolak", () => {
    expect(midtrans.isValidSignature({ ...n, signature_key: sign("kunci-palsu") })).toBe(false);
  });

  test("nominal diubah penyerang ditolak", () => {
    expect(midtrans.isValidSignature({ ...n, gross_amount: "1.00", signature_key: sign(SERVER_KEY) })).toBe(false);
  });

  test("format sampah ditolak tanpa error", () => {
    expect(midtrans.isValidSignature({ ...n, signature_key: "bukan-hex" })).toBe(false);
  });
});

test.each([
  [{ transaction_status: "settlement" }, "paid"],
  [{ transaction_status: "capture", fraud_status: "accept" }, "paid"],
  [{ transaction_status: "capture", fraud_status: "challenge" }, "pending"],
  [{ transaction_status: "expire" }, "expired"],
  [{ transaction_status: "deny" }, "cancelled"],
  [{ transaction_status: "pending" }, "pending"],
] as const)("mapStatus %j -> %s", (input, expected) => {
  expect(midtrans.mapStatus(input)).toBe(expected);
});
