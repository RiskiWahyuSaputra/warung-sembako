"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { ErrorBox, Loading } from "./ui";

const ProfileContext = createContext<Profile | null>(null);

export function useProfile() {
  const p = useContext(ProfileContext);
  if (!p) throw new Error("useProfile dipakai di luar Shell");
  return p;
}

const NAV: { href: string; label: string; ownerOnly?: boolean }[] = [
  { href: "/kasir", label: "Kasir" },
  { href: "/barang", label: "Barang" },
  { href: "/stok", label: "Stok" },
  { href: "/pelanggan", label: "Kasbon" },
  { href: "/transaksi", label: "Transaksi" },
  { href: "/laporan", label: "Laporan", ownerOnly: true },
];

const storeName = process.env.NEXT_PUBLIC_STORE_NAME || "Warung Sembako";

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Menu ponsel tertutup otomatis saat pindah halaman: ia hanya "terbuka" untuk path tempat dibuka.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabaseBrowser();
      const { data: auth } = await sb.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data, error } = await sb.from("profiles").select("id, full_name, role").eq("id", auth.user.id).single();
      if (cancelled) return;
      if (error) setError("Profil pengguna tidak ditemukan. Pastikan schema.sql sudah dijalankan.");
      else setProfile(data as Profile);
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, router]);

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const links = NAV.filter((n) => !n.ownerOnly || profile?.role === "owner");

  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-card">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2">
          <Link href="/kasir" className="mr-auto min-w-0 truncate py-2 text-lg font-extrabold tracking-tight">
            {storeName}
          </Link>
          <nav aria-label="Menu utama" className="hidden lg:block">
            <ul className="flex gap-1">
              {links.map((n) => (
                <li key={n.href}>
                  <NavLink href={n.href} active={pathname.startsWith(n.href)}>
                    {n.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          {profile && (
            <span className="hidden text-sm text-ink-soft sm:inline">
              {profile.full_name} · {profile.role === "owner" ? "Pemilik" : "Kasir"}
            </span>
          )}
          <button type="button" className="btn btn-ghost hidden min-h-10 text-sm lg:inline-flex" onClick={logout}>
            Keluar
          </button>
          <button
            type="button"
            className="btn btn-ghost lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuPath(menuOpen ? null : pathname)}
          >
            {menuOpen ? "Tutup" : "Menu"}
          </button>
        </div>
        {menuOpen && (
          <nav id="mobile-menu" aria-label="Menu utama" className="border-t border-line px-4 pb-3 lg:hidden">
            <ul className="grid grid-cols-2 gap-2 pt-3 sm:grid-cols-3">
              {links.map((n) => (
                <li key={n.href}>
                  <NavLink href={n.href} active={pathname.startsWith(n.href)} block>
                    {n.label}
                  </NavLink>
                </li>
              ))}
              <li>
                <button type="button" className="btn btn-ghost w-full" onClick={logout}>
                  Keluar
                </button>
              </li>
            </ul>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">
        {error ? (
          <ErrorBox message={error} onRetry={() => setAttempt((a) => a + 1)} />
        ) : !profile ? (
          <Loading label="Menyiapkan kasir…" />
        ) : (
          <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>
        )}
      </main>
    </div>
  );
}

function NavLink({ href, active, block, children }: { href: string; active: boolean; block?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center rounded-lg px-3 font-semibold ${block ? "justify-center border border-line" : ""} ${
        active ? "bg-green-tint text-green" : "text-ink hover:bg-paper"
      }`}
    >
      {children}
    </Link>
  );
}
