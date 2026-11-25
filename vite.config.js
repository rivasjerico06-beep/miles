import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_PORT = Number(process.env.API_PORT || 3001);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // In development the Express API runs separately (npm run dev starts both).
    proxy: { "/api": { target: `http://localhost:${API_PORT}` } },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 900,
  },
});
