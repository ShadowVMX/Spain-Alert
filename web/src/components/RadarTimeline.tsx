import { useEffect } from "react";
import type { RadarData } from "../hooks/useRadarFrames";

const VELOCIDAD_MS = 450; // ritmo de reproducción entre frames
const PAUSA_FINAL_MS = 1200; // pequeña pausa al llegar al final, antes de rebobinar

interface Props {
  radar: RadarData;
  indice: number;
  reproduciendo: boolean;
  onIndice: (i: number) => void;
  onReproduciendo: (v: boolean) => void;
}

export function RadarTimeline({ radar, indice, reproduciendo, onIndice, onReproduciendo }: Props) {
  const total = radar.frames.length;

  useEffect(() => {
    if (!reproduciendo || total === 0) return;
    const esUltimo = indice >= total - 1;
    const id = setTimeout(() => onIndice(esUltimo ? 0 : indice + 1), esUltimo ? PAUSA_FINAL_MS : VELOCIDAD_MS);
    return () => clearTimeout(id);
  }, [reproduciendo, indice, total, onIndice]);

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
