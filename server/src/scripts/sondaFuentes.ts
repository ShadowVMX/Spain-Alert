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

/** Tope de texto a escanear en busca de rutas. Un visor puede pesar megas y no hace
 *  falta leerlo entero: las llamadas a datos aparecen en la cabecera del documento. */
const MAX_TEXTO_ESCANEADO = 300_000;

interface Candidato {
  grupo: string;
  id: string;
  /** Qué esperamos encontrar aquí, para poder juzgar si la respuesta sirve. */
  buscamos: string;
  url: string;
  headers?: Record<string, string>;
  /** Caracteres de respuesta cruda a imprimir. Para cuando el resumen no basta y hay
   *  que leer el HTML a mano para deducir por dónde pide los datos un visor. */
  volcado?: number;
  /** Desde qué carácter volcar. El `<head>` de un visor son kilobytes de CSS; lo que
   *  interesa suele estar más abajo. */
  volcadoDesde?: number;
  /** Patrón cuyas coincidencias se listan. Es la forma de sacar los nombres de los
   *  campos de un formulario, o las rutas de los bundles de JavaScript, sin tener
   *  que volcar el documento entero. */
  extraer?: string;
  /** Método y cuerpo, para los endpoints que solo responden a POST. */
  metodo?: string;
  cuerpo?: Record<string, string>;
}

