// Mode demo untuk portofolio: aktif bila NEXT_PUBLIC_DEMO_PASSWORD diisi.
// Kata sandi ini memang publik (tampil sebagai tombol di halaman login); jangan pakai di warung sungguhan.
// Akun dan datanya dibuat ulang oleh `npm run demo:reset` (lihat scripts/demo-reset.mjs).

export const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || "";
export const isDemo = DEMO_PASSWORD.length > 0;

export const DEMO_ACCOUNTS = [
  { role: "owner", label: "Pemilik", email: "demo.pemilik@example.com", hint: "Semua menu, termasuk laporan laba" },
  { role: "kasir", label: "Kasir", email: "demo.kasir@example.com", hint: "Jualan, stok masuk, kasbon" },
] as const;
