import { describe, expect, test } from "vitest";
import { parseNumber, qty, rupiah } from "@/lib/format";

describe("parseNumber (format angka Indonesia)", () => {
  test.each([
    ["12500", 12500],
    ["12.500", 12500],
    ["1.250.000", 1250000],
    ["Rp 10.000", 10000],
    ["2,5", 2.5],
    ["1.250,75", 1250.75],
    ["0.5", 0.5], // titik tanpa 3 digit di belakang = desimal (kebiasaan ketik di HP)
  ])("%s -> %d", (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });

  test.each(["", "   ", "abc"])("%j tidak valid", (input) => {
    expect(parseNumber(input)).toBeNaN();
  });
});

test("rupiah dan qty", () => {
  expect(rupiah(1250000)).toBe("Rp1.250.000");
  expect(rupiah(null)).toBe("Rp0");
  expect(qty(1.5)).toBe("1,5");
  expect(qty("2.000")).toBe("2");
});
