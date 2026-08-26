import type { GeoFeature, GeoFeatureCollection } from "./types.js";

/**
 * Embalses en tiempo real.
 *
 * En España no existe una única fuente nacional con el nivel de los embalses al
 * momento. El Boletín Hidrológico de MITECO es nacional pero SEMANAL, y para una
 * app de riadas eso no sirve: durante una DANA un embalse cambia en horas, no en
 * semanas.
 *
 * El dato al minuto vive en los SAIH de cada confederación, que son trece sistemas
 * distintos. Por eso esto está montado como un registro de fuentes al que se van
 * añadiendo cuencas una a una, y no como una integración única.
 *
 * Ninguna fuente da nada por supuesto: descubre los campos por nombre, comprueba
 * que las coordenadas caen sobre España y que los números tienen sentido, y deja
 * constancia en el log de lo que encuentra. Si no puede determinar el llenado con
 * certeza, no publica ese embalse. Un porcentaje inventado sería peor que no tener
 * la capa: daría una sensación de control que no existe.
 */

export type EstadoEmbalse = "verde" | "amarillo" | "rojo" | "desconocido";

export interface EmbalseProperties {
  id: string;
  nombre: string;
  cuenca: string | null;
  volumenActual_hm3: number | null;
  capacidadTotal_hm3: number | null;
  porcentaje: number | null;
  estado: EstadoEmbalse;
  fecha: string | null;
  fuente: string;
}

/**
 * Umbrales de llenado. No significan "desbordado": un embalse lleno no es
 * peligroso por sí mismo. Lo que miden es el MARGEN que le queda para absorber
 * una crecida. Al 95% ya casi no hay colchón, así que lo que entra sale.
 */
const UMBRAL_AMARILLO = 85;
const UMBRAL_ROJO = 95;

export function clasificarEmbalse(porcentaje: number | null): EstadoEmbalse {
  if (porcentaje === null || !Number.isFinite(porcentaje)) return "desconocido";
  if (porcentaje >= UMBRAL_ROJO) return "rojo";
  if (porcentaje >= UMBRAL_AMARILLO) return "amarillo";
  return "verde";
}

export class EmbalsesError extends Error {
  constructor(mensaje: string, readonly diagnostico: string[]) {
    super(mensaje);
    this.name = "EmbalsesError";
  }
}

// --- Detección de campos ----------------------------------------------------

