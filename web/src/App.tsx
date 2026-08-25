import { useEffect, useState } from "react";
import { MapView } from "./components/MapView";
import { Legend } from "./components/Legend";
import { AlertBanner } from "./components/AlertBanner";
import { useGeolocation } from "./hooks/useGeolocation";
import { useHazardData } from "./hooks/useHazardData";
import { useNearbyAlerts } from "./hooks/useNearbyAlerts";
import type { SaihCapa } from "./types";

// Los datos se regeneran cada ~10 min en origen; refrescamos con esa cadencia.
const REFRESCO_MS = 5 * 60 * 1000;

export default function App() {
  const [locationOn, setLocationOn] = useState(false);
  const [showWarnings, setShowWarnings] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [showQuakes, setShowQuakes] = useState(true);
  const [saihLayers, setSaihLayers] = useState<SaihCapa[]>(["rios", "pluviometria"]);
  const [refreshKey, setRefreshKey] = useState(0);

  const datos = useHazardData(refreshKey);
  const geo = useGeolocation(locationOn);
  const { alerts } = useNearbyAlerts(geo.lat, geo.lon, datos);

  useEffect(() => {
    const id = setInterval(() => setRefreshKey((k) => k + 1), REFRESCO_MS);
    return () => clearInterval(id);
  }, []);

  async function activarUbicacion() {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    setLocationOn(true);
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>🚨 Alerta España</h1>
        <p className="tagline">Mapa nacional de riesgos en tiempo real: lluvia, DANA, riadas, viento y terremotos.</p>
        <div className="controls">
          {!locationOn ? (
            <button className="btn-primary" onClick={activarUbicacion}>
              📍 Activar alertas por mi ubicación
            </button>
          ) : (
            <span className="status-ok">
              📍 Vigilando tu zona {geo.lat && geo.lon ? `(${geo.lat.toFixed(3)}, ${geo.lon.toFixed(3)})` : "…"}
            </span>
          )}
          <button className="btn-secondary" onClick={() => setRefreshKey((k) => k + 1)} disabled={datos.cargando}>
            {datos.cargando ? "⏳ Cargando…" : "🔄 Actualizar datos"}
          </button>
          {datos.actualizado && <span className="meta-text">Datos de {new Date(datos.actualizado).toLocaleString("es-ES")}</span>}
        </div>
        {geo.error && <p className="error-text">No se pudo obtener tu ubicación: {geo.error}</p>}
      </header>

      <main className="map-wrap">
        <MapView
          datos={datos}
          showWarnings={showWarnings}
          showStations={showStations}
          showQuakes={showQuakes}
          saihLayers={saihLayers}
          userPos={geo.lat && geo.lon ? { lat: geo.lat, lon: geo.lon } : null}
        />
        <Legend
          showWarnings={showWarnings}
          showStations={showStations}
          showQuakes={showQuakes}
          saihLayers={saihLayers}
          onToggle={(key) => {
            if (key === "showWarnings") setShowWarnings((v) => !v);
            if (key === "showStations") setShowStations((v) => !v);
            if (key === "showQuakes") setShowQuakes((v) => !v);
          }}
          onToggleSaih={(capa) => setSaihLayers((prev) => (prev.includes(capa) ? prev.filter((c) => c !== capa) : [...prev, capa]))}
        />
      </main>

      <AlertBanner alerts={alerts} />

      <footer className="footer">
        Fuentes: AEMET OpenData (avisos y estaciones), SAIH/MITECO (ríos y embalses), EMSC (terremotos). Tu ubicación se
        procesa en tu dispositivo y no se envía a ningún servidor. No sustituye a los avisos oficiales de Protección Civil
        — en una emergencia llama al 112.
      </footer>
    </div>
  );
}
