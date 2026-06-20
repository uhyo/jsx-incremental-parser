#!/bin/bash
# SessionStart hook: install dependencies so lint/typecheck/test/build work
# in Claude Code on the web sessions.
set -euo pipefail

# Only run in the remote (Claude Code on the web) environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Enable Corepack so the pinned pnpm version (packageManager field) is used.
corepack enable >/dev/null 2>&1 || true

# Idempotent dependency install; reuses the cached container state on resume.
pnpm install --frozen-lockfile
