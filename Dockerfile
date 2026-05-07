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

ARG CHARTERIS_VERSION=dev
ARG CHARTERIS_GIT_SHA=
ENV CHARTERIS_VERSION=${CHARTERIS_VERSION}
ENV CHARTERIS_GIT_SHA=${CHARTERIS_GIT_SHA}

# better-sqlite3 needs build tools at install time
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY server/package*.json ./
RUN npm install && apk del python3 make g++

COPY server/ .
COPY openapi.yaml ./openapi.yaml

# Copy built Vue app into /app/public
COPY --from=ui-build /ui/dist ./public

# Extract version and commit SHA from git metadata (no git install needed).
# Reads .git/COMMIT_EDITMSG for the last commit subject and .git/HEAD for the SHA.
# Writes /app/build-info.json which config/index.ts reads as a fallback.
COPY .git /tmp/git-meta
RUN set -e; \
    COMMIT_MSG=$(head -1 /tmp/git-meta/COMMIT_EDITMSG 2>/dev/null || echo ''); \
    VERSION=$(echo "$COMMIT_MSG" | awk '{print $1}'); \
    if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then VERSION=dev; fi; \
    HEAD_CONTENTS=$(cat /tmp/git-meta/HEAD); \
    if echo "$HEAD_CONTENTS" | grep -q '^ref:'; then \
      REF=$(echo "$HEAD_CONTENTS" | sed 's/ref: //'); \
      SHA=$(cut -c1-7 /tmp/git-meta/$REF 2>/dev/null || echo ''); \
    else \
      SHA=$(echo "$HEAD_CONTENTS" | cut -c1-7); \
    fi; \
    printf '{"version":"%s","commit":"%s"}\n' "$VERSION" "$SHA" > /app/build-info.json; \
    rm -rf /tmp/git-meta

EXPOSE 8080

# Use tsx to run TypeScript directly
CMD ["npx", "tsx", "src/index.ts"]
