# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM python:3.12-slim AS base

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM base AS runtime

WORKDIR /app

# Cloud Run injects PORT env var (default 8080)
ENV PORT=8080
ENV ENVIRONMENT=production
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

EXPOSE 8080

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
