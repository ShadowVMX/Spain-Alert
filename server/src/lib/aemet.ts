import { gunzipSync } from "node:zlib";
import { extract } from "tar-stream";
import { XMLParser } from "fast-xml-parser";
import type { GeoFeature, GeoFeatureCollection, HazardKind, Severity, WeatherStationProperties } from "./types.js";
import { classifyRain, classifyTrend } from "./rain.js";

const AEMET_BASE = "https://opendata.aemet.es/opendata/api";

const URL_ALTA = "https://opendata.aemet.es/centrodedescargas/altaUsuario";

/**
 * Error de credenciales, separado del resto a propósito: desde 2026 las claves de
 * AEMET caducan a los 3 meses, así que una clave que funcionaba deja de hacerlo sin
 * previo aviso. Quien llama a esto debe tratarlo como fallo grave y ruidoso, nunca
 * como "hoy no hay datos": en una app de avisos, quedarse en silencio es lo peor
 * que puede pasar.
 */
export class AemetAuthError extends Error {
  readonly esDeAutenticacion = true;
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "AemetAuthError";
  }
}

function apiKey(): string {
  const key = process.env.AEMET_API_KEY;
  if (!key) {
    throw new AemetAuthError(`Falta AEMET_API_KEY. Consigue una gratis en ${URL_ALTA}`);
  }
  return key;
}

/**
 * Las claves de AEMET son JWT y llevan dentro su fecha de caducidad. Leerla nos
 * permite avisar ANTES de que expire, en vez de enterarnos el día que la app se
 * queda muda. Las claves antiguas (indefinidas) no traen "exp": devolvemos null.
 *
 * Solo se lee el payload; no se valida la firma, que no es cosa nuestra.
 */
