#!/usr/bin/env bash
#
# poll-and-dispatch.sh — near-live trigger for the Raycast extensions catalog.
#
# Checks upstream raycast/extensions for a new commit and, ONLY when the HEAD
# SHA has changed, fires a repository_dispatch so GitHub Actions regenerates the
# catalog. One `git ls-remote` per run (no clone), stateful, and safe to run
# every minute from cron — so the catalog updates within ~1-2 min of an upstream
# change, while GitHub Actions stays idle otherwise.
#
# This is the PRIMARY trigger, meant to run on an always-on host (e.g. the
# Vostro). A web-cron hitting the same repository_dispatch on a coarse interval
# is the fallback: it covers this host being offline AND drives the workflow's
# ~daily download-count refresh on days with no upstream change.
#
# ── Setup ────────────────────────────────────────────────────────────────────
#   1. Fine-grained PAT scoped to ONLY mayankchugh-learning/r, permission
#      "Contents: Read and write". Store it readable only by you:
#        mkdir -p ~/.config/raycast-catalog
#        printf '%s' 'github_pat_xxx' > ~/.config/raycast-catalog/token
#        chmod 600 ~/.config/raycast-catalog/token
#   2. Add to crontab (crontab -e):
#        * * * * * /path/to/poll-and-dispatch.sh >> ~/.cache/raycast-catalog/poll.log 2>&1
#
# ── Config (override via environment) ────────────────────────────────────────
#   RAYCAST_CATALOG_TOKEN_FILE   default ~/.config/raycast-catalog/token
#   RAYCAST_CATALOG_STATE_FILE   default ~/.cache/raycast-catalog/last-sha
#
set -euo pipefail

REPO="mayankchugh-learning/r"
UPSTREAM="https://github.com/raycast/extensions"
BRANCH="main"
EVENT_TYPE="catalog-sync"
TOKEN_FILE="${RAYCAST_CATALOG_TOKEN_FILE:-$HOME/.config/raycast-catalog/token}"
STATE_FILE="${RAYCAST_CATALOG_STATE_FILE:-$HOME/.cache/raycast-catalog/last-sha}"

now() { date -u +%FT%TZ; }

if [ ! -r "$TOKEN_FILE" ]; then
  echo "$(now) ERROR: token file not readable: $TOKEN_FILE" >&2
  exit 1
fi
mkdir -p "$(dirname "$STATE_FILE")"

# Current upstream HEAD — just the ref line, no clone. Soft-fail on network
# errors so a flaky minute doesn't spam cron mail.
if ! remote_sha="$(git ls-remote "$UPSTREAM" "refs/heads/$BRANCH" 2>/dev/null | awk 'NR==1{print $1}')"; then
  echo "$(now) ls-remote failed; skipping" >&2
  exit 0
fi
if [ -z "${remote_sha:-}" ]; then
  echo "$(now) empty sha from ls-remote; skipping" >&2
  exit 0
fi

last_sha="$(cat "$STATE_FILE" 2>/dev/null || true)"
if [ "$remote_sha" = "$last_sha" ]; then
  exit 0  # upstream unchanged — nothing to do
fi

# Change detected → fire repository_dispatch.
token="$(cat "$TOKEN_FILE")"
if ! http_code="$(curl -sS -o /dev/null -w '%{http_code}' \
    -X POST "https://api.github.com/repos/$REPO/dispatches" \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -d "{\"event_type\":\"$EVENT_TYPE\"}" 2>/dev/null)"; then
  echo "$(now) dispatch request failed (network); will retry next run" >&2
  exit 0
fi

# Save the SHA only on success, so a failed dispatch is retried next run.
if [ "$http_code" = "204" ]; then
  printf '%s' "$remote_sha" > "$STATE_FILE"
  echo "$(now) dispatched catalog-sync for ${remote_sha:0:10}"
else
  echo "$(now) dispatch returned HTTP $http_code (sha not saved; will retry)" >&2
fi
