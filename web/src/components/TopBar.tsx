interface Props {
  vigilando: boolean;
  posicion: { lat: number; lon: number } | null;
  actualizado: string | null;
  cargando: boolean;
  nAvisos: number;
  onActivarUbicacion: () => void;
  onRefrescar: () => void;
}

export function TopBar({ vigilando, posicion, actualizado, cargando, nAvisos, onActivarUbicacion, onRefrescar }: Props) {
  return (
    <header className="topbar">
      <div className="marca">
        <span className="marca-icono" aria-hidden="true">
          <span className="marca-pulso" />
        </span>
        <div className="marca-texto">
          <h1>Alerta España</h1>
          <p>
            {nAvisos > 0 ? (
              <span className="marca-avisos">
                {nAvisos} {nAvisos === 1 ? "aviso activo" : "avisos activos"} en España
              </span>
            ) : (
              "Riesgos naturales en tiempo real"
            )}
          </p>
        </div>
      </div>

      <div className="acciones">
        {!vigilando ? (
          <button className="btn btn--primario" onClick={onActivarUbicacion}>
            <span aria-hidden="true">📍</span> Vigilar mi zona
          </button>
        ) : (
          <span className="pastilla pastilla--ok" title={posicion ? `${posicion.lat.toFixed(4)}, ${posicion.lon.toFixed(4)}` : ""}>
            <span className="punto-vivo" /> Vigilando tu zona
          </span>
        )}

        <button className="btn btn--icono" onClick={onRefrescar} disabled={cargando} title="Actualizar datos" aria-label="Actualizar datos">
          <span className={cargando ? "girando" : ""}>⟳</span>
        </button>

        {actualizado && (
          <span className="pastilla pastilla--tenue" title={new Date(actualizado).toLocaleString("es-ES")}>
            {new Date(actualizado).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </header>
  );
}