export function caducidadDeLaClave(): Date | null {
  const key = process.env.AEMET_API_KEY;
  if (!key) return null;
  try {
    const payload = key.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as { exp?: number };
    if (typeof json.exp !== "number") return null;
    return new Date(json.exp * 1000);
  } catch {
    return null; // no es un JWT legible: no pasa nada, seguimos
  }
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
  if (res.status === 401 || res.status === 403) {
    throw new AemetAuthError(
      `AEMET rechazó la clave (HTTP ${res.status}). Las claves caducan a los 3 meses: pide una nueva en ${URL_ALTA} y actualiza el secret AEMET_API_KEY.`
    );
  }
  if (!res.ok) {
    throw new Error(`AEMET rechazó ${path}: HTTP ${res.status}`);
  }
  const meta = (await res.json()) as { estado: number; datos?: string; descripcion?: string };
  if (meta.estado === 401 || meta.estado === 403) {
    throw new AemetAuthError(
      `AEMET rechazó la clave (estado ${meta.estado}: ${meta.descripcion ?? "sin detalle"}). Las claves caducan a los 3 meses: pide una nueva en ${URL_ALTA} y actualiza el secret AEMET_API_KEY.`
    );
  }
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

// AEMET no devuelve "la última lectura de cada estación": devuelve TODAS las
// lecturas de las últimas 24 horas, así que llegan ~10.000 registros de unas 800
// estaciones. Hay que quedarse con la más reciente de cada una.
//
// Esto no es solo cuestión de no repetir puntos en el mapa: mezclar lecturas de
// distintas horas haría que una estación que registró lluvia torrencial esta
// mañana siguiera disparando aviso de riada por la noche. Falsas alarmas
// garantizadas, y con ellas el que la gente deje de hacer caso a los avisos.
const UNA_HORA_MS = 60 * 60 * 1000;
const VENTANA_MAX_H = 24;

// La tendencia solo tiene sentido entre lecturas seguidas. Si una estación estuvo
// caída medio día, comparar su lectura de ahora con la de hace 12 h no dice si la
// lluvia está arreciando: dice que ha pasado el tiempo.
const HUECO_MAX_TENDENCIA_MS = 90 * 60 * 1000;

interface HistorialEstacion {
  actual: AemetObservacion;
  lluvia3h: number | null;
  lluvia6h: number | null;
  lluvia24h: number | null;
  tendencia: import("./rain.js").RainTrend | null;
}

/** Agrupa las observaciones por estación y resume el estado actual de cada una. */
export function resumirPorEstacion(observaciones: AemetObservacion[]): HistorialEstacion[] {
  const porEstacion = new Map<string, AemetObservacion[]>();
  for (const o of observaciones) {
    if (typeof o.lat !== "number" || typeof o.lon !== "number" || !o.fint) continue;
    const lista = porEstacion.get(o.idema);
    if (lista) lista.push(o);
    else porEstacion.set(o.idema, [o]);
  }

  const resumen: HistorialEstacion[] = [];
  for (const lecturas of porEstacion.values()) {
    lecturas.sort((a, b) => new Date(a.fint).getTime() - new Date(b.fint).getTime());
    const actual = lecturas[lecturas.length - 1];
    const instanteActual = new Date(actual.fint).getTime();

    // Los acumulados salen del mismo payload, sin pedir nada más a AEMET, pero hay
    // que sumarlos con cuidado: en cada lectura `prec` son los milímetros de los 60
    // minutos ANTERIORES a esa hora, no los de ese instante.
    //
    // Eso tiene dos trampas, y antes se caía en las dos:
    //
    //  - La ventana incluía la lectura del borde, que cubre la hora anterior a la
    //    ventana. Se sumaban 4 horas y se llamaban 3.
    //
    //  - Se sumaban todas las lecturas. Una estación que reporta cada 20 minutos
    //    manda tres por hora, y las tres cubren los mismos 60 minutos: se solapan.
    //    Sumarlas multiplicaba la lluvia por tres.
    //
    // Se agrupa por hora cubierta y se toma el máximo de cada una: para lecturas
    // horarias es la suma de siempre, y para las que se solapan deja de inventar
    // agua que no ha caído.
    const porHora = new Map<number, number>();
    for (const l of lecturas) {
      const antiguedad = instanteActual - new Date(l.fint).getTime();
      if (antiguedad < 0 || antiguedad >= VENTANA_MAX_H * UNA_HORA_MS) continue;
      const mm = typeof l.prec === "number" && Number.isFinite(l.prec) && l.prec > 0 ? l.prec : 0;
      const hora = Math.floor(antiguedad / UNA_HORA_MS);
      porHora.set(hora, Math.max(porHora.get(hora) ?? 0, mm));
    }

    const acumular = (horas: number): number | null => {
      let total = 0;
      let hayDatos = false;
      for (const [hora, mm] of porHora) {
        if (hora >= horas) continue;
        total += mm;
        hayDatos = true;
      }
      return hayDatos ? Math.round(total * 10) / 10 : null;
    };

    const lluvia3h = acumular(3);
    const lluvia6h = acumular(6);
    const lluvia24h = acumular(24);

    const anterior = lecturas.length >= 2 ? lecturas[lecturas.length - 2] : null;
    const huecoOk = anterior ? instanteActual - new Date(anterior.fint).getTime() <= HUECO_MAX_TENDENCIA_MS : false;
    const tendencia = anterior && huecoOk ? classifyTrend(actual.prec ?? 0, anterior.prec ?? 0) : null;

    resumen.push({ actual, lluvia3h, lluvia6h, lluvia24h, tendencia });
  }
  return resumen;
}

export async function getWeatherStations(): Promise<GeoFeatureCollection<WeatherStationProperties>> {
  const { raw } = await fetchAemet("/observacion/convencional/todas");
  const observaciones = JSON.parse(raw.toString("utf-8")) as AemetObservacion[];
  const estaciones = resumirPorEstacion(observaciones);

  console.log(`   ↳ ${observaciones.length} lecturas de AEMET resumidas en ${estaciones.length} estaciones`);

  const features: GeoFeature<WeatherStationProperties>[] = estaciones.map(({ actual, lluvia3h, lluvia6h, lluvia24h, tendencia }) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [actual.lon as number, actual.lat as number] },
    properties: {
      id: actual.idema,
      nombre: actual.ubi ?? actual.idema,
      provincia: actual.prov ?? null,
      fechaHora: actual.fint,
      precipitacion1h_mm: actual.prec ?? null,
      precipitacionAcumulada_mm: actual.prec ?? null,
      intensidadLluvia: classifyRain(actual.prec ?? 0),
      lluvia3h_mm: lluvia3h,
      lluvia6h_mm: lluvia6h,
      lluvia24h_mm: lluvia24h,
      tendenciaLluvia: tendencia,
      vientoVelocidad_kmh: msToKmh(actual.vv),
      vientoDireccion_grados: actual.dv ?? null,
      vientoRacha_kmh: msToKmh(actual.vmax),
      temperatura_c: actual.ta ?? null,
    },
  }));

  return { type: "FeatureCollection", features, actualizado: new Date().toISOString() };
}

