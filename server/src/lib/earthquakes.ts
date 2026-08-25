import type { EarthquakeProperties, GeoFeature, GeoFeatureCollection } from "./types.js";

// EMSC (European-Mediterranean Seismological Centre) agrega en tiempo casi real los datos
// de las redes sísmicas nacionales, incluida la Red Sísmica Nacional del IGN para España.
// Es un servicio FDSN estándar, estable y sin necesidad de API key.
const EMSC_URL =
  "https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=200&orderby=time" +
  "&minlatitude=27&maxlatitude=44&minlongitude=-19&maxlongitude=5"; // incluye Canarias + Península + Baleares

interface EmscFeature {
  id: string;
  properties: {
    mag: number;
    depth: number;
    flynn_region?: string;
    time: string;
    source_id?: string;
  };
  geometry: { type: "Point"; coordinates: [number, number, number] };
}

export async function getRecentEarthquakes(): Promise<GeoFeatureCollection<EarthquakeProperties>> {
  const res = await fetch(EMSC_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`EMSC rechazó la petición: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { features: EmscFeature[] };

  const features: GeoFeature<EarthquakeProperties>[] = body.features.map((f) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [f.geometry.coordinates[0], f.geometry.coordinates[1]] },
    properties: {
      id: f.id,
      magnitud: f.properties.mag,
      profundidad_km: f.properties.depth,
      lugar: f.properties.flynn_region ?? "Desconocido",
      fecha: f.properties.time,
      fuente: "EMSC",
    },
  }));

  return { type: "FeatureCollection", features, actualizado: new Date().toISOString() };
}
