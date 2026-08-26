export type HazardKind = "lluvia" | "viento" | "tormenta" | "nieve" | "costero" | "altas_temperaturas" | "bajas_temperaturas" | "avenidas" | "terremoto" | "otro";

export type Severity = "verde" | "amarillo" | "naranja" | "rojo";

export interface WeatherStationProperties {
  id: string;
  nombre: string;
  provincia: string | null;
  fechaHora: string;
  precipitacion1h_mm: number | null;
  precipitacionAcumulada_mm: number | null;
  intensidadLluvia: import("./rain.js").RainIntensity;
  lluvia3h_mm: number | null;
  /** Lluvia acumulada en 6 h y en 24 h: la que satura el terreno sin picos llamativos. */
  lluvia6h_mm: number | null;
  lluvia24h_mm: number | null;
  tendenciaLluvia: import("./rain.js").RainTrend | null;
  vientoVelocidad_kmh: number | null;
  vientoDireccion_grados: number | null;
  vientoRacha_kmh: number | null;
  temperatura_c: number | null;
}

export interface WarningProperties {
  id: string;
  severidad: Severity;
  fenomeno: HazardKind;
  descripcion: string;
  zona: string;
  efectivo: string;
  expira: string;
}

export interface EarthquakeProperties {
  id: string;
  magnitud: number;
  profundidad_km: number;
  lugar: string;
  fecha: string;
  fuente: string;
}

export interface GeoFeature<P> {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: P;
}

export interface GeoFeatureCollection<P> {
  type: "FeatureCollection";
  features: GeoFeature<P>[];
  actualizado: string;
}
