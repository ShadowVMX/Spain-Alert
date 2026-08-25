import { useEffect, useState } from "react";

export interface GeoState {
  lat: number | null;
  lon: number | null;
  error: string | null;
  activo: boolean;
}

export function useGeolocation(activo: boolean): GeoState {
  const [state, setState] = useState<GeoState>({ lat: null, lon: null, error: null, activo: false });

  useEffect(() => {
    if (!activo) {
      setState((s) => ({ ...s, activo: false }));
      return;
    }
    if (!("geolocation" in navigator)) {
      setState({ lat: null, lon: null, error: "Este navegador no soporta geolocalización", activo: false });
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setState({ lat: pos.coords.latitude, lon: pos.coords.longitude, error: null, activo: true });
      },
      (err) => {
        setState((s) => ({ ...s, error: err.message, activo: false }));
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [activo]);

  return state;
}
