import { useEffect, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer } from "react-leaflet";
import type { Layer } from "leaflet";
import { fetchEarthquakes, fetchStations, fetchWarnings } from "../api";
import { HAZARD_LABEL, SEVERITY_COLOR } from "../types";
import type { EarthquakeProperties, GeoFeatureCollection, WarningProperties, WeatherStationProperties } from "../types";

const SPAIN_CENTER: [number, number] = [40.2, -3.7];

interface Props {
  showWarnings: boolean;
  showStations: boolean;
  showQuakes: boolean;
  userPos: { lat: number; lon: number } | null;
  refreshKey: number;
}

export function MapView({ showWarnings, showStations, showQuakes, userPos, refreshKey }: Props) {
  const [warnings, setWarnings] = useState<GeoFeatureCollection<WarningProperties> | null>(null);
  const [stations, setStations] = useState<GeoFeatureCollection<WeatherStationProperties> | null>(null);
  const [quakes, setQuakes] = useState<GeoFeatureCollection<EarthquakeProperties> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchWarnings(), fetchStations(), fetchEarthquakes()]).then(([w, s, q]) => {
      if (cancelled) return;
      if (w.status === "fulfilled") setWarnings(w.value);
      if (s.status === "fulfilled") setStations(s.value);
      if (q.status === "fulfilled") setQuakes(q.value);
      const failed = [w, s, q].filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      setLoadError(failed.length > 0 ? failed.map((f) => String(f.reason?.message ?? f.reason)).join(" · ") : null);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      {loadError && (
        <div className="load-error-banner">
          No se pudieron cargar algunas capas ({loadError}). Comprueba la clave de AEMET en el servidor.
        </div>
      )}
      <MapContainer center={SPAIN_CENTER} zoom={6} minZoom={5} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {showWarnings &&
          warnings?.features.map((f) => (
            <GeoJSON
              key={f.properties.id}
              data={f as GeoJSON.Feature}
              style={{ color: SEVERITY_COLOR[f.properties.severidad], weight: 2, fillOpacity: 0.25 }}
              onEachFeature={(_feat, layer: Layer) =>
                layer.bindPopup(
                  `<strong>${HAZARD_LABEL[f.properties.fenomeno]} · ${f.properties.severidad.toUpperCase()}</strong><br/>${f.properties.zona}<br/>${f.properties.descripcion}`
                )
              }
            />
          ))}

        {showStations &&
          stations?.features.map((f) => {
            const rain = f.properties.precipitacion1h_mm ?? 0;
            const wind = f.properties.vientoRacha_kmh ?? 0;
            const intense = rain >= 15 || wind >= 70;
            const geom = f.geometry as GeoJSON.Point;
            return (
              <CircleMarker
                key={f.properties.id}
                center={[geom.coordinates[1], geom.coordinates[0]]}
                radius={intense ? 7 : 4}
                pathOptions={{ color: intense ? "#dc2626" : "#0284c7", fillOpacity: 0.7 }}
              >
                <Popup>
                  <strong>{f.properties.nombre}</strong>
                  <br />
                  Lluvia (1h): {f.properties.precipitacion1h_mm ?? "s/d"} mm
                  <br />
                  Viento: {f.properties.vientoVelocidad_kmh ?? "s/d"} km/h (racha {f.properties.vientoRacha_kmh ?? "s/d"} km/h)
                  <br />
                  Temperatura: {f.properties.temperatura_c ?? "s/d"} °C
                  <br />
                  <small>{new Date(f.properties.fechaHora).toLocaleString("es-ES")}</small>
                </Popup>
              </CircleMarker>
            );
          })}

        {showQuakes &&
          quakes?.features.map((f) => {
            const geom = f.geometry as GeoJSON.Point;
            const mag = f.properties.magnitud;
            return (
              <CircleMarker
                key={f.properties.id}
                center={[geom.coordinates[1], geom.coordinates[0]]}
                radius={Math.max(4, mag * 2.5)}
                pathOptions={{ color: mag >= 4 ? "#dc2626" : "#7c3aed", fillOpacity: 0.5 }}
              >
                <Popup>
                  <strong>Magnitud {mag}</strong>
                  <br />
                  {f.properties.lugar}
                  <br />
                  Profundidad: {f.properties.profundidad_km} km
                  <br />
                  <small>{new Date(f.properties.fecha).toLocaleString("es-ES")}</small>
                </Popup>
              </CircleMarker>
            );
          })}

        {userPos && (
          <CircleMarker center={[userPos.lat, userPos.lon]} radius={8} pathOptions={{ color: "#111827", fillColor: "#22c55e", fillOpacity: 0.9, weight: 2 }}>
            <Popup>Tu ubicación</Popup>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}
