import { booleanPointInPolygon, distance as turfDistance, point } from "@turf/turf";
import { getActiveWarnings, getWeatherStations } from "./aemet.js";
import { getRecentEarthquakes } from "./earthquakes.js";
import { SAFETY_INSTRUCTIONS } from "./instructions.js";
import type { HazardKind, Severity } from "./types.js";
import { cached } from "./cache.js";

export interface NearbyAlert {
  tipo: HazardKind;
  severidad: Severity;
  titulo: string;
  distancia_km: number;
  instrucciones: string[];
  fuente: string;
}

// Radio de influencia de un terremoto según magnitud (heurística conservadora: mejor avisar de más).
function earthquakeRadiusKm(magnitude: number): number {
  if (magnitude < 2.5) return 0; // apenas perceptible, no molestamos
  if (magnitude < 3.5) return 15;
  if (magnitude < 4.5) return 40;
  if (magnitude < 5.5) return 90;
  if (magnitude < 6.5) return 180;
  return 350;
}

// Umbral de lluvia torrencial (AEMET considera "torrencial" > 60 mm/h; avisamos ya en "muy fuerte" > 30 mm/h).
const FLASH_FLOOD_MM_H = 30;
const FLASH_FLOOD_RADIUS_KM = 12;

export async function getNearbyAlerts(lat: number, lon: number): Promise<NearbyAlert[]> {
  const userPoint = point([lon, lat]);
  const alerts: NearbyAlert[] = [];

  const [warnings, quakes, stations] = await Promise.all([
    cached("warnings", 5 * 60 * 1000, getActiveWarnings),
    cached("quakes", 2 * 60 * 1000, getRecentEarthquakes),
    cached("stations", 10 * 60 * 1000, getWeatherStations),
  ]);

  for (const f of warnings.features) {
    try {
      if (booleanPointInPolygon(userPoint, f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon)) {
        alerts.push({
          tipo: f.properties.fenomeno,
          severidad: f.properties.severidad,
          titulo: `Aviso ${f.properties.severidad} por ${f.properties.fenomeno} en ${f.properties.zona}`,
          distancia_km: 0,
          instrucciones: SAFETY_INSTRUCTIONS[f.properties.fenomeno],
          fuente: "AEMET",
        });
      }
    } catch {
      // geometría inválida puntual: la ignoramos en vez de tumbar toda la respuesta
    }
  }

  const recentQuakes = quakes.features.filter((f) => Date.now() - new Date(f.properties.fecha).getTime() < 60 * 60 * 1000);
  for (const f of recentQuakes) {
    const radius = earthquakeRadiusKm(f.properties.magnitud);
    if (radius === 0) continue;
    const geom = f.geometry as GeoJSON.Point;
    const d = turfDistance(userPoint, point(geom.coordinates as [number, number]), { units: "kilometers" });
    if (d <= radius) {
      alerts.push({
        tipo: "terremoto",
        severidad: f.properties.magnitud >= 5 ? "rojo" : f.properties.magnitud >= 4 ? "naranja" : "amarillo",
        titulo: `Terremoto de magnitud ${f.properties.magnitud} cerca de ${f.properties.lugar}`,
        distancia_km: Math.round(d),
        instrucciones: SAFETY_INSTRUCTIONS.terremoto,
        fuente: "EMSC",
      });
    }
  }

  const nearbyHeavyRain = stations.features.filter((f) => {
    if ((f.properties.precipitacion1h_mm ?? 0) < FLASH_FLOOD_MM_H) return false;
    const geom = f.geometry as GeoJSON.Point;
    const d = turfDistance(userPoint, point(geom.coordinates as [number, number]), { units: "kilometers" });
    return d <= FLASH_FLOOD_RADIUS_KM;
  });
  if (nearbyHeavyRain.length > 0 && !alerts.some((a) => a.tipo === "avenidas" || a.tipo === "lluvia")) {
    const worst = nearbyHeavyRain.reduce((a, b) => ((a.properties.precipitacion1h_mm ?? 0) > (b.properties.precipitacion1h_mm ?? 0) ? a : b));
    alerts.push({
      tipo: "avenidas",
      severidad: "naranja",
      titulo: `Lluvia muy fuerte detectada cerca (${worst.properties.precipitacion1h_mm} mm/h en ${worst.properties.nombre}): riesgo de riada repentina`,
      distancia_km: 0,
      instrucciones: SAFETY_INSTRUCTIONS.avenidas,
      fuente: "AEMET (estación automática, aviso no oficial)",
    });
  }

  return alerts;
}
