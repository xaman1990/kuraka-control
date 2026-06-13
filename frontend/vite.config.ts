import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const BACKEND_PORT = process.env.BACKEND_PORT ?? "5174";
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT ?? 5173);

// Vite proxies /api → Express so the browser sees one origin (no CORS).
// See docs/arquitectura/deployment.md.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: FRONTEND_PORT,
    proxy: {
      "/api": {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
  },
});
