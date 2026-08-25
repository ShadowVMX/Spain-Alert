# Imagen única con la web ya construida y la API. Un solo servicio que desplegar.
FROM node:22-slim AS build
WORKDIR /app

COPY server/package*.json ./server/
COPY web/package*.json ./web/
RUN npm --prefix server ci && npm --prefix web ci

COPY server ./server
COPY web ./web
RUN npm --prefix web run build && npm --prefix server run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY server/package*.json ./server/
RUN npm --prefix server ci --omit=dev

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

# La clave de AEMET se pasa como variable de entorno, nunca en la imagen.
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server/dist/index.js"]
