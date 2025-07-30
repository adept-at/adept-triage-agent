#!/bin/bash

echo "=== GitHub Actions Simulation Test ==="
echo "This test simulates how GitHub Actions substitutes expressions directly into shell scripts"
echo ""

# This is the problematic summary that contains backticks
PROBLEM_SUMMARY='🧪 **Test Issue**: The root cause of the failure is an assertion in the test code that intentionally looks for a non-existent element: `[data-test="non-existent-element-for-triage-testing"]`

📸 Analysis includes 3 screenshots

Key indicators: Assertion for non-existent element added in test code, PR diff shows intentional failure block in test file, Error message matches intentional assertion'

echo "1. Testing the OLD approach (direct substitution) - THIS SHOULD FAIL:"
echo "=================================================================="

# Create a temporary script that simulates what GitHub Actions generates
cat > temp_old_approach.sh << 'SCRIPT'
#!/bin/bash
# This simulates what GitHub Actions creates with direct substitution
VERDICT="TEST_ISSUE"
CONFIDENCE="100"
SUMMARY="PLACEHOLDER_SUMMARY"  # This will be replaced
SCRIPT

# Replace PLACEHOLDER_SUMMARY with the actual problematic content
# This simulates GitHub Actions' direct substitution
sed -i '' "s|PLACEHOLDER_SUMMARY|${PROBLEM_SUMMARY}|g" temp_old_approach.sh

echo "Generated script content:"
echo "------------------------"
cat temp_old_approach.sh
echo "------------------------"
echo ""
echo "Attempting to run (expecting error):"
bash temp_old_approach.sh 2>&1 || echo "❌ FAILED AS EXPECTED! Exit code: $?"

echo ""
echo ""
echo "2. Testing the NEW approach (environment variables) - THIS SHOULD WORK:"
echo "======================================================================="

# Create a script that uses environment variables
cat > temp_new_approach.sh << 'SCRIPT'
#!/bin/bash
# This simulates the new approach using environment variables
# The variables are already set in the environment, not substituted into the script

echo "VERDICT: $VERDICT"
echo "CONFIDENCE: $CONFIDENCE"
echo "SUMMARY length: ${#SUMMARY}"
echo ""

# Use jq to create JSON with proper escaping
JSON_PAYLOAD=$(jq -n \
  --arg verdict "$VERDICT" \
  --arg confidence "$CONFIDENCE" \
  --arg summary "$SUMMARY" \
  '{
    verdict: $verdict,
    confidence: $confidence,
    summary: $summary
  }')

echo "Generated JSON:"
echo "$JSON_PAYLOAD" | jq .
SCRIPT

echo "Running with environment variables:"
echo "----------------------------------"
# Run with environment variables set
VERDICT="TEST_ISSUE" \
CONFIDENCE="100" \
SUMMARY="$PROBLEM_SUMMARY" \
bash temp_new_approach.sh

EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ SUCCESS! The new approach works correctly"
else
    echo "❌ FAILED with exit code: $EXIT_CODE"
fi

# Cleanup
rm -f temp_old_approach.sh temp_new_approach.sh

echo ""
echo "=== Summary ==="
echo "The old approach fails because GitHub Actions directly substitutes the string into the shell script,"
echo "causing backticks to be interpreted as command substitution."
echo ""
echo "The new approach works because environment variables are passed separately from the script text,"
echo "preventing shell interpretation of special characters." 