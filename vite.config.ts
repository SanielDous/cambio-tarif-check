import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative: the build works from any path (hash routing needs no server-side base).
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks: they change far less often than the app code and load in parallel.
        manualChunks(id) {
          const path = id.replaceAll("\\", "/");
          const pkg =
            /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)\//.exec(
              path,
            )?.[1];
          if (!pkg) return undefined;
          if (["react", "react-dom", "scheduler"].includes(pkg)) return "vendor-react";
          if (pkg.startsWith("@tanstack/")) return "vendor-router";
          if (pkg === "i18next" || pkg === "react-i18next") return "vendor-i18n";
          if (/^(@radix-ui\/|@floating-ui\/|react-remove-scroll|aria-hidden)/.test(pkg)) {
            return "vendor-ui";
          }
          return undefined;
        },
      },
    },
  },
  define: { __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? "dev") },
});
