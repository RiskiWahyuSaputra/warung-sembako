// Mengembalikan database DEMO ke keadaan awal: akun demo, katalog warung, dan riwayat 14 hari.
//
//   node --env-file=.env.demo scripts/demo-reset.mjs
//
// Butuh NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY,
// dan NEXT_PUBLIC_DEMO_PASSWORD. SEMUA DATA DI DATABASE INI DIHAPUS: jangan arahkan ke database warung sungguhan.
//
// Penjualan dibuat lewat RPC asli (create_sale, stock_in, pay_debt) sebagai kasir/pemilik demo, lalu
// tanggalnya dimundurkan. Jadi angka laporan, stok, dan riwayat konsisten seperti pemakaian sungguhan.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.NEXT_PUBLIC_DEMO_PASSWORD;
if (!url || !publishable || !secret || !password) {
  console.error("Isi NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, NEXT_PUBLIC_DEMO_PASSWORD.");
  process.exit(1);
}
if (process.env.DEMO_RESET_CONFIRM !== "hapus-semua" && !process.argv.includes("--yes")) {
  console.error(`Semua data di ${url} akan dihapus. Jalankan ulang dengan --yes untuk melanjutkan.`);
  process.exit(1);
}

const opts = { auth: { autoRefreshToken: false, persistSession: false } };
const admin = createClient(url, secret, opts);

// Sama dengan src/lib/demo.ts
const ACCOUNTS = [
  { role: "owner", email: "demo.pemilik@example.com", name: "Bu Ratna (Pemilik)" },
  { role: "kasir", email: "demo.kasir@example.com", name: "Dimas (Kasir)" },
];

const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};

// Acak tetapi bisa diulang: data demo sama setiap malam, hanya tanggalnya yang bergeser.
let seed = 20261121;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (items) => {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rand() * total;
  return items.find((i) => (r -= i.weight) < 0) ?? items.at(-1);
};

// ---------------------------------------------------------------------------------------------
// 1. Akun demo (kata sandi direset juga, kalau pengunjung sempat menggantinya)
// ---------------------------------------------------------------------------------------------
const users = {};
for (const a of ACCOUNTS) {
  const list = must(await admin.auth.admin.listUsers({ perPage: 1000 }), "daftar pengguna");
  let user = list.users.find((u) => u.email === a.email);
  if (user) {
    user = must(await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true }), "perbarui akun").user;
  } else {
    user = must(
      await admin.auth.admin.createUser({ email: a.email, password, email_confirm: true, user_metadata: { full_name: a.name } }),
      "buat akun",
    ).user;
  }
  must(await admin.from("profiles").upsert({ id: user.id, full_name: a.name, role: a.role }), "profil");
  users[a.role] = user.id;
}

async function signedIn(email) {
  const client = createClient(url, publishable, opts);
  must(await client.auth.signInWithPassword({ email, password }), `masuk ${email}`);
  return client;
}
const owner = await signedIn(ACCOUNTS[0].email);
const kasir = await signedIn(ACCOUNTS[1].email);

// ---------------------------------------------------------------------------------------------
// 2. Kosongkan data
// ---------------------------------------------------------------------------------------------
for (const table of ["stock_movements", "debt_payments", "sales", "customers", "product_units", "products", "categories"]) {
  must(await admin.from(table).delete().not("id", "is", null), `hapus ${table}`);
}

