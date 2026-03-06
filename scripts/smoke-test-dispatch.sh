#!/usr/bin/env bash
set -euo pipefail

# Smoke test: dispatch triage-failed-test to each consumer repo and monitor results.
# Uses real failed workflow runs so the triage agent produces meaningful output.
# Compatible with bash 3.x (macOS default).

REPOS=(
  "adept-at/lib-cypress-canary"
  "adept-at/lib-wdio-8-e2e-ts"
  "adept-at/lib-wdio-8-multi-remote"
)
RUN_IDS=(
  "22693448847"
  "22732298797"
  "22592680665"
)
JOB_NAMES=(
  "prodSkillBuilder (lexical.snapshots.preview.sca.js)"
  "sauceTest"
  "sauceTest"
)
TRIAGE_RUN_IDS=("" "" "")

echo "============================================"
echo " Smoke Test: Centralized Triage Dispatch"
echo "============================================"
echo ""

# Step 1: Send repository_dispatch to each repo
for i in 0 1 2; do
  repo="${REPOS[$i]}"
  run_id="${RUN_IDS[$i]}"
  job_name="${JOB_NAMES[$i]}"

  echo "▶ Dispatching to $repo"
  echo "  Run ID:   $run_id"
  echo "  Job Name: $job_name"

  gh api "repos/$repo/dispatches" \
    --method POST \
    -f event_type=triage-failed-test \
    -f "client_payload[workflow_run_id]=$run_id" \
    -f "client_payload[job_name]=$job_name" \
    -f "client_payload[spec]=" \
    -f "client_payload[pr_number]=" \
    -f "client_payload[commit_sha]=" \
    -f "client_payload[branch]=main" \
    -f "client_payload[repo_url]=$repo" \
    -f "client_payload[preview_url]=" \
    2>&1 && echo "  ✅ Dispatched" || echo "  ❌ Failed to dispatch"
  echo ""
done

echo "Waiting 20s for workflows to start..."
sleep 20

# Step 2: Find the triage workflow runs triggered by our dispatch
echo ""
echo "============================================"
echo " Finding triggered triage runs"
echo "============================================"
echo ""

for i in 0 1 2; do
  repo="${REPOS[$i]}"
  echo "▶ Checking $repo..."

  run_info=$(gh api "repos/$repo/actions/runs?per_page=5&event=repository_dispatch" \
    -q '[.workflow_runs[] | select(.name | test("[Tt]riage"))] | .[0] | "\(.id)|\(.status)|\(.conclusion // "none")"' \
    2>/dev/null || echo "")

  if [ -n "$run_info" ] && [ "$run_info" != "null|null|null" ]; then
    triage_id=$(echo "$run_info" | cut -d'|' -f1)
    status=$(echo "$run_info" | cut -d'|' -f2)
    conclusion=$(echo "$run_info" | cut -d'|' -f3)
    TRIAGE_RUN_IDS[$i]="$triage_id"
    echo "  Run ID: $triage_id  Status: $status  Conclusion: $conclusion"
  else
    echo "  ⚠️  No triage run found yet"
  fi
  echo ""
done

# Step 3: Poll until all runs complete (max 10 minutes)
echo "============================================"
echo " Monitoring triage runs"
echo "============================================"
echo ""

MAX_POLLS=40
POLL_INTERVAL=15
poll=0

while [ $poll -lt $MAX_POLLS ]; do
  all_done=true

  for i in 0 1 2; do
    repo="${REPOS[$i]}"
    run_id="${TRIAGE_RUN_IDS[$i]}"

    if [ -z "$run_id" ]; then
      run_info=$(gh api "repos/$repo/actions/runs?per_page=5&event=repository_dispatch" \
        -q '[.workflow_runs[] | select(.name | test("[Tt]riage"))] | .[0] | "\(.id)|\(.status)|\(.conclusion // "none")"' \
        2>/dev/null || echo "")

      if [ -n "$run_info" ] && [ "$run_info" != "null|null|null" ]; then
        run_id=$(echo "$run_info" | cut -d'|' -f1)
        TRIAGE_RUN_IDS[$i]="$run_id"
        echo "  [$repo] Found run: $run_id"
      else
        all_done=false
        continue
      fi
    fi

    status_info=$(gh api "repos/$repo/actions/runs/$run_id" \
      -q '"\(.status)|\(.conclusion // "none")"' 2>/dev/null || echo "unknown|unknown")
    status=$(echo "$status_info" | cut -d'|' -f1)
    conclusion=$(echo "$status_info" | cut -d'|' -f2)

    if [ "$status" = "completed" ]; then
      echo "  [$repo] ✅ Completed — conclusion: $conclusion"
    else
      echo "  [$repo] ⏳ $status"
      all_done=false
    fi
  done

  if $all_done; then
    echo ""
    echo "All triage runs completed!"
    break
  fi

  poll=$((poll + 1))
  echo ""
  echo "  Polling again in ${POLL_INTERVAL}s... ($poll/$MAX_POLLS)"
  sleep $POLL_INTERVAL
done

# Step 4: Final report
echo ""
echo "============================================"
echo " Final Report"
echo "============================================"
echo ""

for i in 0 1 2; do
  repo="${REPOS[$i]}"
  run_id="${TRIAGE_RUN_IDS[$i]}"

  if [ -z "$run_id" ]; then
    echo "❌ $repo — No triage run found"
    echo ""
    continue
  fi

  run_data=$(gh api "repos/$repo/actions/runs/$run_id" \
    -q '"\(.conclusion // "unknown")|\(.html_url)"' 2>/dev/null || echo "unknown|unknown")
  conclusion=$(echo "$run_data" | cut -d'|' -f1)
  url=$(echo "$run_data" | cut -d'|' -f2)

  if [ "$conclusion" = "success" ]; then
    icon="✅"
  elif [ "$conclusion" = "failure" ]; then
    icon="❌"
  else
    icon="⚠️"
  fi

  echo "$icon $repo"
  echo "   Conclusion: $conclusion"
  echo "   URL: $url"
  echo ""
done

echo "============================================"
echo " Smoke test complete"
echo "============================================"
