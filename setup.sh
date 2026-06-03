#!/usr/bin/env bash
# One-command setup for GraphCompose AI Template Flow.
# Thin wrapper — the real logic lives in scripts/setup.mjs (cross-platform).
set -euo pipefail
cd "$(dirname "$0")"
exec node scripts/setup.mjs "$@"
