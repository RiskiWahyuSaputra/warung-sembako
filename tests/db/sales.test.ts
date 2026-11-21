import { beforeEach, describe, expect, test } from "vitest";
import { createDb, seed, stockOf, type Db } from "./setup";

type Sale = { id: string; status: string; total: string; change_amount: string | null; invoice_no: string };

let db: Db;
let s: Awaited<ReturnType<typeof seed>>;

beforeEach(async () => {
  db = await createDb();
  s = await seed(db);
});

const createSale = (userId: string, items: unknown[], method: string, customerId?: string | null, cash?: number) =>
  db.as<Sale>(userId, "select * from public.create_sale($1::jsonb, $2, $3::uuid, $4::numeric)", [
    JSON.stringify(items),
    method,
    customerId ?? null,
    cash ?? null,
  ]);

describe("penjualan tunai", () => {
  test("stok berkurang dalam satuan dasar dan kembalian dihitung", async () => {
    // 1 bungkus (16 batang) + 3 batang = 30.000 + 6.000
    const { rows } = await createSale(
      s.kasir,
      [
        { unit_id: s.units.rokokBungkus, qty: 1 },
        { unit_id: s.units.rokokBatang, qty: 3 },
      ],
      "cash",
      null,
      50000,
    );
    expect(rows[0].status).toBe("paid");
    expect(Number(rows[0].total)).toBe(36000);
    expect(Number(rows[0].change_amount)).toBe(14000);
    expect(rows[0].invoice_no).toMatch(/^INV-\d{6}-\d{5}$/);
    expect(await stockOf(db, s.products.rokok)).toBe(32 - 19);

    const moves = await db.admin<{ qty_change: string; type: string }>(
      "select qty_change, type from public.stock_movements where sale_id = $1",
      [rows[0].id],
    );
    expect(moves.rows.map((m) => Number(m.qty_change)).sort()).toEqual([-16, -3]);
  });

  test("modal tercatat saat lunas, untuk laporan laba", async () => {
    const { rows } = await createSale(s.kasir, [{ unit_id: s.units.rokokBatang, qty: 4 }], "cash", null, 10000);
    const items = await db.admin<{ cost_total: string }>("select cost_total from public.sale_items where sale_id = $1", [
      rows[0].id,
    ]);
    expect(Number(items.rows[0].cost_total)).toBe(4 * 1500);
  });

  test("uang kurang ditolak", async () => {
    await expect(createSale(s.kasir, [{ unit_id: s.units.rokokBungkus, qty: 1 }], "cash", null, 20000)).rejects.toThrow(
      /kurang dari total/,
    );
  });

  test("stok tidak cukup ditolak dan tidak ada yang tersimpan", async () => {
    // Stok 32 batang = 2 bungkus; beli 2 bungkus + 1 batang (satuan berbeda, produk sama)
    await expect(
      createSale(
        s.kasir,
        [
          { unit_id: s.units.rokokBungkus, qty: 2 },
          { unit_id: s.units.rokokBatang, qty: 1 },
        ],
        "cash",
        null,
        100000,
      ),
    ).rejects.toThrow(/Stok Rokok Kretek tidak cukup/);

    expect(await stockOf(db, s.products.rokok)).toBe(32);
    const sales = await db.admin<{ n: number }>("select count(*)::int as n from public.sales");
    expect(sales.rows[0].n).toBe(0);
  });

  test("barang satuan bulat tidak bisa dijual pecahan", async () => {
    await expect(createSale(s.kasir, [{ unit_id: s.units.rokokBatang, qty: 1.5 }], "cash", null, 5000)).rejects.toThrow(
      /bilangan bulat/,
    );
  });
});

describe("satuan khusus", () => {
  test("bensin per nominal: Rp25.000 = 2 liter", async () => {
    const { rows } = await createSale(s.kasir, [{ unit_id: s.units.bensinLiter, amount: 25000 }], "cash", null, 25000);
    expect(Number(rows[0].total)).toBe(25000);
    expect(await stockOf(db, s.products.bensin)).toBe(8);
  });

  test("tukar tabung: gas berkurang, tabung kosong bertambah", async () => {
    await createSale(s.kasir, [{ unit_id: s.units.gasTukar, qty: 2 }], "cash", null, 44000);
    expect(await stockOf(db, s.products.gas)).toBe(3);
    expect(await stockOf(db, s.products.tabungKosong)).toBe(2);
  });
});

