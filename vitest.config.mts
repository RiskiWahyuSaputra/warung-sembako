import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    // Tes database memuat skema ke PGlite di setiap tes, butuh waktu lebih dari bawaan 5 detik.
    testTimeout: 30000,
  },
});
