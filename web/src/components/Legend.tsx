import { RAIN_INTENSITY_LABEL, SAIH_LABEL, rainIntensityColor } from "../types";
import type { SaihCapa } from "../types";

interface Props {
  showWarnings: boolean;
  showStations: boolean;
  showQuakes: boolean;
  saihLayers: SaihCapa[];
  onToggle: (key: "showWarnings" | "showStations" | "showQuakes") => void;
  onToggleSaih: (capa: SaihCapa) => void;
}

export function Legend({ showWarnings, showStations, showQuakes, saihLayers, onToggle, onToggleSaih }: Props) {
  return (
    <div className="legend">
      <label>
        <input type="checkbox" checked={showWarnings} onChange={() => onToggle("showWarnings")} />
        Avisos AEMET (lluvia, viento, DANA, costero…)
      </label>
      <label>
        <input type="checkbox" checked={showStations} onChange={() => onToggle("showStations")} />
        Estaciones de lluvia y viento
      </label>
      <label>
        <input type="checkbox" checked={showQuakes} onChange={() => onToggle("showQuakes")} />
        Terremotos recientes
      </label>

      <div className="legend-divider" />
      <p className="legend-title">SAIH (ríos y embalses, todas las cuencas)</p>
      {(Object.keys(SAIH_LABEL) as SaihCapa[]).map((capa) => (
        <label key={capa}>
          <input type="checkbox" checked={saihLayers.includes(capa)} onChange={() => onToggleSaih(capa)} />
          {SAIH_LABEL[capa]}
        </label>
      ))}
      <p className="legend-note">Capa oficial MITECO — toca el mapa para ver el detalle de un punto.</p>

      <div className="legend-divider" />
      <p className="legend-title">Intensidad de lluvia (AEMET)</p>
      <div className="rain-scale">
        {[0.5, 8, 20, 40, 80].map((mm) => (
          <span key={mm} className="rain-swatch" style={{ background: rainIntensityColor(mm) }} title={RAIN_INTENSITY_LABEL[classify(mm)]} />
        ))}
      </div>
      <div className="rain-scale-labels">
        <span>Débil</span>
        <span>Torrencial</span>
      </div>
    </div>
  );
}

function classify(mm: number): keyof typeof RAIN_INTENSITY_LABEL {
  if (mm <= 0) return "sin_lluvia";
  if (mm < 2) return "debil";
  if (mm < 15) return "moderada";
  if (mm < 30) return "fuerte";
  if (mm < 60) return "muy_fuerte";
  return "torrencial";
}
