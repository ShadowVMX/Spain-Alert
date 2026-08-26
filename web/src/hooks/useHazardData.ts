import { useEffect, useState } from "react";
import { fetchEarthquakes, fetchEmbalses, fetchStations, fetchUltimaActualizacion, fetchWarnings } from "../api";
import type { Datos } from "../alertEngine";

export interface HazardData extends Datos {
  cargando: boolean;
  error: string | null;
  actualizado: string | null;
}

const VACIO: HazardData = { avisos: null, estaciones: null, terremotos: null, embalses: null, cargando: true, error: null, actualizado: null };

/**
 * Carga las tres capas de datos. Se hace una sola vez y se comparte entre el mapa
 * y el motor de alertas, para no pedir lo mismo dos veces.
 *
 * Si una fuente falla, las demás siguen mostrándose: es preferible un mapa con los
 * terremotos caídos que ningún mapa.
 */
export function useHazardData(refreshKey: number): HazardData {
  const [data, setData] = useState<HazardData>(VACIO);

  useEffect(() => {
    let cancelled = false;
    setData((d) => ({ ...d, cargando: true }));

    Promise.allSettled([fetchWarnings(), fetchStations(), fetchEarthquakes(), fetchUltimaActualizacion(), fetchEmbalses()]).then(([w, s, q, m, e]) => {
      if (cancelled) return;
      // Los embalses no cuentan como fallo visible: es una capa nueva y todavía
      // incierta, y no debe llenar la pantalla de errores si no está disponible.
      const fallidas = [w, s, q].filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      setData({
        avisos: w.status === "fulfilled" ? w.value : null,
        estaciones: s.status === "fulfilled" ? s.value : null,
        terremotos: q.status === "fulfilled" ? q.value : null,
        embalses: e.status === "fulfilled" ? e.value : null,
        cargando: false,
        error: fallidas.length > 0 ? fallidas.map((f) => String(f.reason?.message ?? f.reason)).join(" · ") : null,
        actualizado: m.status === "fulfilled" ? m.value : null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return data;
}
