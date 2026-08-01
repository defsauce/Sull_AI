#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

corepack enable || true
pnpm install
pnpm build
pnpm test
node scripts/generate-docker-env.mjs
pnpm docker:up
