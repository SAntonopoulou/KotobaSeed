# Kotobaseed backend — FastAPI + APScheduler + Alembic.
#
# Python 3.12-slim keeps the image under 250 MB while staying on a
# version that's well supported by every dep in requirements.txt.

FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps:
# - libpq5 is the runtime psycopg2 links against
# - postgresql-client gives us pg_dump for the backup cron job
# - curl is for the healthcheck
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpq5 \
        postgresql-client \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Build deps live in a stage that gets discarded so the final image stays
# small. psycopg2-binary ships wheels for amd64 so we don't actually need
# a build stage, but if we ever swap to source psycopg we'll keep this.
WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Backend code is mounted under the `backend` package path so imports
# stay `from backend.routers import ...` consistent with how pytest
# imports modules locally.
COPY backend /app/backend
COPY backend/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Backups land in /data/backups by default — `data` is a mounted volume.
# /data/uploads holds user-uploaded media when the local-volume storage
# backend is active; Docker preserves this dir's ownership when the
# named volume mounts on top, so the non-root container user can write.
RUN mkdir -p /data /data/backups /data/uploads

# Run as a non-root user. uid 10001 matches the docker-compose user spec
# so files written into /data are owned by the same uid on the host.
RUN useradd --uid 10001 --create-home --shell /bin/bash kotobaseed \
    && chown -R kotobaseed:kotobaseed /app /data
USER kotobaseed

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/healthz || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
