/**
 * Comprobaciones del resumen de estaciones de AEMET.
 *
 * De aquí salen los números que alimentan todo lo demás: la intensidad que se
 * pinta en el mapa y el acumulado de 3 h que dispara el aviso de terreno
 * saturado. Si estos números están inflados, la app avisa de riadas que no hay.
 *
 * AEMET manda TODAS las lecturas de las últimas 24 h (~10.000 registros), y en
 * cada una `prec` son los milímetros caídos en los 60 minutos ANTERIORES a esa
 * hora. Eso tiene dos trampas: sumar de más al elegir la ventana, y sumar
 * lecturas que se solapan cuando una estación reporta más de una vez por hora.
 */

import { resumirPorEstacion } from "../lib/aemet.js";

const base = Date.UTC(2026, 7, 26, 12, 0, 0);
const hAtras = (h: number) => new Date(base - h * 3600_000).toISOString();

const lectura = (fint: string, prec: number) => ({ idema: "E1", ubi: "Paiporta", fint, prec, lat: 39.42, lon: -0.41 });

const casos: [string, () => boolean][] = [
  [
    "12 h de lluvia mansa se ven en el acumulado de 24 h",
    () => {
      // 15 mm/h durante 12 horas: ninguna hora llama la atención, pero son 180 mm.
      // Es el patrón que satura el terreno y llena las ramblas.
      const r = resumirPorEstacion(Array.from({ length: 12 }, (_, i) => lectura(hAtras(i), 15)));
      return r[0]?.lluvia24h === 180 && r[0]?.lluvia6h === 90 && r[0]?.lluvia3h === 45;
    },
  ],
  [
    "el acumulado de 24 h no se lleva lecturas de hace 30 h",
    () => {
      const r = resumirPorEstacion([lectura(hAtras(30), 100), lectura(hAtras(1), 5), lectura(hAtras(0), 5)]);
      return r[0]?.lluvia24h === 10;
    },
  ],
  [
    "el acumulado de 3 h suma 3 horas, no 4",
    () => {
      // 4 lecturas horarias de 20 mm. Las 3 últimas horas son 60 mm, no 80.
      const r = resumirPorEstacion([lectura(hAtras(3), 20), lectura(hAtras(2), 20), lectura(hAtras(1), 20), lectura(hAtras(0), 20)]);
      return r[0]?.lluvia3h === 60;
    },
  ],
  [
    "lecturas que se solapan no multiplican la lluvia",
    () => {
      // Estación que reporta cada 20 min. Cada `prec` son los 60 min anteriores,
      // así que las tres lecturas de una misma hora se solapan: no se suman.
      const r = resumirPorEstacion([
        lectura(hAtras(1), 30),
        lectura(hAtras(0.66), 30),
        lectura(hAtras(0.33), 30),
        lectura(hAtras(0), 30),
      ]);
      return (r[0]?.lluvia3h ?? 0) <= 60;
    },
  ],
  [
    "la tendencia no se calcula contra una lectura de hace 12 h",
    () => {
      const r = resumirPorEstacion([lectura(hAtras(12), 50), lectura(hAtras(0), 5)]);
      return r[0]?.tendencia === null;
    },
  ],
  [
    "la tendencia sí se calcula entre lecturas consecutivas",
    () => {
      const r = resumirPorEstacion([lectura(hAtras(1), 5), lectura(hAtras(0), 40)]);
      return r[0]?.tendencia === "subiendo";
    },
  ],
  [
    "se queda con la lectura más reciente de cada estación",
    () => {
      const r = resumirPorEstacion([lectura(hAtras(5), 99), lectura(hAtras(0), 3)]);
      return r.length === 1 && r[0].actual.prec === 3;
    },
  ],
  [
    "descarta lecturas sin coordenadas",
    () => resumirPorEstacion([{ idema: "X", fint: hAtras(0), prec: 5 } as never]).length === 0,
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