// --- Avisos CAP (DANA, lluvia torrencial, viento, tormentas, costero, nieve...) ---------

/**
 * Traducción de la severidad CAP genérica. Es solo el PLAN B: el nivel oficial
 * viaja aparte, en <parameter valueName="AEMET-Meteoalerta nivel">, y ese es el
 * que manda.
 *
 * Importa acertar la correspondencia porque en el perfil de AEMET un aviso
 * NARANJA se manda como severity=Severe. Traducir Severe a rojo convertía todos
 * los naranjas en rojos: la app se pasaría el día gritando el nivel máximo, y una
 * app que grita siempre deja de mirarse.
 */
const SEVERITY_MAP: Record<string, Severity> = {
  Minor: "verde",
  Moderate: "amarillo",
  Severe: "naranja",
  Extreme: "rojo",
};

/** El nivel tal y como lo publica AEMET, que no hay que interpretar. */
const NIVEL_MAP: Record<string, Severity> = {
  verde: "verde",
  amarillo: "amarillo",
  naranja: "naranja",
  rojo: "rojo",
};

/**
 * Códigos de fenómeno de AEMET-Meteoalerta. Van en <eventCode>, no en
 * <parameter>, y el valor tiene la forma "PR;Lluvia": lo que sirve es la sigla.
 *
 * Antes aquí había un mapa de dígitos ("1", "2"...) que ningún aviso real usa,
 * así que nunca se llegó a leer el código y todo dependía de adivinarlo por el
 * texto del <event>.
 */
const PHENOMENON_MAP: Record<string, HazardKind> = {
  PR: "lluvia", // precipitación
  NE: "nieve",
  NV: "nieve", // nevadas
  TO: "tormenta",
  VI: "viento",
  CT: "costero",
  AT: "altas_temperaturas",
  BT: "bajas_temperaturas",
  AV: "avenidas", // avenidas y crecidas: riadas
  DE: "avenidas", // deshielo
};

