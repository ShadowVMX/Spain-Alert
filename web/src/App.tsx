import { useEffect, useState } from "react";
import { MapView } from "./components/MapView";
import { TopBar } from "./components/TopBar";
import { ControlPanel } from "./components/ControlPanel";
import type { CapasVisibles } from "./components/ControlPanel";
import { RadarTimeline } from "./components/RadarTimeline";
import type { Velocidad } from "./components/RadarTimeline";
import { AlertBanner } from "./components/AlertBanner";
import { StaleBanner } from "./components/StaleBanner";
import { useGeolocation } from "./hooks/useGeolocation";
import { useHazardData } from "./hooks/useHazardData";
import { useNearbyAlerts } from "./hooks/useNearbyAlerts";
import { useRadarFrames } from "./hooks/useRadarFrames";
import type { SaihCapa } from "./types";

// Los datos se regeneran cada ~10 min en origen; refrescamos con esa cadencia.
const REFRESCO_MS = 5 * 60 * 1000;

export default function App() {
  const [locationOn, setLocationOn] = useState(false);
  const [capas, setCapas] = useState<CapasVisibles>({ radar: true, avisos: true, estaciones: true, terremotos: false });
  const [saihLayers, setSaihLayers] = useState<SaihCapa[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const [indiceRadar, setIndiceRadar] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(true);
  const [opacidadRadar, setOpacidadRadar] = useState(0.75);
  const [velocidadRadar, setVelocidadRadar] = useState<Velocidad>(2);
  // Por defecto solo se ven las estaciones donde llueve: las ~800 de AEMET a la vez
  // llenan España de puntos grises que no dicen nada.
  const [soloConLluvia, setSoloConLluvia] = useState(true);

  const datos = useHazardData(refreshKey);
  const radar = useRadarFrames(refreshKey);
  const geo = useGeolocation(locationOn);
  const { alerts } = useNearbyAlerts(geo.lat, geo.lon, datos);

  // Al cargar el radar, arrancamos en el último frame observado (el "ahora"),
  // que es lo que la gente espera ver al abrir la app.
  useEffect(() => {
    if (radar.ultimoObservado >= 0) setIndiceRadar(radar.ultimoObservado);
  }, [radar.ultimoObservado]);

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
      <MapView
        datos={datos}
        radar={radar}
        indiceRadar={indiceRadar}
        opacidadRadar={opacidadRadar}
        capas={capas}
        saihLayers={saihLayers}
        soloConLluvia={soloConLluvia}
        userPos={geo.lat && geo.lon ? { lat: geo.lat, lon: geo.lon } : null}
      />

      <div className="capa-ui">
        <TopBar
          vigilando={locationOn && !geo.error}
          posicion={geo.lat && geo.lon ? { lat: geo.lat, lon: geo.lon } : null}
          actualizado={datos.actualizado}
          cargando={datos.cargando}
          nAvisos={datos.avisos?.features.length ?? 0}
          onActivarUbicacion={activarUbicacion}
          onRefrescar={() => setRefreshKey((k) => k + 1)}
        />

        <StaleBanner actualizado={datos.actualizado} />
        {geo.error && <div className="tira-error">No se pudo obtener tu ubicación: {geo.error}</div>}
        {datos.error && <div className="tira-error">Algunas capas no cargaron: {datos.error}</div>}

        <ControlPanel
          capas={capas}
          saihLayers={saihLayers}
          opacidadRadar={opacidadRadar}
          soloConLluvia={soloConLluvia}
          nEstaciones={datos.estaciones?.features.length ?? 0}
          nConLluvia={(datos.estaciones?.features ?? []).filter((f) => (f.properties.precipitacion1h_mm ?? 0) > 0).length}
          onCapa={(clave) => setCapas((c) => ({ ...c, [clave]: !c[clave] }))}
          onSaih={(capa) => setSaihLayers((prev) => (prev.includes(capa) ? prev.filter((c) => c !== capa) : [...prev, capa]))}
          onOpacidadRadar={setOpacidadRadar}
          onSoloConLluvia={setSoloConLluvia}
        />

        {capas.radar && (
          <RadarTimeline
            radar={radar}
            indice={indiceRadar}
            reproduciendo={reproduciendo}
            velocidad={velocidadRadar}
            onIndice={setIndiceRadar}
            onReproduciendo={setReproduciendo}
            onVelocidad={setVelocidadRadar}
          />
        )}

        <footer className="creditos">
          AEMET · SAIH/MITECO · EMSC ·{" "}
          <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">
            RainViewer
          </a>{" "}
          — Tu ubicación se procesa en tu dispositivo. No sustituye a Protección Civil: en emergencia, 112.
        </footer>
      </div>

      <AlertBanner alerts={alerts} />
    </div>
  );
}
