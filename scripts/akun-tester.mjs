// Buat (atau perbarui) akun tester dengan peran pemilik/admin, untuk staging atau lokal.
//
//   npm run akun:tester -- tester@warung.test             -> kata sandi acak, dicetak di terminal
//   npm run akun:tester -- tester@warung.test Rahasia123  -> kata sandi sendiri
//   npm run akun:tester -- kasir@warung.test --kasir      -> akun kasir
//
// Database staging: node --env-file=.env.staging scripts/akun-tester.mjs tester@warung.test
// Butuh NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY (kunci rahasia, hanya dipakai di sini).
// Aman dijalankan berulang: akun yang sudah ada diperbarui kata sandi dan perannya.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const peran = args.includes("--kasir") ? "kasir" : "owner";
const [email, sandiArg] = args.filter((a) => !a.startsWith("--"));

if (!email || !email.includes("@")) {
  console.error("Pakai: npm run akun:tester -- <email> [kata-sandi] [--kasir]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const kunci = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !kunci) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY belum diisi di file env.");
  process.exit(1);
}

const sandi = sandiArg ?? randomBytes(9).toString("base64url");
if (sandi.length < 6) {
  console.error("Kata sandi minimal 6 karakter.");
  process.exit(1);
}

const supabase = createClient(url, kunci, { auth: { autoRefreshToken: false, persistSession: false } });
const nama = peran === "owner" ? "Tester Admin" : "Tester Kasir";

async function cariUser(alamat) {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const ketemu = data.users.find((u) => u.email?.toLowerCase() === alamat.toLowerCase());
    if (ketemu || data.users.length < 200) return ketemu ?? null;
  }
}

let user = await cariUser(email);
if (user) {
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, { password: sandi, email_confirm: true });
  if (error) throw error;
  user = data.user;
} else {
  // Trigger handle_new_user membuat baris profiles (kasir bila sudah ada pengguna lain)
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: sandi,
    email_confirm: true,
    user_metadata: { full_name: nama },
  });
  if (error) throw error;
  user = data.user;
}

// Kunci rahasia melewati RLS, jadi peran bisa langsung diatur
const { error: errProfil } = await supabase
  .from("profiles")
  .upsert({ id: user.id, full_name: nama, role: peran }, { onConflict: "id" });
if (errProfil) throw errProfil;

console.log(`Akun ${peran === "owner" ? "pemilik/admin" : "kasir"} siap:`);
console.log(`  Email      : ${email}`);
console.log(`  Kata sandi : ${sandi}`);
