/**
 * Predicción de lluvia por municipio (AEMET).
 *
 * Hasta aquí la app solo miraba hacia atrás: lo que ya había caído y los avisos
 * oficiales. Esto es lo que le permite decir "en Grazalema se esperan 70 mm esta
 * tarde" antes de que caiga la primera gota.
 *
 * EL PROBLEMA, medido con una sonda contra la API real: AEMET corta a unas 20
 * peticiones por minuto, y no hay endpoint nacional. Son 8.100 municipios, uno por
 * petición: un ciclo completo son ~13 horas. No se puede refrescar España entera.
 *
 * LA SOLUCIÓN no es repartirse el límite a partes iguales, es gastarlo donde está
 * el tiempo. Un martes de julio da igual que Grazalema se refresque cada 12 horas;
 * el día que hay aviso naranja en la Serranía tiene que entrar en la primera tanda.
 * De ahí la cola con prioridad de más abajo.
 *
 * Priorizar por población sería lo cómodo y sería un error: Grazalema tiene 2.165
 * habitantes y es donde más llueve de España. Los pueblos que se inundan no son
 * los grandes.
 */

import type { GeoFeatureCollection, WarningProperties, WeatherStationProperties } from "./types.js";

export interface Municipio {
  /** Código INE de 5 dígitos, que es lo que pide la API de predicción. */
  id: string;
  nombre: string;
  lat: number;
  lon: number;
  habitantes: number;
}

export interface HoraPrevista {
  /** Instante ISO al que se refiere la previsión. */
  hora: string;
  mm: number;
  /** Probabilidad en %, o null si AEMET no la da para ese tramo. */
  probabilidad: number | null;
}

export interface PrediccionMunicipio {
  municipio: string;
  nombre: string;
  elaborado: string;
  horas: HoraPrevista[];
}

// --- Maestro de municipios ------------------------------------------------------

interface MunicipioCrudo {
  id?: string;
  nombre?: string;
  latitud_dec?: string;
  longitud_dec?: string;
  num_hab?: string;
}

/**
 * El campo `id` viene como "id11019"; la API de predicción quiere "11019".
 *
 * Ojo con `id_old`, que para Grazalema vale 11180 y NO sirve para pedir la
 * predicción. Sondeando esto se descubrió que pedir un código a ojo devuelve otro
 * pueblo sin dar ningún error: con 11017 AEMET contesta "Espera", que también es
 * de Cádiz. Un fallo así no se nota hasta que alguien se fía de la previsión
 * equivocada.
 */
export function parsearMaestro(crudo: unknown): Municipio[] {
  if (!Array.isArray(crudo)) return [];
  const municipios: Municipio[] = [];
  for (const m of crudo as MunicipioCrudo[]) {
    const id = (m.id ?? "").replace(/^id/, "").trim();
    const lat = Number(m.latitud_dec);
    const lon = Number(m.longitud_dec);
    if (!/^\d{5}$/.test(id)) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // Fuera de España no hay municipio que valga: si las coordenadas no cuadran,
    // es que el campo no es el que creemos.
    if (lon < -19 || lon > 5 || lat < 27 || lat > 44) continue;
    municipios.push({
      id,
      nombre: m.nombre ?? id,
      lat,
      lon,
      habitantes: Number(m.num_hab) || 0,
    });
  }
  return municipios;
}

// --- Predicción de un municipio -------------------------------------------------

interface DiaCrudo {
  fecha?: string;
  precipitacion?: { value?: string; periodo?: string }[];
  probPrecipitacion?: { value?: string; periodo?: string }[];
}

/**
 * AEMET da la lluvia hora a hora (`periodo` = "20" son las 20:00) y la
 * probabilidad por tramos de seis horas (`periodo` = "2002" es de 20:00 a 02:00).
 * Se casa cada hora con el tramo que la contiene, teniendo en cuenta que el tramo
 * puede cruzar la medianoche.
 */
