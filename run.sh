#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"
PNPM_VERSION="10.33.0"
COMPOSE_FILES=(-f "$ROOT_DIR/infra/docker-compose.yml" -f "$ROOT_DIR/infra/docker-compose.override.yml")

log() {
  printf '\033[1;34m[mila]\033[0m %s\n' "$*"
}

warn() {
  printf '\033[1;33m[mila]\033[0m %s\n' "$*"
}

die() {
  printf '\033[1;31m[mila]\033[0m %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Mila local runner

Usage:
  ./run.sh              Start infra, API, and web UI for local development
  ./run.sh dev          Same as above
  ./run.sh backend      Start the Docker backend stack only
  ./run.sh stop         Stop Docker services
  ./run.sh clean        Stop Docker services and delete local database data
  ./run.sh logs [svc]   Follow Docker logs, optionally for one service
  ./run.sh status       Show Docker service status

The default command opens the source development stack:
  - Web UI: http://localhost:3000
  - API:    http://localhost:4000/api/health
EOF
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
  elif command_exists docker-compose; then
    COMPOSE_CMD=(docker-compose)
  else
    die "Docker Compose is required. Install Docker Desktop, then run this again."
  fi
}

compose() {
  detect_compose
  "${COMPOSE_CMD[@]}" "${COMPOSE_FILES[@]}" "$@"
}

generate_secret() {
  if command_exists openssl; then
    openssl rand -hex 48
    return
  fi

  od -An -tx1 -N48 /dev/urandom | tr -d ' \n'
}

env_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2); exit }' "$ENV_FILE"
}

replace_env_value() {
  local key="$1"
  local value="$2"
  local file="$3"
  local tmp

  tmp="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { replaced = 0 }
    $0 ~ "^" key "=" {
      print key "=" value
      replaced = 1
      next
    }
    { print }
    END {
      if (!replaced) print key "=" value
    }
  ' "$file" >"$tmp"
  mv "$tmp" "$file"
}

ensure_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    [[ -f "$ENV_EXAMPLE" ]] || die "Missing .env.example; cannot create .env."
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    log "Created .env from .env.example."
  fi

  local jwt_secret
  jwt_secret="$(env_value JWT_SECRET || true)"
  if [[ -z "$jwt_secret" || "$jwt_secret" == "replace-with-a-long-random-secret" ]]; then
    replace_env_value "JWT_SECRET" "$(generate_secret)" "$ENV_FILE"
    log "Generated a local JWT_SECRET in .env."
  fi
}

load_env() {
  # The API does not load .env itself, so export it before starting Nest.
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a

  export DATABASE_URL="${DATABASE_URL:-postgresql://mila:mila@localhost:15432/mila}"
  export MILA_API_INTERNAL_URL="${MILA_API_INTERNAL_URL:-http://localhost:4000}"
  export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-}"
  export NEXT_PUBLIC_API_WS_URL="${NEXT_PUBLIC_API_WS_URL:-ws://localhost:4000/meetings/live}"
  export WEB_ORIGIN="${WEB_ORIGIN:-http://localhost:3000}"
  export ASR_PROVIDER="${ASR_PROVIDER:-http}"
  export ASR_BASE_URL="${ASR_BASE_URL:-http://127.0.0.1:9000}"

  if [[ -z "${REDIS_URL:-}" || "$REDIS_URL" == "redis://localhost:6379" ]]; then
    export REDIS_URL="redis://localhost:16379"
  fi
}

warn_if_missing_llm_key() {
  if [[ -z "${GOOGLE_API_KEY:-}" && -z "${OPENROUTER_API_KEY:-}" && -z "${NVIDIA_NIM_API_KEY:-}" && -z "${DEEPSEEK_API_KEY:-}" && -z "${LLM_API_KEY:-}" ]]; then
    warn "No LLM API key is set in .env. The app will start, but chat and generated notes need a provider key."
  fi
}

ensure_node() {
  command_exists node || die "Node.js 20.19+ is required. Install Node.js, then run this again."

  local major
  major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
  if (( major < 20 )); then
    die "Node.js 20.19+ is required. Current version: $(node -v)."
  fi
}

ensure_pnpm() {
  if command_exists pnpm; then
    return
  fi

  if command_exists corepack; then
    log "pnpm was not found; activating pnpm@$PNPM_VERSION with Corepack."
    corepack enable
    corepack prepare "pnpm@$PNPM_VERSION" --activate
  fi

  command_exists pnpm || die "pnpm is required. Install it with: corepack enable && corepack prepare pnpm@$PNPM_VERSION --activate"
}

ensure_docker() {
  command_exists docker || die "Docker is required. Install Docker Desktop, then run this again."
  docker info >/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop, then run this again."
}

install_deps() {
  if [[ -d "$ROOT_DIR/node_modules" ]]; then
    log "JavaScript dependencies are already installed."
    return
  fi

  log "Installing JavaScript dependencies..."
  pnpm install
}

start_infra() {
  ensure_docker
  log "Starting Postgres, Redis, and ASR worker..."
  compose up -d --build postgres redis asr-worker
  wait_for_postgres
}

wait_for_postgres() {
  log "Waiting for Postgres..."
  for _ in {1..60}; do
    if compose exec -T postgres pg_isready -U mila -d mila >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  die "Postgres did not become ready. Run ./run.sh logs postgres for details."
}

prepare_database() {
  log "Generating Prisma client..."
  pnpm --filter @mila/api exec prisma generate

  log "Applying database migrations..."
  pnpm --filter @mila/api exec prisma migrate deploy
}

start_dev() {
  cd "$ROOT_DIR"
  ensure_env
  load_env
  warn_if_missing_llm_key
  ensure_node
  ensure_pnpm
  install_deps
  start_infra
  prepare_database

  log "Starting API and web UI..."
  log "Web UI: http://localhost:3000"
  log "API:    http://localhost:4000/api/health"
  log "Use Ctrl-C to stop API/web. Docker services stay up; stop them with ./run.sh stop."
  exec pnpm dev
}

start_backend() {
  cd "$ROOT_DIR"
  ensure_env
  load_env
  warn_if_missing_llm_key
  ensure_docker

  log "Starting Docker backend stack..."
  compose up -d --build
  log "Backend API: http://localhost:4000/api/health"
  log "Stop it with ./run.sh stop."
}

stop_stack() {
  cd "$ROOT_DIR"
  ensure_docker
  compose down
}

clean_stack() {
  cd "$ROOT_DIR"
  ensure_docker
  compose down -v
}

logs_stack() {
  cd "$ROOT_DIR"
  ensure_docker
  compose logs -f "$@"
}

status_stack() {
  cd "$ROOT_DIR"
  ensure_docker
  compose ps
}

if [[ "${1:-}" == "--" ]]; then
  shift
fi

command_name="${1:-dev}"
if [[ $# -gt 0 ]]; then
  shift
fi

case "$command_name" in
  dev|run|start)
    start_dev "$@"
    ;;
  backend|docker)
    start_backend "$@"
    ;;
  stop|down)
    stop_stack
    ;;
  clean|reset)
    clean_stack
    ;;
  logs)
    logs_stack "$@"
    ;;
  status|ps)
    status_stack
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage
    die "Unknown command: $command_name"
    ;;
esac
