# 🚨 Alerta España

**Mapa nacional de riesgos naturales en tiempo real, con alertas automáticas por
proximidad.** Si un fenómeno peligroso se acerca a donde estás, la app te avisa al
instante con instrucciones concretas de qué hacer.

El foco es **la lluvia**: DANAs, lluvias torrenciales y riadas. Es el fenómeno
natural que más muertes evitables causa en España, y la mayoría ocurren por no
saber a tiempo que el agua venía.

> No sustituye a Protección Civil ni al 112. Es una capa adicional, más rápida y
> más visual, para que nadie se quede sin enterarse.

---

## Qué hace

- **Radar de lluvia animado** sobre el mapa: las últimas 2 horas más una predicción
  a corto plazo. Le das al play y ves la tormenta moverse, así que sabes si viene
  hacia ti o se aleja.
- **Avisos oficiales de AEMET** dibujados como zonas de colores según su gravedad
  (amarillo / naranja / rojo).
- **~800 estaciones de medición** en toda España, coloreadas por intensidad de
  lluvia según la escala oficial de AEMET.
- **Ríos y embalses (SAIH)** de todas las confederaciones hidrográficas.
- **Terremotos recientes** de la red sísmica.
- **Alerta por proximidad**: activas tu ubicación y, si entras en zona de aviso o
  se detecta lluvia peligrosa cerca, salta una sirena, una notificación y una
  ficha a pantalla completa con las instrucciones de autoprotección.

**Tu ubicación nunca sale de tu dispositivo.** El cálculo de qué te afecta se hace
en tu propio móvil, no en un servidor.

---

## Cómo se usa

1. Abres la web. Ves el mapa de España con el radar en marcha.
2. **▶ en la barra inferior**: reproduce la animación del radar. La marca amarilla
   de la barra separa lo ya observado de la predicción.
3. **☰ Capas** (arriba a la derecha): enciendes y apagas radar, avisos, estaciones,
   ríos, embalses y terremotos. También ajustas la opacidad del radar.
4. **📍 Vigilar mi zona**: da permiso de ubicación y notificaciones. A partir de ahí
   la app comprueba tu entorno cada vez que te mueves y cada pocos minutos.
5. Tocando cualquier punto del mapa se abre su detalle (lluvia acumulada, viento,
   temperatura, magnitud del sismo, etc.).

Se puede **instalar como app** en el móvil: en el navegador, "Añadir a pantalla de
inicio".

---

## De dónde salen los datos

