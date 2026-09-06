import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = env.VITE_AUCTORAIL_API_URL ?? env.VITE_PROOFGATE_API_URL ?? "";

  return {
    base: "./",
    plugins: [react()],
    define: {
      "import.meta.env.VITE_AUCTORAIL_API_URL": JSON.stringify(apiUrl),
      // Legacy compile-time alias so the existing live UI keeps working while
      // source files are migrated away from the previous product namespace.
      "import.meta.env.VITE_PROOFGATE_API_URL": JSON.stringify(apiUrl)
    },
    server: {
      port: 5173,
      host: "0.0.0.0",
      // Allow the sandbox preview host (Vite rejects unknown hosts;
      // leading-dot entries match any subdomain of e2b.app).
      allowedHosts: [".e2b.app"],
      proxy: {
        "/api/security-lab": {
          target: "http://127.0.0.1:8788",
          changeOrigin: false
        },
        "/api/content-check": {
          target: "http://127.0.0.1:8788",
          changeOrigin: false
        },
        "/api/verify-proof": {
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
  };
});
