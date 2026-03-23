# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS base

WORKDIR /app

# Copiar solo package.json primero para aprovechar caché de Docker
COPY backend/package*.json ./backend/

# Instalar dependencias de producción
RUN cd backend && npm install --omit=dev

# Copiar el resto del código
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# ── Production stage ─────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copiar desde base
COPY --from=base /app .

# Usuario no-root por seguridad
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

CMD ["node", "backend/server.js"]
