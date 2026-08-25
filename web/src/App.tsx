import { useState } from "react";
import { MapView } from "./components/MapView";
import { Legend } from "./components/Legend";
import { AlertBanner } from "./components/AlertBanner";
import { useGeolocation } from "./hooks/useGeolocation";
import { useNearbyAlerts } from "./hooks/useNearbyAlerts";

export default function App() {
  const [locationOn, setLocationOn] = useState(false);
  const [showWarnings, setShowWarnings] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [showQuakes, setShowQuakes] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const geo = useGeolocation(locationOn);
  const { alerts, error: alertError } = useNearbyAlerts(geo.lat, geo.lon);

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
        <p className="tagline">Mapa nacional de riesgos en tiempo real: lluvia, viento, DANA, riadas y terremotos.</p>
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
          <button className="btn-secondary" onClick={() => setRefreshKey((k) => k + 1)}>
            🔄 Actualizar datos
          </button>
        </div>
        {geo.error && <p className="error-text">No se pudo obtener tu ubicación: {geo.error}</p>}
        {alertError && <p className="error-text">No se pudieron comprobar alertas cercanas: {alertError}</p>}
      </header>

      <main className="map-wrap">
        <MapView
          showWarnings={showWarnings}
          showStations={showStations}
          showQuakes={showQuakes}
          userPos={geo.lat && geo.lon ? { lat: geo.lat, lon: geo.lon } : null}
          refreshKey={refreshKey}
        />
        <Legend
          showWarnings={showWarnings}
          showStations={showStations}
          showQuakes={showQuakes}
          onToggle={(key) => {
            if (key === "showWarnings") setShowWarnings((v) => !v);
            if (key === "showStations") setShowStations((v) => !v);
            if (key === "showQuakes") setShowQuakes((v) => !v);
          }}
        />
      </main>

      <AlertBanner alerts={alerts} />

      <footer className="footer">
        Fuentes: AEMET OpenData (avisos y estaciones), EMSC (terremotos, red incluye datos IGN). No sustituye a los avisos
        oficiales de Protección Civil — actúa siempre siguiendo también sus indicaciones.
      </footer>
    </div>
  );
}
