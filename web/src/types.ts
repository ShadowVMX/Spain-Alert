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

export type RainIntensity = "sin_lluvia" | "debil" | "moderada" | "fuerte" | "muy_fuerte" | "torrencial";

export const RAIN_INTENSITY_LABEL: Record<RainIntensity, string> = {
  sin_lluvia: "Sin lluvia",
  debil: "Débil",
  moderada: "Moderada",
  fuerte: "Fuerte",
  muy_fuerte: "Muy fuerte",
  torrencial: "Torrencial",
};

/** Colores en línea con la escala oficial AEMET de intensidad de precipitación. */
export function rainIntensityColor(mmPorHora: number): string {
  if (mmPorHora <= 0) return "#475569";
  if (mmPorHora < 2) return "#38bdf8";
  if (mmPorHora < 15) return "#0284c7";
  if (mmPorHora < 30) return "#eab308";
  if (mmPorHora < 60) return "#f97316";
  return "#dc2626";
}

export interface WeatherStationProperties {
  id: string;
  nombre: string;
  provincia: string | null;
  fechaHora: string;
  precipitacion1h_mm: number | null;
  precipitacionAcumulada_mm: number | null;
  intensidadLluvia: RainIntensity;
  lluvia3h_mm: number | null;
  tendenciaLluvia: "subiendo" | "estable" | "bajando" | null;
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

export type SaihCapa = "rios" | "embalses" | "pluviometria";

export const SAIH_LABEL: Record<SaihCapa, string> = {
  rios: "Ríos (caudal / nivel)",
  embalses: "Embalses (nivel / volumen)",
  pluviometria: "Pluviometría SAIH",
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

export type EstadoEmbalse = "verde" | "amarillo" | "rojo" | "desconocido";

export interface EmbalseProperties {
  id: string;
  nombre: string;
  cuenca: string | null;
  volumenActual_hm3: number | null;
  capacidadTotal_hm3: number | null;
  porcentaje: number | null;
  estado: EstadoEmbalse;
  fecha: string | null;
  fuente: string;
}

export const EMBALSE_COLOR: Record<EstadoEmbalse, string> = {
  verde: "#22c55e",
  amarillo: "#eab308",
  rojo: "#ef4444",
  desconocido: "#64748b",
};

/**
 * Un embalse lleno no está "desbordado": lo que mide el color es el MARGEN que le
 * queda para absorber una crecida. Sin margen, lo que entra sale aguas abajo.
 */
export const EMBALSE_ETIQUETA: Record<EstadoEmbalse, string> = {
  verde: "Con margen",
  amarillo: "Poco margen",
  rojo: "Sin margen",
  desconocido: "Sin dato de nivel",
};
