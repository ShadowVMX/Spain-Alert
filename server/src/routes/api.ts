import { Router } from "express";
import { getActiveWarnings, getWeatherStations } from "../lib/aemet.js";
import { getRecentEarthquakes } from "../lib/earthquakes.js";
import { getNearbyAlerts } from "../lib/alertEngine.js";
import { cached } from "../lib/cache.js";

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
