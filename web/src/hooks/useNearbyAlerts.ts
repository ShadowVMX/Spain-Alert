import { useEffect, useRef, useState } from "react";
import { calcularAlertasCercanas } from "../alertEngine";
import type { Datos } from "../alertEngine";
import { playSiren } from "../siren";
import type { NearbyAlert } from "../types";

/**
 * Recalcula las alertas cada vez que cambia la posición o llegan datos nuevos.
 * El cálculo es local (ver alertEngine.ts): la ubicación no se envía a ningún sitio.
 */
export function useNearbyAlerts(lat: number | null, lon: number | null, datos: Datos) {
  const [alerts, setAlerts] = useState<NearbyAlert[]>([]);
  const vistas = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (lat === null || lon === null) {
      setAlerts([]);
      return;
    }

    const nuevas = calcularAlertasCercanas(lat, lon, datos);
    setAlerts(nuevas);

    for (const a of nuevas) {
      const clave = `${a.tipo}-${a.titulo}`;
      if (vistas.current.has(clave)) continue;
      vistas.current.add(clave);

      playSiren();
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(`⚠️ ${a.titulo}`, {
          body: a.instrucciones[0],
          tag: clave,
          requireInteraction: true,
        });
      }
    }
  }, [lat, lon, datos]);

  return { alerts };
}
