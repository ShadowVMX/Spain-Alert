import { useEffect, useRef, useState } from "react";

/**
 * Medidor de fluidez real, para saber qué hace TU móvil en lugar de suponerlo.
 *
 * Muestra dos cosas distintas que suelen confundirse:
 *  - fps: fotogramas que la app está dibujando ahora mismo.
 *  - Hz: el máximo que permite la pantalla, deducido del intervalo más corto
 *    entre fotogramas que se ha llegado a ver.
 *
 * Si los fps están muy por debajo de los Hz, el cuello de botella es la app.
 * Si coinciden, la app va al máximo que el dispositivo deja: el límite es el
 * móvil (o el modo de ahorro de batería), no el código.
 */
// Frecuencias de pantalla habituales. Se redondea a la más cercana porque el
// intervalo medido nunca sale exacto y "120 Hz" se lee mejor que "118 Hz".
const HZ_HABITUALES = [60, 75, 90, 120, 144, 165, 240];

function estimarHz(deltas: number[]): number {
  if (deltas.length < 20) return 0;
  // Percentil 10 en lugar del mínimo: un único fotograma con jitter no puede
  // inventarse una pantalla de 366 Hz, y sigue reflejando el mejor ritmo real.
  const ordenados = [...deltas].sort((a, b) => a - b);
  const p10 = ordenados[Math.floor(ordenados.length * 0.1)];
  const bruto = 1000 / p10;
  return HZ_HABITUALES.reduce((mejor, cand) => (Math.abs(cand - bruto) < Math.abs(mejor - bruto) ? cand : mejor));
}

const MUESTRAS = 180;

export function FpsMeter() {
  const [fps, setFps] = useState(0);
  const [hz, setHz] = useState(0);
  const deltas = useRef<number[]>([]);

  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let ultimoInstante = performance.now();
    let inicioVentana = ultimoInstante;

    const tick = (ahora: number) => {
      const delta = ahora - ultimoInstante;
      // Descartamos deltas imposibles: pestaña en segundo plano o saltos del reloj.
      if (delta >= 3 && delta < 200) {
        deltas.current.push(delta);
        if (deltas.current.length > MUESTRAS) deltas.current.shift();
      }
      ultimoInstante = ahora;
      frames++;

      if (ahora - inicioVentana >= 500) {
        setFps(Math.round((frames * 1000) / (ahora - inicioVentana)));
        const estimado = estimarHz(deltas.current);
        if (estimado > 0) setHz(estimado);
        frames = 0;
        inicioVentana = ahora;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const alMaximo = hz > 0 && fps >= hz - 8;

  return (
    <div className="fps-meter" role="status" aria-live="off">
      <span className={alMaximo ? "fps-valor fps-valor--ok" : "fps-valor"}>{fps}</span>
      <span className="fps-unidad">fps</span>
      {hz > 0 && <span className="fps-max">pantalla {hz} Hz</span>}
    </div>
  );
}
