import "dotenv/config";
import express from "express";
import cors from "cors";
import { api } from "./routes/api.js";

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use("/api", api);

app.listen(port, () => {
  console.log(`Spain Alert API escuchando en http://localhost:${port}`);
  if (!process.env.AEMET_API_KEY) {
    console.warn("AVISO: falta AEMET_API_KEY en .env — los endpoints de AEMET fallarán. Consíguela en https://opendata.aemet.es/centrodedescargas/altaUsuario");
  }
});
