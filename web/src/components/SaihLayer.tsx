import { useEffect, useState } from "react";
import { WMSTileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { DATA_MODE, fetchSaihCapa } from "../api";
import type { SaihCapaInfo } from "../api";
import type { SaihCapa } from "../types";

/**
 * Capa WMS oficial del SAIH (MITECO, agrega todas las cuencas hidrográficas).
 * Si la capa no está disponible simplemente no se pinta, sin romper el mapa.
 *
 * Las teselas son imágenes, así que el navegador puede pedirlas directamente al
 * WMS sin CORS. La consulta de detalle al hacer click (GetFeatureInfo) sí es una
 * petición de datos, así que solo funciona cuando hay backend que la reenvíe.
 */
export function SaihLayer({ capa, opacity = 0.8 }: { capa: SaihCapa; opacity?: number }) {
  const [info, setInfo] = useState<SaihCapaInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSaihCapa(capa)
      .then((i) => !cancelled && setInfo(i))
      .catch(() => {
        /* capa no disponible: no se pinta */
      });
    return () => {
      cancelled = true;
    };
  }, [capa]);

  useMapEvents({
    click: async (e) => {
      if (!info || DATA_MODE !== "api") return; // sin backend no hay GetFeatureInfo (CORS)
      const map = e.target as L.Map;
      const size = map.getSize();
      const bounds = map.getBounds();
      const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
      const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
      const punto = map.latLngToContainerPoint(e.latlng);

      try {
        const params = new URLSearchParams({
          bbox: [sw.x, sw.y, ne.x, ne.y].join(","),
          width: String(size.x),
          height: String(size.y),
          i: String(Math.round(punto.x)),
          j: String(Math.round(punto.y)),
          crs: "EPSG:3857",
        });
        const res = await fetch(`/api/saih/${capa}/info?${params.toString()}`);
        const texto = (await res.text()).trim();
        if (texto) {
          L.popup()
            .setLatLng(e.latlng)
            .setContent(`<pre style="white-space:pre-wrap;margin:0;font-size:0.75rem;">${escapeHtml(texto)}</pre>`)
            .openOn(map);
        }
      } catch {
        // Consulta puntual fallida: no interrumpe el uso del mapa.
      }
    },
  });

  if (!info) return null;

  return (
    <WMSTileLayer
      url={info.wmsUrl}
      params={{ layers: info.layer, format: "image/png", transparent: true, version: "1.3.0" }}
      opacity={opacity}
      attribution="SAIH / MITECO"
    />
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