| Capa | Fuente | Actualización | Estado |
|---|---|---|---|
| Radar de lluvia animado | [RainViewer](https://www.rainviewer.com/) | ~10 min | ✅ integrado |
| Avisos meteorológicos (CAP) | [AEMET OpenData](https://opendata.aemet.es) | ~5 min | ✅ integrado |
| Estaciones (lluvia, viento, temperatura) | AEMET OpenData | ~10 min | ✅ integrado |
| Ríos, embalses y pluviometría | [SAIH / MITECO](https://www.miteco.gob.es/es/cartografia-y-sig/ide/descargas/agua/saih.html) (todas las cuencas) | en vivo (WMS) | ⚠️ capa visual, sin verificar en producción |
| Terremotos | [EMSC](https://www.seismicportal.eu) (incluye la red del IGN) | ~2 min | ✅ integrado |
| Mapa base | [CARTO](https://carto.com/attributions) + [OpenStreetMap](https://www.openstreetmap.org/copyright) | — | ✅ integrado |

### Detección propia de riesgo de riada

Además de los avisos oficiales, la app calcula su propio aviso a partir de las
estaciones cercanas, en tres niveles:

| Nivel | Cuándo salta | Por qué importa |
|---|---|---|
| 🔴 Rojo | Lluvia torrencial cerca (>60 mm/h) | Riada repentina posible en minutos |
| 🟠 Naranja | Lluvia muy fuerte (>30 mm/h), y avisa si además va a más | Da margen antes del aviso oficial |
| 🟡 Amarillo | Más de 60 mm acumulados en 3 h | El terreno está saturado: los ríos siguen subiendo **aunque ya no llueva fuerte** |

Ese último caso es el que mata en las riadas: la gente ve que ha escampado y se
confía, mientras el agua sigue bajando desde la cabecera.

---

## Instalación

### Requisitos

- [Node.js 20 o superior](https://nodejs.org)
- Una clave gratuita de AEMET (ver abajo)

### Paso 1 — Clave de AEMET

Sin esto no hay datos de lluvia. Es gratis y tarda 5 minutos:

1. Entra en https://opendata.aemet.es/centrodedescargas/altaUsuario
2. Pon tu email → llega un correo de confirmación → confirmas → llega un **segundo**
   correo con la clave (una cadena larguísima; se copia entera).

> **⚠️ Las claves de AEMET caducan a los 3 meses.** Antes eran indefinidas, pero
> AEMET cambió la política: ahora duran 90 días, y desde el **15 de octubre de 2026**
> las antiguas sin fecha de caducidad dejan de funcionar (error 401). Renovarla es
> repetir el mismo trámite.
>
> El proyecto está preparado para que eso no te pille por sorpresa: avisa 14 días
> antes, falla ruidosamente si caduca (en vez de publicar un mapa vacío) y la propia
> app enseña un aviso si los datos se quedan atrás. Ver
> [Cómo falla](#cómo-falla-a-propósito).

### Paso 2 — Instalar y arrancar

```bash
git clone https://github.com/ShadowVMX/Spain-Alert.git
cd Spain-Alert

npm run install:all                    # instala server + web

cp server/.env.example server/.env     # y pega dentro tu AEMET_API_KEY

npm run build                          # construye web y servidor
npm start                              # -> http://localhost:8787
```

Un solo proceso sirve el mapa y la API.

### Para desarrollar (con recarga automática)

```bash
npm run dev:server     # terminal 1 -> API en :8787
npm run dev:web        # terminal 2 -> web en :5173
```

### Comandos disponibles

| Comando | Qué hace |
|---|---|
| `npm run install:all` | Instala las dependencias de `server/` y `web/` |
| `npm run build` | Construye la web y compila el servidor |
| `npm start` | Arranca la app completa (web + API) |
| `npm run dev:server` | Servidor en modo desarrollo |
| `npm run dev:web` | Web en modo desarrollo |
| `npm run typecheck` | Comprueba tipos en todo el proyecto |
| `npm --prefix server run generar-datos` | Descarga los datos como archivos estáticos |

---

## Publicar la app

### Opción A — GitHub Pages (gratis, recomendada)

GitHub Pages solo sirve archivos estáticos y no puede ejecutar el servidor Node.
La solución: **GitHub Actions hace de servidor por lotes**. Cada 10 minutos descarga
los datos con la clave guardada como *secret*, los deja como archivos JSON y publica
la web. La clave nunca llega al navegador.

**⚠️ El repositorio tiene que ser público:**

| | Repo público | Repo privado (plan Free) |
|---|---|---|
| GitHub Actions | gratis e ilimitado | 2.000 min/mes, después se paga |
| GitHub Pages | gratis | ❌ no disponible |

Con el cron cada 10 min son unos 8.600 min/mes: en público **0 €**; en privado
rondaría los **50 $/mes**, y ni siquiera tendrías Pages sin GitHub Pro.

Pasos, todo desde la web de GitHub:

1. **Hacer el repo público** → `Settings` → abajo del todo, `Danger Zone` →
   `Change repository visibility` → `Public`.
2. **Guardar la clave** → `Settings` → `Secrets and variables` → `Actions` →
   `New repository secret`. Name: `AEMET_API_KEY`. Secret: tu clave.
3. **Activar Pages** → `Settings` → `Pages` → en `Source`, elegir **GitHub Actions**.
4. **Primer despliegue** → pestaña `Actions` → `Publicar en GitHub Pages` →
   `Run workflow`.

En 2-3 minutos estará en `https://<tu-usuario>.github.io/Spain-Alert/`, y a partir
de ahí se actualiza solo.

**Limitaciones de este modo**, que conviene tener claras:

- Los datos se refrescan cada ~10 min y **GitHub puede retrasar** las ejecuciones
  programadas cuando va cargado. No es tiempo real garantizado.
- No hay notificaciones con la app cerrada (eso necesita servidor).
- El detalle al tocar una capa del SAIH no funciona sin servidor (lo bloquea CORS);
  las capas sí se ven.
- GitHub desactiva los cron si el repo pasa 60 días sin actividad.

### Opción B — Servidor propio (datos en vivo)

Es el salto cuando la app se use en serio. Hay un `Dockerfile` que empaqueta web +
API en un solo servicio; vale para Render, Railway, Fly.io o un VPS.

```bash
docker build -t alerta-espana .
docker run -p 8787:8787 -e AEMET_API_KEY=tu_clave alerta-espana
```

Solo hay que configurar `AEMET_API_KEY` y, si el hosting lo pide, `PORT`.

> **Importante para móvil:** la geolocalización y las notificaciones **solo funcionan
> bajo HTTPS** (o en `localhost`). Los hostings citados dan HTTPS automático.

---

## Arquitectura

```
server/    Node + Express (TypeScript) — descarga y normaliza los datos oficiales
  src/lib/         clientes de AEMET, EMSC y SAIH + motor de alertas de servidor
  src/scripts/     generador de datos estáticos para el despliegue en Pages
web/       Vite + React + Leaflet — el mapa y toda la interfaz
  src/alertEngine.ts   cálculo de alertas EN EL NAVEGADOR
.github/   workflow que descarga datos y publica en Pages
```

La app funciona en **dos modos con el mismo código**, elegidos al compilar con
`VITE_DATA_MODE`:

- **estático** → los datos son archivos JSON generados por Actions (GitHub Pages).
- **api** → el backend los sirve en vivo (despliegue con Docker).

En ambos casos la clave de AEMET vive solo en el servidor o el runner, nunca en el
navegador.

**Las alertas se calculan en el cliente** (`web/src/alertEngine.ts`). Además de
permitir el modo sin servidor, esto significa que la ubicación del usuario no se
envía a ninguna parte.

### Cómo funciona la alerta por proximidad

1. El navegador vigila la posición con `watchPosition`.
2. Con cada cambio de posición o de datos se recalcula localmente:
   - si el punto cae dentro de algún **polígono de aviso activo**,
   - si hay un **terremoto reciente** dentro de un radio según su magnitud,
   - si hay **estaciones cercanas con lluvia intensa o terreno saturado**.
3. Si aparece algo nuevo: sirena, notificación del navegador y ficha a pantalla
   completa con instrucciones para ese fenómeno concreto.

---

## Cómo falla (a propósito)

En una app de avisos, **unos datos viejos son más peligrosos que no tener datos**:
un mapa en calma hace creer que no hay peligro. Por eso:

- Si falla una fuente secundaria (terremotos, SAIH), se publica igual: mejor un mapa
  con los avisos de lluvia que ningún mapa.
- Si falla **toda** la información de lluvia, el despliegue se aborta. Al no
  publicarse nada, Pages mantiene la última versión buena y GitHub avisa por email.
- Si la clave de AEMET caduca o es inválida, se aborta siempre, con el mensaje de
  qué hacer para renovarla.
- El descargador lee la fecha de caducidad de la propia clave y avisa cuando quedan
  menos de 14 días.
- La app muestra una tira de aviso si los datos llevan más de 40 minutos sin
  actualizarse, y en rojo pasadas 3 horas, remitiendo a los avisos oficiales.

---

## Qué está probado y qué no

**Verificado:**

- Todo compila y el servidor arranca sirviendo mapa y API en un solo puerto.
- El motor de alertas, en un navegador real con geolocalización simulada: en
  Valencia con aviso rojo y 78 mm/h salta la alerta con sus instrucciones; en Madrid
  sin lluvia no salta nada (sin falsas alarmas).
- La interfaz con 800 estaciones: ~56 fps haciendo zoom, sin errores de JavaScript y
  sin desbordes en móvil (390 px).
- La detección de clave caducada: avisa a 14 días, aborta con código de error si la
  clave no vale.

**No verificado todavía:** las llamadas reales a las fuentes. El entorno donde se
escribió este código bloquea la salida a `opendata.aemet.es`, `seismicportal.eu`,
`wms.mapama.gob.es`, `rainviewer.com` y los servidores de mapas, así que la primera
vez que hable de verdad con AEMET será en tu despliegue. AEMET, EMSC y RainViewer
son APIs estándar y documentadas; **el WMS del SAIH es el más incierto** y es lo
primero que conviene mirar al desplegar.

---

## Roadmap

- [ ] Meter el nivel de los ríos del SAIH en el motor de alertas (es la señal más
      fiable de riada real, mejor que solo mirar la lluvia).
- [ ] Notificaciones push con la app cerrada (Service Worker + VAPID + backend).
- [ ] Empaquetar como APK con [Capacitor](https://capacitorjs.com/) o
      [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap): la web ya está
      lista, no hay que reescribir el mapa ni las alertas.
- [ ] Incendios forestales (EFFIS/Copernicus).
- [ ] Avisos de Protección Civil de las CCAA.
- [ ] Radar de más resolución para España usando el propio radar de AEMET.
- [ ] Viento y terremotos con más detalle: radio sísmico basado en intensidad real
      en lugar de la heurística por magnitud, y umbrales de racha por tipo de
      vehículo o actividad.
- [ ] "Modo tras la alerta": qué hacer cuando pasa el peligro.

---

## Licencia y avisos

Proyecto independiente. No está gestionado ni respaldado por AEMET, el IGN, MITECO
ni Protección Civil.

Los datos son de sus respectivas fuentes y se usan bajo sus condiciones: AEMET y
MITECO exigen citar la procedencia, y RainViewer requiere atribución visible (está
en el pie de la app). El uso gratuito de RainViewer está pensado para proyectos
pequeños; si esto creciera mucho, habría que hablar con ellos.

**En una emergencia real, sigue siempre las indicaciones de las autoridades y llama
al 112.**