function guessPhenomenon(event: string, code: string | undefined): HazardKind {
  // El valor llega como "PR;Lluvia"; nos quedamos con la sigla.
  const sigla = code?.split(";")[0]?.trim().toUpperCase();
  if (sigla && PHENOMENON_MAP[sigla]) return PHENOMENON_MAP[sigla];
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

/** El aviso tiene que caer sobre España o sus islas. */
function puntoPlausible(lon: number, lat: number): boolean {
  return Number.isFinite(lon) && Number.isFinite(lat) && lon > -19 && lon < 5 && lat > 27 && lat < 44;
}

/**
 * CAP da el polígono como "lat,lon lat,lon ..."; GeoJSON lo quiere al revés.
 *
 * Devuelve null si algún punto no se entiende o cae fuera de España. Un aviso
 * medio dibujado es peor que ninguno: pintaría una zona equivocada y alguien
 * podría creerse a salvo estando dentro del área de verdad.
 */
function parsePolygon(polygonText: string): [number, number][] | null {
  const pares = polygonText.trim().split(/\s+/);
  if (pares.length < 4) return null; // un anillo cerrado necesita al menos 4 puntos

  const ring: [number, number][] = [];
  for (const par of pares) {
    const [lat, lon] = par.split(",").map(Number);
    if (!puntoPlausible(lon, lat)) return null;
    ring.push([lon, lat]);
  }
  return ring;
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
  eventCode?: { valueName?: string; value?: string }[] | { valueName?: string; value?: string };
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
  return {
    type: "FeatureCollection",
    features: parsearAvisosCap(xmlFiles),
    actualizado: new Date().toISOString(),
  };
}

/**
 * Convierte los XML del CAP de AEMET en avisos dibujables.
 *
 * Va separado de la descarga a propósito: desde que existe la app no ha habido
 * ningún aviso activo en España, así que este código nunca se había visto
 * funcionar con un aviso de verdad. Separándolo se puede comprobar contra avisos
 * reales guardados, sin esperar a que haya una DANA para descubrir que falla.
 */
export function parsearAvisosCap(xmlFiles: string[]): GeoFeature<import("./types.js").WarningProperties>[] {
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
      const codigos = Array.isArray(info.eventCode) ? info.eventCode : info.eventCode ? [info.eventCode] : [];

      // El fenómeno va en <eventCode>, con valueName "AEMET-Meteoalerta fenomeno".
      // Se acepta también "phenomenon" por si algún día cambian al término inglés.
      const codigoFenomeno = [...codigos, ...params].find((p) => {
        const n = p?.valueName?.toLowerCase() ?? "";
        return n.includes("fenomeno") || n.includes("fenòmen") || n.includes("phenomenon");
      })?.value;

      // El nivel oficial manda; la severidad CAP es el plan B.
      const nivel = params.find((p) => p?.valueName?.toLowerCase().includes("nivel"))?.value?.trim().toLowerCase();
      const severidad: Severity = (nivel ? NIVEL_MAP[nivel] : undefined) ?? SEVERITY_MAP[info.severity ?? ""] ?? "verde";
      if (severidad === "verde") continue; // sin riesgo, no molesta al usuario

      // Un aviso vencido en el mapa es una falsa alarma, y las falsas alarmas son
      // las que consiguen que la gente deje de mirar la app.
      if (info.expires) {
        const caduca = Date.parse(info.expires);
        if (Number.isFinite(caduca) && caduca < Date.now()) continue;
      }

      for (const area of areas) {
        const polyRaw = area.polygon;
        const polys = Array.isArray(polyRaw) ? polyRaw : polyRaw ? [polyRaw] : [];
        if (polys.length === 0) continue;

        const rings = polys.map(parsePolygon).filter((r): r is [number, number][] => r !== null);
        // Si alguno de los polígonos del área no se entiende, no se publica el área:
        // dibujar solo la parte legible daría una zona de aviso más pequeña que la real.
        if (rings.length !== polys.length) continue;
        features.push({
          type: "Feature",
          geometry: rings.length > 1 ? { type: "MultiPolygon", coordinates: rings.map((r) => [r]) } : { type: "Polygon", coordinates: rings },
          properties: {
            id: `${alert.identifier ?? "aviso"}-${area.areaDesc ?? features.length}`,
            severidad,
            fenomeno: guessPhenomenon(info.event ?? "", codigoFenomeno),
            descripcion: info.description ?? info.event ?? "Aviso meteorológico",
            zona: area.areaDesc ?? "España",
            efectivo: info.effective ?? "",
            expira: info.expires ?? "",
          },
        });
      }
    }
  }

  return features;
}
