/**
 * Sonda de la API de predicción de AEMET.
 *
 * La app solo mira hacia atrás: lo que ya ha caído y los avisos oficiales. Para
 * poder decir "en Grazalema se esperan 70 mm esta tarde" hace falta la predicción
 * por municipio, que no estamos usando.
 *
 * Antes de escribir esa integración hay que ver qué devuelve de verdad, y desde el
 * entorno de desarrollo no hay salida a AEMET. Este script presta el runner de
 * Actions como banco de pruebas. No publica nada ni toca los datos de la web.
 *
 * Tres preguntas que decidir el diseño entero:
 *   1. ¿Qué trae el maestro de municipios? (¿coordenadas? ¿cuántos son?)
 *   2. ¿Qué forma tiene la predicción horaria de un municipio?
 *   3. ¿Cuántas peticiones aguanta seguidas? De eso depende a cuántos municipios
 *      podemos llegar en cada pasada del cron.
 */

const CLAVE = process.env.AEMET_API_KEY;
const BASE = "https://opendata.aemet.es/opendata/api";

if (!CLAVE) {
  console.error("Falta AEMET_API_KEY");
  process.exit(1);
}

/** AEMET responde con un JSON que contiene la URL real de los datos. */
async function pedir(ruta: string): Promise<{ ok: boolean; estado: number; datos?: unknown; nota?: string }> {
  const r1 = await fetch(`${BASE}${ruta}`, { headers: { api_key: CLAVE as string } });
  if (!r1.ok) return { ok: false, estado: r1.status, nota: (await r1.text()).slice(0, 200) };
  const meta = (await r1.json()) as { datos?: string; estado?: number; descripcion?: string };
  if (!meta.datos) return { ok: false, estado: meta.estado ?? 0, nota: meta.descripcion ?? "sin campo datos" };
  const r2 = await fetch(meta.datos);
  if (!r2.ok) return { ok: false, estado: r2.status, nota: "falló la descarga de datos" };
  const texto = await r2.text();
  try {
    return { ok: true, estado: 200, datos: JSON.parse(texto) };
  } catch {
    return { ok: true, estado: 200, nota: `no es JSON: ${texto.slice(0, 200)}` };
  }
}

function recortar(v: unknown, prof = 0): string {
  if (prof > 3) return "…";
  if (Array.isArray(v)) return `[${v.length}] ${v.length ? recortar(v[0], prof + 1) : ""}`;
  if (v && typeof v === "object") {
    const e = Object.entries(v as Record<string, unknown>).slice(0, 12);
    return `{ ${e.map(([k, x]) => `${k}: ${recortar(x, prof + 1)}`).join(", ")} }`;
  }
  return JSON.stringify(v)?.slice(0, 60) ?? "null";
}

async function main() {
  console.log("=".repeat(70));
  console.log("1. MAESTRO DE MUNICIPIOS");
  console.log("=".repeat(70));
  const maestro = await pedir("/maestro/municipios");
  if (maestro.ok && Array.isArray(maestro.datos)) {
    const lista = maestro.datos as Record<string, unknown>[];
    console.log(`   municipios: ${lista.length}`);
    console.log(`   campos: ${Object.keys(lista[0] ?? {}).join(", ")}`);
    console.log(`   ejemplo: ${JSON.stringify(lista[0])?.slice(0, 400)}`);
    const graza = lista.find((m) => String(m.nombre ?? "").toLowerCase().includes("grazalema"));
    console.log(`   Grazalema: ${graza ? JSON.stringify(graza).slice(0, 300) : "NO ENCONTRADO"}`);
  } else {
    console.log(`   ❌ estado ${maestro.estado}: ${maestro.nota}`);
  }

  console.log("");
  console.log("=".repeat(70));
  console.log("2. PREDICCIÓN HORARIA DE UN MUNICIPIO (Grazalema = 11017)");
  console.log("=".repeat(70));
  const pred = await pedir("/prediccion/especifica/municipio/horaria/11017");
  if (pred.ok && pred.datos) {
    const d = pred.datos as Record<string, unknown>[];
    console.log(`   estructura: ${recortar(d)}`);
    const dia0 = (d?.[0] as { prediccion?: { dia?: Record<string, unknown>[] } })?.prediccion?.dia;
    console.log(`   días devueltos: ${dia0?.length ?? "?"}`);
    if (dia0?.[0]) {
      console.log(`   campos por día: ${Object.keys(dia0[0]).join(", ")}`);
      console.log(`   precipitacion: ${JSON.stringify(dia0[0].precipitacion)?.slice(0, 500)}`);
      console.log(`   probPrecipitacion: ${JSON.stringify(dia0[0].probPrecipitacion)?.slice(0, 300)}`);
    }
  } else {
    console.log(`   ❌ estado ${pred.estado}: ${pred.nota}`);
  }

  console.log("");
  console.log("=".repeat(70));
  console.log("3. ¿CUÁNTAS PETICIONES SEGUIDAS AGUANTA?");
  console.log("=".repeat(70));
  const muestras = ["28079", "46250", "08019", "41091", "50297", "11017", "33044", "07040", "35016", "30030"];
  const t0 = Date.now();
  let ok = 0;
  let fallos = 0;
  for (const id of muestras) {
    const r = await pedir(`/prediccion/especifica/municipio/horaria/${id}`);
    if (r.ok) ok++;
    else {
      fallos++;
      console.log(`   ${id}: ❌ ${r.estado} ${r.nota?.slice(0, 100)}`);
    }
  }
  const seg = (Date.now() - t0) / 1000;
  console.log(`   ${ok} bien / ${fallos} mal en ${seg.toFixed(1)}s  →  ${(seg / muestras.length).toFixed(2)}s por municipio`);
  console.log(`   a ese ritmo, en 5 minutos daría tiempo a ~${Math.floor(300 / (seg / muestras.length))} municipios`);
}

main().catch((e) => {
  console.error("La sonda falló:", e);
  process.exit(1);
});
