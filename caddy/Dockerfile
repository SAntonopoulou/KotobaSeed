# Custom Caddy build — the official caddy:2 image does not ship the
# Cloudflare DNS plugin we need for DNS-01 wildcard issuance, so we use
# Caddy's published xcaddy builder to bake in just that one plugin.

FROM caddy:2.10-builder AS builder
RUN xcaddy build \
    --with github.com/caddy-dns/cloudflare

FROM caddy:2.10

# Replace the stock binary with our plugin-equipped one. Everything else
# (entrypoint, config layout, certmagic storage) stays standard.
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
