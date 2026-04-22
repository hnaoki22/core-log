import { defineConfig } from "vitest/config";
import path from "path";

// Phase 0 #18 — Vitest test foundation
//
// Configuration goals:
//   - Match the path alias `@/*` used in the Next.js codebase (tsconfig)
//   - Node environment by default (DOM-less, fastest). Component tests can
//     opt in to happy-dom with a per-file pragma if/when we add them.
//   - Typed as pure .ts tests under src/**/__tests__ or alongside the file
//     as *.test.ts. We start with lib/ tests; API route integration tests
//     are a follow-up.

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/**/__tests__/**/*.ts",
      "src/**/__tests__/**/*.tsx",
    ],
    exclude: ["node_modules", ".next", "dist"],
    reporters: ["default"],
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
