/**
 * Comprobaciones del parseo de avisos CAP de AEMET.
 *
 * Desde que existe la app no ha habido ni un solo aviso activo en España, así que
 * este código nunca se había visto funcionar de verdad. Estrenarlo durante una
 * DANA es exactamente lo que no puede pasar: si falla ese día, falla el día que
 * importa.
 *
 * El XML de abajo tiene la estructura real del perfil AEMET-Meteoalerta, que NO
 * es el CAP genérico: el nivel oficial (amarillo/naranja/rojo) viaja en un
 * <parameter>, y el fenómeno en un <eventCode>, no en los campos que uno supondría.
 */

import { parsearAvisosCap } from "../lib/aemet.js";

const avisoRojoLluvia = `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>2.49.0.1.724.0.260826120000.987654</identifier>
  <sender>112@aemet.es</sender>
  <sent>2026-08-26T12:00:00+02:00</sent>
  <status>Actual</status>
  <msgType>Alert</msgType>
  <scope>Public</scope>
  <info>
    <language>es-ES</language>
    <category>Met</category>
    <event>lluvias</event>
    <urgency>Immediate</urgency>
    <severity>Severe</severity>
    <certainty>Likely</certainty>
    <eventCode>
      <valueName>AEMET-Meteoalerta fenomeno</valueName>
      <value>PR;Lluvia</value>
    </eventCode>
    <effective>2026-08-26T12:00:00+02:00</effective>
    <expires>2099-12-31T23:59:59+02:00</expires>
    <senderName>AEMET</senderName>
    <headline>Aviso rojo por lluvias en Litoral norte de Valencia</headline>
    <description>Precipitación acumulada en una hora: 90 mm</description>
    <parameter>
      <valueName>AEMET-Meteoalerta nivel</valueName>
      <value>rojo</value>
    </parameter>
    <area>
      <areaDesc>Litoral norte de Valencia</areaDesc>
      <polygon>39.6,-0.35 39.7,-0.20 39.50,-0.10 39.6,-0.35</polygon>
      <geocode><valueName>AEMET-Meteoalerta zona</valueName><value>771201</value></geocode>
    </area>
  </info>
</alert>`;

// Mismo aviso pero ya caducado. Un aviso rojo vencido en el mapa es una falsa
// alarma, y las falsas alarmas son las que hacen que la gente deje de mirar.
const avisoCaducado = avisoRojoLluvia
  .replace("<expires>2099-12-31T23:59:59+02:00</expires>", "<expires>2020-01-01T00:00:00+02:00</expires>")
  .replace("260826120000.987654", "260826120000.111111");

// Polígono con un punto corrupto. No se puede dibujar medio aviso: o se entiende
// entero o no se pinta.
const avisoPoligonoRoto = avisoRojoLluvia
  .replace("39.6,-0.35 39.7,-0.20 39.50,-0.10 39.6,-0.35", "39.6,-0.35 basura 39.50,-0.10 39.6,-0.35")
  .replace("260826120000.987654", "260826120000.222222");

// Aviso NARANJA. Aquí es donde se ve si leemos el nivel oficial o lo adivinamos:
// en el perfil de AEMET el naranja viaja como severity=Severe, y el rojo como
// Extreme. Si se traduce la severidad CAP a ojo, todos los naranjas se
// convierten en rojos y la app se pasa el día gritando.
const avisoNaranja = avisoRojoLluvia
  .replace("<value>rojo</value>", "<value>naranja</value>")
  .replace("260826120000.987654", "260826120000.333333");

// Aviso cuyo <event> no dice qué fenómeno es. El tipo real está en el
// <eventCode> de AEMET, que es donde hay que mirar.
const avisoEventoVago = avisoRojoLluvia
  .replace("<event>lluvias</event>", "<event>Aviso meteorológico</event>")
  .replace("260826120000.987654", "260826120000.444444");

const comprobar: [string, () => boolean][] = [
  ["un aviso rojo de lluvia se parsea", () => parsearAvisosCap([avisoRojoLluvia]).length === 1],
  [
    "toma el nivel oficial de AEMET (rojo), no solo la severidad CAP",
    () => parsearAvisosCap([avisoRojoLluvia])[0]?.properties.severidad === "rojo",
  ],
  [
    "reconoce el fenómeno como lluvia",
    () => parsearAvisosCap([avisoRojoLluvia])[0]?.properties.fenomeno === "lluvia",
  ],
  [
    "conserva la zona",
    () => parsearAvisosCap([avisoRojoLluvia])[0]?.properties.zona === "Litoral norte de Valencia",
  ],
  [
    "el polígono queda en lon,lat y sobre Valencia",
    () => {
      const g = parsearAvisosCap([avisoRojoLluvia])[0]?.geometry as GeoJSON.Polygon | undefined;
      const p = g?.coordinates?.[0]?.[0];
      return !!p && Math.abs(p[0] + 0.35) < 0.01 && Math.abs(p[1] - 39.6) < 0.01;
    },
  ],
  ["descarta un aviso ya caducado", () => parsearAvisosCap([avisoCaducado]).length === 0],
  ["descarta un polígono con puntos corruptos", () => parsearAvisosCap([avisoPoligonoRoto]).length === 0],
  ["un XML basura no rompe el resto", () => parsearAvisosCap(["no soy xml", avisoRojoLluvia]).length === 1],
  [
    "un naranja NO se convierte en rojo (severity=Severe, nivel=naranja)",
    () => parsearAvisosCap([avisoNaranja])[0]?.properties.severidad === "naranja",
  ],
  [
    "saca el fenómeno del eventCode cuando el texto no lo dice",
    () => parsearAvisosCap([avisoEventoVago])[0]?.properties.fenomeno === "lluvia",
  ],
];

let ok = true;
for (const [que, fn] of comprobar) {
  let bien = false;
  try {
    bien = fn();
  } catch (e) {
    bien = false;
    console.log(`   (excepción: ${(e as Error).message})`);
  }
  console.log(`${bien ? "✅" : "❌"} ${que}`);
  if (!bien) ok = false;
}
console.log(ok ? "\nTodas pasan." : "\nHay comprobaciones que fallan.");
process.exit(ok ? 0 : 1);
