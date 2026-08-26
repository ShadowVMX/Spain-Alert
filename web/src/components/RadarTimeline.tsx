import { useEffect } from "react";
import type { RadarData } from "../hooks/useRadarFrames";

// Ritmo base entre frames. A 400 ms la animación se arrastra; los radares
// meteorológicos suelen ir bastante más rápidos, así que por defecto va a 2x.
const RITMO_BASE_MS = 400;
const PAUSA_FINAL_MS = 900; // respiro al llegar al final, antes de rebobinar

export const VELOCIDADES = [1, 2, 4] as const;
export type Velocidad = (typeof VELOCIDADES)[number];

interface Props {
  radar: RadarData;
  indice: number;
  reproduciendo: boolean;
  velocidad: Velocidad;
  onIndice: (i: number) => void;
  onReproduciendo: (v: boolean) => void;
  onVelocidad: (v: Velocidad) => void;
}

export function RadarTimeline({ radar, indice, reproduciendo, velocidad, onIndice, onReproduciendo, onVelocidad }: Props) {
  const total = radar.frames.length;

  useEffect(() => {
    if (!reproduciendo || total === 0) return;
    const esUltimo = indice >= total - 1;
    const espera = esUltimo ? PAUSA_FINAL_MS : RITMO_BASE_MS / velocidad;
    const id = setTimeout(() => onIndice(esUltimo ? 0 : indice + 1), espera);
    return () => clearTimeout(id);
  }, [reproduciendo, indice, total, velocidad, onIndice]);

  if (radar.cargando) {
    return (
      <div className="radar-bar">
        <span className="radar-estado">Cargando radar…</span>
      </div>
    );
  }

  if (radar.error || total === 0) {
    return (
      <div className="radar-bar">
        <span className="radar-estado radar-estado--error">Radar no disponible ahora mismo</span>
      </div>
    );
  }

  const frame = radar.frames[indice];
  const esPrediccion = frame?.esPrediccion ?? false;
  const hora = frame ? new Date(frame.time * 1000) : null;

  return (
    <div className="radar-bar">
      <button
        className="radar-play"
        onClick={() => onReproduciendo(!reproduciendo)}
        aria-label={reproduciendo ? "Pausar animación" : "Reproducir animación"}
      >
        {reproduciendo ? "❚❚" : "▶"}
      </button>

      <button
        className="radar-velocidad"
        onClick={() => onVelocidad(VELOCIDADES[(VELOCIDADES.indexOf(velocidad) + 1) % VELOCIDADES.length])}
        title="Velocidad de la animación"
        aria-label={`Velocidad ${velocidad}x, pulsa para cambiar`}
      >
        {velocidad}x
      </button>

      <div className="radar-pista">
        <input
          type="range"
          min={0}
          max={total - 1}
          value={indice}
          onChange={(e) => {
            onReproduciendo(false);
            onIndice(Number(e.target.value));
          }}
          aria-label="Momento del radar"
        />
        {/* Marca visual de dónde acaba lo observado y empieza la predicción */}
        {radar.ultimoObservado >= 0 && radar.ultimoObservado < total - 1 && (
          <span className="radar-corte" style={{ left: `${(radar.ultimoObservado / (total - 1)) * 100}%` }} />
        )}
      </div>

      <div className="radar-hora">
        <strong>{hora ? hora.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</strong>
        <span className={esPrediccion ? "radar-etiqueta radar-etiqueta--pred" : "radar-etiqueta"}>
          {esPrediccion ? "predicción" : "observado"}
        </span>
      </div>
    </div>
  );
}
