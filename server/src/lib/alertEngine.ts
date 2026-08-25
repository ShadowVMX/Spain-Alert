import { booleanPointInPolygon, distance as turfDistance, point } from "@turf/turf";
import { getActiveWarnings, getWeatherStations } from "./aemet.js";
import { getRecentEarthquakes } from "./earthquakes.js";
import { SAFETY_INSTRUCTIONS } from "./instructions.js";
import type { HazardKind, Severity } from "./types.js";
import { cached } from "./cache.js";
import { RAIN_INTENSITY_LABEL } from "./rain.js";

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

// Umbrales según la escala oficial AEMET: avisamos ya en "muy fuerte" (30-60 mm/h);
// "torrencial" (>60 mm/h) se trata como riesgo de riada inminente (rojo).
const FLASH_FLOOD_MM_H = 30;
const TORRENTIAL_MM_H = 60;
const FLASH_FLOOD_RADIUS_KM = 12;
// El terreno saturado por lluvia sostenida puede provocar crecidas río abajo incluso
// si en este momento ya no está lloviendo con esa intensidad justo encima del usuario.
const SATURATED_GROUND_3H_MM = 60;

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

  const yaHayAvisoDeLluvia = alerts.some((a) => a.tipo === "avenidas" || a.tipo === "lluvia");
  if (!yaHayAvisoDeLluvia) {
    const cercanas = stations.features
      .map((f) => {
        const geom = f.geometry as GeoJSON.Point;
        const d = turfDistance(userPoint, point(geom.coordinates as [number, number]), { units: "kilometers" });
        return { f, d };
      })
      .filter(({ d }) => d <= FLASH_FLOOD_RADIUS_KM);

    const torrencial = cercanas.filter(({ f }) => (f.properties.precipitacion1h_mm ?? 0) >= TORRENTIAL_MM_H);
    const muyFuerte = cercanas.filter(({ f }) => (f.properties.precipitacion1h_mm ?? 0) >= FLASH_FLOOD_MM_H);
    const terrenoSaturado = cercanas.filter(({ f }) => (f.properties.lluvia3h_mm ?? 0) >= SATURATED_GROUND_3H_MM);

    if (torrencial.length > 0) {
      const worst = torrencial.reduce((a, b) => ((a.f.properties.precipitacion1h_mm ?? 0) > (b.f.properties.precipitacion1h_mm ?? 0) ? a : b)).f;
      alerts.push({
        tipo: "avenidas",
        severidad: "rojo",
        titulo: `Lluvia TORRENCIAL cerca de ti (${worst.properties.precipitacion1h_mm} mm/h en ${worst.properties.nombre}): riesgo MUY ALTO de riada repentina`,
        distancia_km: 0,
        instrucciones: SAFETY_INSTRUCTIONS.avenidas,
        fuente: "AEMET (estación automática, aviso no oficial)",
      });
    } else if (muyFuerte.length > 0) {
      const worst = muyFuerte.reduce((a, b) => ((a.f.properties.precipitacion1h_mm ?? 0) > (b.f.properties.precipitacion1h_mm ?? 0) ? a : b)).f;
      const tendencia = worst.properties.tendenciaLluvia === "subiendo" ? " y sigue intensificándose" : "";
      alerts.push({
        tipo: "avenidas",
        severidad: "naranja",
        titulo: `Lluvia ${RAIN_INTENSITY_LABEL[worst.properties.intensidadLluvia].toLowerCase()} detectada cerca (${worst.properties.precipitacion1h_mm} mm/h en ${worst.properties.nombre})${tendencia}: riesgo de riada repentina`,
        distancia_km: 0,
        instrucciones: SAFETY_INSTRUCTIONS.avenidas,
        fuente: "AEMET (estación automática, aviso no oficial)",
      });
    } else if (terrenoSaturado.length > 0) {
      const worst = terrenoSaturado.reduce((a, b) => ((a.f.properties.lluvia3h_mm ?? 0) > (b.f.properties.lluvia3h_mm ?? 0) ? a : b)).f;
      alerts.push({
        tipo: "avenidas",
        severidad: "amarillo",
        titulo: `Terreno saturado por lluvia acumulada cerca de ti (${worst.properties.lluvia3h_mm} mm en 3h en ${worst.properties.nombre}): ríos y ramblas pueden seguir subiendo aunque ahora no llueva tan fuerte`,
        distancia_km: 0,
        instrucciones: SAFETY_INSTRUCTIONS.avenidas,
        fuente: "AEMET (estación automática, aviso no oficial)",
      });
    }
  }

  return alerts;
}
