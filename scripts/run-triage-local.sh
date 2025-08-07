#!/usr/bin/env bash
set -euo pipefail

# Local triage runner using gh CLI auth and env inputs to our Action
# Usage:
#   scripts/run-triage-local.sh <WORKFLOW_RUN_ID> [--repo owner/repo] [--job JOB_NAME] [--pr PR_NUMBER] [--sha COMMIT_SHA]
#
# Requirements:
# - gh CLI authenticated (gh auth login)
# - OPENAI_API_KEY present in your shell env (e.g., in ~/.bash_profile)
# - Node 20 available via nvm
#
# Behavior:
# - Sources ~/.bash_profile, activates Node 20
# - Exports INPUT_* env vars expected by @actions/core
# - Runs dist/index.js and prints out key outputs

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <WORKFLOW_RUN_ID> [--repo owner/repo] [--job JOB_NAME] [--pr PR_NUMBER] [--sha COMMIT_SHA]" >&2
  exit 1
fi

RUN_ID="$1"; shift
REPO=""; JOB_NAME=""; PR_NUMBER=""; COMMIT_SHA=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2;;
    --job) JOB_NAME="$2"; shift 2;;
    --pr) PR_NUMBER="$2"; shift 2;;
    --sha) COMMIT_SHA="$2"; shift 2;;
    *) echo "Unknown arg: $1" >&2; exit 1;;
  esac
done

# Source bash profile and enable Node 20 via nvm
if [[ -f "$HOME/.bash_profile" ]]; then
  # shellcheck disable=SC1090
  source "$HOME/.bash_profile"
fi
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1090
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
if command -v nvm >/dev/null 2>&1; then
  nvm use 20 >/dev/null
fi

# Validate OPENAI_API_KEY
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "ERROR: OPENAI_API_KEY is not set in your environment." >&2
  echo "Hint: export OPENAI_API_KEY=... in ~/.bash_profile" >&2
  exit 1
fi

# gh token for auth
if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI not found. Install GitHub CLI first." >&2
  exit 1
fi
GH_TOKEN=$(gh auth token 2>/dev/null || true)
if [[ -z "$GH_TOKEN" ]]; then
  echo "ERROR: gh CLI not authenticated. Run: gh auth login" >&2
  exit 1
fi

# Install deps/build if needed
if [[ ! -d node_modules ]]; then
  npm ci
fi
if [[ ! -f dist/index.js ]]; then
  npm run build
fi

# Map inputs to @actions/core expected env vars
export INPUT_GITHUB_TOKEN="$GH_TOKEN"
export INPUT_OPENAI_API_KEY="$OPENAI_API_KEY"
export INPUT_WORKFLOW_RUN_ID="$RUN_ID"
if [[ -n "$JOB_NAME" ]]; then export INPUT_JOB_NAME="$JOB_NAME"; fi
if [[ -n "$PR_NUMBER" ]]; then export INPUT_PR_NUMBER="$PR_NUMBER"; fi
if [[ -n "$COMMIT_SHA" ]]; then export INPUT_COMMIT_SHA="$COMMIT_SHA"; fi
if [[ -n "$REPO" ]]; then export INPUT_REPOSITORY="$REPO"; fi

# Execute the action entrypoint
echo "Running local triage for run $RUN_ID ${REPO:+(repo: $REPO)} ${JOB_NAME:+(job: $JOB_NAME)}"
node dist/index.js | tee /tmp/triage-local-$$.log

# Attempt to extract set-outputs and summary lines for quick view
echo "\n--- Parsed Outputs ---"
awk -F '::' '/^::set-output name=/{print $3}' /tmp/triage-local-$$.log | sed 's/\r$//' || true
# Also surface our log lines
grep -E "^(Verdict:|Confidence:|Summary:)" /tmp/triage-local-$$.log || true

rm -f /tmp/triage-local-$$.log


