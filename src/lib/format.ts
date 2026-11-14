const rupiahFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const qtyFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });

export const rupiah = (n: number | string | null | undefined) => `Rp${rupiahFmt.format(Number(n ?? 0))}`;
export const qty = (n: number | string | null | undefined) => qtyFmt.format(Number(n ?? 0));

/** "12.500" atau "12500" atau "12,5" -> angka. Mengembalikan NaN jika tidak valid. */
export function parseNumber(input: string): number {
  const s = input.trim().replace(/\s|rp/gi, "");
  if (!s) return NaN;
  // Format Indonesia: titik = ribuan, koma = desimal.
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  return Number(s);
}

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

/** Tanggal hari ini di Asia/Jakarta, format YYYY-MM-DD. */
export const todayJakarta = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Terjadi kesalahan. Coba lagi.";
}
