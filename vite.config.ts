import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api/security-lab": {
        target: "http://127.0.0.1:8788",
        changeOrigin: false
      },
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false
      }
    }
  },
  build: {
    target: "es2022"
  }
});