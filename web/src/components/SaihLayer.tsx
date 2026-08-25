import { useEffect, useState } from "react";
import { WMSTileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { SaihCapa } from "../types";

interface LayerMeta {
  layer: string;
}

async function fetchLayerMeta(capa: SaihCapa): Promise<LayerMeta> {
  const res = await fetch(`/api/saih/${capa}/layer`);
  if (!res.ok) throw new Error(`No se pudo obtener la capa SAIH ${capa}`);
  return res.json();
}

/**
 * Capa WMS oficial del SAIH (MITECO, agrega todas las cuencas). Si el descubrimiento
 * de la capa o el WMS fallan, simplemente no se pinta nada (no rompe el resto del mapa).
 */
export function SaihLayer({ capa, opacity = 0.8 }: { capa: SaihCapa; opacity?: number }) {
  const [meta, setMeta] = useState<LayerMeta | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLayerMeta(capa)
      .then((m) => !cancelled && setMeta(m))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [capa]);

  useMapEvents({
    click: async (e) => {
      if (!meta) return;
      const map = e.target as L.Map;
      const size = map.getSize();
      const bounds = map.getBounds();
      const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
      const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
      const point = map.latLngToContainerPoint(e.latlng);
      const bbox = [sw.x, sw.y, ne.x, ne.y].join(",");

      try {
        const params = new URLSearchParams({
          bbox,
          width: String(size.x),
          height: String(size.y),
          i: String(Math.round(point.x)),
          j: String(Math.round(point.y)),
          crs: "EPSG:3857",
        });
        const res = await fetch(`/api/saih/${capa}/info?${params.toString()}`);
        const texto = (await res.text()).trim();
        if (texto) {
          L.popup().setLatLng(e.latlng).setContent(`<pre style="white-space:pre-wrap;margin:0;font-size:0.75rem;">${escapeHtml(texto)}</pre>`).openOn(map);
        }
      } catch {
        // Consulta puntual fallida: no interrumpe el uso del mapa.
      }
    },
  });

  if (error || !meta) return null;

  return (
    <WMSTileLayer
      url={`/api/saih/${capa}/tiles`}
      params={{ layers: meta.layer, format: "image/png", transparent: true, version: "1.3.0" }}
      opacity={opacity}
      attribution="SAIH / MITECO"
    />
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
