/**
 * Comprobaciones del motor de alertas.
 *
 * Este es el código que decide si suena la alarma. Hasta ahora no tenía ni una
 * comprobación: se sabía que "funcionaba" porque en pruebas con ubicación
 * simulada salía algo, no porque estuviera verificado que salga lo correcto.
 *
 * Los casos de abajo son situaciones concretas de riada, con coordenadas reales.
 */

import { calcularAlertasCercanas } from "../alertEngine";
import type { Datos } from "../alertEngine";

// El usuario está en Valencia capital.
const YO = { lat: 39.47, lon: -0.38 };

const ahora = () => new Date().toISOString();
const haceHoras = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

function estacion(nombre: string, lat: number, lon: number, mmHora: number, opts: { hace?: number; mm3h?: number; mm6h?: number; mm24h?: number } = {}) {
  return {
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [lon, lat] },
    properties: {
      id: nombre, nombre, provincia: null,
      fechaHora: opts.hace ? haceHoras(opts.hace) : ahora(),
      precipitacion1h_mm: mmHora, precipitacionAcumulada_mm: mmHora,
      intensidadLluvia: mmHora >= 60 ? ("torrencial" as const) : mmHora >= 30 ? ("muy_fuerte" as const) : ("moderada" as const),
      lluvia3h_mm: opts.mm3h ?? mmHora,
      lluvia6h_mm: opts.mm6h ?? opts.mm3h ?? mmHora,
      lluvia24h_mm: opts.mm24h ?? opts.mm6h ?? opts.mm3h ?? mmHora,
      tendenciaLluvia: null,
      vientoVelocidad_kmh: null, vientoDireccion_grados: null, vientoRacha_kmh: null, temperatura_c: null,
    },
  };
}

function embalseLleno(nombre: string, lat: number, lon: number) {
  return {
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [lon, lat] },
    properties: {
      id: nombre, nombre, cuenca: null, volumenActual_hm3: null, capacidadTotal_hm3: null,
      porcentaje: 98, estado: "rojo" as const, fecha: null, fuente: "ACA",
    },
  };
}

function avisoAmarilloLluvia() {
  return {
    type: "Feature" as const,
    // Cuadrado que cubre Valencia.
    geometry: { type: "Polygon" as const, coordinates: [[[-0.6, 39.3], [-0.2, 39.3], [-0.2, 39.6], [-0.6, 39.6], [-0.6, 39.3]]] },
    properties: {
      id: "av1", severidad: "amarillo" as const, fenomeno: "lluvia" as const,
      descripcion: "Lluvia", zona: "València", efectivo: "", expira: "",
    },
  };
}

const vacio: Datos = { avisos: null, estaciones: null, terremotos: null, embalses: null };
const col = <T>(features: T[]) => ({ type: "FeatureCollection" as const, features, actualizado: ahora() });

const casos: [string, () => boolean][] = [
  [
    "12 h de lluvia mansa (180 mm) SÍ avisan, aunque ninguna hora destaque",
    () => {
      // 15 mm/h sostenidos: ni el pico de 1 h ni el de 3 h llegan a umbral, pero el
      // terreno lleva doce horas empapándose. Es el patrón de la DANA de Valencia.
      const a = calcularAlertasCercanas(YO.lat, YO.lon, {
        ...vacio,
        estaciones: col([estacion("Chiva", 39.51, -0.38, 15, { mm3h: 45, mm6h: 90, mm24h: 180 })]) as never,
      });
      return a.some((x) => x.tipo === "avenidas");
    },
  ],
  [
    "un día entero de lluvia floja (24 mm) NO avisa",
    () => {
      const a = calcularAlertasCercanas(YO.lat, YO.lon, {
        ...vacio,
        estaciones: col([estacion("Tranquilo", 39.51, -0.38, 1, { mm3h: 3, mm6h: 6, mm24h: 24 })]) as never,
      });
      return a.length === 0;
    },
  ],
  [
    "lluvia torrencial a 5 km dispara aviso ROJO de riada",
    () => {
      const a = calcularAlertasCercanas(YO.lat, YO.lon, { ...vacio, estaciones: col([estacion("Paiporta", 39.51, -0.38, 90)]) as never });
      return a.some((x) => x.tipo === "avenidas" && x.severidad === "rojo");
    },
  ],
  [
    "una lectura de hace 3 h NO dispara nada, aunque sea torrencial",
    () => {
      const a = calcularAlertasCercanas(YO.lat, YO.lon, { ...vacio, estaciones: col([estacion("Vieja", 39.51, -0.38, 90, { hace: 3 })]) as never });
      return a.length === 0;
    },
  ],
  [
    "lluvia torrencial a 200 km NO dispara nada",
    () => {
      const a = calcularAlertasCercanas(YO.lat, YO.lon, { ...vacio, estaciones: col([estacion("Lejos", 41.3, -0.38, 90)]) as never });
      return a.length === 0;
    },
  ],
  [
    "un aviso oficial AMARILLO no debe tapar una torrencial ROJA detectada por estación",
    () => {
      const a = calcularAlertasCercanas(YO.lat, YO.lon, {
        ...vacio,
        avisos: col([avisoAmarilloLluvia()]) as never,
        estaciones: col([estacion("Paiporta", 39.51, -0.38, 90)]) as never,
      });
      return a.some((x) => x.severidad === "rojo");
    },
  ],
  [
    "embalse lleno cerca + lluvia SOLO en Galicia NO debe alertar",
    () => {
      const a = calcularAlertasCercanas(YO.lat, YO.lon, {
        ...vacio,
        embalses: col([embalseLleno("Forata", 39.65, -0.38)]) as never,
        estaciones: col([estacion("Santiago", 42.88, -8.54, 25)]) as never,
      });
      return !a.some((x) => x.titulo.includes("embalse"));
    },
  ],
  [
    "embalse lleno cerca + lluvia cerca SÍ alerta",
    () => {
      const a = calcularAlertasCercanas(YO.lat, YO.lon, {
        ...vacio,
        embalses: col([embalseLleno("Forata", 39.65, -0.38)]) as never,
        estaciones: col([estacion("Cerca", 39.55, -0.38, 25)]) as never,
      });
      return a.some((x) => x.titulo.includes("embalse"));
    },
  ],
  [
    "la alerta más grave sale la primera",
    () => {
      const a = calcularAlertasCercanas(YO.lat, YO.lon, {
        ...vacio,
        avisos: col([avisoAmarilloLluvia()]) as never,
        estaciones: col([estacion("Paiporta", 39.51, -0.38, 90)]) as never,
      });
      return a.length > 1 && a[0].severidad === "rojo";
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
// Un throw deja el código de salida en 1 y hace fallar el PR, sin necesitar los
// tipos de Node en el proyecto de la web.
if (!ok) throw new Error("El motor de alertas no pasa sus comprobaciones");
