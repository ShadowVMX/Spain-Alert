import { gunzipSync } from "node:zlib";
import { extract } from "tar-stream";
import { XMLParser } from "fast-xml-parser";
import type { GeoFeature, GeoFeatureCollection, HazardKind, Severity, WeatherStationProperties } from "./types.js";
import { classifyRain, classifyTrend } from "./rain.js";

const AEMET_BASE = "https://opendata.aemet.es/opendata/api";

function apiKey(): string {
  const key = process.env.AEMET_API_KEY;
  if (!key) {
    throw new Error("Falta AEMET_API_KEY. Consigue una gratis en https://opendata.aemet.es/centrodedescargas/altaUsuario");
  }
  return key;
}

/**
 * Todas las llamadas de AEMET OpenData siguen un patrón de dos pasos:
 * 1) pides el endpoint -> te devuelve { estado, datos: <url>, metadatos: <url> }
 * 2) haces GET a la url de "datos" para obtener el payload real.
 */
async function fetchAemet(path: string): Promise<{ raw: Buffer; contentType: string }> {
  const res = await fetch(`${AEMET_BASE}${path}`, {
    headers: { api_key: apiKey(), Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`AEMET rechazó ${path}: HTTP ${res.status}`);
  }
  const meta = (await res.json()) as { estado: number; datos?: string; descripcion?: string };
  if (meta.estado !== 200 || !meta.datos) {
    throw new Error(`AEMET sin datos para ${path}: ${meta.descripcion ?? meta.estado}`);
  }
  const dataRes = await fetch(meta.datos);
  if (!dataRes.ok) {
    throw new Error(`AEMET: no se pudo descargar datos de ${path}: HTTP ${dataRes.status}`);
  }
  const contentType = dataRes.headers.get("content-type") ?? "";
  const raw = Buffer.from(await dataRes.arrayBuffer());
  return { raw, contentType };
}

// --- Estaciones meteorológicas (lluvia + viento) ---------------------------------------

interface AemetObservacion {
  idema: string;
  ubi?: string;
  prov?: string;
  fint: string;
  prec?: number; // precipitación última hora, mm
  vv?: number; // velocidad viento, m/s
  dv?: number; // dirección viento, grados
  vmax?: number; // racha máxima, m/s
  ta?: number; // temperatura, C
  lat?: number;
  lon?: number;
}

const msToKmh = (v: number | undefined) => (v === undefined ? null : Math.round(v * 3.6 * 10) / 10);

// Máximo de estaciones a las que se les pide histórico por petición, para no agotar
// el límite de peticiones/minuto de la API gratuita de AEMET (solo interesa el
// detalle donde ya está lloviendo fuerte, no en las ~800 estaciones sin lluvia).
const MAX_HISTORY_LOOKUPS = 40;
const HISTORY_CANDIDATE_MM = 2;

interface StationRainDetail {
  sum3h: number;
  tendencia: import("./rain.js").RainTrend | null;
}

async function fetchStationRainDetail(idema: string): Promise<StationRainDetail | null> {
  try {
    const { raw } = await fetchAemet(`/observacion/convencional/datos/estacion/${idema}`);
    const historial = JSON.parse(raw.toString("utf-8")) as AemetObservacion[];
    const ordenado = historial
      .filter((h) => h.fint)
      .sort((a, b) => new Date(a.fint).getTime() - new Date(b.fint).getTime());
    if (ordenado.length === 0) return null;

    const ultimoInstante = new Date(ordenado[ordenado.length - 1].fint).getTime();
    const enUltimas3h = ordenado.filter((h) => ultimoInstante - new Date(h.fint).getTime() <= 3 * 60 * 60 * 1000);
    const sum3h = Math.round(enUltimas3h.reduce((acc, h) => acc + (h.prec ?? 0), 0) * 10) / 10;

    let tendencia: import("./rain.js").RainTrend | null = null;
    if (ordenado.length >= 2) {
      const ultima = ordenado[ordenado.length - 1].prec ?? 0;
      const anterior = ordenado[ordenado.length - 2].prec ?? 0;
      tendencia = classifyTrend(ultima, anterior);
    }
    return { sum3h, tendencia };
  } catch {
    return null; // una estación sin histórico disponible no debe tumbar el resto
  }
}

export async function getWeatherStations(): Promise<GeoFeatureCollection<WeatherStationProperties>> {
  const { raw } = await fetchAemet("/observacion/convencional/todas");
  const observaciones = JSON.parse(raw.toString("utf-8")) as AemetObservacion[];

  const candidatas = observaciones
    .filter((o) => (o.prec ?? 0) >= HISTORY_CANDIDATE_MM)
    .sort((a, b) => (b.prec ?? 0) - (a.prec ?? 0))
    .slice(0, MAX_HISTORY_LOOKUPS)
    .map((o) => o.idema);

  const detalles = new Map<string, StationRainDetail>();
  if (candidatas.length > 0) {
    const resultados = await Promise.allSettled(candidatas.map((idema) => fetchStationRainDetail(idema)));
    candidatas.forEach((idema, idx) => {
      const r = resultados[idx];
      if (r.status === "fulfilled" && r.value) detalles.set(idema, r.value);
    });
  }

  const features: GeoFeature<WeatherStationProperties>[] = observaciones
    .filter((o) => typeof o.lat === "number" && typeof o.lon === "number")
    .map((o) => {
      const detalle = detalles.get(o.idema);
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [o.lon as number, o.lat as number] },
        properties: {
          id: o.idema,
          nombre: o.ubi ?? o.idema,
          provincia: o.prov ?? null,
          fechaHora: o.fint,
          precipitacion1h_mm: o.prec ?? null,
          precipitacionAcumulada_mm: o.prec ?? null,
          intensidadLluvia: classifyRain(o.prec ?? 0),
          lluvia3h_mm: detalle?.sum3h ?? null,
          tendenciaLluvia: detalle?.tendencia ?? null,
          vientoVelocidad_kmh: msToKmh(o.vv),
          vientoDireccion_grados: o.dv ?? null,
          vientoRacha_kmh: msToKmh(o.vmax),
          temperatura_c: o.ta ?? null,
        },
      };
    });

  return { type: "FeatureCollection", features, actualizado: new Date().toISOString() };
}

