/**
 * Live test: Run ArtifactFetcher against a real failed WDIO run.
 *
 * Usage (from repo root):
 *   GITHUB_TOKEN=$(gh auth token) npx ts-node scripts/test-real-artifacts.ts
 */

import { Octokit } from '@octokit/rest';
import { ArtifactFetcher } from '../src/artifact-fetcher';
import { extractErrorFromLogs } from '../src/simplified-analyzer';
import { capArtifactLogs } from '../src/services/log-processor';
import { createAgentContext, getFrameworkLabel } from '../src/agents/base-agent';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!GITHUB_TOKEN) {
  console.error('Set GITHUB_TOKEN or GH_TOKEN');
  process.exit(1);
}

const RUN_ID = '21914697303';
const JOB_NAME = 'sauceTest';
const REPO = { owner: 'adept-at', repo: 'lib-wdio-8-multi-remote' };

async function main() {
  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const fetcher = new ArtifactFetcher(octokit);

  // ── 1. Job logs ──────────────────────────────────────────────
  console.log('═══ 1. Download job logs ═══');
  const jobs = await octokit.actions.listJobsForWorkflowRun({
    ...REPO,
    run_id: parseInt(RUN_ID),
  });
  const failedJob = jobs.data.jobs.find(
    (j: { name: string; conclusion: string | null }) =>
      j.name === JOB_NAME && j.conclusion === 'failure'
  );
  if (!failedJob) {
    console.error(`No failed job named "${JOB_NAME}"`);
    process.exit(1);
  }
  console.log(`  Job ID: ${failedJob.id}`);

  const logsResp = await octokit.actions.downloadJobLogsForWorkflowRun({
    ...REPO,
    job_id: failedJob.id,
  });
  const rawLogs = logsResp.data as unknown as string;
  console.log(`  Raw log size: ${rawLogs.length} chars`);

  // ── 2. extractErrorFromLogs ──────────────────────────────────
  console.log('\n═══ 2. extractErrorFromLogs ═══');
  const errorData = extractErrorFromLogs(rawLogs);
  if (errorData) {
    console.log(`  ✅ framework : ${errorData.framework}`);
    console.log(`  ✅ message   : ${errorData.message.substring(0, 200)}`);
    console.log(`  ✅ testName  : ${errorData.testName}`);
    console.log(`  ✅ fileName  : ${errorData.fileName}`);
  } else {
    console.log('  ❌ returned null – no error extracted from logs');
  }

  // ── 3. fetchScreenshots ──────────────────────────────────────
  console.log('\n═══ 3. fetchScreenshots ═══');
  const screenshots = await fetcher.fetchScreenshots(RUN_ID, JOB_NAME, REPO);
  console.log(`  Screenshots returned: ${screenshots.length}`);
  for (const s of screenshots) {
    console.log(
      `    📷 ${s.name}  (${s.path})  base64len=${s.base64Data?.length ?? 0}`
    );
  }
  if (screenshots.length === 0) {
    console.log(
      '  ⚠️  No screenshots captured – isScreenshotFile may be rejecting WDIO PNGs'
    );
  }

  // ── 4. fetchTestArtifactLogs ─────────────────────────────────
  console.log('\n═══ 4. fetchTestArtifactLogs ═══');
  const artifactLogs = await fetcher.fetchTestArtifactLogs(
    RUN_ID,
    JOB_NAME,
    REPO
  );
  console.log(`  Artifact log length: ${artifactLogs.length} chars`);
  if (artifactLogs.length > 0) {
    console.log(`  ✅ First 300 chars:\n${artifactLogs.substring(0, 300)}`);
    const hasExpect =
      artifactLogs.includes('toContain') || artifactLogs.includes('expect');
    const has1Min = artifactLogs.includes('1 min');
    console.log(`  Contains 'expect/toContain': ${hasExpect}`);
    console.log(`  Contains '1 min': ${has1Min}`);
  } else {
    console.log('  ⚠️  Empty artifact logs');
  }

  // ── 5. capArtifactLogs ───────────────────────────────────────
  console.log('\n═══ 5. capArtifactLogs (truncation) ═══');
  const capped = capArtifactLogs(artifactLogs);
  console.log(`  Capped length: ${capped.length} chars`);
  const cappedHasError =
    capped.includes('toContain') ||
    capped.includes('expect') ||
    capped.includes('1 min');
  console.log(`  Error preserved after capping: ${cappedHasError}`);

  // ── 6. Pipeline context ──────────────────────────────────────
  console.log('\n═══ 6. Agent context & framework label ═══');
  const ctx = createAgentContext({
    errorMessage: errorData?.message || '',
    testFile: errorData?.fileName || '',
    testName: errorData?.testName || '',
    framework: errorData?.framework,
    screenshots: screenshots.map((s) => ({
      name: s.name,
      path: s.path,
      base64Data: s.base64Data || '',
    })),
  });
  console.log(`  context.framework  : ${ctx.framework}`);
  console.log(`  getFrameworkLabel(): ${getFrameworkLabel(ctx.framework)}`);
  console.log(`  context.testFile   : ${ctx.testFile}`);
  console.log(`  context.testName   : ${ctx.testName}`);
  console.log(`  screenshots in ctx : ${ctx.screenshots?.length ?? 0}`);

  // ── Summary ──────────────────────────────────────────────────
  console.log('\n═══ SUMMARY ═══');
  const issues: string[] = [];
  if (!errorData) issues.push('extractErrorFromLogs returned null');
  if (errorData && errorData.framework !== 'webdriverio')
    issues.push(`framework is "${errorData.framework}", expected "webdriverio"`);
  if (screenshots.length === 0)
    issues.push('No screenshots captured from artifacts');
  if (artifactLogs.length === 0) issues.push('No artifact logs captured');
  if (!cappedHasError) issues.push('Error context lost after capArtifactLogs');

  if (issues.length === 0) {
    console.log(
      '  ✅ All checks passed – triage agent would process this run correctly'
    );
  } else {
    console.log('  ❌ Issues found:');
    issues.forEach((i) => console.log(`     - ${i}`));
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
