FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

FROM caddy:2-alpine

COPY --from=build /app/dist /usr/share/caddy/html
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443
