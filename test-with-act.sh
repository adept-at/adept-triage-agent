#!/bin/bash

echo "=== Test GitHub Actions Workflow with 'act' ==="
echo ""

# Check if act is installed
if ! command -v act &> /dev/null; then
    echo "❌ 'act' is not installed."
    echo ""
    echo "To install act:"
    echo "  macOS:    brew install act"
    echo "  Linux:    curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash"
    echo "  Or visit: https://github.com/nektos/act"
    echo ""
    exit 1
fi

# Create a test workflow file
cat > .github/workflows/test-triage-slack.yml << 'EOF'
name: Test Triage Slack Notification

on:
  workflow_dispatch:

jobs:
  test-slack:
    runs-on: ubuntu-latest
    steps:
      - name: Simulate triage outputs
        id: triage
        run: |
          # Simulate the outputs from the triage agent
          echo "verdict=TEST_ISSUE" >> $GITHUB_OUTPUT
          echo "confidence=100" >> $GITHUB_OUTPUT
          
          # This is the problematic summary with backticks
          SUMMARY='🧪 **Test Issue**: The root cause of the failure is an assertion in the test code that intentionally looks for a non-existent element: `[data-test="non-existent-element-for-triage-testing"]`

📸 Analysis includes 3 screenshots

Key indicators: Assertion for non-existent element added in test code, PR diff shows intentional failure block in test file, Error message matches intentional assertion'
          
          # GitHub Actions handles multiline outputs specially
          EOF_MARKER=$(dd if=/dev/urandom bs=15 count=1 status=none | base64)
          echo "summary<<$EOF_MARKER" >> $GITHUB_OUTPUT
          echo "$SUMMARY" >> $GITHUB_OUTPUT
          echo "$EOF_MARKER" >> $GITHUB_OUTPUT

      - name: Send triage results to Slack
        env:
          VERDICT: ${{ steps.triage.outputs.verdict }}
          CONFIDENCE: ${{ steps.triage.outputs.confidence }}
          SUMMARY: ${{ steps.triage.outputs.summary }}
          JOB_NAME: "ag-grid-e2e (test.spec.js)"
          PR_NUMBER: "3221"
          COMMIT_SHA: "62532b5086fbc41b55c6b1393fa0d45716772182"
          REPO_URL: "adept-at/learn-webapp"
          BRANCH_NAME: "pm-test-triage-agent-e2e-2"
          PREVIEW_URL: "https://preview.example.com"
          WORKFLOW_RUN_ID: "16542211028"
        run: |
          # Determine emoji and color
          if [ "$VERDICT" = "TEST_ISSUE" ]; then
            EMOJI="⚠️"
            COLOR="warning"
          elif [ "$VERDICT" = "APPLICATION_ERROR" ]; then
            EMOJI="🚨"
            COLOR="danger"
          elif [ "$VERDICT" = "INFRASTRUCTURE" ]; then
            EMOJI="🚧"
            COLOR="warning"
          else
            EMOJI="❓"
            COLOR="warning"
          fi

          # Create JSON payload using jq for proper escaping
          JSON_PAYLOAD=$(jq -n \
            --arg color "$COLOR" \
            --arg emoji "$EMOJI" \
            --arg verdict "$VERDICT" \
            --arg confidence "$CONFIDENCE" \
            --arg summary "$SUMMARY" \
            --arg job_name "$JOB_NAME" \
            --arg pr_number "$PR_NUMBER" \
            --arg branch "$BRANCH_NAME" \
            --arg preview_url "$PREVIEW_URL" \
            --arg workflow_url "https://github.com/$REPO_URL/actions/runs/$WORKFLOW_RUN_ID" \
            '{
              attachments: [{
                color: $color,
                blocks: [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: ($emoji + " *AI Triage Result:* " + $verdict + " (" + $confidence + "% confidence)")
                    }
                  },
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: ("*Job:* " + $job_name + "\n*Branch:* " + $branch + "\n*PR:* #" + $pr_number)
                    }
                  },
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: ("*Summary:*\n" + $summary)
                    }
                  },
                  {
                    type: "actions",
                    elements: [
                      {
                        type: "button",
                        text: {
                          type: "plain_text",
                          text: "View Workflow"
                        },
                        url: $workflow_url
                      },
                      {
                        type: "button",
                        text: {
                          type: "plain_text",
                          text: "View Preview"
                        },
                        url: $preview_url
                      }
                    ]
                  }
                ]
              }]
            }')

          echo "Generated JSON payload:"
          echo "$JSON_PAYLOAD" | jq .
          
          # For testing, send to httpbin instead of Slack
          if [ -n "${{ secrets.CYPRESS_SLACK_WEBHOOK_URL }}" ]; then
            curl -X POST -H 'Content-type: application/json' \
              --data "$JSON_PAYLOAD" \
              "${{ secrets.CYPRESS_SLACK_WEBHOOK_URL }}"
          else
            echo ""
            echo "No Slack webhook configured, sending to httpbin for testing..."
            curl -X POST -H 'Content-type: application/json' \
              --data "$JSON_PAYLOAD" \
              https://httpbin.org/post
          fi
EOF

echo "Test workflow created at: .github/workflows/test-triage-slack.yml"
echo ""
echo "Running with act..."
echo "=================="

# Run with act
act workflow_dispatch -W .github/workflows/test-triage-slack.yml

echo ""
echo "=== Cleanup ==="
read -p "Remove test workflow file? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -f .github/workflows/test-triage-slack.yml
    echo "Test workflow removed."
fi 