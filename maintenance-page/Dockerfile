# Tiny static fallback served by Caddy whenever the backend is
# unreachable or admin sets MAINTENANCE_MODE=1. Just nginx + an
# index.html with a tiny bit of JS that polls the API health endpoint
# (when it comes back, the page auto-refreshes).
FROM nginx:1.27-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
