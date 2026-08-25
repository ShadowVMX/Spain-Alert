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

> **Estado: código listo, todavía sin desplegar.** Esto es el repositorio, no un
> servicio en marcha: no hay ninguna URL pública que abrir. Para usarlo hay que
> ejecutarlo (en tu ordenador o en un hosting) con una clave de AEMET —
> ver [Puesta en marcha](#puesta-en-marcha), son unos minutos.

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

### Paso 0 (obligatorio): la clave de AEMET

Sin esto no hay datos de lluvia. Es gratis y tarda 5 minutos:

1. Entra en https://opendata.aemet.es/centrodedescargas/altaUsuario
2. Pon tu email → llega un correo de confirmación → confirmas → llega un
   **segundo** correo con la clave (es una cadena larguísima, se copia entera).
3. Guárdala: va en `server/.env` como `AEMET_API_KEY=...`

> La clave es personal. Nunca la subas a GitHub — `.env` ya está en `.gitignore`.

### Opción A — verlo funcionando en tu ordenador (lo más rápido)

Necesitas [Node.js 20 o superior](https://nodejs.org). Desde la raíz del repo:

```bash
npm run install:all          # instala todo (server + web)

cp server/.env.example server/.env
# edita server/.env y pega tu AEMET_API_KEY

npm run build                # construye la web y el servidor
npm start                    # -> http://localhost:8787
```

Abre `http://localhost:8787` y ya está: un único proceso sirve el mapa y la API.

¿Vas a tocar el código? Entonces mejor modo desarrollo, con recarga automática,
en dos terminales:

```bash
npm run dev:server           # terminal 1
npm run dev:web              # terminal 2 -> http://localhost:5173
```

### Opción B — ponerlo online para que lo use cualquiera

El repo incluye un `Dockerfile` que empaqueta web + API en un solo servicio, así
que vale casi cualquier hosting (Render, Railway, Fly.io, un VPS...). Lo único
que tiene que configurar el hosting es:

- la variable de entorno **`AEMET_API_KEY`** con tu clave,
- el puerto, que se lee de **`PORT`** (la mayoría de hostings lo inyectan solos).

```bash
docker build -t alerta-espana .
docker run -p 8787:8787 -e AEMET_API_KEY=tu_clave alerta-espana
```

**Importante para móvil:** la geolocalización y las notificaciones **solo
funcionan bajo HTTPS** (o en `localhost`). Cualquiera de esos hostings te da
HTTPS automático; si montas un VPS a mano, necesitas un certificado
(Caddy o Let's Encrypt lo resuelven en un comando).

### Qué está probado y qué no

Lo verificado hasta ahora: que todo compila, que el servidor arranca, que sirve
el mapa y la API en un solo puerto, y que cuando una fuente externa falla
devuelve un error controlado en vez de caerse.

Lo **no** verificado: las llamadas reales a las fuentes de datos. El entorno
donde se escribió este código bloquea las conexiones salientes a
`opendata.aemet.es`, `seismicportal.eu` y `wms.mapama.gob.es`, así que la primera
vez que este proyecto hable de verdad con AEMET será en tu despliegue. Concretando:
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
