import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "spa-404",
      closeBundle() {
        const index = resolve("dist/index.html");
        try {
          copyFileSync(index, resolve("dist/404.html"));
        } catch {
          /* build output may use another folder */
        }
      },
    },
  ],
  base: process.env.VITE_BASE || "/",
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
});
