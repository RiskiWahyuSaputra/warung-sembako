import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createDb } from "./setup";

const dir = join(__dirname, "..", "..", "supabase");
const updates = readdirSync(dir)
  .filter((f) => /^update-\d+.*\.sql$/.test(f))
  .sort();

// README menjanjikan file update "aman dijalankan ulang": jalankan semuanya dua kali di atas skema terbaru.
test.each(updates)("%s aman dijalankan ulang di atas schema.sql", async (file) => {
  const db = await createDb();
  const sql = readFileSync(join(dir, file), "utf8");
  await db.pg.exec(sql);
  await db.pg.exec(sql);
  expect(true).toBe(true);
});
