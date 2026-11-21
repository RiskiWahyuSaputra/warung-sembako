import { describe, expect, test } from "vitest";
import { defaultUnit, lineValue, quickCash, type Line } from "@/lib/cart";
import type { Product, ProductUnit } from "@/lib/types";

const unit = (id: string, conversion: number, price: number, is_default = false): ProductUnit => ({
  id,
  product_id: "p",
  name: id,
  conversion,
  price,
  barcode: null,
  returns_product_id: null,
  is_default,
});

const product = (allow_decimal: boolean, units: ProductUnit[]): Product => ({
  id: "p",
  name: "Barang",
  category_id: null,
  base_unit: "pcs",
  allow_decimal,
  stock: 100,
  min_stock: 0,
  is_active: true,
  image_path: null,
  created_at: "",
  product_units: units,
});

const line = (p: Product, unitId: string, input: string, mode: Line["mode"] = "qty"): Line => ({
  key: "l1",
  product: p,
  unitId,
  mode,
  input,
});

const rokok = product(false, [unit("batang", 1, 2000), unit("bungkus", 16, 30000, true)]);
const bensin = product(true, [unit("liter", 1, 12500, true)]);

describe("lineValue", () => {
  test("jumlah x harga satuan", () => {
    expect(lineValue(line(rokok, "bungkus", "2"))).toEqual({ qty: 2, subtotal: 60000 });
  });

  test("barang satuan bulat menolak pecahan", () => {
    expect(lineValue(line(rokok, "batang", "1,5"))).toBeNull();
  });

  test("barang desimal menerima pecahan", () => {
    expect(lineValue(line(bensin, "liter", "1,5"))).toEqual({ qty: 1.5, subtotal: 18750 });
  });

  test("beli per nominal: qty dibulatkan 3 desimal, subtotal = nominal", () => {
    expect(lineValue(line(bensin, "liter", "10.000", "amount"))).toEqual({ qty: 0.8, subtotal: 10000 });
    expect(lineValue(line(bensin, "liter", "7000", "amount"))).toEqual({ qty: 0.56, subtotal: 7000 });
  });

  test.each(["", "0", "-1", "abc"])("input %j belum valid", (input) => {
    expect(lineValue(line(rokok, "batang", input))).toBeNull();
  });
});

test("defaultUnit memilih satuan bawaan, atau yang pertama", () => {
  expect(defaultUnit(rokok).id).toBe("bungkus");
  expect(defaultUnit(product(false, [unit("a", 1, 1), unit("b", 2, 2)])).id).toBe("a");
});

describe("quickCash", () => {
  test("uang pas lalu pecahan yang masuk akal", () => {
    expect(quickCash(36000)).toEqual([36000, 40000, 50000, 100000]);
  });

  test("total yang sudah bulat tidak diulang", () => {
    expect(quickCash(50000)).toEqual([50000, 60000, 100000]);
  });
});
