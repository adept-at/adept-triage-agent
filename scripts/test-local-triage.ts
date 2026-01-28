#!/usr/bin/env npx ts-node
/**
 * Local end-to-end test for the triage agent
 * Tests the full flow: error analysis -> verdict -> fix recommendation
 *
 * Usage:
 *   npx ts-node scripts/test-local-triage.ts
 */

import { OpenAIClient } from '../src/openai-client';
import { analyzeFailure } from '../src/simplified-analyzer';
import { SimplifiedRepairAgent } from '../src/repair/simplified-repair-agent';
import { buildRepairContext } from '../src/repair-context';
import { ErrorData } from '../src/types';

// Note: @actions/core logging is handled by the modules themselves

async function runLocalTriage() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable required');
    process.exit(1);
  }

  console.log('🧪 Local Triage Agent End-to-End Test');
  console.log('═'.repeat(60));

  // Test case: Typical Cypress element not found error
  const testErrorData: ErrorData = {
    message: `Timed out retrying after 10000ms: Expected to find element: [data-testid="submit-button"], but never found it.

Searched for:
  - cy.get('[data-testid="submit-button"]')

Error occurred at:
  cypress/e2e/login.cy.ts:25:10`,
    stackTrace: `at Context.eval (cypress/e2e/login.cy.ts:25:10)
    at runnable.run (node_modules/cypress/lib/driver/src/runnable.ts:123:20)`,
    framework: 'cypress',
    testName: 'should submit the login form successfully',
    fileName: 'cypress/e2e/login.cy.ts',
    logs: [`
=== CYPRESS LOGS ===
  Running: login.cy.ts
  1) should submit the login form successfully
     ✖ Timed out retrying after 10000ms: Expected to find element: [data-testid="submit-button"], but never found it.

  0 passing (15s)
  1 failing

=== END LOGS ===
`],
  };

  console.log('\n📋 Test Case: Cypress Element Not Found');
  console.log('─'.repeat(60));
  console.log(`Error: ${testErrorData.message.split('\n')[0]}`);
  console.log(`Test: ${testErrorData.testName}`);
  console.log(`File: ${testErrorData.fileName}`);

  // Initialize OpenAI client
  const openaiClient = new OpenAIClient(apiKey);

  console.log('\n🔍 Step 1: Analyzing failure with GPT-5.2...');
  console.log('─'.repeat(60));

  const startAnalysis = Date.now();

  try {
    // Run analysis
    const analysisResult = await analyzeFailure(openaiClient, testErrorData);

    const analysisTime = ((Date.now() - startAnalysis) / 1000).toFixed(2);

    console.log(`\n✅ Analysis completed in ${analysisTime}s`);
    console.log('─'.repeat(60));
    console.log(`Verdict:    ${analysisResult.verdict}`);
    console.log(`Confidence: ${analysisResult.confidence}%`);
    console.log(`Summary:    ${(analysisResult.summary || '').substring(0, 200)}...`);
    console.log(`Indicators: ${(analysisResult.indicators || []).join(', ')}`);

    // If TEST_ISSUE, generate fix recommendation
    if (analysisResult.verdict === 'TEST_ISSUE') {
      console.log('\n🔧 Step 2: Generating fix recommendation...');
      console.log('─'.repeat(60));

      const repairContext = buildRepairContext({
        testFile: testErrorData.fileName || 'unknown',
        testName: testErrorData.testName || 'unknown',
        errorMessage: testErrorData.message,
        workflowRunId: '12345',
        jobName: 'cypress-tests',
        commitSha: 'abc123',
        branch: 'main',
        repository: 'owner/repo',
      });

      const repairAgent = new SimplifiedRepairAgent(openaiClient);
      const startFix = Date.now();

      const fixRecommendation = await repairAgent.generateFixRecommendation(
        repairContext,
        testErrorData
      );

      const fixTime = ((Date.now() - startFix) / 1000).toFixed(2);

      if (fixRecommendation) {
        console.log(`\n✅ Fix recommendation generated in ${fixTime}s`);
        console.log('─'.repeat(60));
        console.log(`Confidence: ${fixRecommendation.confidence}%`);
        console.log(`Summary:    ${fixRecommendation.summary.substring(0, 200)}...`);

        if (fixRecommendation.proposedChanges.length > 0) {
          console.log('\n📝 Proposed Changes:');
          fixRecommendation.proposedChanges.forEach((change, idx) => {
            console.log(`  ${idx + 1}. ${change.file}${change.line ? `:${change.line}` : ''}`);
            console.log(`     ${change.justification.substring(0, 80)}...`);
          });
        }
      } else {
        console.log(`\n⚠️  No fix recommendation generated (confidence too low)`);
      }
    } else {
      console.log('\n📌 PRODUCT_ISSUE detected - no fix recommendation needed');
      if (analysisResult.suggestedSourceLocations?.length) {
        console.log('\n📍 Suggested source locations to investigate:');
        analysisResult.suggestedSourceLocations.forEach((loc, idx) => {
          console.log(`  ${idx + 1}. ${loc.file}:${loc.lines}`);
          console.log(`     ${loc.reason}`);
        });
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('🎉 Local triage test PASSED!');
    console.log('═'.repeat(60));

  } catch (error) {
    console.error('\n❌ Triage failed:', error);
    process.exit(1);
  }
}

// Run without jest
runLocalTriage();
