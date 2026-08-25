export type HazardKind =
  | "lluvia"
  | "viento"
  | "tormenta"
  | "nieve"
  | "costero"
  | "altas_temperaturas"
  | "bajas_temperaturas"
  | "avenidas"
  | "terremoto"
  | "otro";

export type Severity = "verde" | "amarillo" | "naranja" | "rojo";

export interface WeatherStationProperties {
  id: string;
  nombre: string;
  provincia: string | null;
  fechaHora: string;
  precipitacion1h_mm: number | null;
  precipitacionAcumulada_mm: number | null;
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

export interface NearbyAlert {
  tipo: HazardKind;
  severidad: Severity;
  titulo: string;
  distancia_km: number;
  instrucciones: string[];
  fuente: string;
}

export const SEVERITY_COLOR: Record<Severity, string> = {
  verde: "#16a34a",
  amarillo: "#eab308",
  naranja: "#f97316",
  rojo: "#dc2626",
};

export const HAZARD_LABEL: Record<HazardKind, string> = {
  lluvia: "Lluvia",
  viento: "Viento",
  tormenta: "Tormenta",
  nieve: "Nieve",
  costero: "Fenómeno costero",
  altas_temperaturas: "Calor extremo",
  bajas_temperaturas: "Frío extremo",
  avenidas: "Avenidas / riadas",
  terremoto: "Terremoto",
  otro: "Otro",
};

export const HAZARD_ICON: Record<HazardKind, string> = {
  lluvia: "🌧️",
  viento: "💨",
  tormenta: "⛈️",
  nieve: "❄️",
  costero: "🌊",
  altas_temperaturas: "🔥",
  bajas_temperaturas: "🥶",
  avenidas: "🌊",
  terremoto: "🌍",
  otro: "⚠️",
};
