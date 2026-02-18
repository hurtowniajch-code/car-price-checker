#!/bin/bash
# Scrape filter options (fuel types, gearboxes, engine capacities, powers) from Otomoto
# Run on server with proxy env vars set
#
# Usage:
#   ./scripts/run-scrape-options.sh              # all brands (~2200 models, several hours)
#   ./scripts/run-scrape-options.sh Audi          # single brand test
#   ./scripts/run-scrape-options.sh BMW           # single brand test
#
# Requires: PROXY_URL, PROXY_USER, PROXY_PASS env vars (or set below)

export PROXY_URL="${PROXY_URL:-31.59.20.176:6754}"
export PROXY_USER="${PROXY_USER:-qfbpacrz}"
export PROXY_PASS="${PROXY_PASS:-1db9evfw6wno}"

npx ts-node scripts/scrape-options.ts "$@"