// --- Avisos CAP (DANA, lluvia torrencial, viento, tormentas, costero, nieve...) ---------

const SEVERITY_MAP: Record<string, Severity> = {
  Minor: "amarillo",
  Moderate: "naranja",
  Severe: "rojo",
  Extreme: "rojo",
};

// Códigos de fenómeno AEMET-Meteoalerta (parameter valueName="AEMET-Meteoalerta phenomenon").
const PHENOMENON_MAP: Record<string, HazardKind> = {
  "1": "lluvia", // BB - lluvia
  "2": "nieve", // NE - nieve
  "3": "tormenta", // TO - tormentas
  "4": "viento", // VI - viento
  "5": "costero", // CT - costero
  "6": "altas_temperaturas", // AT
  "7": "bajas_temperaturas", // BT
  "8": "avenidas", // AV - avenidas / crecidas (riadas)
  "9": "nieve", // NV - nieve en carreteras / aludes
};

function guessPhenomenon(event: string, code: string | undefined): HazardKind {
  if (code && PHENOMENON_MAP[code]) return PHENOMENON_MAP[code];
  const e = event.toLowerCase();
  if (e.includes("lluvia") || e.includes("dana")) return "lluvia";
  if (e.includes("viento")) return "viento";
  if (e.includes("tormenta")) return "tormenta";
  if (e.includes("nieve") || e.includes("alud")) return "nieve";
  if (e.includes("costero") || e.includes("oleaje")) return "costero";
  if (e.includes("avenida") || e.includes("crecida") || e.includes("riada")) return "avenidas";
  if (e.includes("calor") || e.includes("altas temperaturas")) return "altas_temperaturas";
  if (e.includes("frío") || e.includes("bajas temperaturas")) return "bajas_temperaturas";
  return "otro";
}

