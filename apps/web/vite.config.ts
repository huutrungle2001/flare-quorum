import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    proxy: {
      "/local-flare-ingress": {
        target: "https://veilbid-flare-ingress-production.up.railway.app",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/local-flare-ingress/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (request) => {
            request.setHeader("Origin", "https://flare-quorum.vercel.app");
          });
        },
      },
    },
  },
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
