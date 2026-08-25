const MINUTOS = 60 * 1000;

// Los datos se regeneran cada ~10 min. Pasados 40 sin novedades algo va mal
// (workflow caído, clave de AEMET caducada, AEMET no responde...).
const AVISO_MS = 40 * MINUTOS;
const GRAVE_MS = 3 * 60 * MINUTOS;

/**
 * En una app de avisos, unos datos viejos son más peligrosos que no tener datos:
 * un mapa en calma hace creer que no hay peligro. Si la información se ha quedado
 * atrás hay que decirlo bien claro y mandar al usuario a la fuente oficial.
 */
export function StaleBanner({ actualizado }: { actualizado: string | null }) {
  if (!actualizado) return null;

  const edadMs = Date.now() - new Date(actualizado).getTime();
  if (Number.isNaN(edadMs) || edadMs < AVISO_MS) return null;

  const grave = edadMs >= GRAVE_MS;
  const horas = Math.floor(edadMs / (60 * MINUTOS));
  const minutos = Math.floor(edadMs / MINUTOS);
  const antiguedad = horas >= 1 ? `${horas} h` : `${minutos} min`;

  return (
    <div className={`stale-banner${grave ? " stale-banner--grave" : ""}`} role="alert">
      <strong>⚠️ Datos desactualizados ({antiguedad} sin actualizarse).</strong>{" "}
      {grave
        ? "No te fíes de este mapa ahora mismo: puede haber avisos activos que no se estén mostrando."
        : "Puede que no estés viendo los avisos más recientes."}{" "}
      Consulta{" "}
      <a href="https://www.aemet.es/es/eltiempo/prediccion/avisos" target="_blank" rel="noreferrer">
        los avisos oficiales de AEMET
      </a>
      .
    </div>
  );
}
