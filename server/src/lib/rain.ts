/** Escala oficial AEMET de intensidad de precipitación (mm en la última hora). */
export type RainIntensity = "sin_lluvia" | "debil" | "moderada" | "fuerte" | "muy_fuerte" | "torrencial";

export const RAIN_INTENSITY_LABEL: Record<RainIntensity, string> = {
  sin_lluvia: "Sin lluvia",
  debil: "Débil",
  moderada: "Moderada",
  fuerte: "Fuerte",
  muy_fuerte: "Muy fuerte",
  torrencial: "Torrencial",
};

export function classifyRain(mmPorHora: number): RainIntensity {
  if (mmPorHora <= 0) return "sin_lluvia";
  if (mmPorHora < 2) return "debil";
  if (mmPorHora < 15) return "moderada";
  if (mmPorHora < 30) return "fuerte";
  if (mmPorHora < 60) return "muy_fuerte";
  return "torrencial";
}

export type RainTrend = "subiendo" | "estable" | "bajando";

export function classifyTrend(ultima: number, anterior: number): RainTrend {
  if (ultima > anterior + 1) return "subiendo";
  if (ultima < anterior - 1) return "bajando";
  return "estable";
}
