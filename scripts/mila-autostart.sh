#!/usr/bin/env bash
#
# mila-autostart.sh — bring the MILA backend stack up headlessly.
#
# Designed to be invoked by the macOS LaunchAgent (com.mila.backend) at login,
# but also safe to run by hand. Idempotent: it starts the container runtime if
# it is down, then `compose up -d` the full stack (postgres + redis + asr-worker
# + api). The api container self-applies Prisma migrations on boot
# (see apps/api/Dockerfile), so there is no separate database step here.
#
# Why this exists: the Electron app launches at login, but nothing brought the
# Docker backend up — so sessions failed with a 500 and ASR fell back to mock.
# This script is the piece that makes MILA start *completely*.
#
set -Eeuo pipefail

# LaunchAgents run with a minimal PATH; make sure Homebrew + common bins resolve
# so `colima` / `docker` are found regardless of the login shell.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILES=(-f "$ROOT_DIR/infra/docker-compose.yml" -f "$ROOT_DIR/infra/docker-compose.override.yml")
HEALTH_URL="${MILA_HEALTH_URL:-http://localhost:4000/api/health}"
LOG_DIR="${MILA_LOG_DIR:-$HOME/Library/Logs/mila}"
RUNTIME_TIMEOUT="${MILA_RUNTIME_TIMEOUT:-120}" # seconds to wait for the daemon
HEALTH_TIMEOUT="${MILA_HEALTH_TIMEOUT:-180}"   # seconds to wait for /api/health

mkdir -p "$LOG_DIR"

log() {
  printf '%s [mila-autostart] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

command_exists() { command -v "$1" >/dev/null 2>&1; }

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
  elif command_exists docker-compose; then
    COMPOSE_CMD=(docker-compose)
  else
    die "Docker Compose not found. Install Colima (brew install colima docker docker-compose) or Docker Desktop."
  fi
}

ensure_runtime() {
  # If the Docker daemon already answers, the runtime is up — nothing to do.
  if docker info >/dev/null 2>&1; then
    log "Container runtime already running."
    return
  fi

  # Prefer Colima (the project's documented runtime), fall back to Docker Desktop.
  if command_exists colima; then
    log "Starting Colima…"
    colima start || die "colima start failed. Run 'colima start' manually to inspect."
  elif [[ -d "/Applications/Docker.app" ]]; then
    log "Starting Docker Desktop…"
    open -ga Docker || true
  else
    die "No container runtime found. Install Colima (brew install colima) or Docker Desktop."
  fi

  # Wait for the daemon to accept connections.
  local waited=0
  while ! docker info >/dev/null 2>&1; do
    if (( waited >= RUNTIME_TIMEOUT )); then
      die "Container runtime did not become ready within ${RUNTIME_TIMEOUT}s."
    fi
    sleep 2
    waited=$((waited + 2))
  done
  log "Container runtime is ready."
}

start_stack() {
  detect_compose
  log "Bringing up the backend stack (postgres + redis + asr-worker + api)…"
  # No --build here: keep login fast. Compose still builds images that do not
  # exist yet (first run), but will not rebuild on every boot. Run ./run.sh once
  # after pulling new code if images need refreshing.
  ( cd "$ROOT_DIR" && "${COMPOSE_CMD[@]}" "${COMPOSE_FILES[@]}" up -d ) \
    || die "compose up failed. Inspect with: ./run.sh logs"
}

wait_for_health() {
  if ! command_exists curl; then
    log "curl not available; skipping health probe."
    return 0
  fi
  log "Waiting for API health at $HEALTH_URL …"
  local waited=0
  while ! curl -fsS -o /dev/null --max-time 3 "$HEALTH_URL" 2>/dev/null; do
    if (( waited >= HEALTH_TIMEOUT )); then
      log "WARNING: API not healthy after ${HEALTH_TIMEOUT}s. It may still be building images or migrating. Check: ./run.sh logs api"
      return 0
    fi
    sleep 3
    waited=$((waited + 3))
  done
  log "API is healthy. MILA backend is up."
}

main() {
  log "Starting MILA backend autostart (root: $ROOT_DIR)"
  ensure_runtime
  start_stack
  wait_for_health
  log "Autostart complete."
}

main "$@"