// ---------------------------------------------------------------------------------------------
// 3. Katalog. cost = harga modal per satuan dasar. end = sisa stok yang dituju di akhir riwayat
//    (di bawah min_stock = muncul peringatan stok menipis).
// ---------------------------------------------------------------------------------------------
const CATALOG = [
  { cat: "Bensin", name: "Pertalite eceran", base: "liter", decimal: true, min: 10, cost: 10500, end: 22,
    units: [{ name: "Liter", conv: 1, price: 12000, default: true }] },
  { cat: "Gas & Galon", name: "Tabung gas 3kg kosong", base: "tabung", min: 0, cost: 0, end: 0, container: true,
    units: [{ name: "Tabung", conv: 1, price: 150000, default: true }] },
  { cat: "Gas & Galon", name: "Gas LPG 3kg", base: "tabung", min: 3, cost: 19000, end: 2,
    units: [{ name: "Tukar tabung", conv: 1, price: 22000, default: true, returns: "Tabung gas 3kg kosong" }] },
  { cat: "Gas & Galon", name: "Galon kosong", base: "galon", min: 0, cost: 0, end: 0, container: true,
    units: [{ name: "Galon", conv: 1, price: 40000, default: true }] },
  { cat: "Gas & Galon", name: "Air galon isi ulang", base: "galon", min: 3, cost: 3500, end: 9,
    units: [{ name: "Tukar galon", conv: 1, price: 6000, default: true, returns: "Galon kosong" }] },
  { cat: "Rokok", name: "Rokok kretek filter 16", base: "batang", min: 32, cost: 1750, end: 118,
    units: [
      { name: "Batang", conv: 1, price: 2000, barcode: "2000000000011" },
      { name: "Bungkus", conv: 16, price: 30000, default: true, barcode: "2000000000028" },
      { name: "Slop", conv: 160, price: 295000 },
    ] },
  { cat: "Rokok", name: "Rokok mild 16", base: "batang", min: 32, cost: 1850, end: 12,
    units: [
      { name: "Batang", conv: 1, price: 2200 },
      { name: "Bungkus", conv: 16, price: 32000, default: true, barcode: "2000000000035" },
    ] },
  { cat: "Sembako", name: "Beras medium curah", base: "gram", decimal: true, min: 10000, cost: 12, end: 23500,
    units: [{ name: "Kg", conv: 1000, price: 14000, default: true }, { name: "Liter", conv: 800, price: 11500 }] },
  { cat: "Sembako", name: "Gula pasir curah", base: "gram", decimal: true, min: 3000, cost: 16, end: 7500,
    units: [{ name: "Kg", conv: 1000, price: 18500, default: true }, { name: "Setengah kg", conv: 500, price: 9500 }] },
  { cat: "Sembako", name: "Minyak goreng 1L", base: "pcs", min: 6, cost: 16500, end: 3,
    units: [{ name: "Pcs", conv: 1, price: 19000, default: true, barcode: "2000000000042" }] },
  { cat: "Sembako", name: "Telur ayam", base: "butir", min: 30, cost: 1850, end: 64,
    units: [{ name: "Butir", conv: 1, price: 2300, default: true }, { name: "Setengah kg (8 butir)", conv: 8, price: 17500 }] },
  { cat: "Sembako", name: "Mi instan goreng", base: "pcs", min: 20, cost: 2900, end: 47,
    units: [{ name: "Pcs", conv: 1, price: 3500, default: true, barcode: "2000000000059" }, { name: "Dus (40)", conv: 40, price: 125000 }] },
  { cat: "Kebutuhan harian", name: "Kopi sachet", base: "pcs", min: 20, cost: 1150, end: 52,
    units: [{ name: "Sachet", conv: 1, price: 1500, default: true }, { name: "Renceng (10)", conv: 10, price: 14000 }] },
  { cat: "Kebutuhan harian", name: "Air mineral 600ml", base: "pcs", min: 24, cost: 2900, end: 41,
    units: [{ name: "Botol", conv: 1, price: 4000, default: true, barcode: "2000000000066" }, { name: "Dus (24)", conv: 24, price: 82000 }] },
  { cat: "Kebutuhan harian", name: "Sabun mandi batang", base: "pcs", min: 6, cost: 3300, end: 14,
    units: [{ name: "Pcs", conv: 1, price: 4500, default: true }] },
  { cat: "Kebutuhan harian", name: "Teh celup kotak", base: "pcs", min: 4, cost: 5200, end: 9,
    units: [{ name: "Kotak", conv: 1, price: 6500, default: true }] },
];

// Apa yang biasa dibeli orang: [produk, satuan, bobot, pilihan jumlah] atau nominal rupiah untuk bensin.
const BASKET = [
  { product: "Pertalite eceran", unit: "Liter", weight: 14, amounts: [10000, 10000, 15000, 20000, 25000] },
  { product: "Gas LPG 3kg", unit: "Tukar tabung", weight: 7, qty: [1, 1, 1, 2] },
  { product: "Air galon isi ulang", unit: "Tukar galon", weight: 8, qty: [1, 1, 2] },
  { product: "Rokok kretek filter 16", unit: "Bungkus", weight: 12, qty: [1, 1, 1, 2] },
  { product: "Rokok kretek filter 16", unit: "Batang", weight: 7, qty: [1, 2, 3, 4] },
  { product: "Rokok kretek filter 16", unit: "Slop", weight: 0.4, qty: [1] },
  { product: "Rokok mild 16", unit: "Bungkus", weight: 7, qty: [1, 1, 2] },
  { product: "Rokok mild 16", unit: "Batang", weight: 3, qty: [1, 2, 3] },
  { product: "Beras medium curah", unit: "Kg", weight: 6, qty: [1, 2, 2, 5] },
  { product: "Beras medium curah", unit: "Liter", weight: 3, qty: [1, 2, 3] },
  { product: "Gula pasir curah", unit: "Kg", weight: 4, qty: [1, 1, 2] },
  { product: "Gula pasir curah", unit: "Setengah kg", weight: 3, qty: [1] },
  { product: "Minyak goreng 1L", unit: "Pcs", weight: 5, qty: [1, 1, 2] },
  { product: "Telur ayam", unit: "Butir", weight: 4, qty: [2, 4, 5, 10] },
  { product: "Telur ayam", unit: "Setengah kg (8 butir)", weight: 3, qty: [1, 1, 2] },
  { product: "Mi instan goreng", unit: "Pcs", weight: 9, qty: [1, 2, 3, 5] },
  { product: "Kopi sachet", unit: "Sachet", weight: 8, qty: [1, 2, 3] },
  { product: "Kopi sachet", unit: "Renceng (10)", weight: 2, qty: [1] },
  { product: "Air mineral 600ml", unit: "Botol", weight: 8, qty: [1, 1, 2] },
  { product: "Sabun mandi batang", unit: "Pcs", weight: 3, qty: [1, 2] },
  { product: "Teh celup kotak", unit: "Kotak", weight: 2, qty: [1] },
];

