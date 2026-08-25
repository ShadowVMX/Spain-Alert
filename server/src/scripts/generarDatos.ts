import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { AemetAuthError, caducidadDeLaClave, getActiveWarnings, getWeatherStations } from "../lib/aemet.js";
import { getRecentEarthquakes } from "../lib/earthquakes.js";
import { getSaihLayerName, SAIH_LAYERS } from "../lib/saih.js";
import type { SaihCapa } from "../lib/saih.js";

/**
 * Genera los datos como archivos estáticos para poder publicar la app en
 * GitHub Pages (que no puede ejecutar un servidor). Lo lanza GitHub Actions
 * cada pocos minutos con la clave de AEMET guardada como secret del repo,
 * de modo que la clave nunca llega al navegador.
 *
 * POLÍTICA DE FALLOS (importante en una app de avisos):
 *
 * - Si falla una fuente secundaria (terremotos, SAIH), se publica igualmente:
 *   más vale un mapa con los avisos de lluvia que ningún mapa.
 * - Si falla TODA la lluvia (avisos + estaciones), se aborta con error. Al no
 *   desplegarse nada, GitHub Pages sigue sirviendo la última versión buena y
 *   GitHub avisa por email del workflow fallido. Publicar un mapa vacío sería
 *   peor: parecería que no hay peligro en ningún sitio.
 * - Si la clave está caducada o es inválida, se aborta siempre y se dice
 *   explícitamente qué hay que hacer (las claves de AEMET caducan a los 3 meses).
 */

const outDir = process.argv[2] ?? path.resolve(process.cwd(), "../web/public/datos");

interface Resultado {
  archivo: string;
  ok: boolean;
  detalle: string;
  authError?: boolean;
}

async function escribir(nombre: string, datos: unknown): Promise<void> {
  await fs.writeFile(path.join(outDir, nombre), JSON.stringify(datos), "utf-8");
}

async function generar<T>(archivo: string, fetcher: () => Promise<T>): Promise<Resultado> {
  try {
    const datos = await fetcher();
    await escribir(archivo, datos);
    const n = (datos as { features?: unknown[] }).features?.length;
    return { archivo, ok: true, detalle: n === undefined ? "ok" : `${n} elementos` };
  } catch (err) {
    // Dejamos una colección vacía para que el frontend no reviente al leerla.
    // Si el fallo es grave, main() aborta antes de que esto llegue a publicarse.
    await escribir(archivo, {
      type: "FeatureCollection",
      features: [],
      actualizado: new Date().toISOString(),
      error: (err as Error).message,
    });
    return { archivo, ok: false, detalle: (err as Error).message, authError: err instanceof AemetAuthError };
  }
}

/**
 * Los nombres de capa del WMS del SAIH se descubren aquí (desde el runner, que sí
 * tiene red) y se guardan, porque el navegador no puede consultarlos por CORS.
 */
async function generarSaih(): Promise<Resultado> {
  const capas = Object.keys(SAIH_LAYERS) as SaihCapa[];
  const resultados = await Promise.allSettled(capas.map((capa) => getSaihLayerName(capa)));

  const salida: Record<string, { wmsUrl: string; layer: string } | null> = {};
  let okCount = 0;
  const fallos: string[] = [];

  capas.forEach((capa, i) => {
    const r = resultados[i];
    if (r.status === "fulfilled") {
      salida[capa] = { wmsUrl: SAIH_LAYERS[capa], layer: r.value };
      okCount++;
    } else {
      salida[capa] = null;
      // El motivo concreto importa: sin él no hay forma de saber si el WMS cambió
      // de URL, si rechaza al runner o si el XML no tiene la forma esperada.
      const motivo = r.reason instanceof Error ? r.reason.message : String(r.reason);
      fallos.push(`${capa}: ${motivo}`);
    }
  });

  await escribir("saih.json", { capas: salida, actualizado: new Date().toISOString() });

  for (const f of fallos) {
    console.log(`   ↳ SAIH ${f}`);
  }

  return { archivo: "saih.json", ok: okCount > 0, detalle: `${okCount}/${capas.length} capas descubiertas` };
}

function abortar(motivo: string, detalle: string): never {
  console.error(`\n❌ ${motivo}`);
  console.error(`   ${detalle}`);
  console.error("\n   No se publica nada: GitHub Pages seguirá sirviendo los últimos datos buenos");
  console.error("   en lugar de un mapa vacío que parecería decir que no hay ningún peligro.");
  process.exit(1);
}

const DIAS_PARA_AVISAR = 14;

/**
 * Avisa con antelación de que hay que renovar la clave. En GitHub Actions el
 * prefijo ::warning:: hace que aparezca destacado en el resumen del workflow.
 */
function comprobarCaducidadClave(): void {
  const caduca = caducidadDeLaClave();
  if (!caduca) return;

  const diasRestantes = Math.floor((caduca.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const fecha = caduca.toISOString().slice(0, 10);

  if (diasRestantes <= DIAS_PARA_AVISAR) {
    console.log(
      `::warning::La clave de AEMET caduca el ${fecha} (quedan ${diasRestantes} días). ` +
        `Pide una nueva en ${"https://opendata.aemet.es/centrodedescargas/altaUsuario"} y actualiza el secret AEMET_API_KEY antes de esa fecha.`
    );
  } else {
    console.log(`🔑 La clave de AEMET caduca el ${fecha} (quedan ${diasRestantes} días).`);
  }
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  console.log(`Generando datos en ${outDir}`);
  comprobarCaducidadClave();

  const [avisos, estaciones, terremotos, saih] = await Promise.all([
    generar("avisos.json", getActiveWarnings),
    generar("estaciones.json", getWeatherStations),
    generar("terremotos.json", getRecentEarthquakes),
    generarSaih(),
  ]);

  await escribir("meta.json", {
    actualizado: new Date().toISOString(),
    fuentes: {
      avisos: avisos.ok,
      estaciones: estaciones.ok,
      terremotos: terremotos.ok,
      saih: saih.ok,
    },
  });

  for (const r of [avisos, estaciones, terremotos, saih]) {
    console.log(`${r.ok ? "✅" : "⚠️ "} ${r.archivo}: ${r.detalle}`);
  }

  if (avisos.authError || estaciones.authError) {
    abortar(
      "La clave de AEMET no es válida o ha caducado.",
      `Pide una nueva en https://opendata.aemet.es/centrodedescargas/altaUsuario y actualízala en Settings → Secrets and variables → Actions → AEMET_API_KEY.`
    );
  }

  if (!avisos.ok && !estaciones.ok) {
    abortar("No se pudo obtener ningún dato de lluvia de AEMET.", `avisos: ${avisos.detalle} | estaciones: ${estaciones.detalle}`);
  }

  console.log("\nDatos listos para publicar.");
}

main().catch((err) => {
  console.error("Fallo generando los datos:", err);
  process.exit(1);
});
