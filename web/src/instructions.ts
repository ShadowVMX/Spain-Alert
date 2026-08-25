import type { HazardKind } from "./types";

/**
 * Instrucciones de autoprotección por tipo de fenómeno (estilo Protección Civil).
 *
 * NOTA: existe una copia equivalente en `server/src/lib/instructions.ts`, que usa
 * el endpoint /api/alerts/nearby (pensado para las futuras notificaciones push,
 * donde el texto lo compone el servidor). Si cambias un texto aquí, cámbialo allí.
 */
export const SAFETY_INSTRUCTIONS: Record<HazardKind, string[]> = {
  avenidas: [
    "No cruces vados, puentes bajos ni cauces aunque parezcan tranquilos: 15 cm de agua pueden tirarte al suelo.",
    "Aléjate de ríos, ramblas, barrancos y garajes o sótanos cercanos a cauces.",
    "Si estás en el coche y el agua sube, abandónalo y sube a un lugar alto. No intentes cruzar zonas inundadas.",
    "Sube a plantas superiores del edificio; no bajes al garaje.",
    "Desconecta la electricidad si el agua puede entrar en casa.",
  ],
  lluvia: [
    "Evita desplazamientos no imprescindibles, sobre todo por carreteras secundarias o zonas bajas.",
    "Aléjate de cauces, ramblas y zonas históricamente inundables.",
    "Si conduces, reduce la velocidad y nunca cruces un tramo de carretera inundado.",
    "Revisa desagües y sumideros cerca de tu vivienda si es seguro hacerlo.",
  ],
  viento: [
    "Aléjate de árboles, andamios, grúas, cornisas y carteles que puedan caer.",
    "Evita circular por carreteras expuestas, especialmente con vehículos altos o caravanas.",
    "Retira o asegura objetos sueltos en terrazas y balcones.",
    "Si estás en el mar o la costa, no navegues ni te acerques al litoral.",
  ],
  tormenta: [
    "Busca refugio en un edificio o vehículo cerrado; evita zonas abiertas y elevadas.",
    "No te refugies bajo árboles aislados.",
    "Desconecta aparatos eléctricos no imprescindibles.",
    "Si estás en el agua (piscina, playa, río), sal inmediatamente.",
  ],
  nieve: [
    "Evita desplazamientos por carretera salvo necesidad; usa cadenas si debes circular.",
    "Lleva manta, comida y batería del móvil cargada si viajas.",
    "No te alejes de zonas habitadas ni transites por zonas de riesgo de aludes.",
  ],
  costero: [
    "Aléjate de paseos marítimos, espigones y playas bajas: puede haber olas de gran altura.",
    "No practiques actividades náuticas ni te bañes.",
    "Ten cuidado con embarcaciones y objetos que el oleaje pueda arrastrar.",
  ],
  altas_temperaturas: [
    "Evita el ejercicio físico y la exposición al sol en las horas centrales del día.",
    "Bebe agua con frecuencia aunque no tengas sed.",
    "No dejes a nadie (personas ni animales) dentro de un vehículo.",
  ],
  bajas_temperaturas: [
    "Abrígate por capas y evita la exposición prolongada al frío.",
    "Ten cuidado con placas de hielo en aceras y carreteras.",
    "Revisa la calefacción y la ventilación si usas combustión (riesgo de intoxicación).",
  ],
  terremoto: [
    'Si estás dentro: agáchate, cúbrete bajo una mesa resistente y agárrate ("agáchate, cúbrete, agárrate").',
    "Aléjate de ventanas, espejos y muebles altos que puedan caer.",
    "No uses ascensores. Si estás fuera, aléjate de edificios, farolas y cables eléctricos.",
    "Tras el temblor, revisa posibles daños antes de volver a entrar en un edificio y prepárate para réplicas.",
  ],
  otro: ["Sigue las indicaciones de Protección Civil y de las autoridades locales."],
};
