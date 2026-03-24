FROM node:20-alpine AS base

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY backend/ ./backend/
COPY frontend/ ./frontend/

FROM node:20-alpine

WORKDIR /app

COPY --from=base /app ./

EXPOSE 3000

CMD ["node", "backend/server.js"]
