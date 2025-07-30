#!/bin/bash

echo "=== Reproducing the EXACT GitHub Actions Error ==="
echo ""

# Create a script that shows what GitHub Actions generates with direct substitution
cat > github_actions_generated.sh << 'EOF'
#!/bin/bash
# This is what GitHub Actions creates when it substitutes ${{ steps.triage.outputs.summary }}
SUMMARY="🧪 **Test Issue**: The root cause of the failure is an assertion in the test code that intentionally looks for a non-existent element: `[data-test="non-existent-element-for-triage-testing"]`

📸 Analysis includes 3 screenshots"
EOF

echo "1. The problematic script that GitHub Actions would generate:"
echo "============================================================="
cat github_actions_generated.sh
echo "============================================================="
echo ""

echo "2. Running this script to see the error:"
echo "----------------------------------------"
bash github_actions_generated.sh 2>&1 || echo -e "\n❌ FAILED with exit code: $?"

echo ""
echo "3. The error explained:"
echo "-----------------------"
echo "The backticks in the string are interpreted as command substitution."
echo "The shell tries to execute: [data-test=\"non-existent-element-for-triage-testing\"]"
echo "This is not a valid command, hence: 'command not found'"

echo ""
echo "4. Testing the solution with environment variables:"
echo "===================================================="

# The fixed approach
SUMMARY='🧪 **Test Issue**: The root cause of the failure is an assertion in the test code that intentionally looks for a non-existent element: `[data-test="non-existent-element-for-triage-testing"]`

📸 Analysis includes 3 screenshots' \
bash -c 'echo "Summary received via environment: ${SUMMARY:0:50}..."'

echo "✅ No error! Environment variables prevent shell interpretation."

# Cleanup
rm -f github_actions_generated.sh 