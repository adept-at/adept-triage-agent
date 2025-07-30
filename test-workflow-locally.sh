#!/bin/bash

echo "=== Local GitHub Actions Workflow Test ==="
echo "This simulates the exact workflow behavior locally"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test data that contains problematic characters
TEST_VERDICT="TEST_ISSUE"
TEST_CONFIDENCE="100"
TEST_SUMMARY='🧪 **Test Issue**: The root cause of the failure is an assertion in the test code that intentionally looks for a non-existent element: `[data-test="non-existent-element-for-triage-testing"]`

📸 Analysis includes 3 screenshots

Key indicators: Assertion for non-existent element added in test code, PR diff shows intentional failure block in test file, Error message matches intentional assertion'

# Other workflow data
TEST_JOB_NAME="ag-grid-e2e (ag.grid.training.activity.column.resize.persistence.spec.js)"
TEST_PR_NUMBER="3221"
TEST_COMMIT_SHA="62532b5086fbc41b55c6b1393fa0d45716772182"
TEST_REPO_URL="adept-at/learn-webapp"
TEST_BRANCH_NAME="pm-test-triage-agent-e2e-2"
TEST_PREVIEW_URL="https://learn-webapp-git-pm-test-triage-agent-e2e-2-adept-at.vercel.app"
TEST_WORKFLOW_RUN_ID="16542211028"

# Function to test the workflow
test_workflow() {
    local webhook_url=$1
    
    echo -e "${YELLOW}Testing with webhook: $webhook_url${NC}"
    echo ""
    
    # Export as environment variables (simulating GitHub Actions env: section)
    export VERDICT="$TEST_VERDICT"
    export CONFIDENCE="$TEST_CONFIDENCE"
    export SUMMARY="$TEST_SUMMARY"
    export JOB_NAME="$TEST_JOB_NAME"
    export PR_NUMBER="$TEST_PR_NUMBER"
    export COMMIT_SHA="$TEST_COMMIT_SHA"
    export REPO_URL="$TEST_REPO_URL"
    export BRANCH_NAME="$TEST_BRANCH_NAME"
    export PREVIEW_URL="$TEST_PREVIEW_URL"
    export SPEC="ag.grid.training.activity.column.resize.persistence.spec.js"
    export WORKFLOW_RUN_ID="$TEST_WORKFLOW_RUN_ID"
    
    # Run the exact workflow code
    bash << 'WORKFLOW_SCRIPT'
    set -e
    
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
    echo ""
    
    # Send the message
    if [ -n "$WEBHOOK_URL" ]; then
        echo "Sending to webhook..."
        RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST -H 'Content-type: application/json' \
          --data "$JSON_PAYLOAD" \
          "$WEBHOOK_URL")
        
        HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d':' -f2)
        BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')
        
        echo "Response body: $BODY"
        echo "HTTP Status: $HTTP_STATUS"
        
        if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "201" ] || [ "$HTTP_STATUS" = "204" ]; then
            echo "✅ Success!"
            return 0
        else
            echo "❌ Failed with HTTP status: $HTTP_STATUS"
            return 1
        fi
    else
        echo "No webhook URL provided, skipping actual send"
        return 0
    fi
WORKFLOW_SCRIPT
    
    # Set WEBHOOK_URL for the workflow script
    WEBHOOK_URL="$webhook_url" bash -c 'eval "$BASH_SOURCE"'
}

# Main menu
echo -e "${YELLOW}Choose test option:${NC}"
echo "1. Test with webhook.site (recommended for visual inspection)"
echo "2. Test with httpbin.org (shows request details)"
echo "3. Test with your Slack webhook"
echo "4. Dry run (no actual webhook call)"
echo ""
read -p "Enter choice (1-4): " choice

case $choice in
    1)
        echo ""
        echo -e "${YELLOW}Steps:${NC}"
        echo "1. Go to https://webhook.site"
        echo "2. Copy your unique URL"
        echo "3. Paste it here"
        echo ""
        read -p "Enter webhook.site URL: " webhook_url
        if [ -n "$webhook_url" ]; then
            test_workflow "$webhook_url"
            echo ""
            echo -e "${GREEN}Check https://webhook.site to see the formatted Slack message!${NC}"
        else
            echo -e "${RED}No URL provided${NC}"
        fi
        ;;
    2)
        webhook_url="https://httpbin.org/post"
        test_workflow "$webhook_url"
        ;;
    3)
        read -p "Enter your Slack webhook URL: " webhook_url
        if [ -n "$webhook_url" ]; then
            test_workflow "$webhook_url"
            echo ""
            echo -e "${GREEN}Check your Slack channel!${NC}"
        else
            echo -e "${RED}No URL provided${NC}"
        fi
        ;;
    4)
        test_workflow ""
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo "=== Test Summary ==="
echo "This test simulated the exact GitHub Actions workflow locally."
echo "The summary contained backticks and other special characters that previously caused issues."
echo ""
echo "If the test succeeded, your workflow will work correctly when deployed!" 