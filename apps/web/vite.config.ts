import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      buffer: "buffer/",
    },
  },
  build: {
    emptyOutDir: true,
    outDir: "dist",
  },
  plugins: [react()],
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      thresholds: {
        branches: 40,
        functions: 48,
        lines: 42,
        statements: 40,
      },
    },
    environment: "jsdom",
    setupFiles: "./test/setup.ts",
  },
});
