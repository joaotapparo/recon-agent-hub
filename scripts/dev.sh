#!/usr/bin/env bash
# Sobe o ambiente de desenvolvimento local.
#
#   scripts/dev.sh            backend local (porta 8000) + painel Vite (porta 5173)
#   scripts/dev.sh --backend  só o backend local
#   scripts/dev.sh --remote   só o painel, com /api apontando pro servidor da AWS
#                             (REMOTE_API, padrão http://3.16.255.31:8000)
#
# Ctrl+C encerra tudo. O backend local usa backend/.env e backend/data/recon.db,
# separados do banco do servidor.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-all}"
REMOTE_API="${REMOTE_API:-http://3.16.255.31:8000}"

if [[ "$MODE" != "--remote" && ! -f "$ROOT/backend/.env" ]]; then
  echo "backend/.env não existe. Copie backend/.env.example e ajuste os *_PATH" >&2
  echo "com caminhos absolutos (ex.: /opt/homebrew/bin/httpx)." >&2
  exit 1
fi

pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

start_backend() {
  (cd "$ROOT/backend" && uv sync -q --all-extras && uv run alembic upgrade head \
    && exec uv run uvicorn app.main:app --reload --port 8000) &
  pids+=($!)
}

start_frontend() {
  local target="$1"
  (cd "$ROOT/frontend" && [[ -d node_modules ]] || pnpm install
   cd "$ROOT/frontend" && VITE_PROXY_TARGET="$target" exec pnpm dev) &
  pids+=($!)
}

case "$MODE" in
  all)       start_backend; start_frontend "http://localhost:8000" ;;
  --backend) start_backend ;;
  --remote)  echo "Painel local -> API em $REMOTE_API"; start_frontend "$REMOTE_API" ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac

wait
