#!/usr/bin/env node

// Complete end-to-end test of the Adept Triage Agent
// This simulates what would have happened if the triage had worked correctly

const { spawn } = require('child_process');
const path = require('path');

console.log('🔬 Complete End-to-End Test of Adept Triage Agent v1.3.0\n');
console.log('='.repeat(60));
console.log('Testing with real workflow failure from lib-cypress-canary');
console.log('='.repeat(60) + '\n');

// Real workflow parameters from the failed run
const TEST_PARAMS = {
  WORKFLOW_RUN_ID: '16541467263',
  JOB_NAME: 'previewUrlTest (lexical.preview.url.sca.js)',
  REPOSITORY: 'adept-at/lib-cypress-canary',
  PR_NUMBER: '', // This was a scheduled run, no PR
  COMMIT_SHA: 'd5f4e3b2a1', // Example commit
  BRANCH: 'main',
};

console.log('📋 Test Parameters:');
console.log(`  Repository: ${TEST_PARAMS.REPOSITORY}`);
console.log(
  `  Workflow Run: https://github.com/${TEST_PARAMS.REPOSITORY}/actions/runs/${TEST_PARAMS.WORKFLOW_RUN_ID}`
);
console.log(`  Job Name: ${TEST_PARAMS.JOB_NAME}`);
console.log(`  Branch: ${TEST_PARAMS.BRANCH}`);
console.log(
  `  PR Number: ${TEST_PARAMS.PR_NUMBER || '(none - scheduled run)'}`
);
console.log('\n' + '='.repeat(60) + '\n');

// Set up environment variables
process.env.INPUT_GITHUB_TOKEN = process.env.GITHUB_TOKEN;
process.env.INPUT_OPENAI_API_KEY = process.env.OPENAI_API_KEY;
process.env.INPUT_WORKFLOW_RUN_ID = TEST_PARAMS.WORKFLOW_RUN_ID;
process.env.INPUT_JOB_NAME = TEST_PARAMS.JOB_NAME;
process.env.INPUT_REPOSITORY = TEST_PARAMS.REPOSITORY;
process.env.INPUT_PR_NUMBER = TEST_PARAMS.PR_NUMBER;
process.env.INPUT_COMMIT_SHA = TEST_PARAMS.COMMIT_SHA;
process.env.INPUT_CONFIDENCE_THRESHOLD = '70';

// GitHub Actions environment variables
process.env.GITHUB_REPOSITORY = TEST_PARAMS.REPOSITORY;
process.env.GITHUB_ACTION = 'adept-triage-agent';
process.env.GITHUB_WORKFLOW = 'e2e-test';
process.env.GITHUB_RUN_ID = '999999999';
process.env.GITHUB_RUN_NUMBER = '1';

console.log('🚀 Starting Triage Analysis...\n');

// Capture start time
const startTime = Date.now();

// Run the compiled action
const actionPath = path.join(__dirname, 'dist', 'index.js');
const child = spawn('node', [actionPath], {
  env: process.env,
  stdio: 'pipe', // Capture output for formatting
});

let output = '';

child.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;

  // Format and display key information
  if (text.includes('Analyzing job:')) {
    console.log('✅ ' + text.trim());
  } else if (text.includes('screenshots found')) {
    console.log('📸 ' + text.trim());
  } else if (text.includes('artifact(s) specific to job')) {
    console.log('📦 ' + text.trim());
  } else if (text.includes('Using GPT-4')) {
    console.log('\n🧠 ' + text.trim());
  } else if (text.includes('Verdict:')) {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 ANALYSIS RESULTS');
    console.log('='.repeat(60));
    console.log(text.trim());
  } else if (text.includes('Confidence:') || text.includes('Summary:')) {
    console.log(text.trim());
  } else if (text.includes('::set-output')) {
    // Skip GitHub Actions output commands in display
  } else {
    process.stdout.write(text);
  }
});

child.stderr.on('data', (data) => {
  process.stderr.write(data);
});

child.on('exit', (code) => {
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(60));

  if (code === 0) {
    console.log('✅ TEST COMPLETED SUCCESSFULLY');

    // Extract and display the verdict details
    const verdictMatch = output.match(/::set-output name=verdict::(.+)/);
    const confidenceMatch = output.match(/::set-output name=confidence::(.+)/);
    const reasoningMatch = output.match(/::set-output name=reasoning::(.+)/);

    if (verdictMatch && confidenceMatch) {
      console.log('='.repeat(60));
      console.log('\n📊 FINAL RESULTS:');
      console.log(`  Verdict: ${verdictMatch[1]}`);
      console.log(`  Confidence: ${confidenceMatch[1]}%`);
      console.log(`  Duration: ${duration}s`);

      if (reasoningMatch) {
        console.log('\n📝 AI Reasoning:');
        console.log(reasoningMatch[1].replace(/\\n/g, '\n  '));
      }
    }
  } else {
    console.log(`❌ TEST FAILED with exit code: ${code}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🏁 End-to-End Test Complete');
  console.log('='.repeat(60));

  process.exit(code);
});
