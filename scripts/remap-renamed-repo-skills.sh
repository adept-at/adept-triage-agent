#!/usr/bin/env bash
# One-off: remap triage skills in DynamoDB after the wdio repo renames
# (lib-wdio-8-multi-remote -> lib-wdio-9-multi-remote,
#  lib-wdio-8-e2e-ts      -> lib-wdio-9-e2e).
#
# Usage: ./remap-renamed-repo-skills.sh [aws-profile]
#
# Copies each item to the new pk first (one put-item per item — no
# batch-write 25-request limit), verifies the new-pk count, and only then
# deletes the old items. Safe to re-run: puts are idempotent (same sk),
# and a failed verification aborts before any delete.
set -euo pipefail

[ "${1:-}" != "" ] && export AWS_PROFILE="$1"
TABLE=triage-skills-v1-live
REGION=us-east-1
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Counts by length of the auto-paginated Items array; `--select COUNT`
# only reflects the final page when the CLI paginates.
count_for_pk() {
  aws dynamodb query --table-name "$TABLE" --region "$REGION" \
    --key-condition-expression "pk = :pk" \
    --expression-attribute-values "{\":pk\":{\"S\":\"REPO#$1\"}}" \
    --projection-expression "pk" --output json \
    | python3 -c "import json,sys; print(len(json.load(sys.stdin)['Items']))"
}

remap_repo() {
  local OLD="$1" NEW="$2"
  echo "=== $OLD -> $NEW ==="
  rm -f "$WORK"/*.json

  # The AWS CLI auto-paginates `query`: Items spans every page.
  aws dynamodb query --table-name "$TABLE" --region "$REGION" \
    --key-condition-expression "pk = :pk" \
    --expression-attribute-values "{\":pk\":{\"S\":\"REPO#$OLD\"}}" \
    --output json > "$WORK/old-items.json"

  local COUNT
  COUNT=$(python3 -c "import json; print(len(json.load(open('$WORK/old-items.json'))['Items']))")
  echo "found $COUNT item(s) under REPO#$OLD"
  [ "$COUNT" -eq 0 ] && return 0

  # One pair of files per item: NNNN.put.json (rewritten copy under the
  # new pk) and NNNN.key.json (old pk+sk for the delete pass).
  NEW_REPO="$NEW" WORK="$WORK" python3 <<'EOF'
import json, os
new, work = os.environ['NEW_REPO'], os.environ['WORK']
for i, item in enumerate(json.load(open(f'{work}/old-items.json'))['Items']):
    with open(f'{work}/{i:04d}.key.json', 'w') as f:
        json.dump({'pk': item['pk'], 'sk': item['sk']}, f)
    copy = dict(item)
    copy['pk'] = {'S': f'REPO#{new}'}
    copy['repo'] = {'S': new}
    with open(f'{work}/{i:04d}.put.json', 'w') as f:
        json.dump(copy, f)
EOF

  local f
  for f in "$WORK"/*.put.json; do
    aws dynamodb put-item --table-name "$TABLE" --region "$REGION" --item "file://$f"
  done

  local NEW_COUNT
  NEW_COUNT=$(count_for_pk "$NEW")
  echo "verified $NEW_COUNT item(s) now under REPO#$NEW"
  if [ "$NEW_COUNT" -lt "$COUNT" ]; then
    echo "ABORT: new pk count ($NEW_COUNT) < old count ($COUNT); old items NOT deleted"
    return 1
  fi

  for f in "$WORK"/*.key.json; do
    aws dynamodb delete-item --table-name "$TABLE" --region "$REGION" --key "file://$f"
  done
  echo "deleted $COUNT old item(s) under REPO#$OLD"
}

remap_repo "adept-at/lib-wdio-8-multi-remote" "adept-at/lib-wdio-9-multi-remote"
remap_repo "adept-at/lib-wdio-8-e2e-ts" "adept-at/lib-wdio-9-e2e"

echo "=== final pk distribution ==="
aws dynamodb scan --table-name "$TABLE" --region "$REGION" \
  --projection-expression "pk" --query 'Items[].pk.S' --output text \
  | tr '\t' '\n' | sort | uniq -c
