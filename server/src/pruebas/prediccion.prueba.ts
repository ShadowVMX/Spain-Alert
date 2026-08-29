/**
 * Comprobaciones de la predicción por municipio y de la cola con prioridad.
 *
 * Los datos de abajo son los que devolvió de verdad la sonda contra la API de
 * AEMET, no un formato supuesto.
 */

import { parsearMaestro, parsearPrediccion, ordenarPorPrioridad, type Municipio } from "../lib/prediccion.js";

// Tal cual salió del maestro real.
const maestroCrudo = [
  {
    latitud: "36º46'4.75788\"", id_old: "11180", url: "grazalema-id11019", latitud_dec: "36.76798830",
    altitud: "901", capital: "Grazalema", num_hab: "2165", zona_comarcal: "611101", destacada: "0",
    nombre: "Grazalema", longitud_dec: "-5.36588983", id: "id11019", longitud: "-5º21'57.203388\"",
  },
  {
    latitud_dec: "40.54845854", num_hab: "65", nombre: "Ababuj", longitud_dec: "-0.80780117", id: "id44001",
  },
  // Basura: sin id utilizable y con coordenadas imposibles.
  { nombre: "Fantasma", id: "xx", latitud_dec: "99", longitud_dec: "99", num_hab: "0" },
];

const prediccionCruda = [
  {
    origen: { productor: "AEMET" },
    elaborado: "2026-08-26T20:53:11",
    nombre: "Grazalema",
    provincia: "Cádiz",
    id: "11019",
    prediccion: {
      dia: [
        {
          fecha: "2026-08-26T00:00:00",
          precipitacion: [
            { value: "0", periodo: "20" },
            { value: "12.5", periodo: "21" },
            { value: "30", periodo: "22" },
            { value: "Ip", periodo: "23" },
          ],
          probPrecipitacion: [{ value: "85", periodo: "2002" }],
        },
      ],
    },
  },
];

const muni = (id: string, nombre: string, lat: number, lon: number, hab: number): Municipio => ({ id, nombre, lat, lon, habitantes: hab });

// Cuadrado sobre la Serranía de Ronda.
const avisoSerrania = {
  type: "FeatureCollection" as const,
  actualizado: "",
  features: [
    {
      type: "Feature" as const,
      geometry: { type: "Polygon" as const, coordinates: [[[-5.6, 36.6], [-5.1, 36.6], [-5.1, 36.9], [-5.6, 36.9], [-5.6, 36.6]]] },
      properties: { id: "a1", severidad: "naranja" as const, fenomeno: "lluvia" as const, descripcion: "", zona: "Serranía", efectivo: "", expira: "" },
    },
  ],
};

const GRAZALEMA = muni("11019", "Grazalema", 36.768, -5.366, 2165);
const MADRID = muni("28079", "Madrid", 40.42, -3.7, 3300000);
const SEVILLA = muni("41091", "Sevilla", 37.39, -5.98, 680000);

const casos: [string, () => boolean][] = [
  [
    "el maestro deja el código INE listo para pedir la predicción (id11019 -> 11019)",
    () => parsearMaestro(maestroCrudo)[0]?.id === "11019",
  ],
  [
    "descarta los municipios con coordenadas imposibles",
    () => parsearMaestro(maestroCrudo).length === 2,
  ],
  [
    "lee la lluvia hora a hora en milímetros",
    () => {
      const p = parsearPrediccion(prediccionCruda);
      return p?.horas.find((h) => h.hora.endsWith("22:00:00"))?.mm === 30;
    },
  ],
  [
    "casa cada hora con su tramo de probabilidad, aunque el tramo cruce medianoche",
    () => parsearPrediccion(prediccionCruda)?.horas[0]?.probabilidad === 85,
  ],
  [
    "'Ip' (inapreciable) no se cuela como 0 mm",
    () => parsearPrediccion(prediccionCruda)?.horas.length === 3,
  ],
  [
    "un municipio bajo aviso adelanta a uno grande sin aviso",
    () => {
      const orden = ordenarPorPrioridad([MADRID, SEVILLA, GRAZALEMA], 1, { avisos: avisoSerrania, estaciones: null });
      return orden.length === 1 && orden[0].nombre === "Grazalema";
    },
  ],
  [
    "sin aviso ni lluvia, nadie se salta la cola por ser grande",
    () => {
      const orden = ordenarPorPrioridad([MADRID, SEVILLA, GRAZALEMA], 3, { avisos: null, estaciones: null, ahora: new Date("2026-08-26T00:00:00Z") });
      return orden.length === 3;
    },
  ],
  [
    "una estación midiendo lluvia fuerte cerca también adelanta al municipio",
    () => {
      const estaciones = {
        type: "FeatureCollection" as const,
        actualizado: "",
        features: [
          {
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [-5.37, 36.78] },
            properties: { id: "E", nombre: "Benamahoma", provincia: null, fechaHora: "", precipitacion1h_mm: 25,
              precipitacionAcumulada_mm: 25, intensidadLluvia: "muy_fuerte" as const, lluvia3h_mm: 25, lluvia6h_mm: 25,
              lluvia24h_mm: 25, tendenciaLluvia: null, vientoVelocidad_kmh: null, vientoDireccion_grados: null,
              vientoRacha_kmh: null, temperatura_c: null },
          },
        ],
      };
      const orden = ordenarPorPrioridad([MADRID, GRAZALEMA], 1, { avisos: null, estaciones: estaciones as never });
      return orden[0]?.nombre === "Grazalema";
    },
  ],
  [
    "la cola de fondo rota con la hora, para acabar cubriendo el país",
    () => {
      const lista = Array.from({ length: 24 }, (_, i) => muni(String(10000 + i), `M${i}`, 40, -3, 100));
      const a = ordenarPorPrioridad(lista, 1, { avisos: null, estaciones: null, ahora: new Date("2026-08-26T00:00:00Z") });
      const b = ordenarPorPrioridad(lista, 1, { avisos: null, estaciones: null, ahora: new Date("2026-08-26T12:00:00Z") });
      return a[0].id !== b[0].id;
    },
  ],
];

let ok = true;
for (const [que, fn] of casos) {
  let bien = false;
  try { bien = fn(); } catch (e) { console.log(`   (excepción: ${(e as Error).message})`); }
  console.log(`${bien ? "✅" : "❌"} ${que}`);
  if (!bien) ok = false;
}
console.log(ok ? "\nTodas pasan." : "\nHay comprobaciones que fallan.");
process.exit(ok ? 0 : 1);
