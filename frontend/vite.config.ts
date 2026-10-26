import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev, /api is proxied to the local FastAPI server.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8000" } },
  build: { rollupOptions: { output: { manualChunks: { charts: ["recharts"], react: ["react", "react-dom"] } } } },
});
