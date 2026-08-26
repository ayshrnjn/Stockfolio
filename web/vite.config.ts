import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  const apiTarget = environment.VITE_DEV_API_TARGET || "http://localhost:8080";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": apiTarget,
        "/health": apiTarget,
        "/live": apiTarget,
      },
    },
    build: {
      sourcemap: true,
      target: "es2022",
    },
  };
});

