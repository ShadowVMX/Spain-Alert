# Contribuir a Alerta España

Gracias por pasarte. Este proyecto existe por una razón concreta: en España muere
gente en riadas y DANAs que habría podido ponerse a salvo si hubiera sabido a tiempo
lo que venía. Cualquier ayuda para que eso pase menos veces es bienvenida.

**No hace falta ser programador.** Reportar que la app falló en tu pueblo, o
contarnos que tu confederación hidrográfica publica datos que no estamos usando,
vale tanto como escribir código.

---

## Formas de ayudar

| Puedes... | Aunque no sepas programar |
|---|---|
| 🐛 [Reportar un fallo](../../issues/new?template=01-bug.yml) | ✅ |
| 💡 [Proponer una mejora](../../issues/new?template=02-idea.yml) | ✅ |
| 🌊 [Aportar una fuente de datos](../../issues/new?template=03-fuente-datos.yml) | ✅ |
| 📖 Mejorar la documentación o los textos de autoprotección | ✅ |
| 💻 Enviar código | Requiere Node.js |

### Lo más valioso ahora mismo

**Dónde publica MITECO el estado de los embalses.** Es lo que más falta hace ahora
mismo: la capa del mapa, los colores y la regla de aviso ya están hechos y probados,
pero no encontramos la fuente. El API de objetos geográficos de MITECO responde, pero
sus colecciones son de agricultura, pesca y alimentación; el agua no está ahí.

**Fuentes de datos en general.** Es el cuello de botella real. Los datos de
emergencias en España están repartidos entre AEMET, nueve confederaciones
hidrográficas, el IGN, las comunidades autónomas y los ayuntamientos, cada uno con su
formato y sin un catálogo común. Si trabajas en alguno de esos organismos, o
simplemente conoces un portal que publique datos en tiempo real,
[cuéntanoslo](../../issues/new?template=03-fuente-datos.yml).

**Conocimiento local.** Si sabes qué barranco de tu pueblo se desborda siempre, o
qué vado se corta con dos gotas, eso es información que ningún sensor da.

---

## Enviar código

### Preparar el entorno

Esto es solo para desarrollar. **El servicio en marcha lo mantenemos nosotros**
—infraestructura, clave de AEMET y despliegue— así que para usar la app basta con
[abrirla en el navegador](https://shadowvmx.github.io/Spain-Alert/).

Para tocar código necesitas tu propia clave de AEMET, que es
[gratuita](https://opendata.aemet.es/centrodedescargas/altaUsuario) y tarda 5
minutos. La del proyecto es privada y no se comparte.

```bash
git clone https://github.com/ShadowVMX/Spain-Alert.git
cd Spain-Alert
npm run install:all

cp server/.env.example server/.env
# pega dentro TU clave de AEMET

npm run dev:server    # terminal 1
npm run dev:web       # terminal 2 -> http://localhost:5173
```

### El flujo

1. Haz un fork y crea una rama descriptiva: `git checkout -b arregla-radar-canarias`
2. Haz tus cambios.
3. Comprueba que sigue todo en pie:
   ```bash
   npm run typecheck
   npm run build
   ```
4. Abre un Pull Request. La plantilla te guía sobre qué contar.

No hace falta que el PR sea perfecto. Es mejor uno a medias con una buena
explicación que uno que nunca llega.

---

## Cómo escribimos el código

No hay reglas estrictas, pero sí un par de criterios que sí importan:

**El idioma.** Nombres de variables, comentarios y textos de la interfaz **en
español**. Es un proyecto para España y queremos que cualquiera pueda leerlo.

**Los comentarios explican el porqué, no el qué.** El código ya dice lo que hace.
Un comentario útil es el que explica una decisión que no es obvia:

```ts
// Avisamos ya en "muy fuerte" (30 mm/h) y no solo en "torrencial" (60), porque
// una rambla seca puede llevarse un coche mucho antes de llegar a ese umbral.
const FLASH_FLOOD_MM_H = 30;
```

**Los tipos, en serio.** TypeScript en modo estricto. Si te peleas con un tipo,
pregunta en el PR en vez de poner `any`.

---

## Las reglas que no se negocian

Este proyecto avisa a gente de peligros reales. Eso impone unos límites:

### 1. Quedarse callado es el peor fallo posible

Si una fuente de datos falla, hay que **decirlo**. Un mapa vacío o desactualizado
hace creer que no hay peligro, y eso es peor que no tener app. Nunca sustituyas un
error por un silencio.

### 2. Nunca inventes datos ni coordenadas

Si no sabes dónde va exactamente una capa en el mapa, **no la pintes**. Un radar
desplazado veinte kilómetros pinta lluvia donde no la hay y deja en blanco la zona
que se está inundando.

Cuando una fuente no diga sus propias coordenadas, dedúcelas del archivo o déjalo
sin publicar. En este repo hay comprobaciones de cordura que verifican que los
datos caen sobre España antes de dibujarlos: no las quites.

### 3. Prudencia hacia el aviso, no hacia el silencio

Ante la duda de si avisar o no, se avisa. Una falsa alarma molesta; un aviso que no
llega puede matar. Dicho esto, tampoco conviene saturar: si algo genera avisos
constantes, la gente los ignora y volvemos al mismo sitio.

### 4. Las instrucciones de autoprotección se basan en fuentes oficiales

Los textos que se muestran en una alerta (`web/src/instructions.ts`) siguen las
recomendaciones de Protección Civil y AEMET. Si propones cambiarlos, di en qué te
basas. No es un sitio para improvisar.

### 5. La ubicación del usuario no se envía a ninguna parte

El cálculo de qué te afecta se hace en el propio dispositivo. Es una decisión de
diseño deliberada, no una casualidad. Cualquier cambio que mande la posición a un
servidor tiene que justificarse muy bien.

---

## Qué NO aceptamos

- Cambios que hagan la app dependiente de un servicio de pago sin alternativa libre.
- Publicidad, analítica que rastree a los usuarios o telemetría no consentida.
- Presentar el proyecto como si fuera oficial de AEMET, Protección Civil o el IGN.
- Scraping agresivo de fuentes públicas: son servicios pagados con dinero de todos,
  y tumbarlos perjudica a todo el mundo. Cachea y sé razonable.

---

## Dudas

Abre una [Discussion](../../discussions) o pregunta directamente en un issue. No hay
preguntas tontas: este proyecto toca meteorología, hidrología, sismología y
desarrollo web a la vez, y nadie domina las cuatro cosas.
