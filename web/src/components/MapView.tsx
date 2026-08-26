import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";
import type { Layer } from "leaflet";
import { HAZARD_ICON, HAZARD_LABEL, RAIN_INTENSITY_LABEL, SEVERITY_COLOR, rainIntensityColor } from "../types";
import type { SaihCapa } from "../types";
import type { HazardData } from "../hooks/useHazardData";
import type { RadarData } from "../hooks/useRadarFrames";
import { SaihLayer } from "./SaihLayer";
import { RadarLayer } from "./RadarLayer";
import type { CapasVisibles } from "./ControlPanel";

// Encuadre que incluye Península, Baleares y Canarias.
const CENTRO_ESPANA: [number, number] = [39.6, -4.5];

// Base oscura y sobria: deja que los colores del radar y los avisos sean lo único
// que llame la atención en el mapa.
const BASE_OSCURA = "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png";
const ETIQUETAS = "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png";
const ATRIBUCION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

interface Props {
  datos: HazardData;
  radar: RadarData;
  indiceRadar: number;
  opacidadRadar: number;
  capas: CapasVisibles;
  saihLayers: SaihCapa[];
  soloConLluvia: boolean;
  userPos: { lat: number; lon: number } | null;
}

// Solo late lo que de verdad es peligroso. Animar cada estación con algo de lluvia
// llenaba el mapa de parpadeos y gastaba GPU sin aportar información.
const LLUVIA_PELIGROSA_MM = 30;

export function MapView({ datos, radar, indiceRadar, opacidadRadar, capas, saihLayers, soloConLluvia, userPos }: Props) {
  const estaciones = (datos.estaciones?.features ?? []).filter(
    (f) => !soloConLluvia || (f.properties.precipitacion1h_mm ?? 0) > 0
  );

  return (
    <MapContainer
      center={CENTRO_ESPANA}
      zoom={6}
      minZoom={5}
      zoomControl={false}
      worldCopyJump
      className="mapa"
    >
      <TileLayer url={BASE_OSCURA} attribution={ATRIBUCION} />

      {capas.radar && <RadarLayer radar={radar} indice={indiceRadar} opacidad={opacidadRadar} />}

      {saihLayers.map((capa) => (
        <SaihLayer key={capa} capa={capa} />
      ))}

      {/* Las etiquetas van encima del radar para que los nombres sigan leyéndose. */}
      <TileLayer url={ETIQUETAS} zIndex={400} />

      {capas.avisos &&
        datos.avisos?.features.map((f) => (
          <GeoJSON
            key={f.properties.id}
            data={f as GeoJSON.Feature}
            style={{
              color: SEVERITY_COLOR[f.properties.severidad],
              weight: 1.5,
              opacity: 0.9,
              fillOpacity: f.properties.severidad === "rojo" ? 0.3 : 0.18,
              className: `aviso aviso--${f.properties.severidad}`,
            }}
            onEachFeature={(_feat, layer: Layer) =>
              layer.bindPopup(
                `<div class="pop">
                   <div class="pop-cabecera" style="background:${SEVERITY_COLOR[f.properties.severidad]}">
                     ${HAZARD_ICON[f.properties.fenomeno]} ${HAZARD_LABEL[f.properties.fenomeno]} · ${f.properties.severidad.toUpperCase()}
                   </div>
                   <div class="pop-cuerpo">
                     <strong>${f.properties.zona}</strong>
                     <p>${f.properties.descripcion}</p>
                   </div>
                 </div>`,
                { className: "pop-wrap" }
              )
            }
          />
        ))}

      {capas.estaciones &&
        estaciones.map((f) => {
          const lluvia = f.properties.precipitacion1h_mm ?? 0;
          const geom = f.geometry as GeoJSON.Point;
          const intensa = lluvia >= LLUVIA_PELIGROSA_MM;
          return (
            <CircleMarker
              key={f.properties.id}
              center={[geom.coordinates[1], geom.coordinates[0]]}
              radius={intensa ? 8 : lluvia > 0 ? 5 : 3}
              pathOptions={{
                color: rainIntensityColor(lluvia),
                weight: intensa ? 2 : 1,
                fillColor: rainIntensityColor(lluvia),
                fillOpacity: lluvia > 0 ? 0.75 : 0.35,
                className: intensa ? "estacion estacion--intensa" : "estacion",
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <strong>{f.properties.nombre}</strong>
                {lluvia > 0 ? ` · ${lluvia} mm/h` : " · sin lluvia"}
              </Tooltip>
              <Popup className="pop-wrap">
                <div className="pop">
                  <div className="pop-cabecera" style={{ background: rainIntensityColor(lluvia) }}>
                    🌧️ {RAIN_INTENSITY_LABEL[f.properties.intensidadLluvia]}
                  </div>
                  <div className="pop-cuerpo">
                    <strong>{f.properties.nombre}</strong>
                    <dl className="pop-datos">
                      <dt>Lluvia (1 h)</dt>
                      <dd>{f.properties.precipitacion1h_mm ?? "s/d"} mm</dd>
                      {f.properties.lluvia3h_mm !== null && (
                        <>
                          <dt>Acumulado 3 h</dt>
                          <dd>
                            {f.properties.lluvia3h_mm} mm
                            {f.properties.tendenciaLluvia === "subiendo" && " ↑"}
                            {f.properties.tendenciaLluvia === "bajando" && " ↓"}
                          </dd>
                        </>
                      )}
                      <dt>Viento</dt>
                      <dd>
                        {f.properties.vientoVelocidad_kmh ?? "s/d"} km/h
                        {f.properties.vientoRacha_kmh ? ` (racha ${f.properties.vientoRacha_kmh})` : ""}
                      </dd>
                      <dt>Temperatura</dt>
                      <dd>{f.properties.temperatura_c ?? "s/d"} °C</dd>
                    </dl>
                    <small>{new Date(f.properties.fechaHora).toLocaleString("es-ES")}</small>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

      {capas.terremotos &&
        datos.terremotos?.features.map((f) => {
          const geom = f.geometry as GeoJSON.Point;
          const mag = f.properties.magnitud;
          const fuerte = mag >= 4;
          return (
            <CircleMarker
              key={f.properties.id}
              center={[geom.coordinates[1], geom.coordinates[0]]}
              radius={Math.max(4, mag * 2.5)}
              pathOptions={{
                color: fuerte ? "#f43f5e" : "#a78bfa",
                weight: 1.5,
                fillOpacity: 0.28,
                className: fuerte ? "sismo sismo--fuerte" : "sismo",
              }}
            >
              <Popup className="pop-wrap">
                <div className="pop">
                  <div className="pop-cabecera" style={{ background: fuerte ? "#f43f5e" : "#a78bfa" }}>
                    🌍 Magnitud {mag}
                  </div>
                  <div className="pop-cuerpo">
                    <strong>{f.properties.lugar}</strong>
                    <dl className="pop-datos">
                      <dt>Profundidad</dt>
                      <dd>{f.properties.profundidad_km} km</dd>
                      <dt>Fuente</dt>
                      <dd>{f.properties.fuente}</dd>
                    </dl>
                    <small>{new Date(f.properties.fecha).toLocaleString("es-ES")}</small>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

      {userPos && (
        <CircleMarker
          center={[userPos.lat, userPos.lon]}
          radius={7}
          pathOptions={{ color: "#fff", weight: 2, fillColor: "#22c55e", fillOpacity: 1, className: "yo" }}
        >
          <Tooltip direction="top" offset={[0, -6]} permanent>
            Estás aquí
          </Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
