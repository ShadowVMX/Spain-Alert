import { useEffect, useRef, useState } from "react";
import { fetchNearbyAlerts } from "../api";
import { playSiren } from "../siren";
import type { NearbyAlert } from "../types";

const POLL_MS = 60_000;

export function useNearbyAlerts(lat: number | null, lon: number | null) {
  const [alerts, setAlerts] = useState<NearbyAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (lat === null || lon === null) {
      setAlerts([]);
      return;
    }

    let cancelled = false;

    async function check() {
      try {
        const { alerts: nuevas } = await fetchNearbyAlerts(lat as number, lon as number);
        if (cancelled) return;
        setError(null);
        setAlerts(nuevas);

        for (const a of nuevas) {
          const key = `${a.tipo}-${a.titulo}`;
          if (seen.current.has(key)) continue;
          seen.current.add(key);

          playSiren();
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`⚠️ ${a.titulo}`, {
              body: a.instrucciones[0],
              tag: key,
              requireInteraction: true,
            });
          }
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }

    void check();
    const id = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [lat, lon]);

  return { alerts, error };
}
