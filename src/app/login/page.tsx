"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="panel receipt-edge p-6">
          <p className="text-sm font-semibold text-ink-soft">Masuk ke kasir</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{storeName}</h1>
          <hr className="perforated my-5 border-t-2" />
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
              <p role="alert" className="text-sm font-semibold text-brick">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? "Memeriksa…" : "Masuk"}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-sm text-ink-soft">
          Akun kasir dibuat oleh pemilik warung di dashboard Supabase.
        </p>
      </div>
    </main>
  );
}
