# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build -- --configuration k8s

# ---- runtime (nginx serve a SPA + proxy reverso para backend/telemetria) ----
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/Front-Sonda-Geopetro-IO/browser /usr/share/nginx/html
EXPOSE 80
