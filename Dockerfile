# =============================================================================
#  Idaho Hunt Planner — Map Center
#  Multi-stage: build with Node, serve static assets with nginx.
#  Final image carries no Node runtime and no build tooling.
# =============================================================================

# ---------- stage 1: dependencies ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# `npm ci` when a lockfile exists, `npm install` on first build.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---------- stage 2: build ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG VITE_CONFIG_URL=/config/app.config.yml
ENV VITE_CONFIG_URL=$VITE_CONFIG_URL
# Rollup holds the whole ArcGIS SDK graph in memory; the default container heap
# is not enough and the build aborts with SIGABRT.
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

# ---------- stage 3: runtime ----------
FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache curl tzdata \
 && addgroup -g 10001 -S app \
 && adduser -u 10001 -S app -G app

COPY --from=build /app/dist /usr/share/nginx/html
# app.config.yml ships as a default; docker-compose bind-mounts over it so the
# file can be edited on a running container without rebuilding the image.
COPY config/app.config.yml /usr/share/nginx/html/config/app.config.yml
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf

RUN chown -R app:app /usr/share/nginx/html /var/cache/nginx /var/log/nginx \
 && touch /var/run/nginx.pid && chown app:app /var/run/nginx.pid

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=4s --start-period=8s --retries=3 \
  CMD curl -fsS http://localhost:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
