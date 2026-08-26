/**
 * Sonda de fuentes de datos.
 *
 * Este entorno de desarrollo no tiene salida a internet hacia los portales
 * hidrológicos: el proxy responde 403 a cualquier host que no sea GitHub o npm.
 * Así que probar un endpoint a ciegas y esperar al despliegue para ver si va
 * costaba una ejecución entera de producción por intento.
 *
 * Esto le da la vuelta: el runner de GitHub Actions SÍ tiene internet abierto, y
 * este script lo usa como banco de pruebas. Lanza en paralelo una lista de
 * candidatos, resume lo que devuelve cada uno y lo imprime. No escribe nada, no
 * toca la web publicada y no forma parte del despliegue.
 *
 * Para añadir un candidato basta con meterlo en CANDIDATOS. Se ejecuta desde la
 * pestaña Actions → "Sondear fuentes de datos" → Run workflow.
 */

const TIMEOUT_MS = 25_000;

interface Candidato {
  grupo: string;
  id: string;
  /** Qué esperamos encontrar aquí, para poder juzgar si la respuesta sirve. */
  buscamos: string;
  url: string;
  headers?: Record<string, string>;
}

const CANDIDATOS: Candidato[] = [
  // === RONDA 2 =============================================================
  // La ronda 1 descartó lo que no existe y dejó tres pistas buenas. Esto va a por
  // ellas.

  // --- ACA: hay un conjunto EN TIEMPO REAL ---------------------------------
  // El catálogo lo destapó: junto al conjunto diario que ya usamos hay otro
  // titulado "(dades en temps real)". Es justo lo que falta, porque un dato
  // diario no sirve durante una DANA: el embalse cambia en horas.
  {
    grupo: "ACA tiempo real",
    id: "vjx7-datos",
    buscamos: "campos y coordenadas del conjunto en tiempo real",
    url: "https://analisi.transparenciacatalunya.cat/resource/vjx7-6kcp.json?$limit=3",
  },
  {
    grupo: "ACA tiempo real",
    id: "vjx7-metadatos",
    buscamos: "cada cuánto se actualiza de verdad y cómo se llaman sus columnas",
    url: "https://analisi.transparenciacatalunya.cat/api/views/vjx7-6kcp.json",
  },
  {
    grupo: "ACA tiempo real",
    id: "39c7-volum",
    buscamos: "el otro conjunto de volumen por embalse, por si trae la capacidad",
    url: "https://analisi.transparenciacatalunya.cat/resource/39c7-5ydt.json?$limit=3",
  },

  // --- Hidrosur (Andalucía): el visor sirve sus capas como JSON suelto ------
  // El HTML del visor delataba las rutas. Si estos archivos son GeoJSON, ahí
  // están las coordenadas de embalses y aforos de toda la cuenca mediterránea
  // andaluza, sin clave y sin scraping.
  {
    grupo: "Hidrosur",
    id: "capa-embalses-punto",
    buscamos: "embalses como puntos: nombre + coordenadas",
    url: "https://www.redhidrosurmedioambiente.es/saih/assets/visorSAIH/capas/Embalses_pto.json",
  },
  {
    grupo: "Hidrosur",
    id: "capa-aforos",
    buscamos: "aforos: el caudal del río es mejor señal de riada que la lluvia",
    url: "https://www.redhidrosurmedioambiente.es/saih/assets/visorSAIH/capas/Aforos.json",
  },
  {
    grupo: "Hidrosur",
    id: "capa-pluviometricas",
    buscamos: "pluviómetros de la red, más densos que los de AEMET en la zona",
    url: "https://www.redhidrosurmedioambiente.es/saih/assets/visorSAIH/capas/Pluviometricas.json",
  },
  {
    grupo: "Hidrosur",
    id: "datos-a-la-carta",
    buscamos: "el endpoint que sirve las LECTURAS, no solo la geometría",
    url: "https://www.redhidrosurmedioambiente.es/saih/datos/a/la/carta",
  },

  // --- SAIH Júcar: el host vive, las rutas eran mías -----------------------
  // Respondió "Cannot GET /chj/saih/": es un Express, así que el servidor está
  // levantado y sirve otra cosa. Hay que encontrar qué.
  { grupo: "SAIH Júcar", id: "raiz-dominio", buscamos: "el visor de verdad y las rutas que llame por dentro", url: "https://saih.chj.es/" },
  { grupo: "SAIH Júcar", id: "chj", buscamos: "otro punto de entrada", url: "https://saih.chj.es/chj/" },

  // --- MITECO: ver el directorio ArcGIS entero ----------------------------
  // Respondió 200 con {currentVersion, folders, services} en 260 bytes, pero el
  // resumen de la ronda 1 se comió justo los nombres. Ahora se vuelca literal.
  { grupo: "MITECO", id: "arcgis-directorio", buscamos: "los nombres de las carpetas y servicios", url: "https://sig.mapama.gob.es/arcgis/rest/services?f=json" },
];

