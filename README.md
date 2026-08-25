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

> **Estado: código listo, pendiente de activar el despliegue.** El repositorio ya
> trae todo lo necesario para publicarse solo en GitHub Pages, pero hace falta dar
> tres clics en la configuración del repo (hacerlo público, guardar la clave de
> AEMET y activar Pages) — ver [Puesta en marcha](#puesta-en-marcha).

## Arquitectura

```
server/   Node/Express (TypeScript) — descarga y normaliza los datos oficiales
web/      App web (Vite + React + Leaflet) — mapa, capas y alertas por geolocalización
.github/  Workflow que hace de "servidor por lotes" para el despliegue en Pages
```

La app funciona en **dos modos**, con el mismo código:

- **Estático** (GitHub Pages): GitHub Actions ejecuta el descargador cada 10 min y
  deja los datos como archivos JSON. No hay servidor en marcha.
- **Con servidor** (Docker): el backend descarga los datos en vivo en cada consulta.

En ambos casos la clave de AEMET vive solo en el lado del servidor/runner y nunca
llega al navegador, y las respuestas se normalizan a GeoJSON con un formato común.

**Las alertas se calculan en el navegador** (`web/src/alertEngine.ts`), no en el
servidor. Además de permitir el modo estático, esto significa que la ubicación del
usuario nunca sale de su dispositivo.

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
3. Guárdala. Según cómo despliegues va en `server/.env` o como *secret* del repo
   (ver más abajo).

> La clave es personal. Nunca la subas a GitHub — `.env` ya está en `.gitignore`.
> Como *secret* de GitHub sí es seguro: no aparece en el código publicado y GitHub
> la censura incluso en los logs de los workflows.

### Opción A — GitHub Pages, gratis y sin servidor (recomendada)

GitHub Pages solo sirve archivos estáticos, así que no puede ejecutar el servidor
Node. La solución: **GitHub Actions hace de servidor por lotes**. Cada 10 minutos
descarga los datos de AEMET/EMSC/SAIH con la clave guardada como secret, los deja
como archivos JSON y publica la web. El navegador solo lee esos archivos.

Efecto secundario muy bueno: como no hay backend, **el cálculo de alertas se hace
en el propio dispositivo**, así que la ubicación del usuario no viaja a ningún sitio.

**⚠️ El repositorio tiene que ser público.** En el plan gratuito de GitHub:

| | Repo público | Repo privado (plan Free) |
|---|---|---|
| GitHub Actions | gratis e ilimitado | 2.000 min/mes, después se paga |
| GitHub Pages | gratis | ❌ no disponible |

Con el cron cada 10 min son unos 8.600 min/mes: en público **0 €**, en privado
rondaría los **50 $/mes** (y ni siquiera tendrías Pages sin GitHub Pro).

Pasos, todo desde la web de GitHub:

1. **Hacer el repo público**
   `Settings` → abajo del todo, `Danger Zone` → `Change visibility` → `Public`.
2. **Guardar la clave de AEMET**
   `Settings` → `Secrets and variables` → `Actions` → `New repository secret`
   - Name: `AEMET_API_KEY`
   - Secret: la clave que te mandó AEMET
3. **Activar Pages**
   `Settings` → `Pages` → en `Source` elige **GitHub Actions** (no "Deploy from a branch").
4. **Lanzar el primer despliegue**
   `Actions` → `Publicar en GitHub Pages` → `Run workflow`.

En 2-3 minutos estará en `https://shadowvmx.github.io/Spain-Alert/`, y a partir
de ahí se actualiza solo cada 10 minutos.

**Limitaciones honestas de este modo**, que conviene tener claras en una app de
seguridad:

- Los datos se refrescan cada ~10 min, y GitHub **puede retrasar** las ejecuciones
  programadas cuando sus servidores van cargados. No es un sistema de tiempo real
  garantizado. Para lluvia es aceptable (AEMET publica a ese mismo ritmo), pero si
  esto llega a usarse en serio conviene mover la descarga de datos a un servidor
  propio — el `Dockerfile` de la Opción C ya lo permite sin reescribir nada.
- No hay notificaciones con la app cerrada (eso necesita backend, está en el roadmap).
- La consulta de detalle al tocar una capa del SAIH no funciona sin backend (CORS);
  las capas sí se ven.
- GitHub desactiva los workflows programados si el repo pasa 60 días sin actividad.

### Opción B — verlo funcionando en tu ordenador

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

### Opción C — hosting propio con el servidor Node (datos en vivo)

El repo incluye un `Dockerfile` que empaqueta web + API en un solo servicio, así
que vale casi cualquier hosting (Render, Railway, Fly.io, un VPS...). Es la opción
a la que hay que pasar si la app se usa en serio: los datos se piden en vivo en cada
consulta en lugar de cada 10 minutos. Lo único que tiene que configurar el hosting es:

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

Lo verificado hasta ahora:

- Todo compila; el servidor arranca y sirve el mapa y la API en un solo puerto.
- Cuando una fuente externa falla se devuelve un error controlado en vez de caerse,
  y el resto de capas siguen funcionando.
- **El motor de alertas se ha probado en un navegador real** (Chromium con
  geolocalización simulada) contra un escenario sintético de DANA: estando en
  Valencia con aviso rojo y 78 mm/h, salta la tarjeta de alerta con sus
  instrucciones; estando en Madrid sin lluvia, no salta nada (sin falsas alarmas).

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
