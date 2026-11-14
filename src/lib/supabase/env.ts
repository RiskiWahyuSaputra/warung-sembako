// Supabase > Project Settings > API Keys.
// Nama baru: publishable key (sb_publishable_...) dan secret key (sb_secret_...).
// Nama lama (anon / service_role) tetap diterima untuk project lama.
// NEXT_PUBLIC_* harus ditulis lengkap seperti ini supaya Next.js bisa menyisipkannya ke browser.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Hanya untuk server. Jangan pernah diimpor dari komponen browser. */
export function supabaseSecretKey() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY belum diisi di .env.local");
  return key;
}
