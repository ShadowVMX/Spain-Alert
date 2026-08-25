import { useEffect, useState } from "react";
import { TileLayer } from "react-leaflet";
import { urlDeFrame } from "../hooks/useRadarFrames";
import type { RadarData } from "../hooks/useRadarFrames";

/**
 * Radar animado. En vez de montar de golpe los ~15 frames (cada uno son decenas de
 * teselas, y saturaría la red al abrir la app), se montan solo los que ya se han
 * visitado: el primero al entrar, y el resto según avanza la animación. A partir de
 * la primera vuelta la reproducción es fluida porque ya están en caché.
 *
 * Los frames no visibles se quedan con opacidad 0 en lugar de desmontarse, para que
 * cambiar de frame no provoque un parpadeo.
 */
export function RadarLayer({ radar, indice, opacidad }: { radar: RadarData; indice: number; opacidad: number }) {
  const [montados, setMontados] = useState<Set<number>>(new Set());

  useEffect(() => {
    setMontados((prev) => {
      if (prev.has(indice)) return prev;
      const siguiente = new Set(prev);
      siguiente.add(indice);
      return siguiente;
    });
  }, [indice]);

  if (radar.error || radar.frames.length === 0) return null;

  return (
    <>
      {radar.frames.map((frame, i) =>
        montados.has(i) ? (
          <TileLayer
            key={frame.time}
            url={urlDeFrame(radar.host, frame)}
            opacity={i === indice ? opacidad : 0}
            zIndex={200}
            attribution='Radar: <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a>'
          />
        ) : null
      )}
    </>
  );
}
