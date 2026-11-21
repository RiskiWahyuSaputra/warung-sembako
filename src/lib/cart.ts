import { parseNumber } from "./format";
import type { Product } from "./types";

export type Line = {
  key: string;
  product: Product;
  unitId: string;
  /** "qty": jumlah satuan. "amount": beli per nominal rupiah (bensin Rp10.000). */
  mode: "qty" | "amount";
  input: string;
};

export const unitOf = (l: Line) => l.product.product_units!.find((u) => u.id === l.unitId)!;
export const defaultUnit = (p: Product) => p.product_units!.find((u) => u.is_default) ?? p.product_units![0];

/** Jumlah satuan & subtotal sebuah baris, atau null jika input belum valid. */
export function lineValue(l: Line): { qty: number; subtotal: number } | null {
  const u = unitOf(l);
  const n = parseNumber(l.input);
  if (!(n > 0)) return null;
  if (l.mode === "amount") {
    if (!(u.price > 0)) return null;
    return { qty: Math.round((n / u.price) * 1000) / 1000, subtotal: Math.round(n) };
  }
  if (!l.product.allow_decimal && !Number.isInteger(n)) return null;
  return { qty: n, subtotal: Math.round(n * u.price) };
}

/** Pecahan uang yang biasa diterima, untuk tombol cepat. */
export function quickCash(total: number) {
  const options = new Set<number>([total]);
  for (const step of [5000, 10000, 20000, 50000, 100000]) {
    const v = Math.ceil(total / step) * step;
    if (v > total) options.add(v);
  }
  return [...options].sort((a, b) => a - b).slice(0, 6);
}
