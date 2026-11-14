# Warung Sembako

Aplikasi kasir dan stok untuk warung sembako: bensin eceran, gas, galon, rokok, beras curah, dan barang harian.
Dibuat dengan Next.js 16 + Supabase, pembayaran QRIS lewat Midtrans.

## Fitur

- **Kasir**: scan barcode (scanner USB atau kamera HP), keranjang, bayar tunai / QRIS / kasbon, cetak struk 58mm.
- **Satuan jual fleksibel**: rokok per batang, bungkus, atau slop; bensin per liter atau per nominal (Rp10.000); beras per kg.
- **Tukar wadah**: jual "tukar tabung" gas atau "tukar galon" otomatis menambah stok tabung/galon kosong.
- **Stok**: barang masuk (dihitung per dus/slop, dikonversi otomatis), harga modal rata-rata, stok opname, riwayat.
- **Kasbon**: utang per pelanggan, bayar sebagian, pengingat WhatsApp.
- **Laporan** (khusus pemilik): laba kotor, omzet, per cara bayar, per hari, 10 barang terlaris.
- **Peran**: pemilik dan kasir. Kasir tidak bisa melihat harga modal, laporan laba, atau mengubah harga.

Pintasan kasir: `F2` cari barang, `F9` bayar.

## Setup

### 1. Supabase

1. Buat project di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**, jalankan isi `supabase/schema.sql`.
3. (Opsional) jalankan `supabase/seed.sql` untuk data contoh. Harganya hanya contoh, ubah sesuai warung kamu.
4. Buka **Authentication > Users > Add user**, buat akun pemilik dulu.
   **Pengguna pertama otomatis jadi pemilik**, akun berikutnya jadi kasir.
5. Matikan pendaftaran publik di **Authentication > Sign In / Providers > Allow new users to sign up**,
   supaya hanya pemilik yang bisa menambah akun.

### 2. Midtrans (QRIS)

1. Daftar di [dashboard.midtrans.com](https://dashboard.midtrans.com), pakai mode **Sandbox** dulu.
2. Ambil **Server Key** di Settings > Access Keys.
3. Setelah aplikasi online, isi **Settings > Payment > Notification URL** dengan
   `https://domain-kamu/api/midtrans/notification`.

Selama development di localhost, webhook Midtrans tidak bisa menjangkau komputer kamu.
Tidak masalah: layar kasir mengecek status pembayaran ke Midtrans setiap 3 detik.
Untuk mencoba bayar di sandbox, buka [simulator QRIS Midtrans](https://simulator.sandbox.midtrans.com/v2/qris/index)
dan tempel URL gambar QR yang muncul.

### 3. Jalankan

```bash
cp .env.example .env.local   # lalu isi nilainya
npm install
npm run dev
```

Buka http://localhost:3000 dan masuk dengan akun pemilik.

## Catatan

- **Kamera** untuk scan barcode hanya jalan di HTTPS atau `localhost`. Untuk mencoba dari HP di jaringan yang sama,
  deploy dulu (mis. Vercel) atau pakai tunnel HTTPS.
- **Printer thermal**: tombol "Cetak struk" membuka dialog cetak browser dengan ukuran kertas 58mm.
  Pasang printer Bluetooth/USB sebagai printer di sistem operasi.
- **Stok** disimpan dalam satuan dasar (batang, liter, gram, pcs). Semua perubahan stok tercatat di `stock_movements`.
- **Keamanan**: penjualan, stok, dan kasbon hanya bisa diubah lewat fungsi database (RPC), bukan langsung dari browser.
  `SUPABASE_SECRET_KEY` dan `MIDTRANS_SERVER_KEY` hanya dipakai di server; jangan beri awalan `NEXT_PUBLIC_`.
