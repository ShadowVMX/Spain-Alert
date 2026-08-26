<p align="center">
  <img src="docs/img/banner.svg" alt="Alerta España — Mapa nacional de riesgos naturales en tiempo real" width="100%">
</p>

<p align="center">
  <a href="https://shadowvmx.github.io/Spain-Alert/"><img src="https://img.shields.io/badge/▶_ABRIR_LA_APP-shadowvmx.github.io-ef4444?style=for-the-badge" alt="Abrir la app"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/datos-AEMET_·_EMSC_·_RainViewer-0ea5e9?style=flat-square" alt="Fuentes de datos">
  <img src="https://img.shields.io/badge/actualización-cada_10_min-22c55e?style=flat-square" alt="Actualización">
  <img src="https://img.shields.io/badge/PWA-instalable-a78bfa?style=flat-square" alt="PWA instalable">
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/contribuciones-bienvenidas-f97316?style=flat-square" alt="Contribuciones bienvenidas"></a>
</p>

---

## El problema

En España muere gente en riadas y DANAs que **habría podido ponerse a salvo si
hubiera sabido a tiempo lo que venía**. La información existe: AEMET, las
confederaciones hidrográficas y el IGN publican datos en tiempo real. El problema es
que están repartidos en portales distintos, con formatos distintos, y nadie los mira
mientras conduce de vuelta a casa bajo la lluvia.

**Alerta España junta todo eso en un mapa y te avisa cuando el peligro se acerca a
donde estás.**

> ⚠️ Esto no sustituye a Protección Civil ni al 112. Es una capa adicional, más
> rápida y más visual, para que nadie se quede sin enterarse.

---

## Cómo se usa

**Es una web. No hay que instalar nada, ni registrarse, ni configurar nada.**

### 👉 [shadowvmx.github.io/Spain-Alert](https://shadowvmx.github.io/Spain-Alert/)

<p align="center">
  <img src="docs/img/interfaz.svg" alt="Esquema de la interfaz: mapa a pantalla completa, barra superior con avisos activos, panel de capas y línea de tiempo del radar" width="100%">
</p>

1. Abres el enlace. Ves España con el radar de lluvia en marcha.
2. **▶ abajo** reproduce la animación; el botón **1x/2x/4x** ajusta la velocidad. La
   marca amarilla separa lo ya observado de la predicción.
3. **☰ Capas** enciende y apaga radar, avisos, estaciones, embalses y terremotos.
4. **📍 Vigilar mi zona** activa el aviso automático (pide ubicación y notificaciones).
5. Tocas cualquier punto del mapa y ves su detalle.

**Para tenerla a mano en el móvil:** en el navegador, *"Añadir a pantalla de inicio"*.
Queda como una app más, con su icono.

**Tu ubicación nunca sale de tu dispositivo.** El cálculo de qué te afecta se hace en
tu propio móvil. No hay cuentas, ni registro, ni rastreo, ni publicidad.

---

## Qué muestra

| | |
|---|---|
| 🌧️ **Radar de lluvia animado** | Últimas 2 horas más predicción. **Ves si la tormenta viene hacia ti o se aleja** |
| ⚠️ **Avisos oficiales de AEMET** | Zonas de aviso por gravedad: amarillo, naranja, rojo |
| 📡 **858 estaciones** | Toda la red de AEMET, coloreada por intensidad de lluvia |
| 🌍 **Terremotos** | Sismos recientes de la red nacional |
| 💧 **Embalses** | Nivel de llenado por colores, en tiempo real *(Catalunya; resto de cuencas en marcha)* |

### Detección propia de riesgo de riada

Además de los avisos oficiales, la app calcula el suyo desde las estaciones cercanas:

<p align="center">
  <img src="docs/img/riada.svg" alt="Cómo se decide el aviso propio de riada" width="100%">
</p>