export function parsearPrediccion(crudo: unknown, horasMax = 48): PrediccionMunicipio | null {
  const raiz = Array.isArray(crudo) ? (crudo[0] as Record<string, unknown>) : (crudo as Record<string, unknown>);
  if (!raiz) return null;
  const id = String(raiz.id ?? "");
  const dias = (raiz.prediccion as { dia?: DiaCrudo[] } | undefined)?.dia;
  if (!/^\d{5}$/.test(id) || !Array.isArray(dias)) return null;

  const horas: HoraPrevista[] = [];
  for (const dia of dias) {
    const base = (dia.fecha ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) continue;

    const probabilidadEn = (h: number): number | null => {
      for (const p of dia.probPrecipitacion ?? []) {
        const tramo = p.periodo ?? "";
        if (tramo.length !== 4) continue;
        const desde = Number(tramo.slice(0, 2));
        const hasta = Number(tramo.slice(2));
        if (!Number.isFinite(desde) || !Number.isFinite(hasta)) continue;
        // Un tramo como 2002 cruza la medianoche.
        const dentro = desde <= hasta ? h >= desde && h < hasta : h >= desde || h < hasta;
        if (dentro) {
          const v = Number(p.value);
          return Number.isFinite(v) ? v : null;
        }
      }
      return null;
    };

    for (const p of dia.precipitacion ?? []) {
      const h = Number(p.periodo);
      const mm = Number(p.value);
      // "Ip" (inapreciable) y demás textos no son cero: son ausencia de dato.
      if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isFinite(mm)) continue;
      horas.push({
        hora: `${base}T${String(h).padStart(2, "0")}:00:00`,
        mm,
        probabilidad: probabilidadEn(h),
      });
    }
  }

  horas.sort((a, b) => a.hora.localeCompare(b.hora));
  return {
    municipio: id,
    nombre: String(raiz.nombre ?? id),
    elaborado: String(raiz.elaborado ?? ""),
    horas: horas.slice(0, horasMax),
  };
}

// --- La cola con prioridad ------------------------------------------------------

/** Un municipio bajo aviso oficial, o con lluvia fuerte medida cerca, va primero. */
const RADIO_LLUVIA_KM = 25;
const LLUVIA_QUE_IMPORTA_MM = 15;

function distanciaKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Punto dentro de un anillo, por el método del rayo. */
function dentroDe(lon: number, lat: number, anillo: number[][]): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

export interface Contexto {
  avisos: GeoFeatureCollection<WarningProperties> | null;
  estaciones: GeoFeatureCollection<WeatherStationProperties> | null;
  /** Para rotar el fondo de la cola sin guardar estado entre ejecuciones. */
  ahora?: Date;
}

/**
 * Ordena los municipios por urgencia y devuelve los `cupo` primeros.
 *
 * Delante van los que están bajo un aviso oficial de lluvia, tormenta o avenidas,
 * o cerca de una estación que ya está midiendo lluvia fuerte. Detrás, todos los
 * demás rotando: la posición de arranque sale de la hora, así que a lo largo del
 * día se acaba pasando por todos sin necesidad de guardar por dónde iba.
 */
export function ordenarPorPrioridad(municipios: Municipio[], cupo: number, ctx: Contexto): Municipio[] {
  const zonasDeAviso = (ctx.avisos?.features ?? []).filter(
    (f) => f.properties.fenomeno === "lluvia" || f.properties.fenomeno === "tormenta" || f.properties.fenomeno === "avenidas"
  );

  const lloviendo = (ctx.estaciones?.features ?? []).filter(
    (f) => (f.properties.precipitacion1h_mm ?? 0) >= LLUVIA_QUE_IMPORTA_MM
  );

  const urgentes: Municipio[] = [];
  const resto: Municipio[] = [];

  for (const m of municipios) {
    const bajoAviso = zonasDeAviso.some((f) => {
      const g = f.geometry as { type: string; coordinates: unknown };
      const anillos: number[][][] =
        g.type === "MultiPolygon" ? (g.coordinates as number[][][][]).map((p) => p[0]) : [(g.coordinates as number[][][])[0]];
      return anillos.some((a) => Array.isArray(a) && dentroDe(m.lon, m.lat, a));
    });

    const conLluviaCerca =
      !bajoAviso &&
      lloviendo.some((f) => {
        const [lon, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
        return distanciaKm(m.lat, m.lon, lat, lon) <= RADIO_LLUVIA_KM;
      });

    if (bajoAviso || conLluviaCerca) urgentes.push(m);
    else resto.push(m);
  }

  // Entre urgentes, primero los más poblados: si hay que cortar por cupo, que el
  // corte deje fuera a los de menos gente, no a los que salgan al azar.
  urgentes.sort((a, b) => b.habitantes - a.habitantes);

  if (urgentes.length >= cupo) return urgentes.slice(0, cupo);

  // El resto rota con la hora del día, para ir cubriendo el país de fondo.
  const hora = (ctx.ahora ?? new Date()).getUTCHours();
  const arranque = resto.length > 0 ? Math.floor((hora / 24) * resto.length) : 0;
  const rotado = [...resto.slice(arranque), ...resto.slice(0, arranque)];

  return [...urgentes, ...rotado].slice(0, cupo);
}