function parsePolygon(polygonText: string): [number, number][][] {
  // CAP polygon: "lat,lon lat,lon ..." -> GeoJSON quiere [lon, lat]
  const ring = polygonText
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [lat, lon] = pair.split(",").map(Number);
      return [lon, lat] as [number, number];
    });
  return [ring];
}

function extractCapFiles(tarGz: Buffer): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const files: string[] = [];
    let tarBuffer: Buffer;
    try {
      tarBuffer = gunzipSync(tarGz);
    } catch {
      // A veces AEMET devuelve el XML suelto (sin comprimir) cuando solo hay un aviso.
      resolve([tarGz.toString("utf-8")]);
      return;
    }
    const ex = extract();
    ex.on("entry", (_header, stream, next) => {
      const chunks: Buffer[] = [];
      stream.on("data", (c: unknown) => chunks.push(c as Buffer));
      stream.on("end", () => {
        files.push(Buffer.concat(chunks).toString("utf-8"));
        next();
      });
      stream.resume();
    });
    ex.on("finish", () => resolve(files));
    ex.on("error", reject);
    ex.end(tarBuffer);
  });
}

interface CapArea {
  polygon?: string | string[];
  areaDesc?: string;
}
interface CapInfo {
  event?: string;
  severity?: string;
  effective?: string;
  expires?: string;
  description?: string;
  parameter?: { valueName?: string; value?: string }[] | { valueName?: string; value?: string };
  area?: CapArea | CapArea[];
}
interface CapAlert {
  identifier?: string;
  info?: CapInfo | CapInfo[];
}

const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

export async function getActiveWarnings(): Promise<GeoFeatureCollection<import("./types.js").WarningProperties>> {
  const { raw } = await fetchAemet("/avisos_cap/ultimoelaborado/area/esp");
  const xmlFiles = await extractCapFiles(raw);

  const features: GeoFeature<import("./types.js").WarningProperties>[] = [];

  for (const xml of xmlFiles) {
    let parsed: { alert?: CapAlert };
    try {
      parsed = xmlParser.parse(xml);
    } catch {
      continue;
    }
    const alert = parsed.alert;
    if (!alert) continue;
    const infos = Array.isArray(alert.info) ? alert.info : alert.info ? [alert.info] : [];

    for (const info of infos) {
      const areas = Array.isArray(info.area) ? info.area : info.area ? [info.area] : [];
      const params = Array.isArray(info.parameter) ? info.parameter : info.parameter ? [info.parameter] : [];
      const phenomenonParam = params.find((p) => p?.valueName?.includes("phenomenon"));
      const severidad = SEVERITY_MAP[info.severity ?? ""] ?? "verde";
      if (severidad === "verde") continue; // sin riesgo, no molesta al usuario

      for (const area of areas) {
        const polyRaw = area.polygon;
        const polys = Array.isArray(polyRaw) ? polyRaw : polyRaw ? [polyRaw] : [];
        if (polys.length === 0) continue;

        const rings = polys.flatMap((p) => parsePolygon(p));
        features.push({
          type: "Feature",
          geometry: rings.length > 1 ? { type: "MultiPolygon", coordinates: rings.map((r) => [r]) } : { type: "Polygon", coordinates: rings },
          properties: {
            id: `${alert.identifier ?? "aviso"}-${area.areaDesc ?? features.length}`,
            severidad,
            fenomeno: guessPhenomenon(info.event ?? "", phenomenonParam?.value),
            descripcion: info.description ?? info.event ?? "Aviso meteorológico",
            zona: area.areaDesc ?? "España",
            efectivo: info.effective ?? "",
            expira: info.expires ?? "",
          },
        });
      }
    }
  }

  return { type: "FeatureCollection", features, actualizado: new Date().toISOString() };
}