// --- Resumen de la respuesta ------------------------------------------------

/** Recorre un JSON y devuelve las claves que parecen coordenadas. Es lo que decide
 *  si una fuente sirve: sin coordenadas no se puede dibujar y no se inventan. */
function buscarCoordenadas(valor: unknown, ruta = "", encontradas: string[] = [], profundidad = 0): string[] {
  if (profundidad > 4 || encontradas.length >= 6 || valor === null || typeof valor !== "object") return encontradas;
  if (Array.isArray(valor)) {
    if (valor.length > 0) buscarCoordenadas(valor[0], `${ruta}[0]`, encontradas, profundidad + 1);
    return encontradas;
  }
  for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
    const n = clave.toLowerCase();
    if (/^(lat|lon|lng|latitud|longitud|latitude|longitude|x|y|utm|coord|geometry|the_geom|location)/.test(n)) {
      encontradas.push(`${ruta}.${clave} = ${JSON.stringify(v)?.slice(0, 80)}`);
    }
    buscarCoordenadas(v, `${ruta}.${clave}`, encontradas, profundidad + 1);
  }
  return encontradas;
}

/** Por debajo de esto el JSON entero cabe en el log y se lee mejor que cualquier resumen. */
const VOLCADO_LITERAL_BYTES = 1500;

function resumirJson(texto: string): string[] {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return [`  no era JSON válido pese al content-type; empieza por: ${texto.slice(0, 120)}`];
  }

  const lineas: string[] = [];

  // Una respuesta corta se enseña tal cual. En la ronda anterior el directorio
  // ArcGIS cabía en 260 bytes y el resumen tapó los nombres de las carpetas, que
  // era exactamente el dato que se buscaba.
  if (texto.length <= VOLCADO_LITERAL_BYTES) {
    for (const linea of JSON.stringify(datos, null, 2).split("\n")) lineas.push(`  ${linea}`);
    return lineas;
  }

  if (Array.isArray(datos)) {
    lineas.push(`  array de ${datos.length} elementos`);
    if (datos.length > 0 && typeof datos[0] === "object" && datos[0] !== null) {
      lineas.push(`  campos: ${Object.keys(datos[0] as object).join(", ").slice(0, 400)}`);
    }
  } else if (typeof datos === "object" && datos !== null) {
    const obj = datos as Record<string, unknown>;
    lineas.push(`  objeto con claves: ${Object.keys(obj).join(", ").slice(0, 400)}`);
    // El catálogo de Socrata devuelve {results:[{resource:{id,name,...}}]}: sacar
    // el id y el nombre de cada conjunto es justo lo que buscamos aquí.
    const results = obj.results;
    if (Array.isArray(results)) {
      lineas.push(`  ${results.length} conjuntos encontrados:`);
      for (const r of results.slice(0, 25)) {
        const rec = (r as { resource?: Record<string, unknown> }).resource;
        if (rec) lineas.push(`    · ${String(rec.id)}  ${String(rec.name).slice(0, 90)}`);
      }
    }
    // Metadatos de una vista de Socrata: columnas reales y última actualización.
    if (Array.isArray(obj.columns)) {
      const nombres = (obj.columns as { fieldName?: string }[]).map((c) => c.fieldName).join(", ");
      lineas.push(`  columnas: ${nombres.slice(0, 400)}`);
    }
    if (typeof obj.rowsUpdatedAt === "number") {
      lineas.push(`  última actualización de filas: ${new Date(obj.rowsUpdatedAt * 1000).toISOString()}`);
    }
  }

  const coords = buscarCoordenadas(datos);
  lineas.push(coords.length > 0 ? `  ✅ posibles coordenadas: ${coords.join(" | ").slice(0, 400)}` : "  ❌ no se ve ningún campo de coordenadas");
  return lineas;
}