**El caso amarillo es el que mata.** La gente ve que ha escampado, se confía y sale
—mientras el agua sigue bajando desde la cabecera del río. Por eso avisamos aunque
en ese momento ya no llueva fuerte.

---

## Estado actual

### ✅ Funcionando en producción

| Capa | Fuente | Comprobado |
|---|---|---|
| Radar de lluvia | [RainViewer](https://www.rainviewer.com/) | Sí, en la app publicada |
| Estaciones | [AEMET OpenData](https://opendata.aemet.es) | Sí — **858 estaciones** por ejecución |
| Embalses de Catalunya | [ACA](https://analisi.transparenciacatalunya.cat/d/vjx7-6kcp) vía datos abiertos de la Generalitat | Sí — nivel en tiempo real, con posición propia |
| Terremotos | [EMSC](https://www.seismicportal.eu) (incluye red del IGN) | Sí — **200 sismos** por ejecución |
| Mapa base | [CARTO](https://carto.com/attributions) + [OpenStreetMap](https://www.openstreetmap.org/copyright) | Sí |
| Alertas por proximidad | Cálculo local | Sí, en navegador con ubicación simulada |

### ⏳ Pendiente

| Qué | Estado real |
|---|---|
| **Avisos AEMET (CAP)** | El código está integrado y responde, pero desde que la app existe **no ha habido ningún aviso activo en España**, así que el parseo del formato oficial todavía no se ha visto funcionar con un aviso de verdad. |
| **Embalses fuera de Catalunya** | Catalunya ya va en tiempo real. Faltan las cuencas donde caen las DANAs. **MITECO queda descartado**: ni su API de objetos geográficos ni su directorio ArcGIS (`ElevationsService`, `PrintService`, `SharedService`) publican el agua, y su WMS tiene la cadena TLS incompleta. La vía buena es cuenca a cuenca. |
| **Ríos y caudales (SAIH)** | `wms.mapama.gob.es` responde con `UNABLE_TO_VERIFY_LEAF_SIGNATURE`: le falta el certificado intermedio en la cadena TLS. Los navegadores lo resuelven solos buscándolo; Node no. |
| **Notificaciones con la app cerrada** | Necesita un servidor con Push API y claves VAPID. Hoy el aviso solo salta con la pestaña abierta. |
| **Frecuencia real de actualización** | El cron pide cada 10 min, pero GitHub retrasa las tareas programadas: en la práctica se ejecuta cada 30-60 min. Para lluvia se aguanta; si esto se usa en serio, hay que mover la descarga a un servidor propio. |

---

## Cómo funciona por dentro

<p align="center">
  <img src="docs/img/flujo-datos.svg" alt="Flujo de datos: de las fuentes oficiales al aviso en tu móvil" width="100%">
</p>

GitHub Pages solo sirve archivos estáticos y no puede ejecutar un servidor. La
solución: **GitHub Actions hace de servidor por lotes**. Descarga los datos con la
clave de AEMET guardada como *secret*, los deja como archivos JSON y publica la web.

<p align="center">
  <img src="docs/img/despliegue.svg" alt="Ciclo de publicación en GitHub Pages" width="100%">
</p>

La clave de AEMET **nunca llega al navegador**, y **las alertas se calculan en el
cliente** (`web/src/alertEngine.ts`), así que la ubicación del usuario no se envía a
ninguna parte.

```
server/                    Node + Express (TypeScript)
  src/lib/aemet.ts           avisos CAP + estaciones, con detección de clave caducada
  src/lib/embalses.ts        embalses en tiempo real, registro de fuentes por cuenca
  src/lib/saih.ts            capas WMS de ríos y embalses
  src/lib/earthquakes.ts     sismos vía EMSC
  src/lib/rain.ts            escala oficial de intensidad de AEMET
  src/scripts/               generador de datos estáticos + sonda de fuentes
  src/pruebas/               comprobaciones del pivotado de embalses

web/                       Vite + React + Leaflet
  src/alertEngine.ts         ⭐ cálculo de alertas EN EL NAVEGADOR
  src/components/            mapa, radar, panel, avisos, embalses
  src/hooks/                 datos, geolocalización, frames del radar

.github/workflows/         descarga datos y publica en Pages
```

### Cómo falla (a propósito)

En una app de avisos, **unos datos viejos son más peligrosos que no tener datos**: un
mapa en calma hace creer que no hay peligro. Por eso:

| Situación | Qué hace |
|---|---|
| Falla una fuente secundaria (sismos, embalses) | Publica igual: mejor un mapa con la lluvia que ningún mapa |
| Falla **toda** la información de lluvia | Aborta el despliegue. Pages mantiene lo último bueno y GitHub avisa por email |
| La clave de AEMET caduca | Aborta siempre, con el mensaje de cómo renovarla |
| Quedan menos de 14 días de clave | Aviso destacado en el resumen del workflow |
| Los datos llevan +40 min sin actualizarse | La app muestra una tira de aviso; en rojo pasadas 3 h |
| No se sabe dónde va una capa en el mapa | **No se dibuja.** Nunca se inventan coordenadas |

---

## Contribuir

**Este proyecto necesita gente. Y no solo programadores.**

| Puedes... | ¿Hace falta programar? |
|---|---|
| 🐛 [Reportar un fallo](../../issues/new?template=01-bug.yml) | No |
| 💡 [Proponer una mejora](../../issues/new?template=02-idea.yml) | No |
| 🌊 [Aportar una fuente de datos](../../issues/new?template=03-fuente-datos.yml) | No |
| 📖 Mejorar los textos de autoprotección | No |
| 💻 Enviar código | Sí |

### Lo más urgente ahora mismo

**Los embalses del Júcar y del Ebro**, que son las cuencas donde caen las DANAs.

Catalunya ya está en tiempo real. MITECO está descartado como agregador nacional
—lo comprobamos endpoint por endpoint— así que hay que ir cuenca a cuenca. Lo que
sabemos hasta ahora:

| Cuenca | Estado |
|---|---|
| Catalunya (ACA) | ✅ Integrada, en tiempo real |
| **Júcar** | 🔜 **Localizado.** `saih.chj.es/embalses` y `/aforos` sirven sus datos, y la portada trae la red de pluviómetros embebida en el HTML con lluvia a 1, 4, 12 y 24 h. Falta escribir la integración |
| Hidrosur (Andalucía) | 🔜 Capas en GeoJSON localizadas y catálogo de sensores accesible. El endpoint de lecturas responde pero aún no acierta con el formato de fecha |
| Ebro | ❌ **Inalcanzable desde GitHub Actions.** Tiempo de espera agotado en http y en https, con y sin `www`. No es el certificado: es el camino de red. Necesitaría otra salida |

<details>
<summary>Lo que sabemos del SAIH del Júcar (por si alguien quiere adelantarse)</summary>

```
https://saih.chj.es/            portada: red de pluviómetros embebida en el HTML
                                como `let estaciones = [{"idEstacionRemota": ...}]`
https://saih.chj.es/embalses    HTML servido desde el servidor, valores dentro
https://saih.chj.es/aforos      HTML servido desde el servidor, valores dentro
```

**No hay API JSON.** `aforo-datos`, `aforo-datos-ultimo` y `aforo-datos-umbrales`
parecen rutas pero son **nombres de clase CSS**: el caudal viene escrito en el
propio HTML.

```html
<div class="aforo-datos-ultimo">Último valor
  <div class="dato-valor-ppal">12,18 m<sup>3</sup>/s</div><span>09:20</span></div>
```

Así que la integración de estas dos capas es análisis de HTML, con lo que eso
implica: se rompe el día que la confederación cambie su plantilla. La portada es
distinta y más sólida, porque ahí sí hay un JSON completo embebido.

**Cuidado con las coordenadas.** Los campos se llaman `fldNCoordGPSLat` y
`fldNCoordGPSLon`, pero no son grados ni están en ese orden: el que dice «Lat»
lleva la X y el que dice «Lon» lleva la Y, ambas en UTM del huso 30 Norte. Se
comprueba con l'Alfàs del Pi, que cae en (755000, 4272000). Fiarse del nombre
del campo pondría Alicante en el océano Índico.

</details>

Si trabajas en una confederación hidrográfica o conoces el portal correcto,
[cuéntanoslo](../../issues/new?template=03-fuente-datos.yml) — es lo que más falta
hace. Hay un workflow, **Sondear fuentes de datos**, que prueba endpoints candidatos
y dice qué devuelve cada uno; añadir uno a la lista es cambiar una línea.

También vale el **conocimiento local**: qué barranco de tu pueblo se desborda
siempre, qué vado se corta con dos gotas. Eso no lo da ningún sensor.

### Para tocar código

📖 Lee **[CONTRIBUTING.md](CONTRIBUTING.md)** antes de enviar nada. Resumen de las
reglas que no se negocian: nunca inventes coordenadas, nunca falles en silencio, la
ubicación no sale del dispositivo.

```bash
git clone https://github.com/ShadowVMX/Spain-Alert.git
cd Spain-Alert
npm run install:all

cp server/.env.example server/.env    # con tu propia clave de AEMET, gratuita
npm run dev:server                    # terminal 1
npm run dev:web                       # terminal 2 → http://localhost:5173
```

Para desarrollar necesitas tu propia clave de AEMET
([gratuita](https://opendata.aemet.es/centrodedescargas/altaUsuario), tarda 5
minutos). La del proyecto es privada y no se comparte.

| Comando | Qué hace |
|---|---|
| `npm run install:all` | Instala dependencias de `server/` y `web/` |
| `npm run dev:server` / `dev:web` | Desarrollo con recarga automática |
| `npm run typecheck` | Comprueba tipos en todo el proyecto |
| `npm run build` | Construye web y servidor |
| `npm --prefix server run generar-datos` | Descarga los datos como archivos estáticos |
| `npm --prefix server run test` | Comprueba el pivotado de embalses sin tocar la red |

> El servicio oficial lo mantenemos nosotros: la infraestructura, la clave de AEMET y
> el despliegue son del proyecto. No hace falta que nadie monte su propia copia para
> usarlo ni para contribuir — basta con la web de arriba.

---

## Roadmap

- [ ] **Embalses del Júcar y del Ebro** (lo más urgente: Catalunya ya va en tiempo real)
- [ ] Nivel y caudal de los ríos del SAIH, resolviendo el certificado TLS
- [ ] Meter el caudal de los ríos en el motor de alertas: es la señal más fiable de
      riada real, mejor que solo mirar la lluvia
- [ ] Notificaciones push con la app cerrada
- [ ] Empaquetar como APK con [Capacitor](https://capacitorjs.com/) o
      [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
- [ ] Radar propio de AEMET, de más resolución sobre España
- [ ] Incendios forestales (EFFIS/Copernicus)
- [ ] Avisos de Protección Civil de las CCAA
- [ ] Servidor propio para actualización real cada 10 min

---

## Licencia y avisos

Publicado bajo [licencia MIT](LICENSE).

Proyecto independiente. **No está gestionado ni respaldado por AEMET, el IGN, MITECO
ni Protección Civil.**

Los datos son de sus fuentes y se usan bajo sus condiciones: AEMET y MITECO exigen
citar la procedencia, y RainViewer requiere atribución visible (está en el pie de la
app). El uso gratuito de RainViewer está pensado para proyectos pequeños; si esto
creciera mucho, habría que hablar con ellos.

<p align="center">
  <strong>En una emergencia real, sigue las indicaciones de las autoridades y llama al 112.</strong>
</p>
