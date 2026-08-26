import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import distance from "@turf/distance";
import { point } from "@turf/helpers";
import { SAFETY_INSTRUCTIONS } from "./instructions";
import { RAIN_INTENSITY_LABEL } from "./types";
import type { EarthquakeProperties, EmbalseProperties, GeoFeatureCollection, NearbyAlert, WarningProperties, WeatherStationProperties } from "./types";

/**
 * El cálculo de proximidad se hace aquí, en el navegador, y no en un servidor.
 * Dos motivos: permite publicar la app como sitio estático (GitHub Pages), y
 * sobre todo hace que la ubicación del usuario NUNCA salga de su dispositivo.
 *
 * Es un puerto de `server/src/lib/alertEngine.ts` (que se mantiene para las
 * futuras notificaciones push, donde sí hace falta calcularlo en servidor).
 */

// Radio de influencia de un terremoto según magnitud (heurística conservadora: mejor avisar de más).
function earthquakeRadiusKm(magnitude: number): number {
  if (magnitude < 2.5) return 0; // apenas perceptible, no molestamos
  if (magnitude < 3.5) return 15;
  if (magnitude < 4.5) return 40;
  if (magnitude < 5.5) return 90;
  if (magnitude < 6.5) return 180;
  return 350;
}

// Umbrales según la escala oficial AEMET.
const FLASH_FLOOD_MM_H = 30;
const TORRENTIAL_MM_H = 60;
const FLASH_FLOOD_RADIUS_KM = 12;
const SATURATED_GROUND_3H_MM = 60;

const UNA_HORA_MS = 60 * 60 * 1000;

// Una estación que deja de reportar se queda con su última lectura congelada. Si esa
// lectura era de lluvia torrencial, seguiría disparando avisos indefinidamente. Solo
// contamos lecturas recientes: es preferible perder una estación caída que inundar
// de falsas alarmas a quien tenga la app abierta.
const LECTURA_MAX_ANTIGUEDAD_MS = 2 * UNA_HORA_MS;

// Un embalse afecta a quien está aguas abajo, que puede ser bastante más lejos que
// una tormenta local: de ahí el radio más amplio que el de las estaciones.
const EMBALSE_RADIO_KM = 40;
// Lluvia a partir de la cual un embalse sin margen empieza a ser preocupante.
const LLUVIA_RELEVANTE_MM = 10;

function esReciente(fechaHora: string): boolean {
  const t = new Date(fechaHora).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= LECTURA_MAX_ANTIGUEDAD_MS;
}

export interface Datos {
  avisos: GeoFeatureCollection<WarningProperties> | null;
  estaciones: GeoFeatureCollection<WeatherStationProperties> | null;
  terremotos: GeoFeatureCollection<EarthquakeProperties> | null;
  embalses: GeoFeatureCollection<EmbalseProperties> | null;
}

