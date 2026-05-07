#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${1:-charteris}"

commit_subject="$(git log -1 --pretty=%s 2>/dev/null || true)"
version_candidate="$(printf '%s' "$commit_subject" | awk '{print $1}')"

if [[ "$version_candidate" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  VERSION="$version_candidate"
else
  VERSION="$(git describe --tags --abbrev=0 2>/dev/null || echo dev)"
fi

GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo '')"

echo "Building $IMAGE_NAME with version=$VERSION sha=$GIT_SHA"

docker build \
  --build-arg CHARTERIS_VERSION="$VERSION" \
  --build-arg CHARTERIS_GIT_SHA="$GIT_SHA" \
  -t "$IMAGE_NAME" \
  .
