#!/usr/bin/env bash
# Resume the latest opencode session for this project.
# Reads the session id from SESSION.md (repo root).

set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
SESSION_FILE="$REPO_ROOT/SESSION.md"

if [[ ! -f "$SESSION_FILE" ]]; then
    echo "SESSION.md not found in repo root."
    exit 1
fi

# Extract session id from the code block in SESSION.md
SESSION_ID=$(grep -oP 'opencode -s \K\S+' "$SESSION_FILE" | head -n1)

if [[ -z "$SESSION_ID" ]]; then
    echo "No session id found in SESSION.md"
    exit 1
fi

echo "Resuming session: $SESSION_ID"
cd "$REPO_ROOT"
opencode -s "$SESSION_ID"