describe("kasbon", () => {
  const debtOf = async (id: string) =>
    Number((await db.admin<{ d: string }>("select debt_balance as d from public.customers where id = $1", [id])).rows[0].d);

  test("wajib pilih pelanggan", async () => {
    await expect(createSale(s.kasir, [{ unit_id: s.units.rokokBatang, qty: 1 }], "kasbon")).rejects.toThrow(
      /Pilih pelanggan/,
    );
  });

  test("utang bertambah, bisa dibayar sebagian, tidak bisa lebih bayar", async () => {
    await createSale(s.kasir, [{ unit_id: s.units.rokokBungkus, qty: 1 }], "kasbon", s.pelanggan);
    expect(await debtOf(s.pelanggan)).toBe(30000);

    await db.as(s.kasir, "select public.pay_debt($1, $2)", [s.pelanggan, 10000]);
    expect(await debtOf(s.pelanggan)).toBe(20000);

    await expect(db.as(s.kasir, "select public.pay_debt($1, $2)", [s.pelanggan, 25000])).rejects.toThrow(
      /melebihi sisa kasbon/,
    );
  });
});

describe("QRIS", () => {
  test("stok baru berkurang setelah lunas, dan konfirmasi ganda aman", async () => {
    const { rows } = await createSale(s.kasir, [{ unit_id: s.units.rokokBungkus, qty: 1 }], "qris");
    expect(rows[0].status).toBe("pending");
    expect(await stockOf(db, s.products.rokok)).toBe(32);

    // Webhook Midtrans bisa datang lebih dari sekali
    await db.admin("select public.finalize_sale($1)", [rows[0].id]);
    await db.admin("select public.finalize_sale($1)", [rows[0].id]);
    expect(await stockOf(db, s.products.rokok)).toBe(16);
  });

  test("kasir tidak bisa menandai lunas sendiri dari browser", async () => {
    const { rows } = await createSale(s.kasir, [{ unit_id: s.units.rokokBungkus, qty: 1 }], "qris");
    await expect(db.as(s.kasir, "select public.finalize_sale($1)", [rows[0].id])).rejects.toThrow(/permission denied/);
    await expect(db.as(s.kasir, "select public.cancel_pending_sale($1)", [rows[0].id])).rejects.toThrow(
      /permission denied/,
    );
  });

  test("barang di tagihan QRIS yang belum dibayar tidak bisa dijual lagi", async () => {
    // Stok gas 5: semuanya masuk tagihan QRIS yang belum dibayar
    const qris = await createSale(s.kasir, [{ unit_id: s.units.gasTukar, qty: 5 }], "qris");
    await expect(createSale(s.kasir, [{ unit_id: s.units.gasTukar, qty: 1 }], "cash", null, 22000)).rejects.toThrow(
      /Stok Gas 3kg tidak cukup \(sisa 0 tabung, 5 tabung menunggu pembayaran QRIS\)/,
    );

    // Pelanggan tetap bisa membayar, dan stok tidak pernah minus
    await db.admin("select public.finalize_sale($1)", [qris.rows[0].id]);
    expect(await stockOf(db, s.products.gas)).toBe(0);
  });

  test("tagihan QRIS yang dibatalkan melepas stok yang dipesan", async () => {
    const qris = await createSale(s.kasir, [{ unit_id: s.units.gasTukar, qty: 5 }], "qris");
    await db.admin("select public.cancel_pending_sale($1)", [qris.rows[0].id]);
    const { rows } = await createSale(s.kasir, [{ unit_id: s.units.gasTukar, qty: 1 }], "cash", null, 22000);
    expect(rows[0].status).toBe("paid");
  });

  test("tagihan QRIS lebih dari 20 menit tidak lagi menahan stok, walau webhook belum datang", async () => {
    const qris = await createSale(s.kasir, [{ unit_id: s.units.gasTukar, qty: 5 }], "qris");
    await db.admin("update public.sales set created_at = now() - interval '30 minutes' where id = $1", [
      qris.rows[0].id,
    ]);
    const { rows } = await createSale(s.kasir, [{ unit_id: s.units.gasTukar, qty: 1 }], "cash", null, 22000);
    expect(rows[0].status).toBe("paid");
  });

  test("transaksi yang dibatalkan tidak bisa dilunasi", async () => {
    const { rows } = await createSale(s.kasir, [{ unit_id: s.units.rokokBungkus, qty: 1 }], "qris");
    await db.admin("select public.cancel_pending_sale($1, 'expired')", [rows[0].id]);
    await expect(db.admin("select public.finalize_sale($1)", [rows[0].id])).rejects.toThrow(/sudah expired/);
    expect(await stockOf(db, s.products.rokok)).toBe(32);
  });
});
