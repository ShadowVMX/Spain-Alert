# Alerta España 🚨

Mapa nacional en tiempo real de riesgos naturales — lluvia, viento, DANA, riadas y
terremotos — con **alertas automáticas por proximidad**: si detecta que un fenómeno
peligroso se acerca a tu ubicación, te avisa al instante con instrucciones de
autoprotección específicas para ese tipo de desastre.

No sustituye a Protección Civil ni a los canales oficiales de emergencias (112):
es una capa adicional, más rápida y más visual, pensada para que nadie se quede sin
enterarse a tiempo.

## Arquitectura

```
server/   API en Node/Express (TypeScript) — agrega y normaliza datos oficiales
web/      App web (Vite + React + Leaflet) — mapa, capas y alertas por geolocalización
```

El frontend nunca llama directamente a AEMET/EMSC: todo pasa por el backend, que
guarda la API key de AEMET a salvo, cachea las respuestas (para no agotar el límite
de peticiones gratuito) y normaliza todo a GeoJSON con un formato común.

### Fuentes de datos integradas ahora mismo

| Capa | Fuente | Qué da | Frecuencia |
|---|---|---|---|
| Estaciones de lluvia y viento | [AEMET OpenData](https://opendata.aemet.es) — red de ~800 estaciones automáticas | precipitación, viento, racha, temperatura por estación, toda España | ~10 min |
| Avisos meteorológicos (DANA, lluvia torrencial, viento, costero, nieve, tormentas) | AEMET OpenData — avisos CAP oficiales | polígonos de zona afectada + severidad (amarillo/naranja/rojo) | ~5 min |
| Terremotos | [EMSC](https://www.seismicportal.eu) (agrega la Red Sísmica Nacional del IGN) | magnitud, profundidad, epicentro, en tiempo casi real | ~2 min |
| Riesgo de riada repentina (heurística propia) | Cálculo propio sobre las estaciones AEMET | avisa de lluvia torrencial muy localizada aunque AEMET aún no haya emitido aviso oficial | en cada comprobación |

### Cómo funciona la alerta por proximidad

1. El usuario pulsa "Activar alertas por mi ubicación" (pide permiso de geolocalización y de notificaciones).
2. El navegador manda su posición cada vez que cambia; la app pregunta a
   `/api/alerts/nearby?lat=&lon=` cada 60 segundos.
3. El backend comprueba:
   - si el punto cae dentro de algún **polígono de aviso activo** (point-in-polygon),
   - si hay un **terremoto reciente** a menos de un radio calculado según su magnitud,
   - si hay **estaciones cercanas con lluvia muy intensa** (posible riada repentina).
4. Si hay coincidencia nueva: suena una sirena, salta una notificación del navegador
   y aparece una tarjeta a pantalla completa con instrucciones de autoprotección
   específicas (evacuar, no cruzar vados, protegerse de un terremoto, etc.).

## Puesta en marcha

### 1. Backend

```bash
cd server
cp .env.example .env
# Rellena AEMET_API_KEY (gratis, la manda por email):
# https://opendata.aemet.es/centrodedescargas/altaUsuario
npm install
npm run dev       # http://localhost:8787
```

### 2. Frontend

```bash
cd web
npm install
npm run dev        # http://localhost:5173, proxy automático a /api -> :8787
```

Abre `http://localhost:5173`. En local, las notificaciones del navegador y el audio
funcionan directamente; para producción sirve el frontend por HTTPS (necesario para
geolocalización y notificaciones en móvil).

> **Nota sobre esta sandbox de desarrollo:** el entorno donde se ha escrito este
> código bloquea las conexiones salientes a `opendata.aemet.es` y
> `seismicportal.eu`, así que las llamadas reales no se han podido probar en vivo
> aquí (se ha comprobado que el servidor arranca, sirve `/api/health` y devuelve
> errores controlados). En tu máquina o en un hosting normal, con la API key de
> AEMET puesta, deberían funcionar sin cambios — pero conviene probarlo en cuanto
> lo despliegues y avisar si algún endpoint de AEMET/EMSC hubiera cambiado de forma.

## Roadmap (lo iremos añadiendo "uno a uno")

- **SAIH por cuenca (caudal de ríos, nivel de embalses)** — es la pieza que más
  ayuda contra riadas, pero cada Confederación Hidrográfica (Ebro, Júcar, Duero,
  Cantábrico, Segura, Guadalquivir...) tiene su propio sistema, sin API unificada.
  Hay que integrarlas una a una. La estructura ya está lista: basta con crear un
  cliente en `server/src/lib/` que devuelva un `GeoFeatureCollection` igual que
  `aemet.ts`, y sumarlo en `alertEngine.ts`.
- **Notificaciones push reales (con la app cerrada)** — ahora mismo la
  notificación solo salta si la pestaña sigue abierta. Para avisar con el móvil
  bloqueado hace falta un Service Worker con Push API + claves VAPID y guardar
  las suscripciones de cada usuario en el backend.
- **App instalable (PWA) → APK** — ya está el `manifest.webmanifest` y el
  `sw.js` mínimo para que se pueda "Añadir a pantalla de inicio". Para la APK,
  el camino más rápido es envolver esta misma web con
  [Capacitor](https://capacitorjs.com/) o generar una Trusted Web Activity con
  [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) — no hace falta
  reescribir nada del mapa ni de la lógica de alertas.
- **Incendios forestales** (EFFIS/Copernicus) y **alertas de Protección Civil**
  (RSS/CAP de las CCAA, cuando lo publiquen) como capas adicionales.
- **Historial y "modo tras la alerta"**: qué hacer cuando pasa el peligro,
  puntos de encuentro, contacto con 112.

## Aviso legal

Esta app usa fuentes públicas oficiales pero es un proyecto independiente, no
gestionado por AEMET, el IGN ni Protección Civil. En una emergencia real, sigue
siempre las indicaciones de las autoridades y llama al 112.
