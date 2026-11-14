// Warna lembut per kategori untuk kotak inisial barang (pengganti foto barang).
// Warna dibagi berurutan menurut daftar kategori, jadi 6 kategori pertama pasti berbeda warna.
// Semua pasangan teks/latar di bawah >= 4,5:1.
const PALETTE = [
  { bg: "#e6f5ee", fg: "#065f46" }, // hijau
  { bg: "#e8f0fe", fg: "#1e429f" }, // biru
  { bg: "#fff4d6", fg: "#7a4b00" }, // kuning
  { bg: "#fde8e8", fg: "#9b1c1c" }, // merah
  { bg: "#f3e8ff", fg: "#5b21b6" }, // ungu
  { bg: "#e0f7fa", fg: "#055160" }, // tosca
];

const NEUTRAL = { bg: "#eef0f3", fg: "#374151" };

export type TileColor = { bg: string; fg: string };

/** Peta id kategori -> warna, mengikuti urutan daftar kategori. */
export function buildCategoryColors(categoryIds: string[]) {
  const map = new Map(categoryIds.map((id, i) => [id, PALETTE[i % PALETTE.length]]));
  return (id: string | null | undefined): TileColor => (id && map.get(id)) || NEUTRAL;
}

/** "Gas LPG 3kg" -> "GL", "Pertalite eceran" -> "PE" */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
}
