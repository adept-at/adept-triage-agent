#!/bin/bash
set -euo pipefail

# All repos that use adept-triage-agent@v1
REPOS=(
  "adept-at/lib-cypress-canary"
  "adept-at/lib-wdio-8-e2e-ts"
  "adept-at/learn-webapp"
  "adept-at/lib-wdio-8-multi-remote"
)

echo "============================================"
echo "  Triage Agent — Secret Updater"
echo "============================================"
echo ""
echo "This script will update CROSS_REPO_PAT and"
echo "OPENAI_API_KEY on all repos using the triage agent."
echo ""
echo "Repos:"
for repo in "${REPOS[@]}"; do
  echo "  - $repo"
done
echo ""

# --- CROSS_REPO_PAT ---
echo "--------------------------------------------"
echo "Step 1: CROSS_REPO_PAT"
echo "--------------------------------------------"
read -rp "Paste your new CROSS_REPO_PAT (hidden): " -s CROSS_REPO_PAT
echo ""

if [ -z "$CROSS_REPO_PAT" ]; then
  echo "Error: empty token. Aborting."
  exit 1
fi

for repo in "${REPOS[@]}"; do
  echo -n "  Setting CROSS_REPO_PAT on $repo... "
  echo "$CROSS_REPO_PAT" | gh secret set CROSS_REPO_PAT --repo "$repo" 2>&1
  echo "done"
done
echo ""

# --- OPENAI_API_KEY ---
echo "--------------------------------------------"
echo "Step 2: OPENAI_API_KEY"
echo "--------------------------------------------"

# Check which repos already have it
MISSING_OPENAI=()
for repo in "${REPOS[@]}"; do
  if ! gh secret list --repo "$repo" 2>/dev/null | grep -q "OPENAI_API_KEY"; then
    MISSING_OPENAI+=("$repo")
  fi
done

if [ ${#MISSING_OPENAI[@]} -eq 0 ]; then
  echo "  All repos already have OPENAI_API_KEY."
  read -rp "  Update it on all repos anyway? (y/N): " UPDATE_ALL
  if [[ "$UPDATE_ALL" =~ ^[Yy]$ ]]; then
    MISSING_OPENAI=("${REPOS[@]}")
  fi
fi

if [ ${#MISSING_OPENAI[@]} -gt 0 ]; then
  echo "  Repos needing OPENAI_API_KEY:"
  for repo in "${MISSING_OPENAI[@]}"; do
    echo "    - $repo"
  done
  read -rp "  Paste your OPENAI_API_KEY (hidden): " -s OPENAI_KEY
  echo ""

  if [ -z "$OPENAI_KEY" ]; then
    echo "  Skipping — empty key."
  else
    for repo in "${MISSING_OPENAI[@]}"; do
      echo -n "  Setting OPENAI_API_KEY on $repo... "
      echo "$OPENAI_KEY" | gh secret set OPENAI_API_KEY --repo "$repo" 2>&1
      echo "done"
    done
  fi
fi

echo ""
echo "--------------------------------------------"
echo "Verification"
echo "--------------------------------------------"
for repo in "${REPOS[@]}"; do
  echo ""
  echo "  $repo:"
  gh secret list --repo "$repo" 2>/dev/null | grep -E "CROSS_REPO_PAT|OPENAI_API_KEY" | while read -r line; do
    echo "    ✅ $line"
  done
done

echo ""
echo "============================================"
echo "  Done! All triage agent repos are updated."
echo "============================================"

# Clean up
unset CROSS_REPO_PAT OPENAI_KEY 2>/dev/null || true
