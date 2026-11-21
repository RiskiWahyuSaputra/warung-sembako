"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, isDemo } from "@/lib/demo";
import { supabaseBrowser } from "@/lib/supabase/client";

const storeName = process.env.NEXT_PUBLIC_STORE_NAME || "Warung Sembako";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    await signIn(email, password);
  }

  async function signIn(email: string, password: string) {
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Email atau kata sandi salah." : error.message);
      setBusy(false);
      return;
    }
    router.replace("/kasir");
    router.refresh();
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      {/* Panel nama warung (desktop): isinya hanya fakta tentang aplikasi, tanpa klaim/angka karangan */}
      <section aria-hidden="true" className="hidden flex-col justify-between bg-primary p-12 text-white lg:flex">
        <span className="grid size-14 place-items-center rounded-2xl bg-white/15 text-2xl font-extrabold">
          {storeName.trim()[0]?.toUpperCase()}
        </span>
        <div>
          <p className="text-4xl leading-tight font-extrabold tracking-tight">{storeName}</p>
          <p className="mt-3 max-w-md text-lg text-white/85">Kasir, stok, dan kasbon dalam satu layar.</p>
          <ul className="mt-8 grid max-w-md grid-cols-2 gap-3 text-sm font-semibold">
            {["Scan barcode", "QRIS Midtrans", "Rokok per batang", "Bensin per nominal"].map((t) => (
              <li key={t} className="rounded-xl bg-white/12 px-4 py-3">
                {t}
              </li>
            ))}
          </ul>
        </div>
        <span />
      </section>

      <div className="flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="panel p-7">
          <span aria-hidden="true" className="mb-5 grid size-12 place-items-center rounded-xl bg-primary text-xl font-extrabold text-white lg:hidden">
            {storeName.trim()[0]?.toUpperCase()}
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">Masuk ke kasir</h1>
          <p className="mt-1 mb-6 text-muted">{storeName}</p>
          <form onSubmit={submit} className="space-y-4" noValidate={false}>
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Kata sandi
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className="field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm font-semibold text-danger">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary min-h-12 w-full" disabled={busy}>
              {busy ? "Memeriksa…" : "Masuk"}
            </button>
          </form>
        </div>
        {isDemo ? (
          <div className="panel mt-4 p-5">
            <h2 className="font-extrabold">Coba tanpa daftar</h2>
            <p className="mt-1 mb-4 text-sm text-muted">Data contoh, dikembalikan seperti semula setiap malam.</p>
            <div className="grid gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.role}
                  type="button"
                  className="btn btn-ghost min-h-12 w-full justify-between border border-line text-left"
                  disabled={busy}
                  onClick={() => signIn(a.email, DEMO_PASSWORD)}
                >
                  <span>
                    <span className="block font-bold">Masuk sebagai {a.label}</span>
                    <span className="block text-xs font-normal text-muted">{a.hint}</span>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-6 text-center text-sm text-muted">
            Akun kasir dibuat oleh pemilik warung di dashboard Supabase.
          </p>
        )}
      </div>
      </div>
    </main>
  );
}
