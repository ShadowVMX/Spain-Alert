import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { getActiveWarnings, getWeatherStations } from "../lib/aemet.js";
import { getRecentEarthquakes } from "../lib/earthquakes.js";
import { getSaihLayerName, SAIH_LAYERS } from "../lib/saih.js";
import type { SaihCapa } from "../lib/saih.js";

/**
 * Genera los datos como archivos estáticos para poder publicar la app en
 * GitHub Pages (que no puede ejecutar un servidor). Lo lanza GitHub Actions
 * cada pocos minutos con la clave de AEMET guardada como secret del repo,
 * de modo que la clave nunca llega al navegador.
 *
 * Cada fuente se guarda por separado y un fallo en una NO tumba a las demás:
 * es preferible publicar con los terremotos caídos que quedarse sin avisos de lluvia.
 */

const outDir = process.argv[2] ?? path.resolve(process.cwd(), "../web/public/datos");

interface Resultado {
  archivo: string;
  ok: boolean;
  detalle: string;
}

async function escribir(nombre: string, datos: unknown): Promise<void> {
  await fs.writeFile(path.join(outDir, nombre), JSON.stringify(datos), "utf-8");
}

async function generar<T>(archivo: string, etiqueta: string, fetcher: () => Promise<T>): Promise<Resultado> {
  try {
    const datos = await fetcher();
    await escribir(archivo, datos);
    const n = (datos as { features?: unknown[] }).features?.length;
    return { archivo, ok: true, detalle: n === undefined ? "ok" : `${n} elementos` };
  } catch (err) {
    // Dejamos una colección vacía para que el frontend no reviente al leerla.
    await escribir(archivo, { type: "FeatureCollection", features: [], actualizado: new Date().toISOString(), error: (err as Error).message });
    return { archivo, ok: false, detalle: (err as Error).message };
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
  capas.forEach((capa, i) => {
    const r = resultados[i];
    if (r.status === "fulfilled") {
      salida[capa] = { wmsUrl: SAIH_LAYERS[capa], layer: r.value };
      okCount++;
    } else {
      salida[capa] = null;
    }
  });

  await escribir("saih.json", { capas: salida, actualizado: new Date().toISOString() });
  return { archivo: "saih.json", ok: okCount > 0, detalle: `${okCount}/${capas.length} capas descubiertas` };
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  console.log(`Generando datos en ${outDir}`);

  const resultados = await Promise.all([
    generar("avisos.json", "avisos AEMET", getActiveWarnings),
    generar("estaciones.json", "estaciones AEMET", getWeatherStations),
    generar("terremotos.json", "terremotos EMSC", getRecentEarthquakes),
    generarSaih(),
  ]);

  await escribir("meta.json", { actualizado: new Date().toISOString() });

  for (const r of resultados) {
    console.log(`${r.ok ? "✅" : "⚠️ "} ${r.archivo}: ${r.detalle}`);
  }

  // Si TODO ha fallado no tiene sentido publicar: probablemente falta la clave.
  if (resultados.every((r) => !r.ok)) {
    console.error("Ninguna fuente de datos respondió. ¿Está configurado el secret AEMET_API_KEY?");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fallo generando los datos:", err);
  process.exit(1);
});
