#!/bin/bash
# Import a Trello JSON export into Charteris
# Usage: ./scripts/import-trello.sh <trello-export.json> [api-url] [api-token]

set -e

FILE="${1:?Usage: ./scripts/import-trello.sh <trello-export.json> [api-url] [api-token]}"
API_URL="${2:-http://localhost:3000}"
API_TOKEN="${3:-dev-token-charteris-2026}"

if [ ! -f "$FILE" ]; then
  echo "Error: File not found: $FILE"
  exit 1
fi

echo "Importing Trello export from: $FILE"
echo "API: $API_URL"
echo ""

RESULT=$(curl -s -X POST "${API_URL}/api/v1/import/trello?token=${API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d @"$FILE")

echo "$RESULT" | grep -q '"error"' && { echo "Error: $RESULT"; exit 1; }

echo "Import complete!"
echo "$RESULT"
