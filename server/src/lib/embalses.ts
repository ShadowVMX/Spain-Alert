import type { GeoFeature, GeoFeatureCollection } from "./types.js";

/**
 * Embalses: nivel de llenado por embalse, para saber cuánto margen le queda a la
 * cuenca antes de que una crecida vaya directa aguas abajo.
 *
 * Este módulo se ha escrito sin poder probarlo: el entorno de desarrollo bloquea
 * la salida a los servidores de MITECO. Por eso NO da nada por supuesto sobre la
 * forma de los datos: descubre las colecciones disponibles, busca los campos por
 * nombre entre varias variantes, comprueba que lo que encuentra tiene sentido y
 * deja constancia en el log de todo lo que ve. Si no puede determinar con certeza
 * el volumen y la capacidad, no publica nada.
 *
 * Un embalse mal pintado o con un porcentaje inventado sería peor que no tenerlo:
 * daría una sensación de control que no existe.
 */

const OGC_BASE = "https://wmts.mapama.gob.es/sig-api/ogc/features/v1";

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
}

/**
 * Umbrales de llenado. No significan "desbordado": un embalse lleno no es
 * peligroso por sí mismo. Lo que miden es el MARGEN que le queda para absorber
 * una crecida. Al 97% ya casi no hay colchón, así que lo que entra sale.
 */
const UMBRAL_AMARILLO = 85;
const UMBRAL_ROJO = 95;

export function clasificarEmbalse(porcentaje: number | null): EstadoEmbalse {
  if (porcentaje === null || !Number.isFinite(porcentaje)) return "desconocido";
  if (porcentaje >= UMBRAL_ROJO) return "rojo";
  if (porcentaje >= UMBRAL_AMARILLO) return "amarillo";
  return "verde";
}

/** Busca en un objeto la primera clave cuyo nombre contenga alguno de los términos. */
function buscarCampo(props: Record<string, unknown>, terminos: string[]): { clave: string; valor: number } | null {
  for (const [clave, valor] of Object.entries(props)) {
    const normalizada = clave.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (!terminos.some((t) => normalizada.includes(t))) continue;
    const num = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor.replace(",", ".")) : NaN;
    if (Number.isFinite(num)) return { clave, valor: num };
  }
  return null;
}

function buscarTexto(props: Record<string, unknown>, terminos: string[]): string | null {
  for (const [clave, valor] of Object.entries(props)) {
    const normalizada = clave.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (terminos.some((t) => normalizada.includes(t)) && typeof valor === "string" && valor.trim()) {
      return valor.trim();
    }
  }
  return null;
}

interface ColeccionOGC {
  id: string;
  title?: string;
  description?: string;
}

/** Lista las colecciones del servicio y devuelve las que parecen de embalses. */
export async function descubrirColecciones(): Promise<{ todas: ColeccionOGC[]; candidatas: ColeccionOGC[] }> {
  const res = await fetch(`${OGC_BASE}/collections?f=json`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`No se pudo listar colecciones (HTTP ${res.status}) en ${OGC_BASE}/collections`);

  const json = (await res.json()) as { collections?: ColeccionOGC[] };
  const todas = json.collections ?? [];
  const candidatas = todas.filter((c) => {
    const texto = `${c.id} ${c.title ?? ""} ${c.description ?? ""}`.toLowerCase();
    return texto.includes("embalse") || texto.includes("presa");
  });
  return { todas, candidatas };
}

interface FeatureOGC {
  id?: string | number;
  geometry?: { type: string; coordinates: unknown };
  properties?: Record<string, unknown>;
}

/** Extrae el punto de una geometría, aceptando tanto Point como polígonos (centroide burdo). */
function puntoDe(geom: FeatureOGC["geometry"]): [number, number] | null {
  if (!geom) return null;
  if (geom.type === "Point") {
    const c = geom.coordinates as [number, number];
    return Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? [c[0], c[1]] : null;
  }
  // Para superficies nos vale el primer vértice del anillo exterior: a escala de
  // mapa nacional la diferencia con el centroide real es irrelevante.
  const anillos = geom.coordinates as number[][][] | number[][][][];
  const primer = geom.type === "Polygon" ? (anillos as number[][][])[0]?.[0] : (anillos as number[][][][])[0]?.[0]?.[0];
  return Array.isArray(primer) && Number.isFinite(primer[0]) && Number.isFinite(primer[1])
    ? [primer[0], primer[1]]
    : null;
}

