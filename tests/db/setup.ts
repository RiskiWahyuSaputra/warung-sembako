import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const root = join(__dirname, "..", "..");
const sql = (file: string) => readFileSync(join(root, file), "utf8");

export type Db = Awaited<ReturnType<typeof createDb>>;

/** Database baru di memori: shim Supabase + supabase/schema.sql asli. */
export async function createDb() {
  const pg = new PGlite();
  await pg.exec(sql("tests/db/supabase-shim.sql"));
  await pg.exec(sql("supabase/schema.sql"));

  /** Membuat pengguna lewat auth.users, sehingga trigger handle_new_user ikut diuji. */
  async function createUser(email: string) {
    const { rows } = await pg.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email]);
    return rows[0].id;
  }

  /**
   * Menjalankan query sebagai pengguna yang login (peran authenticated, RLS aktif),
   * seperti panggilan dari browser lewat supabase-js.
   */
  async function as<T>(userId: string, text: string, params: unknown[] = []) {
    return pg.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      await tx.exec("set local role authenticated");
      return tx.query<T>(text, params);
    });
  }

  /** Query sebagai server (kunci rahasia / service role). */
  const admin = <T>(text: string, params: unknown[] = []) => pg.query<T>(text, params);

  return { pg, createUser, as, admin };
}

/** Data dasar: pemilik, kasir, rokok (batang/bungkus), bensin (desimal), gas tukar tabung. */
export async function seed(db: Db) {
  const owner = await db.createUser("pemilik@warung.test");
  const kasir = await db.createUser("kasir@warung.test");

  const product = async (name: string, baseUnit: string, stock: number, cost: number, allowDecimal = false) => {
    const { rows } = await db.admin<{ id: string }>(
      `insert into public.products (name, base_unit, stock, cost_price, allow_decimal)
       values ($1, $2, $3, $4, $5) returning id`,
      [name, baseUnit, stock, cost, allowDecimal],
    );
    return rows[0].id;
  };
  const unit = async (productId: string, name: string, conversion: number, price: number, returnsProductId?: string) => {
    const { rows } = await db.admin<{ id: string }>(
      `insert into public.product_units (product_id, name, conversion, price, returns_product_id, is_default)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [productId, name, conversion, price, returnsProductId ?? null, conversion === 1],
    );
    return rows[0].id;
  };

  const rokok = await product("Rokok Kretek", "batang", 32, 1500);
  const rokokBatang = await unit(rokok, "Batang", 1, 2000);
  const rokokBungkus = await unit(rokok, "Bungkus", 16, 30000);

  const bensin = await product("Bensin Eceran", "liter", 10, 10000, true);
  const bensinLiter = await unit(bensin, "Liter", 1, 12500);

  const tabungKosong = await product("Tabung Gas Kosong", "tabung", 0, 0);
  const gas = await product("Gas 3kg", "tabung", 5, 18000);
  const gasTukar = await unit(gas, "Tukar tabung", 1, 22000, tabungKosong);

  const { rows } = await db.admin<{ id: string }>(
    "insert into public.customers (name) values ('Bu Sri') returning id",
  );
  const pelanggan = rows[0].id;

  return {
    owner,
    kasir,
    products: { rokok, bensin, gas, tabungKosong },
    units: { rokokBatang, rokokBungkus, bensinLiter, gasTukar },
    pelanggan,
  };
}

export async function stockOf(db: Db, productId: string) {
  const { rows } = await db.admin<{ stock: string }>("select stock from public.products where id = $1", [productId]);
  return Number(rows[0].stock);
}
