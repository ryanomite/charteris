# Charteris — Single-container personal task manager
# Stage 1: Build Vue.js frontend
FROM node:20-alpine AS ui-build

WORKDIR /ui
COPY ui/package*.json ./
RUN npm install
COPY ui/ .

# Build-time: API is on same origin (no separate API base URL needed)
ARG VITE_API_BASE_URL=
ARG VITE_API_TOKEN=
RUN npm run build

# Stage 2: Server with built frontend
FROM node:20-alpine

# better-sqlite3 needs build tools at install time
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY server/package*.json ./
RUN npm install && apk del python3 make g++

COPY server/ .
COPY openapi.yaml ./openapi.yaml

# Copy built Vue app into /app/public
COPY --from=ui-build /ui/dist ./public

EXPOSE 8080

# Use tsx to run TypeScript directly
CMD ["npx", "tsx", "src/index.ts"]
