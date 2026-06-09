# Kotobaseed frontend — Vite build → static assets served by nginx.
#
# Two-stage build keeps the final image small (~25 MB) and free of
# node_modules.

# ---- Stage 1: build ---------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# Copy package manifests first so `npm ci` layer can cache.
COPY frontend/package.json frontend/package-lock.json* /app/
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Now bring in the source and build.
COPY frontend /app
# The build expects VITE_API_URL (and friends) at build time. They're
# baked into the bundle, so passing them as ARGs is the documented path.
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
# The frontend needs to know its own apex domain to route tenant
# subdomains correctly. Without this the staging build at
# demo.kotobaseed.net treats "demo" as a tutor slug.
ARG VITE_PLATFORM_APEX=
ENV VITE_PLATFORM_APEX=${VITE_PLATFORM_APEX}
# Toggle staging-only affordances — most visibly the demo login hints.
ARG VITE_DEMO_MODE=
ENV VITE_DEMO_MODE=${VITE_DEMO_MODE}
# Stripe publishable key. Currently unused (every payment flow goes through
# server-side Stripe Checkout), but baked in now so that future Stripe
# Elements / Payment Element use just works without a rebuild.
ARG VITE_STRIPE_PUBLIC_KEY=
ENV VITE_STRIPE_PUBLIC_KEY=${VITE_STRIPE_PUBLIC_KEY}
# Sentry: DSN + environment + release identifier are baked at build
# time so the SDK config is locked to this exact bundle. The release
# string must match the one passed to `sentry-cli sourcemaps upload`
# for source-map resolution in the Sentry UI.
ARG VITE_SENTRY_DSN=
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
ARG VITE_SENTRY_ENVIRONMENT=
ENV VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT}
ARG VITE_SENTRY_RELEASE=
ENV VITE_SENTRY_RELEASE=${VITE_SENTRY_RELEASE}
# Sentry auth token + org/project for source-map upload. Used only
# during build; never makes it into the runtime nginx image.
ARG SENTRY_AUTH_TOKEN=
ARG SENTRY_ORG=
ARG SENTRY_PROJECT=
RUN npm run build
# Upload source maps + register the release if all the Sentry creds are
# present. Run this even when the runtime DSN is empty (release-track
# only) and skip outright if the token is missing.
RUN if [ -n "$SENTRY_AUTH_TOKEN" ] && [ -n "$VITE_SENTRY_RELEASE" ]; then \
      SENTRY_AUTH_TOKEN="$SENTRY_AUTH_TOKEN" \
        npx @sentry/cli releases new "$VITE_SENTRY_RELEASE" \
          --org "$SENTRY_ORG" --project "$SENTRY_PROJECT" && \
      SENTRY_AUTH_TOKEN="$SENTRY_AUTH_TOKEN" \
        npx @sentry/cli sourcemaps upload \
          --org "$SENTRY_ORG" --project "$SENTRY_PROJECT" \
          --release "$VITE_SENTRY_RELEASE" \
          /app/dist && \
      SENTRY_AUTH_TOKEN="$SENTRY_AUTH_TOKEN" \
        npx @sentry/cli releases finalize "$VITE_SENTRY_RELEASE" \
          --org "$SENTRY_ORG" --project "$SENTRY_PROJECT" ; \
    else \
      echo "Sentry source-map upload skipped (missing token or release)"; \
    fi
# Strip the source maps before they ship in the runtime image — they
# served their purpose during the Sentry upload above.
RUN find /app/dist -name "*.map" -delete

# ---- Stage 2: serve ---------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# Drop the default nginx config so our SPA-aware one wins.
RUN rm /etc/nginx/conf.d/default.conf
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
