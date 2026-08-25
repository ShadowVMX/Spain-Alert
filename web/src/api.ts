import type { EarthquakeProperties, GeoFeatureCollection, SaihCapa, WarningProperties, WeatherStationProperties } from "./types";

/**
 * La app funciona en dos modos:
 *
 * - "estatico" (GitHub Pages): los datos son archivos JSON que genera GitHub
 *   Actions cada pocos minutos. No hay servidor, así que la clave de AEMET
 *   nunca llega al navegador y las alertas se calculan en el propio dispositivo.
 * - "api" (despliegue con el servidor Node): los datos se piden en vivo al backend.
 *
 * Se elige en tiempo de compilación con VITE_DATA_MODE.
 */
export const DATA_MODE: "estatico" | "api" = import.meta.env.VITE_DATA_MODE === "estatico" ? "estatico" : "api";

const base = import.meta.env.BASE_URL;

const RUTAS = {
  estatico: {
    avisos: `${base}datos/avisos.json`,
    estaciones: `${base}datos/estaciones.json`,
    terremotos: `${base}datos/terremotos.json`,
    meta: `${base}datos/meta.json`,
    saih: `${base}datos/saih.json`,
  },
  api: {
    avisos: "/api/warnings",
    estaciones: "/api/sensors/weather",
    terremotos: "/api/earthquakes",
    meta: "/api/health",
    saih: null,
  },
} as const;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Error ${res.status} al pedir ${url}`);
  }
  return (await res.json()) as T;
}

export const fetchWarnings = () => getJson<GeoFeatureCollection<WarningProperties>>(RUTAS[DATA_MODE].avisos);
export const fetchStations = () => getJson<GeoFeatureCollection<WeatherStationProperties>>(RUTAS[DATA_MODE].estaciones);
export const fetchEarthquakes = () => getJson<GeoFeatureCollection<EarthquakeProperties>>(RUTAS[DATA_MODE].terremotos);

export interface SaihCapaInfo {
  wmsUrl: string;
  layer: string;
}

/**
 * En modo estático los nombres de capa del WMS vienen pre-descubiertos por el
 * runner de Actions, porque el navegador no puede consultar GetCapabilities
 * (lo bloquea CORS). En modo API los descubre el backend.
 */
export async function fetchSaihCapa(capa: SaihCapa): Promise<SaihCapaInfo> {
  if (DATA_MODE === "estatico") {
    const todas = await getJson<{ capas: Record<string, SaihCapaInfo | null> }>(RUTAS.estatico.saih);
    const info = todas.capas?.[capa];
    if (!info) throw new Error(`Capa SAIH ${capa} no disponible`);
    return info;
  }
  const info = await getJson<{ layer: string; wmsUrl: string }>(`/api/saih/${capa}/layer`);
  // En modo API las teselas pasan por el backend para evitar problemas de CORS.
  return { layer: info.layer, wmsUrl: `/api/saih/${capa}/tiles` };
}

export async function fetchUltimaActualizacion(): Promise<string | null> {
  try {
    const meta = await getJson<{ actualizado?: string; hora?: string }>(RUTAS[DATA_MODE].meta);
    return meta.actualizado ?? meta.hora ?? null;
  } catch {
    return null;
  }
}
