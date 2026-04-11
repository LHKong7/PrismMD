#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[build]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[error]${NC} $*" >&2; }

# ── Parse arguments ──────────────────────────────────────────────────────────
MODE="make"          # default: produce installers
PLATFORM=""          # default: current platform
SKIP_TYPECHECK=false
SKIP_INSTALL=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --package         Package the app without producing installers
  --make            Build platform installers (default)
  --platform <p>    Target platform: darwin, win32, linux
  --skip-typecheck  Skip TypeScript type checking
  --skip-install    Skip npm install
  -h, --help        Show this help

Examples:
  ./scripts/build.sh                    # Build installer for current platform
  ./scripts/build.sh --package          # Package only (no installer)
  ./scripts/build.sh --platform darwin  # Build macOS installer
EOF
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --package)        MODE="package"; shift ;;
    --make)           MODE="make"; shift ;;
    --platform)       PLATFORM="$2"; shift 2 ;;
    --skip-typecheck) SKIP_TYPECHECK=true; shift ;;
    --skip-install)   SKIP_INSTALL=true; shift ;;
    -h|--help)        usage ;;
    *)                err "Unknown option: $1"; usage ;;
  esac
done

# ── Preflight checks ────────────────────────────────────────────────────────
log "PrismMD build script"
log "Mode: $MODE"
log "Platform: ${PLATFORM:-$(node -p 'process.platform')}"

if ! command -v node &>/dev/null; then
  err "Node.js is not installed. Install it from https://nodejs.org/"
  exit 1
fi

if ! command -v npm &>/dev/null; then
  err "npm is not installed."
  exit 1
fi

NODE_VERSION=$(node -p 'process.versions.node.split(".")[0]')
if [[ "$NODE_VERSION" -lt 18 ]]; then
  err "Node.js >= 18 required (found v$(node -v))"
  exit 1
fi

log "Node $(node -v) | npm $(npm -v)"

# ── Install dependencies ────────────────────────────────────────────────────
if [[ "$SKIP_INSTALL" == false ]]; then
  log "Installing dependencies..."
  npm ci --prefer-offline 2>/dev/null || npm install
else
  warn "Skipping npm install"
fi

# ── Type check ──────────────────────────────────────────────────────────────
if [[ "$SKIP_TYPECHECK" == false ]]; then
  log "Running type check..."
  npx tsc --noEmit
  log "Type check passed"
else
  warn "Skipping type check"
fi

# ── Build ────────────────────────────────────────────────────────────────────
FORGE_ARGS=()
if [[ -n "$PLATFORM" ]]; then
  FORGE_ARGS+=(--platform "$PLATFORM")
fi

if [[ "$MODE" == "make" ]]; then
  log "Building installers..."
  npx electron-forge make "${FORGE_ARGS[@]}"
else
  log "Packaging app..."
  npx electron-forge package "${FORGE_ARGS[@]}"
fi

# ── Done ─────────────────────────────────────────────────────────────────────
log "Build complete!"

if [[ "$MODE" == "make" ]]; then
  log "Output: out/make/"
else
  log "Output: out/"
fi
