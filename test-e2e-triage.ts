#!/usr/bin/env ts-node

import { Octokit } from '@octokit/rest';
import { OpenAIClient } from './src/openai-client';
import { analyzeFailure } from './src/analyzer';
import { ArtifactFetcher } from './src/artifact-fetcher';
import { ErrorData, Screenshot } from './src/types';
import * as fs from 'fs';

// Test configuration - using the specific workflow run provided
const WORKFLOW_RUN_ID = 16228900246;
const REPO_OWNER = 'adept-at';
const REPO_NAME = 'lib-cypress-canary';

async function runE2ETriageTest() {
  console.log('🚀 Running End-to-End Triage Test');
  console.log('================================\n');
  
  // Validate environment
  const githubToken = process.env.GITHUB_TOKEN;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  if (!githubToken || !openaiApiKey) {
    console.error('❌ Missing required environment variables!');
    console.error('Run: source ~/.bash_profile && export GITHUB_TOKEN=$(gh auth token)');
    process.exit(1);
  }
  
  // Initialize services
  const octokit = new Octokit({ auth: githubToken });
  const openaiClient = new OpenAIClient(openaiApiKey);
  const artifactFetcher = new ArtifactFetcher(octokit);
  
  try {
    // Step 1: Fetch workflow run details
    console.log('📋 Step 1: Fetching workflow run details...');
    const { data: workflowRun } = await octokit.actions.getWorkflowRun({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      run_id: WORKFLOW_RUN_ID
    });
    
    console.log(`  ✓ Workflow: ${workflowRun.name}`);
    console.log(`  ✓ Status: ${workflowRun.status}`);
    console.log(`  ✓ Conclusion: ${workflowRun.conclusion}`);
    console.log(`  ✓ URL: ${workflowRun.html_url}\n`);
    
    // Step 2: Get failed jobs
    console.log('🔍 Step 2: Finding failed jobs...');
    const { data: jobs } = await octokit.actions.listJobsForWorkflowRun({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      run_id: WORKFLOW_RUN_ID,
      filter: 'latest'
    });
    
    const failedJobs = jobs.jobs.filter(job => job.conclusion === 'failure');
    console.log(`  ✓ Found ${failedJobs.length} failed job(s)\n`);
    
    // Step 3: Analyze each failed job
    console.log('🤖 Step 3: Running AI analysis on failures...');
    const analysisResults = [];
    
    for (const job of failedJobs) {
      console.log(`  Analyzing job: ${job.name}`);
      
      // Get ALL job logs
      const logsResponse = await octokit.actions.downloadJobLogsForWorkflowRun({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        job_id: job.id
      });
      
      const fullLogs = logsResponse.data as unknown as string;
      console.log(`    - Downloaded ${fullLogs.length} characters of logs`);
      
      // Get ALL artifacts - screenshots and logs
      let screenshots: Screenshot[] = [];
      let cypressLogs = '';
      
      try {
        // Set GITHUB_REPOSITORY for artifact fetcher
        process.env.GITHUB_REPOSITORY = `${REPO_OWNER}/${REPO_NAME}`;
        
        // Fetch screenshots for this specific job
        screenshots = await artifactFetcher.fetchScreenshots(
          WORKFLOW_RUN_ID.toString(),
          job.name
        );
        console.log(`    - Found ${screenshots.length} screenshots`);
        
        // Fetch Cypress logs
        cypressLogs = await artifactFetcher.fetchCypressArtifactLogs(
          WORKFLOW_RUN_ID.toString(),
          job.name
        );
        if (cypressLogs) {
          console.log(`    - Found Cypress artifact logs (${cypressLogs.length} characters)`);
        }
      } catch (err: any) {
        console.log('    - No artifacts available:', err.message);
      }
      
      // Combine EVERYTHING into one context blob
      const combinedContext = [
        `=== JOB INFORMATION ===`,
        `Job Name: ${job.name}`,
        `Job ID: ${job.id}`,
        `Job URL: ${job.html_url}`,
        `Failed Step: ${job.steps?.find(s => s.conclusion === 'failure')?.name || 'Unknown'}`,
        ``,
        `=== GITHUB ACTIONS LOGS ===`,
        fullLogs,
        ``,
        `=== CYPRESS ARTIFACT LOGS ===`,
        cypressLogs || 'No Cypress logs found',
        ``,
        `=== END OF LOGS ===`
      ].join('\n');
      
      // Create simple error data with ALL context
      const errorData: ErrorData = {
        message: 'Test failure - see full context for details',
        framework: 'cypress',
        failureType: 'test-failure',
        context: 'Complete failure context including all logs and artifacts',
        testName: job.name,
        fileName: job.steps?.find(s => s.conclusion === 'failure')?.name || 'Unknown',
        screenshots: screenshots,
        logs: [combinedContext]
      };
      
      // Run AI analysis
      const analysis = await analyzeFailure(openaiClient, errorData);
      console.log(`    - Verdict: ${analysis.verdict}`);
      console.log(`    - Confidence: ${analysis.confidence}%`);
      
      analysisResults.push({
        job,
        errorData,
        analysis
      });
    }
    
    // Step 4: Create triage report
    console.log('\n📊 Step 4: Creating triage report...');
    const triageReport = {
      workflowRunId: WORKFLOW_RUN_ID,
      repository: `${REPO_OWNER}/${REPO_NAME}`,
      workflowName: workflowRun.name,
      workflowUrl: workflowRun.html_url,
      failureTime: workflowRun.created_at,
      conclusion: workflowRun.conclusion,
      
      summary: {
        totalFailures: analysisResults.length,
        testIssues: analysisResults.filter(r => r.analysis.verdict === 'TEST_ISSUE').length,
        productIssues: analysisResults.filter(r => r.analysis.verdict === 'PRODUCT_ISSUE').length
      },
      
      failures: analysisResults.map(result => ({
        jobName: result.job.name,
        jobId: result.job.id,
        jobUrl: result.job.html_url,
        failedStep: result.errorData.fileName,
        verdict: result.analysis.verdict,
        confidence: result.analysis.confidence,
        reasoning: result.analysis.reasoning,
        summary: result.analysis.summary,
        indicators: result.analysis.indicators || [],
        hasArtifacts: result.errorData.screenshots ? result.errorData.screenshots.length > 0 : false
      })),
      
      metadata: {
        analyzedAt: new Date().toISOString(),
        triageVersion: '1.0.0',
                    aiModel: 'gpt-4.1'
      }
    };
    
    // Step 5: Save and display results
    console.log('\n💾 Step 5: Saving results...');
    const outputPath = './e2e-triage-report.json';
    fs.writeFileSync(outputPath, JSON.stringify(triageReport, null, 2));
    console.log(`  ✓ Report saved to: ${outputPath}`);
    
    // Display summary
    console.log('\n📈 Test Summary:');
    console.log('================');
    console.log(`Workflow: ${triageReport.workflowName}`);
    console.log(`Total Failures: ${triageReport.summary.totalFailures}`);
    console.log(`Test Issues: ${triageReport.summary.testIssues}`);
    console.log(`Product Issues: ${triageReport.summary.productIssues}`);
    console.log('\nDetailed Results:');
    
    triageReport.failures.forEach((failure, idx) => {
      console.log(`\n${idx + 1}. ${failure.jobName}`);
      console.log(`   Verdict: ${failure.verdict} (${failure.confidence}% confidence)`);
      console.log(`   Failed at: ${failure.failedStep}`);
      console.log(`   Artifacts: ${failure.hasArtifacts ? 'Yes' : 'No'}`);
    });
    
    console.log('\n✅ End-to-End Test Completed Successfully!');
    
  } catch (error: any) {
    console.error('\n❌ Test Failed:', error.message);
    if (error?.status === 404) {
      console.error('Workflow run not found');
    } else if (error?.status === 401) {
      console.error('Authentication failed - check GitHub token');
    }
    process.exit(1);
  }
}

// Run the test
console.log('Adept Triage Agent - End-to-End Test');
console.log('====================================\n');
console.log(`Testing with workflow: https://github.com/${REPO_OWNER}/${REPO_NAME}/actions/runs/${WORKFLOW_RUN_ID}\n`);

runE2ETriageTest().catch(console.error); 