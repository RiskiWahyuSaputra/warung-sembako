import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabaseSecretKey } from "./env";

/** Klien atas nama pengguna yang login (RLS berlaku). */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Dipanggil dari tempat yang tidak boleh menulis cookie; proxy yang menyegarkan sesi.
          }
        },
      },
    },
  );
}

/** Klien secret key, melewati RLS. Hanya untuk konfirmasi pembayaran dari Midtrans. */
export function supabaseAdmin() {
  return createClient(SUPABASE_URL, supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