const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Primera clave cuyo nombre contenga alguno de los términos y cuyo valor sea numérico. */
function campoNumerico(props: Record<string, unknown>, terminos: string[]): number | null {
  for (const [clave, valor] of Object.entries(props)) {
    const n = normalizar(clave);
    if (!terminos.some((t) => n.includes(t))) continue;
    const num = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor.replace(",", ".")) : NaN;
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function campoTexto(props: Record<string, unknown>, terminos: string[]): string | null {
  for (const [clave, valor] of Object.entries(props)) {
    const n = normalizar(clave);
    if (terminos.some((t) => n.includes(t)) && typeof valor === "string" && valor.trim()) return valor.trim();
  }
  return null;
}

/** Comprobación de cordura: el punto tiene que caer sobre España o sus islas. */
function caeEnEspana(lon: number, lat: number): boolean {
  return lon > -19 && lon < 5 && lat > 27 && lat < 44;
}

/**
 * Calcula el llenado. Si el porcentaje viene dado se usa tal cual; si no, se deduce
 * de volumen y capacidad. Un volumen absurdamente mayor que la capacidad significa
 * que se han emparejado mal los campos, y entonces es preferible no dar ningún dato.
 */
function calcularLlenado(props: Record<string, unknown>): { pct: number | null; vol: number | null; cap: number | null } {
  const cap = campoNumerico(props, ["capacitat", "capacidad", "cap_total", "volum_total", "volumen_total"]);
  const vol = campoNumerico(props, ["volum_embassat", "volumen_embalsado", "vol_actual", "volumen_actual", "embalsada", "volum", "volumen"]);
  const directo = campoNumerico(props, ["percentatge", "porcentaje", "percent", "pct", "llenado", "ple"]);

  if (directo !== null && directo >= 0 && directo <= 100) return { pct: Math.round(directo * 10) / 10, vol, cap };
  if (cap !== null && vol !== null && cap > 0 && vol >= 0) {
    const pct = (vol / cap) * 100;
    if (pct <= 130) return { pct: Math.round(pct * 10) / 10, vol, cap };
  }
  return { pct: null, vol, cap };
}

// --- Fuentes ----------------------------------------------------------------

export interface FuenteEmbalses {
  id: string;
  nombre: string;
  cobertura: string;
  /** Cada cuánto publica datos nuevos, para poder decirlo con honestidad en la app. */
  frecuencia: string;
  obtener(diagnostico: string[]): Promise<GeoFeature<EmbalseProperties>[]>;
}

/**
 * Agència Catalana de l'Aigua, vía el portal de datos abiertos de la Generalitat.
 * Es la única fuente encontrada hasta ahora con API pública y documentada: el
 * portal usa Socrata, que expone cada conjunto como JSON y sin clave.
 *
 * Cubre solo las cuencas internas de Catalunya, no el Ebro ni las mediterráneas.
 * Sirve para tener la capa viva y verificar la tubería entera con datos reales
 * mientras se resuelven las cuencas donde caen las DANAs.
 */
const ACA: FuenteEmbalses = {
  id: "aca",
  nombre: "Agència Catalana de l'Aigua",
  cobertura: "Cuencas internas de Catalunya",
  frecuencia: "diaria",
  async obtener(diagnostico) {
    const url = "https://analisi.transparenciacatalunya.cat/resource/gn9e-3qhr.json?$limit=2000&$order=dia%20DESC";
    let res: Response;
    try {
      res = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (err) {
      const causa = (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).message;
      throw new Error(`no se pudo conectar — ${causa}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const filas = (await res.json()) as Record<string, unknown>[];
    if (!Array.isArray(filas) || filas.length === 0) throw new Error("la consulta no devolvió filas");

    // Los nombres de campo reales son lo más valioso para ajustar la detección sin
    // adivinar, así que quedan registrados.
    diagnostico.push(`  campos: ${Object.keys(filas[0]).join(", ")}`);

    // Cada embalse aparece muchas veces, una por fecha. Nos quedamos con la más
    // reciente de cada uno: mezclar fechas daría un mapa incoherente.
    const porEmbalse = new Map<string, Record<string, unknown>>();
    for (const fila of filas) {
      const nombre = campoTexto(fila, ["estaci", "embassament", "embalse", "nom"]);
      if (nombre && !porEmbalse.has(nombre)) porEmbalse.set(nombre, fila);
    }

    const features: GeoFeature<EmbalseProperties>[] = [];
    let sinCoordenadas = 0;

    for (const [nombre, fila] of porEmbalse) {
      const lat = campoNumerico(fila, ["latitud", "lat"]);
      const lon = campoNumerico(fila, ["longitud", "lon", "lng"]);

      // Sin coordenadas no se puede dibujar, y no se inventan.
      if (lat === null || lon === null || !caeEnEspana(lon, lat)) {
        sinCoordenadas++;
        continue;
      }

      const { pct, vol, cap } = calcularLlenado(fila);
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: {
          id: `aca-${normalizar(nombre).replace(/\s+/g, "-")}`,
          nombre,
          cuenca: "Cuencas internas de Catalunya",
          volumenActual_hm3: vol,
          capacidadTotal_hm3: cap,
          porcentaje: pct,
          estado: clasificarEmbalse(pct),
          fecha: campoTexto(fila, ["dia", "data", "fecha"]),
          fuente: "ACA",
        },
      });
    }

    diagnostico.push(`  ${porEmbalse.size} embalses distintos, ${features.length} con coordenadas usables`);
    if (sinCoordenadas > 0) {
      diagnostico.push(`  ⚠️ ${sinCoordenadas} descartados por no traer coordenadas: harán falta de otra fuente`);
    }
    return features;
  },
};

/** Cuencas integradas. Se van añadiendo una a una según se localiza su API. */
const FUENTES: FuenteEmbalses[] = [ACA];

export interface ResultadoEmbalses {
  coleccion: GeoFeatureCollection<EmbalseProperties>;
  diagnostico: string[];
}

export async function getEmbalses(): Promise<ResultadoEmbalses> {
  const diagnostico: string[] = [];
  const features: GeoFeature<EmbalseProperties>[] = [];

  // Las fuentes son independientes: que una cuenca falle no debe dejar sin datos
  // a las demás.
  const resultados = await Promise.allSettled(
    FUENTES.map(async (f) => {
      diagnostico.push(`${f.nombre} (${f.cobertura}, ${f.frecuencia}):`);
      return f.obtener(diagnostico);
    })
  );

  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") {
      features.push(...r.value);
    } else {
      const motivo = r.reason instanceof Error ? r.reason.message : String(r.reason);
      diagnostico.push(`  ✗ ${FUENTES[i].nombre}: ${motivo}`);
    }
  });

  const conNivel = features.filter((f) => f.properties.porcentaje !== null).length;
  diagnostico.push(`Total: ${features.length} embalses, ${conNivel} con nivel de llenado`);

  if (features.length === 0) {
    throw new EmbalsesError("Ninguna fuente devolvió embalses utilizables", diagnostico);
  }

  return {
    coleccion: { type: "FeatureCollection", features, actualizado: new Date().toISOString() },
    diagnostico,
  };
}
