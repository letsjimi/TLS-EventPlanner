# ───────────────────────────────────────────────
# TLS Event Manager — Production Dockerfile
# Multi-stage build für minimale Image-Größe
# ───────────────────────────────────────────────

# Stage 1: Build (nur wenn npm build nötig wäre)
# Aktuell: Static SPA, daher direkt aus /src

# Stage 2: Production
FROM nginx:alpine

LABEL maintainer="TLS Live Sound"
LABEL description="TLS Event Manager — Offline-first Event Planning SPA"

# Konfiguration
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# App-Dateien
COPY index.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY assets/ /usr/share/nginx/html/assets/
COPY manifest.json /usr/share/nginx/html/

# Security Headers & Gzip
RUN echo 'server_tokens off;' >> /etc/nginx/nginx.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
