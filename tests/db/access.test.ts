import { beforeEach, describe, expect, test } from "vitest";
import { createDb, seed, stockOf, type Db } from "./setup";

let db: Db;
let s: Awaited<ReturnType<typeof seed>>;

beforeEach(async () => {
  db = await createDb();
  s = await seed(db);
});

describe("peran pengguna", () => {
  test("pengguna pertama jadi pemilik, berikutnya kasir", async () => {
    const { rows } = await db.admin<{ email: string; role: string }>(
      "select u.email, p.role from public.profiles p join auth.users u on u.id = p.id order by u.email",
    );
    expect(rows).toEqual([
      { email: "kasir@warung.test", role: "kasir" },
      { email: "pemilik@warung.test", role: "owner" },
    ]);
  });

  test("orang yang belum login tidak bisa berjualan", async () => {
    const outsider = await db.admin<{ id: string }>("select gen_random_uuid() as id");
    await expect(
      db.as(outsider.rows[0].id, "select public.create_sale($1::jsonb, 'cash', null, 99999)", [
        JSON.stringify([{ unit_id: s.units.rokokBatang, qty: 1 }]),
      ]),
    ).rejects.toThrow(/Tidak punya akses/);
  });
});

describe("batasan kasir", () => {
  test("tidak bisa membaca harga modal", async () => {
    await expect(db.as(s.kasir, "select cost_price from public.products")).rejects.toThrow(/permission denied/);
    await expect(db.as(s.kasir, "select * from public.product_costs()")).rejects.toThrow(/Hanya owner/);
  });

  test("tidak bisa mengubah stok atau harga langsung", async () => {
    const res = await db.as(s.kasir, "update public.products set stock = 999 where id = $1", [s.products.rokok]);
    expect(res.affectedRows).toBe(0);
    expect(await stockOf(db, s.products.rokok)).toBe(32);

    const harga = await db.as(s.kasir, "update public.product_units set price = 1 where id = $1", [
      s.units.rokokBatang,
    ]);
    expect(harga.affectedRows).toBe(0);
  });

  test("tidak bisa membuat penjualan tanpa lewat create_sale", async () => {
    await expect(
      db.as(s.kasir, "insert into public.sales (invoice_no, payment_method, status) values ('X', 'cash', 'paid')"),
    ).rejects.toThrow(/row-level security/);
  });

  test("tidak bisa stok opname atau melihat laporan", async () => {
    await expect(db.as(s.kasir, "select public.stock_adjust($1, 100)", [s.products.rokok])).rejects.toThrow(
      /Hanya owner/,
    );
    await expect(db.as(s.kasir, "select public.report(current_date, current_date)")).rejects.toThrow(
      /hanya untuk owner/,
    );
  });

  test("pelanggan baru tidak bisa dibuat dengan utang", async () => {
    await expect(
      db.as(s.kasir, "insert into public.customers (name, debt_balance) values ('Palsu', 50000)"),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("pemilik", () => {
  test("barang masuk menghitung harga modal rata-rata tertimbang", async () => {
    // Stok 32 batang @1.500, masuk 160 batang (1 slop) @1.800
    await db.as(s.owner, "select public.stock_in($1, 160, 1800, 'Slop dari agen')", [s.products.rokok]);
    const { rows } = await db.as<{ product_id: string; cost_price: string }>(
      s.owner,
      "select * from public.product_costs()",
    );
    const rokok = rows.find((r) => r.product_id === s.products.rokok)!;
    expect(Number(rokok.cost_price)).toBe(1750); // (32*1500 + 160*1800) / 192
    expect(await stockOf(db, s.products.rokok)).toBe(192);
  });

  test("laporan menghitung omzet, modal, dan barang terlaris", async () => {
    await db.as(s.kasir, "select public.create_sale($1::jsonb, 'cash', null, 30000)", [
      JSON.stringify([{ unit_id: s.units.rokokBungkus, qty: 1 }]),
    ]);
    await db.as(s.kasir, "select public.create_sale($1::jsonb, 'kasbon', $2::uuid)", [
      JSON.stringify([{ unit_id: s.units.gasTukar, qty: 1 }]),
      s.pelanggan,
    ]);

    const { rows } = await db.as<{ r: Record<string, unknown> }>(
      s.owner,
      "select public.report(current_date - 1, current_date + 1) as r",
    );
    const r = rows[0].r as { omzet: number; modal: number; transaksi: number; kasbon_beredar: number; terlaris: { product_name: string }[] };
    expect(Number(r.omzet)).toBe(52000);
    expect(Number(r.modal)).toBe(16 * 1500 + 18000);
    expect(r.transaksi).toBe(2);
    expect(Number(r.kasbon_beredar)).toBe(22000);
    expect(r.terlaris[0].product_name).toBe("Rokok Kretek");
  });

  test("barang di transaksi QRIS yang belum dibayar tidak bisa dihapus", async () => {
    await db.as(s.kasir, "select public.create_sale($1::jsonb, 'qris')", [
      JSON.stringify([{ unit_id: s.units.rokokBatang, qty: 1 }]),
    ]);
    await expect(db.as(s.owner, "delete from public.products where id = $1", [s.products.rokok])).rejects.toThrow(
      /belum dibayar/,
    );
  });
});
