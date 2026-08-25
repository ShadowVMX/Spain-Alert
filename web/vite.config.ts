import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En GitHub Pages la app se sirve bajo /<nombre-del-repo>/, no en la raíz del dominio.
// El workflow de despliegue pasa VITE_BASE con el valor correcto.
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
