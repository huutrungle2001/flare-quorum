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
    environment: "jsdom",
    setupFiles: "./test/setup.ts",
  },
});
