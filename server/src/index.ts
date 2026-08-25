import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { api } from "./routes/api.js";

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use("/api", api);

// En producción el mismo servidor sirve también la web ya construida (web/dist),
// para poder desplegar todo como una sola app en vez de dos servicios separados.
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, "../../web/dist");

if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  // Cualquier ruta que no sea /api la resuelve la SPA.
  app.get("*", (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
  console.log(`Sirviendo la web desde ${webDist}`);
}

app.listen(port, () => {
  console.log(`Alerta España escuchando en http://localhost:${port}`);
  if (!fs.existsSync(webDist)) {
    console.log('Web sin construir todavía: ejecuta "npm run build" en la raíz para servirla desde aquí.');
  }
  if (!process.env.AEMET_API_KEY) {
    console.warn("AVISO: falta AEMET_API_KEY — los datos de lluvia no cargarán. Consíguela gratis en https://opendata.aemet.es/centrodedescargas/altaUsuario");
  }
});
