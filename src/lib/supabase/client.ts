import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

let client: SupabaseClient | undefined;

export function supabaseBrowser(): SupabaseClient {
  client ??= createBrowserClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
  );
  return client;
}