function resumirTexto(texto: string, tipo: string): string[] {
  const lineas: string[] = [];
  // En HTML lo útil es el título y las llamadas a datos que haga la propia página:
  // el visor pinta estaciones en un mapa, así que sus URLs internas son la pista.
  const titulo = texto.match(/<title[^>]*>([\s\S]{0,120}?)<\/title>/i)?.[1]?.trim();
  if (titulo) lineas.push(`  título: ${titulo}`);

  if (tipo.includes("xml")) {
    const capas = [...texto.matchAll(/<Name>([^<]{1,60})<\/Name>/g)].map((m) => m[1]);
    if (capas.length > 0) lineas.push(`  capas WMS: ${[...new Set(capas)].slice(0, 15).join(", ")}`);
    return lineas;
  }

  const rutas = [...texto.matchAll(/["'`(]([\w./?=&:-]*(?:json|glayer|ajax|api|datos|rest|service)[\w./?=&:-]*)["'`)]/gi)]
    .map((m) => m[1])
    .filter((u) => u.length > 8 && u.length < 140);
  const unicas = [...new Set(rutas)].slice(0, 20);
  if (unicas.length > 0) {
    lineas.push("  rutas internas que huelen a datos:");
    for (const u of unicas) lineas.push(`    · ${u}`);
  } else {
    lineas.push(`  sin rutas de datos evidentes (${texto.length} bytes de HTML)`);
  }
  return lineas;
}

async function sondear(c: Candidato): Promise<string[]> {
  const cabecera = `▸ [${c.grupo}] ${c.id}\n  url: ${c.url}\n  buscamos: ${c.buscamos}`;

  let res: Response;
  const t0 = Date.now();
  try {
    res = await fetch(c.url, {
      headers: { "User-Agent": "Alerta-Espana/sonda (proyecto abierto de avisos de riada)", Accept: "*/*", ...c.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // fetch() resume cualquier fallo de red en "fetch failed" y esconde el motivo
    // real en `cause`. Sin sacarlo no se distingue un DNS roto de un certificado.
    const causa = (err as { cause?: { code?: string; message?: string } }).cause;
    const detalle = causa?.code ?? causa?.message ?? (err as Error).message;
    return [cabecera, `  ✗ no conecta — ${detalle}`, ""];
  }

  const tipo = res.headers.get("content-type") ?? "(sin content-type)";
  const texto = await res.text();
  const lineas = [cabecera, `  HTTP ${res.status} · ${tipo} · ${texto.length} bytes · ${Date.now() - t0} ms`];

  if (!res.ok) {
    lineas.push(`  ✗ respuesta de error; empieza por: ${texto.slice(0, 200).replace(/\s+/g, " ")}`);
  } else if (tipo.includes("json") || texto.trimStart().startsWith("{") || texto.trimStart().startsWith("[")) {
    lineas.push(...resumirJson(texto));
  } else {
    lineas.push(...resumirTexto(texto, tipo));
  }

  lineas.push("");
  return lineas;
}

async function main() {
  const salida: string[] = [
    "# Sondeo de fuentes de datos",
    "",
    `Fecha: ${new Date().toISOString()}`,
    `Candidatos: ${CANDIDATOS.length}`,
    "",
    "```",
  ];

  // En paralelo: un candidato lento no debe retrasar al resto, y ninguno depende
  // de otro. Los fallos son resultados válidos aquí, no excepciones.
  const resultados = await Promise.all(CANDIDATOS.map((c) => sondear(c).catch((e) => [`▸ ${c.id}: error inesperado — ${e}`, ""])));
  for (const r of resultados) salida.push(...r);
  salida.push("```");

  const texto = salida.join("\n");
  console.log(texto);

  // El resumen del job es lo que se lee sin excavar en el log.
  const resumen = process.env.GITHUB_STEP_SUMMARY;
  if (resumen) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(resumen, texto + "\n");
  }
}

main();