export function calcularAlertasCercanas(lat: number, lon: number, datos: Datos): NearbyAlert[] {
  const userPoint = point([lon, lat]);
  const alerts: NearbyAlert[] = [];

  for (const f of datos.avisos?.features ?? []) {
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
      // geometría inválida puntual: la ignoramos en vez de perder el resto de avisos
    }
  }

  const recientes = (datos.terremotos?.features ?? []).filter((f) => Date.now() - new Date(f.properties.fecha).getTime() < UNA_HORA_MS);
  for (const f of recientes) {
    const radius = earthquakeRadiusKm(f.properties.magnitud);
    if (radius === 0) continue;
    const geom = f.geometry as GeoJSON.Point;
    const d = distance(userPoint, point(geom.coordinates as [number, number]), { units: "kilometers" });
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
    const cercanas = (datos.estaciones?.features ?? [])
      .filter((f) => esReciente(f.properties.fechaHora))
      .map((f) => {
        const geom = f.geometry as GeoJSON.Point;
        return { f, d: distance(userPoint, point(geom.coordinates as [number, number]), { units: "kilometers" }) };
      })
      .filter(({ d }) => d <= FLASH_FLOOD_RADIUS_KM);

    const torrencial = cercanas.filter(({ f }) => (f.properties.precipitacion1h_mm ?? 0) >= TORRENTIAL_MM_H);
    const muyFuerte = cercanas.filter(({ f }) => (f.properties.precipitacion1h_mm ?? 0) >= FLASH_FLOOD_MM_H);
    const terrenoSaturado = cercanas.filter(({ f }) => (f.properties.lluvia3h_mm ?? 0) >= SATURATED_GROUND_3H_MM);

    if (torrencial.length > 0) {
      const peor = torrencial.reduce((a, b) => ((a.f.properties.precipitacion1h_mm ?? 0) > (b.f.properties.precipitacion1h_mm ?? 0) ? a : b)).f;
      alerts.push({
        tipo: "avenidas",
        severidad: "rojo",
        titulo: `Lluvia TORRENCIAL cerca de ti (${peor.properties.precipitacion1h_mm} mm/h en ${peor.properties.nombre}): riesgo MUY ALTO de riada repentina`,
        distancia_km: 0,
        instrucciones: SAFETY_INSTRUCTIONS.avenidas,
        fuente: "AEMET (estación automática, aviso no oficial)",
      });
    } else if (muyFuerte.length > 0) {
      const peor = muyFuerte.reduce((a, b) => ((a.f.properties.precipitacion1h_mm ?? 0) > (b.f.properties.precipitacion1h_mm ?? 0) ? a : b)).f;
      const tendencia = peor.properties.tendenciaLluvia === "subiendo" ? " y sigue intensificándose" : "";
      alerts.push({
        tipo: "avenidas",
        severidad: "naranja",
        titulo: `Lluvia ${RAIN_INTENSITY_LABEL[peor.properties.intensidadLluvia].toLowerCase()} detectada cerca (${peor.properties.precipitacion1h_mm} mm/h en ${peor.properties.nombre})${tendencia}: riesgo de riada repentina`,
        distancia_km: 0,
        instrucciones: SAFETY_INSTRUCTIONS.avenidas,
        fuente: "AEMET (estación automática, aviso no oficial)",
      });
    } else if (terrenoSaturado.length > 0) {
      const peor = terrenoSaturado.reduce((a, b) => ((a.f.properties.lluvia3h_mm ?? 0) > (b.f.properties.lluvia3h_mm ?? 0) ? a : b)).f;
      alerts.push({
        tipo: "avenidas",
        severidad: "amarillo",
        titulo: `Terreno saturado por lluvia acumulada cerca de ti (${peor.properties.lluvia3h_mm} mm en 3h en ${peor.properties.nombre}): ríos y ramblas pueden seguir subiendo aunque ahora no llueva tan fuerte`,
        distancia_km: 0,
        instrucciones: SAFETY_INSTRUCTIONS.avenidas,
        fuente: "AEMET (estación automática, aviso no oficial)",
      });
    }
  }

  // --- Embalses sin margen -------------------------------------------------
  //
  // Un embalse lleno NO es una emergencia por sí mismo: en primavera es lo normal.
  // Lo que sí importa es la combinación: un embalse sin capacidad de absorber agua
  // MIENTRAS está lloviendo cerca significa que lo que entra sale aguas abajo.
  //
  // Avisar solo por el nivel llenaría la app de alertas permanentes que la gente
  // acabaría ignorando, y con ellas ignoraría también las de verdad.
  const embalsesSinMargen = (datos.embalses?.features ?? []).filter((f) => f.properties.estado === "rojo");
  if (embalsesSinMargen.length > 0) {
    const lloviendoCerca = (datos.estaciones?.features ?? []).some(
      (f) => esReciente(f.properties.fechaHora) && (f.properties.precipitacion1h_mm ?? 0) >= LLUVIA_RELEVANTE_MM
    );

    if (lloviendoCerca) {
      const cercanos = embalsesSinMargen
        .map((f) => {
          const geom = f.geometry as GeoJSON.Point;
          return { f, d: distance(userPoint, point(geom.coordinates as [number, number]), { units: "kilometers" }) };
        })
        .filter(({ d }) => d <= EMBALSE_RADIO_KM);

      if (cercanos.length > 0) {
        const masCercano = cercanos.reduce((a, b) => (a.d < b.d ? a : b));
        const pct = masCercano.f.properties.porcentaje;
        alerts.push({
          tipo: "avenidas",
          severidad: "naranja",
          titulo:
            `El embalse de ${masCercano.f.properties.nombre} está al ${pct !== null ? `${pct}%` : "límite"} ` +
            `y está lloviendo en la zona: sin margen para absorber la crecida, el agua va aguas abajo`,
          distancia_km: Math.round(masCercano.d),
          instrucciones: SAFETY_INSTRUCTIONS.avenidas,
          fuente: "MITECO (nivel de embalses)",
        });
      }
    }
  }

  return alerts;
}
