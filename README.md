<p align="center">
  <img src="docs/img/banner.svg" alt="Alerta España — Mapa nacional de riesgos naturales en tiempo real" width="100%">
</p>

<p align="center">
  <a href="#instalación"><img src="https://img.shields.io/badge/instalar-5%20minutos-22c55e?style=flat-square" alt="Instalar en 5 minutos"></a>
  <a href="#publicar-la-app"><img src="https://img.shields.io/badge/hosting-0%20€%2Fmes-0ea5e9?style=flat-square" alt="Hosting gratis"></a>
  <img src="https://img.shields.io/badge/TypeScript-estricto-3178c6?style=flat-square" alt="TypeScript estricto">
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

## Qué hace

<p align="center">
  <img src="docs/img/interfaz.svg" alt="Esquema de la interfaz: mapa a pantalla completa, barra superior con avisos activos, panel de capas y línea de tiempo del radar" width="100%">
</p>

| | |
|---|---|
| 🌧️ **Radar de lluvia animado** | Las últimas 2 horas más predicción. Le das al play y **ves si la tormenta viene hacia ti o se aleja** |
| ⚠️ **Avisos oficiales de AEMET** | Las zonas de aviso dibujadas por gravedad: amarillo, naranja, rojo |
| 📡 **~800 estaciones** | Toda la red de AEMET, coloreada por intensidad de lluvia según su escala oficial |
| 🌊 **Ríos y embalses** | El SAIH de todas las confederaciones hidrográficas |
| 🌍 **Terremotos** | Sismos recientes de la red nacional |
| 🚨 **Aviso por proximidad** | Si entras en zona de peligro: sirena, notificación y qué hacer exactamente |

**Tu ubicación nunca sale de tu dispositivo.** El cálculo de qué te afecta se hace en
tu propio móvil, no en un servidor. No hay cuentas, ni registro, ni rastreo.

---

## Cómo se usa

1. Abres la web y ves España con el radar en marcha.
2. **▶ abajo** reproduce la animación. La marca amarilla separa lo observado de la
   predicción.
3. **☰ Capas** enciende y apaga radar, avisos, estaciones, ríos, embalses y sismos.
4. **📍 Vigilar mi zona** activa el aviso automático (pide ubicación y notificaciones).
5. Tocas cualquier punto y ves su detalle.

Se puede **instalar como app**: en el navegador, "Añadir a pantalla de inicio".

---

## De dónde salen los datos

<p align="center">
  <img src="docs/img/flujo-datos.svg" alt="Flujo de datos: de las fuentes oficiales al aviso en tu móvil" width="100%">
</p>

