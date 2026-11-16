import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The Purchase module's own suite, shaped like the Main ERP's module suites
 * (vitest.config.ts there runs tests/chromia/**): everything lives under
 * tests/purchase/, so after the merge it becomes `npm run test:purchase`
 * with this include and nothing else to move.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/purchase/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