const CUSTOMERS = [
  { name: "Bu Sri (warung nasi)", phone: "081200000001" },
  { name: "Pak Darto", phone: "081200000002" },
  { name: "Mas Andi ojek", phone: null },
  { name: "Bu Yanti", phone: "081200000004" },
];

const categories = {};
for (const name of new Set(CATALOG.map((p) => p.cat))) {
  categories[name] = must(await admin.from("categories").insert({ name }).select("id").single(), "kategori").id;
}

const products = {}; // name -> { id, units: { unitName: { id, conv, price } }, def }
for (const p of CATALOG) {
  const row = must(
    await admin
      .from("products")
      .insert({ name: p.name, category_id: categories[p.cat], base_unit: p.base, allow_decimal: !!p.decimal, min_stock: p.min })
      .select("id")
      .single(),
    "barang",
  );
  products[p.name] = { id: row.id, units: {}, def: p };
}
for (const p of CATALOG) {
  for (const u of p.units) {
    const row = must(
      await admin
        .from("product_units")
        .insert({
          product_id: products[p.name].id,
          name: u.name,
          conversion: u.conv,
          price: u.price,
          barcode: u.barcode ?? null,
          is_default: !!u.default,
          returns_product_id: u.returns ? products[u.returns].id : null,
        })
        .select("id")
        .single(),
      "satuan",
    );
    products[p.name].units[u.name] = { id: row.id, conv: u.conv, price: u.price };
  }
}

const customers = [];
for (const c of CUSTOMERS) {
  customers.push(must(await admin.from("customers").insert(c).select("id").single(), "pelanggan").id);
}

// ---------------------------------------------------------------------------------------------
// 4. Rencana 14 hari: jam buka 06.30-21.30 WIB, lebih ramai pagi dan sore.
// ---------------------------------------------------------------------------------------------
const DAYS = 14;
const HOUR = 3600_000;
const now = Date.now();
// Tengah malam WIB hari ini, dalam UTC
const todayWib = new Date(new Date(now + 7 * HOUR).toISOString().slice(0, 10) + "T00:00:00Z").getTime() - 7 * HOUR;
const at = (daysAgo, hour) => todayWib - daysAgo * 24 * HOUR + hour * HOUR;
const busyHour = () => pick([
  { weight: 3, h: [6.5, 9] }, { weight: 2, h: [9, 12] }, { weight: 1.5, h: [12, 15] },
  { weight: 3, h: [15, 18.5] }, { weight: 2, h: [18.5, 21.5] },
]).h;

const sales = [];
for (let d = DAYS; d >= 0; d--) {
  const weekend = new Date(at(d, 12) + 7 * HOUR).getUTCDay() % 6 === 0;
  const count = int(11, 17) + (weekend ? 4 : 0);
  for (let i = 0; i < count; i++) {
    const [from, to] = busyHour();
    const time = at(d, from + rand() * (to - from));
    if (time > now - 10 * 60_000) continue; // jangan membuat transaksi di masa depan
    const lines = [];
    const n = pick([{ weight: 6, n: 1 }, { weight: 3, n: 2 }, { weight: 1, n: 3 }]).n;
    for (let j = 0; j < n; j++) {
      const b = pick(BASKET);
      if (lines.some((l) => l.b === b)) continue;
      lines.push({ b, value: b.amounts ? b.amounts[int(0, b.amounts.length - 1)] : b.qty[int(0, b.qty.length - 1)] });
    }
    const method = pick([{ weight: 74, m: "cash" }, { weight: 17, m: "qris" }, { weight: 9, m: "kasbon" }]).m;
    sales.push({ time, lines, method, customer: method === "kasbon" ? customers[int(0, customers.length - 1)] : null });
  }
}
sales.sort((a, b) => a.time - b.time);

