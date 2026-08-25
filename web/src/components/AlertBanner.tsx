import { useState } from "react";
import { HAZARD_ICON, HAZARD_LABEL, SEVERITY_COLOR } from "../types";
import type { NearbyAlert } from "../types";

export function AlertBanner({ alerts }: { alerts: NearbyAlert[] }) {
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const visible = alerts.filter((_, i) => !dismissed.has(i));
  if (visible.length === 0) return null;

  return (
    <div className="alert-overlay">
      {visible.map((a, i) => (
        <div key={i} className="alert-card" style={{ borderColor: SEVERITY_COLOR[a.severidad] }}>
          <div className="alert-card-header" style={{ background: SEVERITY_COLOR[a.severidad] }}>
            <span>
              {HAZARD_ICON[a.tipo]} {HAZARD_LABEL[a.tipo]} · Aviso {a.severidad.toUpperCase()}
            </span>
            <button onClick={() => setDismissed((s) => new Set(s).add(alerts.indexOf(a)))} aria-label="Cerrar">
              ✕
            </button>
          </div>
          <div className="alert-card-body">
            <p className="alert-title">{a.titulo}</p>
            {a.distancia_km > 0 && <p>Distancia estimada: {a.distancia_km} km</p>}
            <ul>
              {a.instrucciones.map((instr, j) => (
                <li key={j}>{instr}</li>
              ))}
            </ul>
            <p className="alert-source">Fuente: {a.fuente}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
