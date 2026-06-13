#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-all}"

if [[ -n "${NODE_BIN:-}" && -x "${NODE_BIN}" ]]; then
  NODE="${NODE_BIN}"
elif command -v node >/dev/null 2>&1; then
  NODE="$(command -v node)"
else
  CODEX_NODE="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
  if [[ -x "${CODEX_NODE}" ]]; then
    NODE="${CODEX_NODE}"
  else
    echo "Node.js not found. Set NODE_BIN=/path/to/node and rerun." >&2
    exit 127
  fi
fi

CODEX_NODE_MODULES="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"
if [[ -d "${CODEX_NODE_MODULES}" ]]; then
  export NODE_PATH="${CODEX_NODE_MODULES}${NODE_PATH:+:${NODE_PATH}}"
fi

run_contract() {
  "${NODE}" --test "${ROOT}/tests/site-contract.test.js"
}

run_visual() {
  "${NODE}" "${ROOT}/tests/visual-lock.test.js"
}

case "${MODE}" in
  all)
    run_contract
    run_visual
    ;;
  contract)
    run_contract
    ;;
  visual)
    run_visual
    ;;
  *)
    echo "Unknown mode: ${MODE}" >&2
    echo "Usage: $0 [all|contract|visual]" >&2
    exit 2
    ;;
esac
