#!/usr/bin/env npx ts-node
/**
 * Local test script to verify the configured OpenAI model is working
 * via the Responses API (matching production usage).
 *
 * Usage:
 *   OPENAI_API_KEY=your-key npx ts-node scripts/test-model-local.ts
 *
 * Or if you have the key in your environment:
 *   npx ts-node scripts/test-model-local.ts
 */

import OpenAI from 'openai';
import { OPENAI } from '../src/config/constants';

const MODELS_TO_TEST = [OPENAI.MODEL, 'gpt-4o'];

async function testModel() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    console.error('   Set it with: export OPENAI_API_KEY=your-key');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey });

  let workingModel: string | null = null;

  for (const MODEL of MODELS_TO_TEST) {
    console.log('\n🧪 Testing OpenAI Model: ' + MODEL);
    console.log('━'.repeat(50));

  const testErrorData = {
    message: 'Timed out retrying after 10000ms: Expected to find element: [data-testid="submit-button"], but never found it.',
    stackTrace: `at Context.eval (cypress/e2e/login.cy.ts:25:10)
    at runnable.run (node_modules/cypress/lib/driver/src/runnable.ts:123:20)`,
    framework: 'cypress',
    testName: 'should submit the login form',
  };

  const systemPrompt = `You are an expert test failure analyzer. Determine if this is a TEST_ISSUE or PRODUCT_ISSUE.
TEST_ISSUE: Problems with the test code (wrong selectors, timing issues, flaky tests)
PRODUCT_ISSUE: Actual bugs in the product (missing functionality, crashes, API errors)

Respond with JSON: { "verdict": "TEST_ISSUE" | "PRODUCT_ISSUE", "reasoning": "explanation", "indicators": ["indicator1", "indicator2"] }`;

  const userPrompt = `Analyze this test failure:

Error: ${testErrorData.message}

Stack Trace:
${testErrorData.stackTrace}

Framework: ${testErrorData.framework}
Test: ${testErrorData.testName}

Respond with a JSON object.`;

  console.log('\n📤 Sending request to ' + MODEL + ' via Responses API...\n');

  const startTime = Date.now();

  try {
    const response = await openai.responses.create({
      model: MODEL,
      instructions: systemPrompt,
      input: [{ role: 'user' as const, content: userPrompt }],
      max_output_tokens: OPENAI.MAX_COMPLETION_TOKENS,
      text: { format: { type: 'json_object' as const } },
    });

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    const content = response.output_text;

    if (!content) {
      console.error('❌ Empty response from model');
      process.exit(1);
    }

    console.log('📥 Response received in ' + duration + 's');
    console.log('━'.repeat(50));

    const result = JSON.parse(content);

    console.log('\n✅ MODEL WORKING!\n');
    console.log('Model:      ' + MODEL);
    console.log('API:        Responses API');
    console.log('Verdict:    ' + result.verdict);
    console.log('Reasoning:  ' + result.reasoning);
    console.log('Indicators: ' + (result.indicators?.join(', ') || 'none'));

    if (response.usage) {
      console.log('\n📊 Token Usage:');
      console.log('  Input:      ' + response.usage.input_tokens);
      console.log('  Output:     ' + response.usage.output_tokens);
      console.log('  Total:      ' + response.usage.total_tokens);
    }

    console.log('\n━'.repeat(50));
    console.log('🎉 Model "' + MODEL + '" test PASSED!');
    workingModel = MODEL;
    break;

    } catch (error: any) {
      console.error('\n❌ Model "' + MODEL + '" failed:');
      console.error('   ' + (error?.message || error));

      if (error?.status === 401) {
        console.error('   Authentication failed. Check your OPENAI_API_KEY.');
        process.exit(1);
      }
    }
  }

  if (workingModel) {
    console.log('\n' + '═'.repeat(50));
    console.log('✅ RECOMMENDED: Use model "' + workingModel + '" in your code');
    if (workingModel === OPENAI.MODEL) {
      console.log('   (matches OPENAI.MODEL in constants.ts)');
    }
    console.log('═'.repeat(50));
  } else {
    console.error('\n❌ No working models found!');
    process.exit(1);
  }
}

testModel();