const CANDIDATOS: Candidato[] = [
  // === RONDA 6 =============================================================
  // Dos cabos sueltos, los dos a un paso de cerrarse.
  //
  // Júcar: confirmado que la raíz declara `let estaciones = [{"idEstacion...`, con
  // toda la red de pluviómetros de la cuenca. Pero la raíz es el mapa de LLUVIA;
  // los embalses y los aforos estarán en otra ruta. El menú lateral no la delató,
  // así que se prueban las evidentes.
  { grupo: "SAIH Júcar", id: "rutaembalses", buscamos: "página de embalses o aforos", url: "https://saih.chj.es/embalses", extraer: "let \\w+ = \\[\\{" },
  { grupo: "SAIH Júcar", id: "rutaaforos", buscamos: "página de embalses o aforos", url: "https://saih.chj.es/aforos", extraer: "let \\w+ = \\[\\{" },
  { grupo: "SAIH Júcar", id: "rutaembalse", buscamos: "página de embalses o aforos", url: "https://saih.chj.es/embalse", extraer: "let \\w+ = \\[\\{" },
  { grupo: "SAIH Júcar", id: "rutaaforo", buscamos: "página de embalses o aforos", url: "https://saih.chj.es/aforo", extraer: "let \\w+ = \\[\\{" },
  { grupo: "SAIH Júcar", id: "rutanivel", buscamos: "página de embalses o aforos", url: "https://saih.chj.es/nivel", extraer: "let \\w+ = \\[\\{" },
  { grupo: "SAIH Júcar", id: "rutacaudal", buscamos: "página de embalses o aforos", url: "https://saih.chj.es/caudal", extraer: "let \\w+ = \\[\\{" },
  { grupo: "SAIH Júcar", id: "rutalluvia", buscamos: "página de embalses o aforos", url: "https://saih.chj.es/lluvia", extraer: "let \\w+ = \\[\\{" },

  // Hidrosur: `datepickerini` y `datepickerfin` SON los nombres buenos — el error
  // cambió de "son requeridos" a "las fechas no son correctas" — así que solo
  // falla el formato. Se prueban los tres habituales.
  {
    grupo: "Hidrosur",
    id: "csv-iso",
    buscamos: "formato de fecha yyyy-mm-dd",
    url: "https://www.redhidrosurmedioambiente.es/saih/datos/a/la/carta/csv?datepickerini=2026-08-25&datepickerfin=2026-08-26&estacion=6&sensor=006P01",
    volcado: 500,
  },
  {
    grupo: "Hidrosur",
    id: "csv-guiones",
    buscamos: "formato de fecha dd-mm-yyyy",
    url: "https://www.redhidrosurmedioambiente.es/saih/datos/a/la/carta/csv?datepickerini=25-08-2026&datepickerfin=26-08-2026&estacion=6&sensor=006P01",
    volcado: 500,
  },
  {
    grupo: "Hidrosur",
    id: "csv-con-hora",
    buscamos: "formato de fecha dd/mm/yyyy hh:mm",
    url: "https://www.redhidrosurmedioambiente.es/saih/datos/a/la/carta/csv?datepickerini=25%2F08%2F2026%2000%3A00&datepickerfin=26%2F08%2F2026%2000%3A00&estacion=6&sensor=006P01",
    volcado: 500,
  },
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

  // El regex solo trocea cadenas entrecomilladas y el filtrado por palabra clave se
  // hace después en JavaScript. La versión anterior metía la alternancia dentro del
  // patrón, entre dos cuantificadores, que es la forma de acabar con backtracking
  // catastrófico ante la entrada equivocada. Aquí no llegó a dispararse, pero un
  // visor puede pesar megas y no compensa dejar la mina puesta.
  const PALABRAS = ["json", "glayer", "ajax", "api", "datos", "rest", "service", "geojson"];
  const rutas = [...texto.slice(0, MAX_TEXTO_ESCANEADO).matchAll(/["'`(]([^"'`()\s]{8,140})["'`)]/g)]
    .map((m) => m[1])
    .filter((u) => PALABRAS.some((pal) => u.toLowerCase().includes(pal)));
  const unicas = [...new Set(rutas)].slice(0, 20);
  if (unicas.length > 0) {
    lineas.push("  rutas internas que huelen a datos:");
    for (const u of unicas) lineas.push(`    · ${u}`);
  } else {
    lineas.push(`  sin rutas de datos evidentes (${texto.length} bytes de HTML)`);
  }

  // Las rutas sueltas no bastan cuando el visor arma la URL por trozos. Lo que
  // hace falta ver es la LLAMADA con lo que tiene alrededor.
  const llamadas = [
    ...texto.slice(0, MAX_TEXTO_ESCANEADO).matchAll(/(fetch\s*\(|\$\.(?:get|post|ajax|getJSON)|axios\.\w+|XMLHttpRequest|\burl\s*:)/g),
  ];
  if (llamadas.length > 0) {
    lineas.push(`  ${llamadas.length} llamadas a datos; contexto de las primeras:`);
    for (const m of llamadas.slice(0, 8)) {
      const desde = Math.max(0, (m.index ?? 0) - 40);
      const trozo = texto.slice(desde, (m.index ?? 0) + 160).replace(/\s+/g, " ");
      lineas.push(`    · …${trozo}…`);
    }
  }
  return lineas;
}

async function sondear(c: Candidato): Promise<string[]> {
  const cabecera = `▸ [${c.grupo}] ${c.id}\n  url: ${c.url}\n  buscamos: ${c.buscamos}`;

  let res: Response;
  const t0 = Date.now();
  try {
    res = await fetch(c.url, {
      method: c.metodo ?? "GET",
      headers: {
        "User-Agent": "Alerta-Espana/sonda (proyecto abierto de avisos de riada)",
        Accept: "*/*",
        ...(c.cuerpo ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...c.headers,
      },
      body: c.cuerpo ? new URLSearchParams(c.cuerpo).toString() : undefined,
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

  if (c.extraer) {
    const encontrados = [...new Set([...texto.matchAll(new RegExp(c.extraer, "g"))].map((m) => m[0]))];
    lineas.push(`  coincidencias de /${c.extraer}/ (${encontrados.length} distintas):`);
    for (const e of encontrados.slice(0, 60)) lineas.push(`    · ${e}`);
  }

  if (c.volcado) {
    const desde = c.volcadoDesde ?? 0;
    lineas.push(`  --- ${c.volcado} caracteres desde el ${desde} ---`);
    for (const l of texto.slice(desde, desde + c.volcado).split("\n")) lineas.push(`  | ${l}`);
    lineas.push("  --- fin del volcado ---");
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
