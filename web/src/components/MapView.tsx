import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer } from "react-leaflet";
import type { Layer } from "leaflet";
import { HAZARD_LABEL, RAIN_INTENSITY_LABEL, SEVERITY_COLOR, rainIntensityColor } from "../types";
import type { SaihCapa } from "../types";
import type { HazardData } from "../hooks/useHazardData";
import { SaihLayer } from "./SaihLayer";

const SPAIN_CENTER: [number, number] = [40.2, -3.7];

interface Props {
  datos: HazardData;
  showWarnings: boolean;
  showStations: boolean;
  showQuakes: boolean;
  saihLayers: SaihCapa[];
  userPos: { lat: number; lon: number } | null;
}

export function MapView({ datos, showWarnings, showStations, showQuakes, saihLayers, userPos }: Props) {
  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      {datos.error && <div className="load-error-banner">No se pudieron cargar algunas capas ({datos.error}).</div>}

      <MapContainer center={SPAIN_CENTER} zoom={6} minZoom={5} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {saihLayers.map((capa) => (
          <SaihLayer key={capa} capa={capa} />
        ))}

        {showWarnings &&
          datos.avisos?.features.map((f) => (
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
          datos.estaciones?.features.map((f) => {
            const lluvia = f.properties.precipitacion1h_mm ?? 0;
            const geom = f.geometry as GeoJSON.Point;
            return (
              <CircleMarker
                key={f.properties.id}
                center={[geom.coordinates[1], geom.coordinates[0]]}
                radius={lluvia >= 15 ? 7 : lluvia > 0 ? 5 : 4}
                pathOptions={{ color: rainIntensityColor(lluvia), fillOpacity: 0.75 }}
              >
                <Popup>
                  <strong>{f.properties.nombre}</strong>
                  <br />
                  Lluvia (última hora): {f.properties.precipitacion1h_mm ?? "s/d"} mm — {RAIN_INTENSITY_LABEL[f.properties.intensidadLluvia]}
                  <br />
                  {f.properties.lluvia3h_mm !== null && (
                    <>
                      Acumulado 3h: {f.properties.lluvia3h_mm} mm
                      {f.properties.tendenciaLluvia && ` (${f.properties.tendenciaLluvia})`}
                      <br />
                    </>
                  )}
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
          datos.terremotos?.features.map((f) => {
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
          <CircleMarker
            center={[userPos.lat, userPos.lon]}
            radius={8}
            pathOptions={{ color: "#111827", fillColor: "#22c55e", fillOpacity: 0.9, weight: 2 }}
          >
            <Popup>Tu ubicación</Popup>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
}
