import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Defaults to the native dev workflow (backend on localhost:8000). Inside
// Docker Compose, the backend isn't reachable via localhost - it's a separate
// service - so compose overrides this via VITE_API_TARGET=http://backend:8000.
const apiTarget = process.env.VITE_API_TARGET || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
