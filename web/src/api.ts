import type { EarthquakeProperties, GeoFeatureCollection, NearbyAlert, WarningProperties, WeatherStationProperties } from "./types";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Error ${res.status} al pedir ${path}`);
  }
  return (await res.json()) as T;
}

export const fetchWarnings = () => getJson<GeoFeatureCollection<WarningProperties>>("/api/warnings");
export const fetchStations = () => getJson<GeoFeatureCollection<WeatherStationProperties>>("/api/sensors/weather");
export const fetchEarthquakes = () => getJson<GeoFeatureCollection<EarthquakeProperties>>("/api/earthquakes");

export const fetchNearbyAlerts = (lat: number, lon: number) =>
  getJson<{ alerts: NearbyAlert[]; comprobado: string }>(`/api/alerts/nearby?lat=${lat}&lon=${lon}`);
