import { useEffect, useState } from "react";

/**
 * Radar de precipitación de RainViewer: últimas 2 horas + predicción a corto plazo.
 * Es gratuito y sin API key, pero exige atribución visible (la ponemos en el mapa)
 * y su uso libre está pensado para proyectos pequeños; si esto creciera habría que
 * hablar con ellos o cambiar de proveedor.
 */
const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";

export interface RadarFrame {
  time: number; // epoch en segundos
  path: string;
  esPrediccion: boolean;
}

interface RainViewerResponse {
  host: string;
  radar?: {
    past?: { time: number; path: string }[];
    nowcast?: { time: number; path: string }[];
  };
}

export interface RadarData {
  frames: RadarFrame[];
  host: string;
  cargando: boolean;
  error: boolean;
  /** Índice del último frame observado; a partir de ahí es predicción. */
  ultimoObservado: number;
}

const VACIO: RadarData = { frames: [], host: "", cargando: true, error: false, ultimoObservado: -1 };

export function useRadarFrames(refreshKey: number): RadarData {
  const [data, setData] = useState<RadarData>(VACIO);

  useEffect(() => {
    let cancelled = false;

    fetch(RAINVIEWER_API)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<RainViewerResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        const past = (json.radar?.past ?? []).map((f) => ({ ...f, esPrediccion: false }));
        const nowcast = (json.radar?.nowcast ?? []).map((f) => ({ ...f, esPrediccion: true }));
        const frames = [...past, ...nowcast];
        setData({
          frames,
          host: json.host,
          cargando: false,
          error: frames.length === 0,
          ultimoObservado: past.length - 1,
        });
      })
      .catch(() => {
        // Sin radar la app sigue siendo útil: avisos y estaciones no dependen de esto.
        if (!cancelled) setData({ ...VACIO, cargando: false, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return data;
}

/** Construye la URL de teselas de un frame. color 2 = escala azul→verde→amarillo→rojo. */
export function urlDeFrame(host: string, frame: RadarFrame, color = 2): string {
  return `${host}${frame.path}/256/{z}/{x}/{y}/${color}/1_1.png`;
}
