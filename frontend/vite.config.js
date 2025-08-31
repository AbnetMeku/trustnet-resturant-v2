import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'), // keeps "@/..." imports working
    },
  },
  server: {
    host: true,  // allow LAN access
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000", // your Flask backend
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
