# AeroGuide API image (Render free web service). Small and stateless for quick cold starts.
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY --from=ghcr.io/astral-sh/uv:0.13 /uv /usr/local/bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app

RUN useradd --create-home --uid 10001 aeroguide
USER aeroguide

ENV PATH="/app/.venv/bin:$PATH" PORT=8000
EXPOSE 8000
# Render sets $PORT. Migrations and seed run from .github/workflows/deploy-data.yml (no pre-deploy on the free tier).
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers"]
