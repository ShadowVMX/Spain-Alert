/**
 * Comprobaciones del pivotado de embalses de ACA.
 *
 * ACA publica en formato largo: una fila por estación, variable e instante. Pasar
 * eso a "un embalse, un porcentaje, un color" tiene tres formas de salir mal, y las
 * tres enseñarían al usuario algo falso en un mapa del que se va a fiar:
 *
 *   1. mezclar lecturas de horas distintas dentro del mismo embalse;
 *   2. confundir el porcentaje con el volumen, porque ambos se llaman "volum embassat";
 *   3. colocar un embalse donde no está, o inventarle una posición si no la trae.
 *
 * Las filas de abajo tienen la forma exacta que devolvió el sondeo contra el
 * conjunto real. Se sustituye `fetch` para no depender de la red.
 */

import { getEmbalses } from "../lib/embalses.js";

const filas = [
  // Estación real, con sus UTM reales tal y como los publica ACA.
  { dia: "2026-08-26T00:00:00.000", hora: "04:50", codi_estacio: "E01", estacio: "Embassament de Darnius Boadella (Darnius)",
    conca: "La Muga", utm_x: "486262", utm_y: "4687606", tipus_variable: "Percentatge volum embassat", valor: "64.1", unitat_mesura: "%" },
  { dia: "2026-08-26T00:00:00.000", hora: "04:50", codi_estacio: "E01", estacio: "Embassament de Darnius Boadella (Darnius)",
    conca: "La Muga", utm_x: "486262", utm_y: "4687606", tipus_variable: "Volum embassat", valor: "40.603", unitat_mesura: "hm³" },
  // Lectura anterior de la MISMA estación: no debe ganar a la de las 04:50.
  { dia: "2026-08-25T00:00:00.000", hora: "23:50", codi_estacio: "E01", estacio: "Embassament de Darnius Boadella (Darnius)",
    conca: "La Muga", utm_x: "486262", utm_y: "4687606", tipus_variable: "Percentatge volum embassat", valor: "11.1", unitat_mesura: "%" },
  // Embalse sin margen. Las UTM son inventadas a propósito: aquí lo que se
  // comprueba es la clasificación por color, no la posición.
  { dia: "2026-08-26T00:00:00.000", hora: "04:50", codi_estacio: "E05", estacio: "Embassament de Sau (Vilanova de Sau)",
    conca: "El Ter", utm_x: "451000", utm_y: "4645000", tipus_variable: "Percentatge volum embassat", valor: "97.2", unitat_mesura: "%" },
  // Sin UTM. Tiene que desaparecer del mapa, no aparecer en un sitio a ojo.
  { dia: "2026-08-26T00:00:00.000", hora: "04:50", codi_estacio: "E99", estacio: "Embassament sense posició",
    conca: "?", utm_x: "", utm_y: "", tipus_variable: "Percentatge volum embassat", valor: "50", unitat_mesura: "%" },
];

globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => filas })) as unknown as typeof fetch;

const { coleccion } = await getEmbalses();
const porId = new Map(coleccion.features.map((f) => [f.properties.id, f]));
const e01 = porId.get("aca-E01");
const e05 = porId.get("aca-E05");

const [lon, lat] = (e01?.geometry as GeoJSON.Point | undefined)?.coordinates ?? [NaN, NaN];

const comprobaciones: [string, boolean][] = [
  ["descarta la estación sin coordenadas en vez de inventárselas", coleccion.features.length === 2 && !porId.has("aca-E99")],
  ["usa la lectura más reciente y no la anterior", e01?.properties.porcentaje === 64.1],
  ["distingue porcentaje de volumen por la unidad publicada", e01?.properties.volumenActual_hm3 === 40.603],
  ["quita el prefijo 'Embassament de' del nombre", e01?.properties.nombre === "Darnius Boadella (Darnius)"],
  // La presa de Darnius Boadella está en torno a 42.34 N, 2.82 E. Si la conversión
  // de UTM se rompiera —huso equivocado, ejes cambiados—, el punto se iría de país
  // o de comarca, y esto lo detecta.
  ["convierte las UTM al lugar correcto", Math.abs(lat - 42.34) < 0.05 && Math.abs(lon - 2.82) < 0.05],
  ["marca en rojo un embalse al 97,2%", e05?.properties.estado === "rojo"],
  ["marca en verde un embalse al 64,1%", e01?.properties.estado === "verde"],
];

let ok = true;
for (const [que, bien] of comprobaciones) {
  console.log(`${bien ? "✅" : "❌"} ${que}`);
  if (!bien) ok = false;
}
console.log(ok ? "\nTodas las comprobaciones pasan." : "\nHay comprobaciones que fallan.");
process.exit(ok ? 0 : 1);
