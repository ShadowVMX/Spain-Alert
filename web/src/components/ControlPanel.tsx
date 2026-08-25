import { useState } from "react";
import { RAIN_INTENSITY_LABEL, SAIH_LABEL, rainIntensityColor } from "../types";
import type { SaihCapa } from "../types";

export interface CapasVisibles {
  radar: boolean;
  avisos: boolean;
  estaciones: boolean;
  terremotos: boolean;
}

interface Props {
  capas: CapasVisibles;
  saihLayers: SaihCapa[];
  opacidadRadar: number;
  onCapa: (clave: keyof CapasVisibles) => void;
  onSaih: (capa: SaihCapa) => void;
  onOpacidadRadar: (v: number) => void;
}

const ESCALA: { mm: number; etiqueta: string }[] = [
  { mm: 1, etiqueta: RAIN_INTENSITY_LABEL.debil },
  { mm: 8, etiqueta: RAIN_INTENSITY_LABEL.moderada },
  { mm: 20, etiqueta: RAIN_INTENSITY_LABEL.fuerte },
  { mm: 45, etiqueta: RAIN_INTENSITY_LABEL.muy_fuerte },
  { mm: 80, etiqueta: RAIN_INTENSITY_LABEL.torrencial },
];

export function ControlPanel({ capas, saihLayers, opacidadRadar, onCapa, onSaih, onOpacidadRadar }: Props) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className={`panel${abierto ? " panel--abierto" : ""}`}>
      <button className="panel-toggle" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
        <span className="panel-toggle-icono">☰</span>
        <span className="panel-toggle-texto">Capas</span>
      </button>

      {abierto && (
        <div className="panel-cuerpo">
          <section className="panel-seccion">
            <h3>Meteorología</h3>
            <Interruptor activo={capas.radar} onClick={() => onCapa("radar")} color="#38bdf8">
              Radar de lluvia
            </Interruptor>
            {capas.radar && (
              <label className="panel-slider">
                <span>Opacidad del radar</span>
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={Math.round(opacidadRadar * 100)}
                  onChange={(e) => onOpacidadRadar(Number(e.target.value) / 100)}
                />
              </label>
            )}
            <Interruptor activo={capas.avisos} onClick={() => onCapa("avisos")} color="#f97316">
              Avisos oficiales AEMET
            </Interruptor>
            <Interruptor activo={capas.estaciones} onClick={() => onCapa("estaciones")} color="#0ea5e9">
              Estaciones de medición
            </Interruptor>
          </section>

          <section className="panel-seccion">
            <h3>Hidrología · SAIH</h3>
            {(Object.keys(SAIH_LABEL) as SaihCapa[]).map((capa) => (
              <Interruptor key={capa} activo={saihLayers.includes(capa)} onClick={() => onSaih(capa)} color="#22d3ee">
                {SAIH_LABEL[capa]}
              </Interruptor>
            ))}
          </section>

          <section className="panel-seccion">
            <h3>Geofísica</h3>
            <Interruptor activo={capas.terremotos} onClick={() => onCapa("terremotos")} color="#a78bfa">
              Terremotos recientes
            </Interruptor>
          </section>

          <section className="panel-seccion">
            <h3>Intensidad de lluvia</h3>
            <div className="escala">
              {ESCALA.map((e) => (
                <div key={e.mm} className="escala-item" title={`${e.etiqueta} (~${e.mm} mm/h)`}>
                  <span className="escala-color" style={{ background: rainIntensityColor(e.mm) }} />
                  <span className="escala-texto">{e.etiqueta}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Interruptor({
  activo,
  onClick,
  color,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button className={`interruptor${activo ? " interruptor--on" : ""}`} onClick={onClick} role="switch" aria-checked={activo}>
      <span className="interruptor-punto" style={{ background: activo ? color : "transparent", borderColor: color }} />
      <span>{children}</span>
    </button>
  );
}
