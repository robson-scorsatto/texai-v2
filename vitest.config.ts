import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Each test spins up its own in-memory PGlite (a WASM Postgres);
    // running multiple test files in parallel worker processes was
    // flaky in this sandboxed environment, so we run them sequentially
    // in a single process instead. Safe to revisit once running against
    // a real Postgres in CI.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "next/headers": path.resolve(__dirname, "./tests/helpers/fake-next-headers.ts"),
      "@/": path.resolve(__dirname, "./src/") + "/",
    },
  },
});
