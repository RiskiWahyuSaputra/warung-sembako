import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

// Menyegarkan sesi Supabase dan mengarahkan pengguna yang belum login ke /login.
// Ini hanya pemeriksaan cepat; keamanan data tetap dijaga RLS di database.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const loggedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  // API memeriksa login sendiri dan menjawab 401 dalam JSON, bukan redirect ke halaman.
  if (pathname.startsWith("/api/")) return response;
  if (!loggedIn && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (loggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/kasir", request.url));
  }
  return response;
}

export const config = {
  // Webhook Midtrans dan file statis tidak butuh login.
  matcher: ["/((?!api/midtrans/notification|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webmanifest)$).*)"],
};
