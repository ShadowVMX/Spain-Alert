# Alerta España 🚨

Mapa nacional en tiempo real de riesgos naturales, con **alertas automáticas por
proximidad**: si detecta que un fenómeno peligroso se acerca a tu ubicación, te
avisa al instante con instrucciones de autoprotección específicas.

**Foco actual del proyecto: lluvia, DANA y riadas** (es la causa de muerte evitable
más frecuente en España por fenómeno natural — de ahí la prioridad). Terremotos
tiene una integración básica ya funcionando; viento se apoya en los mismos avisos
AEMET que la lluvia. Ampliar viento y terremotos con más detalle queda para más
adelante, cuando lluvia esté lo más completa posible.

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

| Capa | Fuente | Qué da | Frecuencia | Estado |
|---|---|---|---|---|
| Estaciones de lluvia y viento | [AEMET OpenData](https://opendata.aemet.es) — red de ~800 estaciones automáticas | precipitación (última hora + acumulado 3h + tendencia), intensidad según escala oficial AEMET, viento, racha, temperatura | ~10 min | ✅ integración estándar y bien documentada |
| Avisos meteorológicos (DANA, lluvia torrencial, viento, costero, nieve, tormentas) | AEMET OpenData — avisos CAP oficiales | polígonos de zona afectada + severidad (amarillo/naranja/rojo) | ~5 min | ✅ integración estándar y bien documentada |
| Ríos, embalses y pluviometría SAIH (**todas** las cuencas de España) | [MITECO — SAIH nacional (WMS)](https://www.miteco.gob.es/es/cartografia-y-sig/ide/descargas/agua/saih.html) | capa oficial visual (caudal/nivel de ríos, nivel/volumen de embalses, pluviometría) + detalle al hacer click | vivo (WMS) | ⚠️ capa visual añadida; **sin verificar en vivo** (ver nota abajo). No forma parte todavía del motor automático de alertas |
| Terremotos | [EMSC](https://www.seismicportal.eu) (agrega la Red Sísmica Nacional del IGN) | magnitud, profundidad, epicentro, en tiempo casi real | ~2 min | ✅ integración básica funcionando |
| Riesgo de riada repentina (heurística propia) | Cálculo propio sobre las estaciones AEMET | 3 niveles: lluvia torrencial (rojo), muy fuerte con tendencia (naranja), terreno saturado por acumulado de 3h aunque ya no llueva tan fuerte (amarillo) | en cada comprobación | ✅ |

### Cómo funciona la alerta por proximidad

1. El usuario pulsa "Activar alertas por mi ubicación" (pide permiso de geolocalización y de notificaciones).
2. El navegador manda su posición cada vez que cambia; la app pregunta a
   `/api/alerts/nearby?lat=&lon=` cada 60 segundos.
3. El backend comprueba:
   - si el punto cae dentro de algún **polígono de aviso activo** (point-in-polygon),
   - si hay un **terremoto reciente** a menos de un radio calculado según su magnitud,
   - si hay **estaciones cercanas con lluvia intensa o terreno saturado** (posible riada repentina, en 3 niveles de severidad).
4. Si hay coincidencia nueva: suena una sirena, salta una notificación del navegador
   y aparece una tarjeta a pantalla completa con instrucciones de autoprotección
   específicas (evacuar, no cruzar vados, protegerse de un terremoto, etc.).

> Las capas de SAIH (ríos/embalses/pluviometría) se ven en el mapa y se pueden
> consultar tocándolas, pero **no** disparan todavía alertas automáticas: primero
> hay que confirmar en un despliegue real que el formato de respuesta es el
> esperado (ver nota de verificación más abajo).

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
> código bloquea las conexiones salientes a `opendata.aemet.es`, `seismicportal.eu`
> y `wms.mapama.gob.es`, así que ninguna llamada real se ha podido probar en vivo
> aquí (se ha comprobado que el servidor arranca, sirve `/api/health` y devuelve
> errores controlados en todos los casos, incluidos los del SAIH). En tu máquina o
> en un hosting normal:
> - **AEMET y EMSC** son APIs REST estándar y bien documentadas — deberían funcionar
>   sin cambios en cuanto pongas la API key de AEMET.
> - **El WMS nacional del SAIH** (`server/src/lib/saih.ts`) se ha construido a partir
>   de búsquedas (URLs confirmadas: `wms.mapama.gob.es/sig/agua/saih/{rios,embalses,pluviometria}`,
>   WMS 1.3.0 perfil INSPIRE) pero no de documentación oficial verificada línea a
>   línea, así que **es lo primero que hay que comprobar al desplegar**: abre el
>   mapa, activa esas capas y mira si aparece algo. Si no carga nada, lo más
>   probable es que `GetCapabilities` devuelva un formato de `<Layer>` distinto al
>   que espera `discoverLayerName()` — es un único punto de fallo fácil de depurar
>   con las herramientas de red del navegador.

## Roadmap (lo iremos añadiendo "uno a uno")

- **Verificar y explotar SAIH de verdad** — ahora mismo es solo una capa visual.
  Si el WMS nacional funciona en producción, el siguiente paso natural es meter
  el nivel/caudal de los ríos en el motor de alertas (`alertEngine.ts`): es la
  señal más fiable de riada real, mejor que solo mirar lluvia. Si el WMS nacional
  no da suficiente detalle, hay que ir cuenca a cuenca (Ebro, Júcar, Duero,
  Cantábrico, Segura, Guadalquivir...), cada una con su propio sistema.
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
- **Viento y terremotos, a futuro**: por ahora se quedan como están (avisos AEMET
  de viento ya funcionan igual que los de lluvia; terremotos vía EMSC ya está
  operativo). Cuando lluvia esté a punto, lo siguiente sería: radio de terremoto
  más preciso (curvas de intensidad reales en vez de la heurística actual por
  magnitud) y una capa específica de rachas de viento con umbrales por tipo de
  vehículo/actividad.

## Aviso legal

Esta app usa fuentes públicas oficiales pero es un proyecto independiente, no
gestionado por AEMET, el IGN ni Protección Civil. En una emergencia real, sigue
siempre las indicaciones de las autoridades y llama al 112.
