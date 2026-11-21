"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { isDemo } from "@/lib/demo";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { IconBarang, IconKasbon, IconKasir, IconKeluar, IconLaporan, IconStok, IconTransaksi } from "./icons";
import { ErrorBox, Loading } from "./ui";

type ProfileState = { profile: Profile | null; error: string | null; retry: () => void };
const ProfileContext = createContext<ProfileState | null>(null);

/** Profil pengguna yang login. Hanya dipakai di dalam <RequireProfile>. */
export function useProfile(): Profile {
  const p = useContext(ProfileContext)?.profile;
  if (!p) throw new Error("useProfile harus dipakai di dalam <RequireProfile>");
  return p;
}

/**
 * Dipasang di setiap halaman: tampilkan "memuat"/error sampai profil siap, lalu isi halaman.
 * Penundaan ada di dalam segmen halaman (bukan di layout) supaya halaman tetap ter-render.
 */
export function RequireProfile({ children }: { children: ReactNode }) {
  const state = useContext(ProfileContext);
  if (state?.error) return <ErrorBox message={state.error} onRetry={state.retry} />;
  if (!state?.profile) return <Loading label="Menyiapkan kasir…" />;
  return <>{children}</>;
}

type NavItem = { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; ownerOnly?: boolean };
const NAV: NavItem[] = [
  { href: "/kasir", label: "Kasir", icon: IconKasir },
  { href: "/barang", label: "Barang", icon: IconBarang },
  { href: "/stok", label: "Stok", icon: IconStok },
  { href: "/pelanggan", label: "Kasbon", icon: IconKasbon },
  { href: "/transaksi", label: "Transaksi", icon: IconTransaksi },
  { href: "/laporan", label: "Laporan", icon: IconLaporan, ownerOnly: true },
];

const storeName = process.env.NEXT_PUBLIC_STORE_NAME || "Warung Sembako";

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabaseBrowser();
      const { data: auth } = await sb.auth.getUser();
      if (cancelled) return;
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data, error } = await sb.from("profiles").select("id, full_name, role").eq("id", auth.user.id).single();
      if (cancelled) return;
      if (error) setError("Profil pengguna tidak ditemukan. Pastikan schema.sql sudah dijalankan.");
      else {
        setError(null);
        setProfile(data as Profile);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, router]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((a) => a + 1);
  }, []);

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const links = NAV.filter((n) => !n.ownerOnly || profile?.role === "owner");
  const isActive = (href: string) => pathname.startsWith(href);
  const roleLabel = profile ? (profile.role === "owner" ? "Pemilik" : "Kasir") : "";

  return (
    <div className="min-h-dvh lg:pl-24">
      {/* Sidebar ikon (desktop) */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center border-r border-line bg-surface py-4 lg:flex">
        <Link
          href="/kasir"
          aria-label={`${storeName}, ke halaman kasir`}
          className="mb-6 grid size-12 place-items-center rounded-xl bg-primary text-lg font-extrabold text-white"
        >
          {storeName.trim()[0]?.toUpperCase()}
        </Link>
        <nav aria-label="Menu utama" className="flex-1">
          <ul className="flex flex-col gap-1.5">
            {links.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={isActive(n.href) ? "page" : undefined}
                  className={`flex w-20 flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-semibold transition-colors ${
                    isActive(n.href) ? "bg-primary-soft text-primary" : "text-muted hover:bg-canvas hover:text-ink"
                  }`}
                >
                  <n.icon />
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <button
          type="button"
          onClick={logout}
          className="flex w-20 flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-semibold text-muted transition-colors hover:bg-danger-soft hover:text-danger"
        >
          <IconKeluar />
          Keluar
        </button>
      </aside>

      {/* Bar atas */}
      <header className="no-print sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 lg:px-6">
          <p className="min-w-0 flex-1 truncate text-lg font-extrabold tracking-tight">{storeName}</p>
          {profile && (
            <div className="flex items-center gap-2.5">
              <span className="hidden text-right leading-tight sm:block">
                <span className="block text-sm font-bold">{profile.full_name}</span>
                <span className="block text-xs text-muted">{roleLabel}</span>
              </span>
              <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-primary-soft text-sm font-extrabold text-primary">
                {profile.full_name.trim()[0]?.toUpperCase()}
              </span>
            </div>
          )}
          <button type="button" className="btn btn-ghost min-h-10 px-3 text-sm lg:hidden" onClick={logout}>
            Keluar
          </button>
        </div>
      </header>

      {isDemo && (
        <p className="no-print border-b border-line bg-primary-soft px-4 py-2 text-center text-sm font-semibold text-primary">
          Mode demo: silakan coba semua fitur. Data dikembalikan seperti semula setiap malam. QRIS memakai sandbox Midtrans.
        </p>
      )}

      <main className="mx-auto max-w-[1440px] px-4 pt-5 pb-28 lg:px-6 lg:pb-8">
        <ProfileContext.Provider value={{ profile, error, retry }}>{children}</ProfileContext.Provider>
      </main>

      {/* Navigasi bawah (HP & tablet) */}
      <nav aria-label="Menu utama" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto flex max-w-xl">
          {links.map((n) => (
            <li key={n.href} className="flex-1">
              <Link
                href={n.href}
                aria-current={isActive(n.href) ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                  isActive(n.href) ? "text-primary" : "text-muted"
                }`}
              >
                <span className={`grid h-7 w-12 place-items-center rounded-full ${isActive(n.href) ? "bg-primary-soft" : ""}`}>
                  <n.icon width={20} height={20} />
                </span>
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