// Kebutuhan stok per barang (satuan dasar) dari rencana di atas
const demand = {};
for (const s of sales) {
  for (const { b, value } of s.lines) {
    const u = products[b.product].units[b.unit];
    const base = b.amounts ? (value / u.price) * u.conv : value * u.conv;
    demand[b.product] = (demand[b.product] ?? 0) + base;
  }
}

// Barang masuk: 65% di awal, sisanya + target akhir di pertengahan.
const restocks = [];
for (const p of CATALOG) {
  if (p.container) continue;
  const need = demand[p.name] ?? 0;
  const round = (v) => (p.decimal && p.base === "liter" ? Math.ceil(v) : Math.ceil(v / (p.base === "gram" ? 1000 : 1)) * (p.base === "gram" ? 1000 : 1));
  restocks.push({ time: at(DAYS, 6), product: p.name, qty: round(need * 0.65 + p.end * 0.3), cost: p.cost, note: "Stok awal" });
  restocks.push({ time: at(Math.floor(DAYS / 2), 7.5), product: p.name, qty: round(need * 0.35 + p.end * 0.7), cost: Math.round(p.cost * 1.03 * 100) / 100, note: "Belanja ke agen" });
}

// ---------------------------------------------------------------------------------------------
// 5. Jalankan berurutan waktu
// ---------------------------------------------------------------------------------------------
const iso = (t) => new Date(t).toISOString();
const events = [
  ...restocks.map((r) => ({ ...r, kind: "restock" })),
  ...sales.map((s) => ({ ...s, kind: "sale" })),
].sort((a, b) => a.time - b.time);

let done = 0;
let skipped = 0;
for (const e of events) {
  if (e.kind === "restock") {
    const p = products[e.product];
    must(await owner.rpc("stock_in", { p_product_id: p.id, p_qty: e.qty, p_unit_cost: e.cost, p_note: e.note }), "barang masuk");
    const mv = must(
      await admin.from("stock_movements").select("id").eq("product_id", p.id).eq("type", "in")
        .order("created_at", { ascending: false }).limit(1).single(),
      "riwayat barang masuk",
    );
    must(await admin.from("stock_movements").update({ created_at: iso(e.time) }).eq("id", mv.id), "mundurkan barang masuk");
    continue;
  }

  const items = e.lines.map(({ b, value }) => {
    const unitId = products[b.product].units[b.unit].id;
    return b.amounts ? { unit_id: unitId, amount: value } : { unit_id: unitId, qty: value };
  });
  let total = 0;
  for (const { b, value } of e.lines) total += b.amounts ? value : value * products[b.product].units[b.unit].price;
  const cash = e.method === "cash" ? [total, Math.ceil(total / 5000) * 5000, Math.ceil(total / 50000) * 50000][int(0, 2)] : null;

  const res = await kasir.rpc("create_sale", {
    p_items: items, p_method: e.method, p_customer_id: e.customer, p_cash_received: cash,
  });
  if (res.error) {
    skipped++;
    continue;
  }
  const sale = res.data;
  if (e.method === "qris") must(await admin.rpc("finalize_sale", { p_sale_id: sale.id }), "QRIS lunas");

  const wib = new Date(e.time + 7 * HOUR).toISOString();
  const invoice = `INV-${wib.slice(2, 4)}${wib.slice(5, 7)}${wib.slice(8, 10)}-${sale.invoice_no.split("-").at(-1)}`;
  must(
    await admin.from("sales").update({ created_at: iso(e.time), paid_at: iso(e.time + 20_000), invoice_no: invoice }).eq("id", sale.id),
    "mundurkan penjualan",
  );
  must(await admin.from("stock_movements").update({ created_at: iso(e.time) }).eq("sale_id", sale.id), "mundurkan riwayat");
  done++;
  if (done % 25 === 0) process.stdout.write(`\r${done} penjualan`);
}

// Sebagian kasbon sudah dicicil
const { data: debtors } = await admin.from("customers").select("id, debt_balance").gt("debt_balance", 0);
for (const [i, c] of (debtors ?? []).entries()) {
  if (i % 2) continue;
  const amount = Math.floor((c.debt_balance * 0.5) / 1000) * 1000;
  if (amount <= 0) continue;
  must(await owner.rpc("pay_debt", { p_customer_id: c.id, p_amount: amount, p_note: "Cicil" }), "bayar kasbon");
  must(
    await admin.from("debt_payments").update({ created_at: iso(at(2, 17)) }).eq("customer_id", c.id),
    "mundurkan pembayaran kasbon",
  );
}

await owner.auth.signOut();
await kasir.auth.signOut();
console.log(`\rDemo siap: ${done} penjualan dalam ${DAYS + 1} hari, ${restocks.length} barang masuk${skipped ? `, ${skipped} dilewati (stok habis)` : ""}.`);