| Capa | Fuente | Actualización | Estado |
|---|---|---|---|
| Radar de lluvia animado | [RainViewer](https://www.rainviewer.com/) | ~10 min | ✅ integrado |
| Avisos meteorológicos (CAP) | [AEMET OpenData](https://opendata.aemet.es) | ~5 min | ✅ integrado |
| Estaciones (lluvia, viento, temperatura) | AEMET OpenData | ~10 min | ✅ integrado |
| Ríos, embalses y pluviometría | [SAIH / MITECO](https://www.miteco.gob.es/es/cartografia-y-sig/ide/descargas/agua/saih.html) | en vivo (WMS) | ⚠️ visual, sin verificar en producción |
| Terremotos | [EMSC](https://www.seismicportal.eu) (incluye red del IGN) | ~2 min | ✅ integrado |
| Mapa base | [CARTO](https://carto.com/attributions) + [OpenStreetMap](https://www.openstreetmap.org/copyright) | — | ✅ integrado |

### Detección propia de riesgo de riada

Además de los avisos oficiales, la app calcula el suyo desde las estaciones cercanas:

<p align="center">
  <img src="docs/img/riada.svg" alt="Cómo se decide el aviso propio de riada" width="100%">
</p>

**El caso amarillo es el que mata.** La gente ve que ha escampado, se confía y sale
—mientras el agua sigue bajando desde la cabecera del río. Por eso avisamos aunque
en ese momento ya no llueva fuerte.

---

## Instalación

### Requisitos

- [Node.js 20 o superior](https://nodejs.org)
- Una clave gratuita de AEMET

### Paso 1 — Clave de AEMET

Sin esto no hay datos de lluvia. Es gratis y tarda 5 minutos:

1. Entra en https://opendata.aemet.es/centrodedescargas/altaUsuario
2. Pon tu email → confirmas desde el primer correo → **llega un segundo correo con
   la clave** (una cadena larguísima; cópiala entera).

> **⚠️ Las claves de AEMET caducan a los 3 meses.** Antes eran indefinidas, pero
> AEMET cambió la política: ahora duran 90 días, y desde el **15 de octubre de 2026**
> las antiguas sin caducidad dejan de funcionar (error 401). Renovarla es repetir el
> mismo trámite.
>
> El proyecto avisa 14 días antes, falla ruidosamente si caduca en vez de publicar un
> mapa vacío, y la app enseña un aviso si los datos se quedan atrás. Ver
> [Cómo falla, a propósito](#cómo-falla-a-propósito).

### Paso 2 — Arrancar

```bash
git clone https://github.com/ShadowVMX/Spain-Alert.git
cd Spain-Alert

npm run install:all                    # instala server + web

cp server/.env.example server/.env     # y pega dentro tu AEMET_API_KEY

npm run build
npm start                              # -> http://localhost:8787
```

Un solo proceso sirve el mapa y la API.

### Para desarrollar

```bash
npm run dev:server     # terminal 1 -> API en :8787
npm run dev:web        # terminal 2 -> web en :5173 (recarga automática)
```

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run install:all` | Instala dependencias de `server/` y `web/` |
| `npm run build` | Construye la web y compila el servidor |
| `npm start` | Arranca la app completa |
| `npm run dev:server` | Servidor con recarga automática |
| `npm run dev:web` | Web con recarga automática |
| `npm run typecheck` | Comprueba tipos en todo el proyecto |
| `npm --prefix server run generar-datos` | Descarga los datos como archivos estáticos |

---

## Publicar la app

### Opción A — GitHub Pages (gratis) ⭐

GitHub Pages solo sirve archivos estáticos y no puede ejecutar Node. La solución:
**GitHub Actions hace de servidor por lotes**. Cada 10 minutos descarga los datos con
la clave guardada como *secret*, los deja como JSON y publica la web. La clave nunca
llega al navegador.

<p align="center">
  <img src="docs/img/despliegue.svg" alt="Ciclo de publicación en GitHub Pages" width="100%">
</p>

**⚠️ El repositorio tiene que ser público:**

| | Repo público | Repo privado (plan Free) |
|---|---|---|
| GitHub Actions | gratis e ilimitado | 2.000 min/mes, después se paga |
| GitHub Pages | gratis | ❌ no disponible |

Con el cron cada 10 min son ~8.600 min/mes: en público **0 €**; en privado rondaría
los **50 $/mes**, y ni siquiera tendrías Pages sin GitHub Pro.

**Pasos**, todo desde github.com:

1. **Repo público** → `Settings` → abajo, `Danger Zone` → `Change repository
   visibility` → `Public`.
2. **Guardar la clave** → `Settings` → `Secrets and variables` → `Actions` → `New
   repository secret`. Name: `AEMET_API_KEY`. Secret: tu clave.
3. **Activar Pages** → `Settings` → `Pages` → en `Source`, elegir **GitHub Actions**.
4. **Desplegar** → pestaña `Actions` → `Publicar en GitHub Pages` → `Run workflow`.

En 2-3 minutos estará en `https://<tu-usuario>.github.io/Spain-Alert/`.

**Limitaciones de este modo:**

- Refresco cada ~10 min, y **GitHub puede retrasar** los cron cuando va cargado. No
  es tiempo real garantizado.
- No hay notificaciones con la app cerrada (eso necesita servidor).
- El detalle al tocar una capa del SAIH no funciona sin servidor (CORS); las capas sí
  se ven.
- GitHub desactiva los cron si el repo pasa 60 días sin actividad.

### Opción B — Servidor propio (datos en vivo)

El salto cuando la app se use en serio. Hay un `Dockerfile` que empaqueta web + API
en un servicio; vale para Render, Railway, Fly.io o un VPS.

```bash
docker build -t alerta-espana .
docker run -p 8787:8787 -e AEMET_API_KEY=tu_clave alerta-espana
```

> **Para móvil:** la geolocalización y las notificaciones **solo funcionan bajo
> HTTPS** (o en `localhost`). Esos hostings dan HTTPS automático.

---

## Arquitectura

```
server/                    Node + Express (TypeScript)
  src/lib/aemet.ts           avisos CAP + estaciones, con detección de clave caducada
  src/lib/saih.ts            capas WMS de ríos y embalses
  src/lib/earthquakes.ts     sismos vía EMSC
  src/lib/rain.ts            escala oficial de intensidad de AEMET
  src/lib/alertEngine.ts     motor de alertas (para las futuras push)
  src/scripts/               generador de datos estáticos para Pages

web/                       Vite + React + Leaflet
  src/alertEngine.ts         ⭐ cálculo de alertas EN EL NAVEGADOR
  src/components/            mapa, radar, panel, avisos
  src/hooks/                 datos, geolocalización, frames del radar

.github/workflows/         descarga datos y publica en Pages
```

La app funciona en **dos modos con el mismo código**, elegidos al compilar con
`VITE_DATA_MODE`:

- **estático** → los datos son archivos JSON generados por Actions (Pages).
- **api** → el backend los sirve en vivo (Docker).

En ambos casos la clave de AEMET vive solo en el servidor o el runner.

**Las alertas se calculan en el cliente** (`web/src/alertEngine.ts`). Además de
permitir el modo sin servidor, esto significa que la ubicación del usuario no se
envía a ninguna parte.

---

## Cómo falla (a propósito)

En una app de avisos, **unos datos viejos son más peligrosos que no tener datos**: un
mapa en calma hace creer que no hay peligro. Por eso:

| Situación | Qué hace |
|---|---|
| Falla una fuente secundaria (sismos, SAIH) | Publica igual: mejor un mapa con la lluvia que ningún mapa |
| Falla **toda** la información de lluvia | Aborta el despliegue. Pages mantiene lo último bueno y GitHub avisa por email |
| La clave de AEMET caduca | Aborta siempre, con el mensaje de cómo renovarla |
| Quedan menos de 14 días de clave | Aviso destacado en el resumen del workflow |
| Los datos llevan +40 min sin actualizarse | La app muestra una tira de aviso; en rojo pasadas 3 h |
| No se sabe dónde va una capa en el mapa | **No se dibuja.** Nunca se inventan coordenadas |

---

## Qué está probado y qué no

**Verificado:**

- ✅ Todo compila; el servidor sirve mapa y API en un solo puerto.
- ✅ El motor de alertas, en navegador real con geolocalización simulada: en Valencia
  con aviso rojo y 78 mm/h **salta la alerta**; en Madrid sin lluvia **no salta nada**.
- ✅ La detección de clave caducada: avisa a 14 días, aborta si la clave no vale.
- ✅ Las fuentes reales responden: AEMET devuelve avisos y estaciones con una clave
  válida, y EMSC unos 200 terremotos por consulta.

**Rendimiento en móvil**, medido con 800 estaciones (88 de ellas con marcador
animado) en un viewport de 390×844 y la CPU frenada para aproximar equipos reales:

| CPU | fps al hacer zoom | respuesta al toque |
|---|---|---|
| 1x (escritorio) | 60 | 16 ms |
| 4x más lenta (gama media) | 56 | 8 ms |
| 6x más lenta (gama baja) | 54 | 14 ms |

Apenas baja porque el mapa no está limitado por CPU: Leaflet mueve las capas con
transformaciones CSS, que van por GPU. El freno de CPU está verificado aparte con una
carga de cálculo puro (89 ms → 330 ms → 539 ms, proporcional al factor aplicado).

Dos salvedades honestas: frenar la CPU **no** simula una GPU más débil ni menos
memoria, así que esto es un indicio y no una prueba sobre un móvil de gama baja real;
y una medición anterior de "~56 fps" se hizo con 804 estaciones cuando el despliegue
real llegó a tener 10.657, de modo que no describía lo que estaba publicado. Ese
recuento ya está corregido.

**Pendiente:**

- ❌ **El SAIH no carga.** `wms.mapama.gob.es` responde con
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE`: le falta el certificado intermedio en la cadena
  TLS. Los navegadores lo resuelven solos buscándolo por su cuenta; Node no. Está por
  ver si las teselas se ven igualmente en el navegador aunque el servidor no pueda
  leer el nombre de la capa.
- ⚠️ **El radar y el mapa base** (RainViewer, CARTO) no se han podido comprobar
  todavía sobre datos reales: el entorno de desarrollo bloquea la salida a esos
  servidores, así que solo se verán en el despliegue.
- ⚠️ **Los avisos CAP** se han probado con datos sintéticos. En el primer despliegue
  real España no tenía ningún aviso activo, así que el parseo del formato oficial
  todavía no se ha visto funcionar con un aviso de verdad.

---

## Contribuir

**Este proyecto necesita gente.** Y no solo programadores.

| Puedes... | ¿Hace falta programar? |
|---|---|
| 🐛 [Reportar un fallo](../../issues/new?template=01-bug.yml) | No |
| 💡 [Proponer una mejora](../../issues/new?template=02-idea.yml) | No |
| 🌊 [Aportar una fuente de datos](../../issues/new?template=03-fuente-datos.yml) | No |
| 📖 Mejorar los textos de autoprotección | No |
| 💻 Enviar código | Sí |

**Lo más valioso ahora mismo son las fuentes de datos.** Es el cuello de botella
real: la información está repartida entre AEMET, nueve confederaciones
hidrográficas, el IGN, las CCAA y los ayuntamientos, sin catálogo común. Si trabajas
en alguno de esos organismos o conoces un portal con datos en tiempo real,
[cuéntanoslo](../../issues/new?template=03-fuente-datos.yml).

También vale el **conocimiento local**: qué barranco de tu pueblo se desborda
siempre, qué vado se corta con dos gotas. Eso no lo da ningún sensor.

📖 **Lee [CONTRIBUTING.md](CONTRIBUTING.md)** antes de enviar código. Tiene las reglas
que no se negocian (resumen: nunca inventes coordenadas, nunca falles en silencio, la
ubicación no sale del dispositivo).

---

## Roadmap

- [ ] Meter el nivel de los ríos del SAIH en el motor de alertas (señal más fiable de
      riada real que solo mirar la lluvia)
- [ ] Radar propio de AEMET, de más resolución sobre España
- [ ] Notificaciones push con la app cerrada (Service Worker + VAPID + backend)
- [ ] Empaquetar como APK con [Capacitor](https://capacitorjs.com/) o
      [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
- [ ] Incendios forestales (EFFIS/Copernicus)
- [ ] Avisos de Protección Civil de las CCAA
- [ ] Radio sísmico por intensidad real en vez de heurística por magnitud
- [ ] "Modo tras la alerta": qué hacer cuando pasa el peligro

---

## Licencia y avisos

Publicado bajo [licencia MIT](LICENSE): puedes usarlo, copiarlo y modificarlo
libremente, citando la autoría y sin garantía de ningún tipo.

Proyecto independiente. **No está gestionado ni respaldado por AEMET, el IGN, MITECO
ni Protección Civil.**

Los datos son de sus fuentes y se usan bajo sus condiciones: AEMET y MITECO exigen
citar la procedencia, y RainViewer requiere atribución visible (está en el pie de la
app). El uso gratuito de RainViewer está pensado para proyectos pequeños; si esto
creciera mucho, habría que hablar con ellos.

<p align="center">
  <strong>En una emergencia real, sigue las indicaciones de las autoridades y llama al 112.</strong>
</p>
