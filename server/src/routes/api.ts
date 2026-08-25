import { Router } from "express";
import { getActiveWarnings, getWeatherStations } from "../lib/aemet.js";
import { getRecentEarthquakes } from "../lib/earthquakes.js";
import { getNearbyAlerts } from "../lib/alertEngine.js";
import { cached } from "../lib/cache.js";
import { getSaihFeatureInfo, getSaihLayerName, SAIH_LAYERS } from "../lib/saih.js";
import type { SaihCapa } from "../lib/saih.js";

export const api = Router();

api.get("/health", (_req, res) => {
  res.json({ ok: true, hora: new Date().toISOString() });
});

api.get("/sensors/weather", async (_req, res) => {
  try {
    const data = await cached("stations", 10 * 60 * 1000, getWeatherStations);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

api.get("/warnings", async (_req, res) => {
  try {
    const data = await cached("warnings", 5 * 60 * 1000, getActiveWarnings);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

api.get("/earthquakes", async (_req, res) => {
  try {
    const data = await cached("quakes", 2 * 60 * 1000, getRecentEarthquakes);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

api.get("/hazards", async (_req, res) => {
  try {
    const [warnings, earthquakes, sensors] = await Promise.all([
      cached("warnings", 5 * 60 * 1000, getActiveWarnings),
      cached("quakes", 2 * 60 * 1000, getRecentEarthquakes),
      cached("stations", 10 * 60 * 1000, getWeatherStations),
    ]);
    res.json({ warnings, earthquakes, sensors });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

const SAIH_CAPAS = Object.keys(SAIH_LAYERS) as SaihCapa[];

function isSaihCapa(value: string): value is SaihCapa {
  return (SAIH_CAPAS as string[]).includes(value);
}

// Capas nacionales del SAIH (todas las cuencas): ríos, embalses, pluviometría.
// Solo exponemos aquí el nombre de capa (para pintar el WMS en el mapa) y un
// proxy de GetFeatureInfo (para el detalle al hacer click). Deliberadamente NO
// entra en el motor automático de alertas todavía: no se ha podido verificar en
// vivo desde este entorno (ver README).
api.get("/saih/:capa/layer", async (req, res) => {
  const { capa } = req.params;
  if (!isSaihCapa(capa)) {
    res.status(404).json({ error: `Capa SAIH desconocida: ${capa}` });
    return;
  }
  try {
    const layer = await getSaihLayerName(capa);
    res.json({ capa, layer, wmsUrl: SAIH_LAYERS[capa] });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

api.get("/saih/:capa/tiles", async (req, res) => {
  const { capa } = req.params;
  if (!isSaihCapa(capa)) {
    res.status(404).send();
    return;
  }
  try {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === "string") params.set(key, value);
    }
    if (!params.has("service")) params.set("service", "WMS");
    if (!params.has("request")) params.set("request", "GetMap");

    const upstream = await fetch(`${SAIH_LAYERS[capa]}?${params.toString()}`);
    if (!upstream.ok) {
      res.status(502).send();
      return;
    }
    res.set("Content-Type", upstream.headers.get("content-type") ?? "image/png");
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.status(502).send();
  }
});

api.get("/saih/:capa/info", async (req, res) => {
  const { capa } = req.params;
  if (!isSaihCapa(capa)) {
    res.status(404).json({ error: `Capa SAIH desconocida: ${capa}` });
    return;
  }
  const { bbox, width, height, i, j, crs } = req.query;
  if (typeof bbox !== "string" || typeof width !== "string" || typeof height !== "string" || typeof i !== "string" || typeof j !== "string") {
    res.status(400).json({ error: "Parámetros bbox, width, height, i, j requeridos" });
    return;
  }
  try {
    const texto = await getSaihFeatureInfo({
      capa,
      bbox,
      width: Number(width),
      height: Number(height),
      i: Number(i),
      j: Number(j),
      crs: typeof crs === "string" ? crs : undefined,
    });
    res.type("text/plain").send(texto);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

api.get("/alerts/nearby", async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    res.status(400).json({ error: "Parámetros lat y lon requeridos y numéricos" });
    return;
  }
  try {
    const alerts = await getNearbyAlerts(lat, lon);
    res.json({ alerts, comprobado: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});
