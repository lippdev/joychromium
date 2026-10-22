import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The build lands in site/dist, which server.mjs serves; dev proxies the sign-up API to a local server.mjs.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true, assetsInlineLimit: 0 },
  server: { proxy: { "/api": "http://127.0.0.1:3000" } },
});
