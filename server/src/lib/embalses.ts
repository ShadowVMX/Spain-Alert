import proj4 from "proj4";
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

/**
 * Busca una clave cuyo nombre contenga alguno de los términos y cuyo valor sea
 * numérico.
 *
 * El bucle exterior recorre los TÉRMINOS, no las claves: así manda el orden de
 * prioridad que escribimos nosotros y no el orden en que la fuente serialice su
 * JSON. Sin eso, en ACA el volumen lo resolvía `percentatge_volum_embassat`
 * —que contiene "volum_embassat" y aparece antes— y habríamos enseñado un
 * porcentaje etiquetado como hm³.
 *
 * `excluir` descarta claves que casan por accidente aunque midan otra cosa.
 */
function campoNumerico(props: Record<string, unknown>, terminos: string[], excluir: string[] = []): number | null {
  for (const termino of terminos) {
    for (const [clave, valor] of Object.entries(props)) {
      const n = normalizar(clave);
      if (!n.includes(termino)) continue;
      if (excluir.some((e) => n.includes(e))) continue;
      const num = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor.replace(",", ".")) : NaN;
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
}

/** Igual que `campoNumerico`, con la prioridad en los términos. */
function campoTexto(props: Record<string, unknown>, terminos: string[]): string | null {
  for (const termino of terminos) {
    for (const [clave, valor] of Object.entries(props)) {
      if (normalizar(clave).includes(termino) && typeof valor === "string" && valor.trim()) return valor.trim();
    }
  }
  return null;
}

/** Comprobación de cordura: el punto tiene que caer sobre España o sus islas. */
function caeEnEspana(lon: number, lat: number): boolean {
  return lon > -19 && lon < 5 && lat > 27 && lat < 44;
}

/**
 * ACA publica la posición en UTM, no en latitud y longitud. Catalunya va en el huso
 * 31 Norte sobre ETRS89 (EPSG:25831).
 *
 * Comprobado contra un punto conocido: la presa de Darnius Boadella está en
 * (486262, 4687606), que se convierte en 42.3406 N, 2.8332 E — a unos 900 m del
 * punto que publican IGN y Wikipedia para esa presa, que es la diferencia esperable
 * entre el sensor del SAIH, situado en el muro, y el punto con el que se rotula el
 * embalse en un mapa.
 *
 * Devuelve null si la conversión no cae sobre España: antes que dibujar un embalse
 * en el sitio equivocado, no se dibuja.
 */
const UTM31N_ETRS89 = "+proj=utm +zone=31 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";

function utmCatalunyaAWgs84(x: number, y: number): [number, number] | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const [lon, lat] = proj4(UTM31N_ETRS89, "WGS84", [x, y]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !caeEnEspana(lon, lat)) return null;
  return [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
}

/**
 * Calcula el llenado. Si el porcentaje viene dado se usa tal cual; si no, se deduce
 * de volumen y capacidad. Un volumen absurdamente mayor que la capacidad significa
 * que se han emparejado mal los campos, y entonces es preferible no dar ningún dato.
 */
export function calcularLlenado(props: Record<string, unknown>): { pct: number | null; vol: number | null; cap: number | null } {
  // Un campo de porcentaje nunca es un volumen ni una capacidad, por muy parecido
  // que sea su nombre: mezclarlos daría cifras sin sentido en la ficha del embalse.
  const NO_ES_VOLUMEN = ["percentatge", "porcentaje", "percent", "pct"];
  const cap = campoNumerico(props, ["capacitat", "capacidad", "cap_total", "volum_total", "volumen_total"], NO_ES_VOLUMEN);
  const vol = campoNumerico(
    props,
    ["volum_embassat", "volumen_embalsado", "vol_actual", "volumen_actual", "embalsada", "volum", "volumen"],
    NO_ES_VOLUMEN
  );
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
 * Agència Catalana de l'Aigua, conjunto EN TIEMPO REAL.
 *
 * Antes usábamos el conjunto diario `gn9e-3qhr`, que no traía coordenadas y además
 * era inútil para lo que hace esta app: durante una DANA un embalse cambia en
 * horas, no en días. El sondeo del catálogo destapó este otro, con marca de tiempo
 * propia en cada lectura y con la posición de la estación.
 *
 * Viene en formato largo: una fila por estación, variable e instante.
 *
 *   dia, hora, codi_estacio, estacio, conca, subconca,
 *   utm_x, utm_y, tipus_variable, codi_variable, descripcio_variable,
 *   nivell_qualitat, valor, unitat_mesura
 *
 * Así que hay que pivotarlo: agrupar por estación, quedarse con su lectura más
 * reciente y cruzar las variables de esa lectura.
 */
const ACA: FuenteEmbalses = {
  id: "aca",
  nombre: "Agència Catalana de l'Aigua",
  cobertura: "Cuencas internas de Catalunya",
  frecuencia: "tiempo real",
  async obtener(diagnostico) {
    const url =
      "https://analisi.transparenciacatalunya.cat/resource/vjx7-6kcp.json" +
      "?$limit=5000&$order=" + encodeURIComponent("dia DESC, hora DESC");

    let res: Response;
    try {
      res = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (err) {
      const causa = (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).message;
      throw new Error(`no se pudo conectar — ${causa}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const filas = (await res.json()) as FilaAca[];
    if (!Array.isArray(filas) || filas.length === 0) throw new Error("la consulta no devolvió filas");

    // Agrupamos por estación y nos quedamos solo con su instante más reciente.
    // Mezclar lecturas de horas distintas dentro de un mismo embalse daría un
    // porcentaje y un volumen que no se corresponden entre sí.
    const porEstacion = new Map<string, FilaAca[]>();
    for (const fila of filas) {
      if (!fila.codi_estacio) continue;
      const previas = porEstacion.get(fila.codi_estacio);
      if (previas) previas.push(fila);
      else porEstacion.set(fila.codi_estacio, [fila]);
    }

    const features: GeoFeature<EmbalseProperties>[] = [];
    let sinCoordenadas = 0;
    let sinNivel = 0;
    let masReciente = "";

    for (const [codigo, lecturas] of porEstacion) {
      const instante = (f: FilaAca) => `${(f.dia ?? "").slice(0, 10)} ${f.hora ?? ""}`;
      const ultimo = lecturas.reduce((max, f) => (instante(f) > max ? instante(f) : max), "");
      const actuales = lecturas.filter((f) => instante(f) === ultimo);
      if (ultimo > masReciente) masReciente = ultimo;

      const referencia = actuales[0];
      const lon_lat = utmCatalunyaAWgs84(Number(referencia.utm_x), Number(referencia.utm_y));
      if (!lon_lat) {
        sinCoordenadas++;
        continue;
      }

      // La unidad manda sobre el nombre de la variable: es el dato que la propia
      // fuente da para decir qué está midiendo, y no depende de cómo lo titule.
      const pct = valorConUnidad(actuales, "%");
      const vol = valorConUnidad(actuales, "hm³");
      if (pct === null) sinNivel++;

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: lon_lat },
        properties: {
          id: `aca-${codigo}`,
          // El nombre viene como "Embassament de Darnius Boadella (Darnius)".
          nombre: (referencia.estacio ?? codigo).replace(/^Embassament (de |d')?/i, "").trim(),
          cuenca: referencia.conca ?? "Cuencas internas de Catalunya",
          volumenActual_hm3: vol,
          capacidadTotal_hm3: null, // El conjunto no la trae; el porcentaje ya viene dado.
          porcentaje: pct,
          estado: clasificarEmbalse(pct),
          // Hora local publicada por ACA. No la convertimos a UTC porque no está
          // documentado el huso y una hora inventada es peor que una hora sin husos.
          fecha: ultimo,
          fuente: "ACA (tiempo real)",
        },
      });
    }

    diagnostico.push(`  ${porEstacion.size} estaciones, ${features.length} publicadas`);
    diagnostico.push(`  lectura más reciente: ${masReciente} (hora local de ACA)`);
    if (sinCoordenadas > 0) diagnostico.push(`  ⚠️ ${sinCoordenadas} descartadas por coordenadas no utilizables`);
    if (sinNivel > 0) diagnostico.push(`  ⚠️ ${sinNivel} publicadas sin porcentaje de llenado`);
    return features;
  },
};

interface FilaAca {
  dia?: string;
  hora?: string;
  codi_estacio?: string;
  estacio?: string;
  conca?: string;
  utm_x?: string;
  utm_y?: string;
  valor?: string;
  unitat_mesura?: string;
}

/** Busca entre las lecturas de un instante la que se publica en la unidad pedida. */
function valorConUnidad(lecturas: FilaAca[], unidad: string): number | null {
  for (const l of lecturas) {
    if (l.unitat_mesura !== unidad) continue;
    const n = Number(l.valor);
    if (Number.isFinite(n)) return Math.round(n * 1000) / 1000;
  }
  return null;
}

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
