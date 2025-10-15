import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['ios >= 12']
    }),
  ],
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
        target: "https://trustnet-restaurant.onrender.com", // your Flask backend
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