/** Comprobación de cordura: el punto tiene que caer sobre España o sus islas. */
function caeEnEspana(lon: number, lat: number): boolean {
  return lon > -19 && lon < 5 && lat > 27 && lat < 44;
}

export interface ResultadoEmbalses {
  coleccion: FeatureCollectionEmbalses;
  diagnostico: string[];
}

export type FeatureCollectionEmbalses = GeoFeatureCollection<EmbalseProperties>;

export async function getEmbalses(): Promise<ResultadoEmbalses> {
  const diagnostico: string[] = [];
  const { todas, candidatas } = await descubrirColecciones();

  diagnostico.push(`${todas.length} colecciones en el servicio; ${candidatas.length} parecen de embalses`);
  for (const c of candidatas.slice(0, 5)) diagnostico.push(`  candidata: ${c.id} — ${c.title ?? "sin título"}`);
  if (candidatas.length === 0) {
    // Sin candidatas, listamos algunas para poder corregir el filtro con datos ciertos.
    for (const c of todas.slice(0, 15)) diagnostico.push(`  disponible: ${c.id} — ${c.title ?? ""}`);
    throw new Error("Ninguna colección parece contener embalses. Revisa los ids listados arriba.");
  }

  const features: GeoFeature<EmbalseProperties>[] = [];
  let camposVistos = "";

  for (const col of candidatas) {
    const url = `${OGC_BASE}/collections/${encodeURIComponent(col.id)}/items?f=json&limit=1000`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { Accept: "application/geo+json, application/json" } });
    } catch (err) {
      const causa = (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).message;
      diagnostico.push(`  ✗ ${col.id}: no se pudo conectar — ${causa}`);
      continue;
    }
    if (!res.ok) {
      diagnostico.push(`  ✗ ${col.id}: HTTP ${res.status}`);
      continue;
    }

    const json = (await res.json()) as { features?: FeatureOGC[] };
    const items = json.features ?? [];
    diagnostico.push(`  ✓ ${col.id}: ${items.length} elementos`);

    if (items.length > 0 && !camposVistos) {
      // Dejamos constancia de los campos reales: es lo que permite ajustar la
      // detección sin tener que adivinar desde fuera.
      camposVistos = Object.keys(items[0].properties ?? {}).join(", ");
      diagnostico.push(`  campos disponibles: ${camposVistos}`);
    }

    for (const item of items) {
      const props = item.properties ?? {};
      const punto = puntoDe(item.geometry);
      if (!punto || !caeEnEspana(punto[0], punto[1])) continue;

      const capacidad = buscarCampo(props, ["capacidad", "cap_total", "volumen_total", "vol_total"]);
      const volumen = buscarCampo(props, ["volumen_actual", "vol_actual", "volumenemb", "agua_embalsada", "embalsada", "volumen"]);
      const porcentajeDirecto = buscarCampo(props, ["porcentaje", "pct", "llenado"]);

      let porcentaje: number | null = null;
      if (porcentajeDirecto && porcentajeDirecto.valor >= 0 && porcentajeDirecto.valor <= 100) {
        porcentaje = porcentajeDirecto.valor;
      } else if (capacidad && volumen && capacidad.valor > 0 && volumen.valor >= 0) {
        // Si el volumen supera claramente la capacidad, es que hemos emparejado mal
        // los campos; preferimos no dar un porcentaje a dar uno falso.
        const pct = (volumen.valor / capacidad.valor) * 100;
        porcentaje = pct <= 130 ? Math.round(pct * 10) / 10 : null;
      }

      const nombre = buscarTexto(props, ["nombre", "denominacion", "embalse", "presa"]) ?? String(item.id ?? "Embalse");

      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: punto },
        properties: {
          id: String(item.id ?? `${col.id}-${features.length}`),
          nombre,
          cuenca: buscarTexto(props, ["cuenca", "demarcacion", "ambito", "confederacion"]),
          volumenActual_hm3: volumen?.valor ?? null,
          capacidadTotal_hm3: capacidad?.valor ?? null,
          porcentaje,
          estado: clasificarEmbalse(porcentaje),
          fecha: buscarTexto(props, ["fecha", "date"]),
        },
      });
    }
  }

  const conPorcentaje = features.filter((f) => f.properties.porcentaje !== null).length;
  diagnostico.push(`Total: ${features.length} embalses, ${conPorcentaje} con nivel de llenado`);

  if (features.length === 0) {
    throw new Error("No se obtuvo ningún embalse válido de las colecciones candidatas.");
  }

  return {
    coleccion: { type: "FeatureCollection", features, actualizado: new Date().toISOString() },
    diagnostico,
  };
}
