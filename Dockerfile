# ==============================================================================
# Multi-Stage Dockerfile for TeamChat AI (FastAPI + React Production Bundle)
# Optimized for Google Cloud Run
# ==============================================================================

# --- Stage 1: Build React Frontend ---
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Stage 2: Python FastAPI Production Server ---
FROM python:3.11-slim AS runner
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source, seed datasets, and compiled static assets
COPY backend/ ./backend/
COPY data/ ./data/
COPY --from=frontend-builder /app/dist ./dist

EXPOSE 8080

CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8080"]
