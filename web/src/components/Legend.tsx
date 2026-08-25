interface Props {
  showWarnings: boolean;
  showStations: boolean;
  showQuakes: boolean;
  onToggle: (key: "showWarnings" | "showStations" | "showQuakes") => void;
}

export function Legend({ showWarnings, showStations, showQuakes, onToggle }: Props) {
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
    </div>
  );
}
