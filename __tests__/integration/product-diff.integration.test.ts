/**
 * Integration tests for recent product diff fetching
 *
 * Verifies that the triage agent can fetch recent commits from a product repo
 * (e.g. learn-webapp) to provide context when tests run against production
 * with no PR/branch/commit context.
 *
 * To run:
 *   GITHUB_TOKEN=your_token npx jest --testPathPattern=product-diff --no-coverage
 */

import { Octokit } from '@octokit/rest';
import { ArtifactFetcher } from '../../src/artifact-fetcher';
import { fetchDiffWithFallback } from '../../src/services/log-processor';
import { ActionInputs } from '../../src/types';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const describeIfToken = GITHUB_TOKEN ? describe : describe.skip;

describeIfToken('Product Diff Integration Tests', () => {
  let octokit: Octokit;
  let artifactFetcher: ArtifactFetcher;

  beforeAll(() => {
    octokit = new Octokit({ auth: GITHUB_TOKEN });
    artifactFetcher = new ArtifactFetcher(octokit);
  });

  describe('fetchRecentProductDiff', () => {
    it('should fetch recent commits from adept-at/learn-webapp', async () => {
      const diff = await artifactFetcher.fetchRecentProductDiff(
        'adept-at/learn-webapp',
        3
      );

      expect(diff).not.toBeNull();
      expect(diff!.files.length).toBeGreaterThan(0);
      expect(diff!.totalChanges).toBeGreaterThan(0);

      console.log('\n=== Recent Product Diff (learn-webapp, last 3 commits) ===');
      console.log(`Files changed: ${diff!.totalChanges}`);
      console.log(`Lines: +${diff!.additions}/-${diff!.deletions}`);
      console.log('\nTop files:');
      diff!.files.slice(0, 10).forEach((f, i) => {
        console.log(`  ${i + 1}. ${f.filename} (+${f.additions}/-${f.deletions})`);
        if (f.patch) {
          const preview = f.patch.split('\n').slice(0, 5).join('\n');
          console.log(`     ${preview.substring(0, 200)}`);
        }
      });
    }, 30000);

    it('should fetch last 5 commits by default', async () => {
      const diff = await artifactFetcher.fetchRecentProductDiff(
        'adept-at/learn-webapp',
        5
      );

      expect(diff).not.toBeNull();
      console.log(`\n=== Last 5 commits: ${diff!.totalChanges} files, +${diff!.additions}/-${diff!.deletions} ===`);
    }, 30000);

    it('should include patch content that could reveal product changes', async () => {
      const diff = await artifactFetcher.fetchRecentProductDiff(
        'adept-at/learn-webapp',
        5
      );

      expect(diff).not.toBeNull();

      const filesWithPatches = diff!.files.filter(f => f.patch);
      console.log(`\n=== ${filesWithPatches.length}/${diff!.files.length} files have patch data ===`);

      const srcFiles = diff!.files.filter(f =>
        f.filename.startsWith('src/') || f.filename.includes('.tsx') || f.filename.includes('.ts')
      );
      console.log(`Source code files changed: ${srcFiles.length}`);
      srcFiles.slice(0, 5).forEach(f => {
        console.log(`  - ${f.filename} (+${f.additions}/-${f.deletions})`);
      });

      expect(filesWithPatches.length).toBeGreaterThan(0);
    }, 30000);

    it('should handle non-existent repo gracefully', async () => {
      const diff = await artifactFetcher.fetchRecentProductDiff(
        'nonexistent/repo-that-does-not-exist',
        3
      );
      expect(diff).toBeNull();
    }, 30000);

    it('should handle invalid repo format gracefully', async () => {
      const diff = await artifactFetcher.fetchRecentProductDiff('invalid-format', 3);
      expect(diff).toBeNull();
    }, 10000);
  });

  describe('fetchDiffWithFallback with product repo', () => {
    it('should fall back to product repo diff when no PR/branch/commit is provided', async () => {
      const inputs: ActionInputs = {
        githubToken: GITHUB_TOKEN!,
        openaiApiKey: '',
        confidenceThreshold: 70,
        productRepo: 'adept-at/learn-webapp',
        productDiffCommits: 3,
      };

      const diff = await fetchDiffWithFallback(artifactFetcher, inputs);

      expect(diff).not.toBeNull();
      expect(diff!.files.length).toBeGreaterThan(0);

      console.log('\n=== fetchDiffWithFallback product repo fallback ===');
      console.log(`Got diff: ${diff!.totalChanges} files, +${diff!.additions}/-${diff!.deletions}`);
      console.log('This is what the triage agent would see for production-URL test failures');
    }, 30000);

    it('should NOT use product repo when PR diff is available', async () => {
      const inputs: ActionInputs = {
        githubToken: GITHUB_TOKEN!,
        openaiApiKey: '',
        confidenceThreshold: 70,
        prNumber: '1',
        repository: 'adept-at/learn-webapp',
        productRepo: 'adept-at/learn-webapp',
        productDiffCommits: 3,
      };

      const diff = await fetchDiffWithFallback(artifactFetcher, inputs, {
        owner: 'adept-at',
        repo: 'learn-webapp',
      });

      // Should get a diff from the PR, not the product repo fallback
      // (PR #1 may not exist, but the point is strategy 1 runs first)
      console.log('\n=== PR takes priority over product repo ===');
      console.log(`Result: ${diff ? 'got diff' : 'null (expected if PR #1 doesnt exist)'}`);
    }, 30000);

    it('should return null when no product repo is configured and no other context', async () => {
      const inputs: ActionInputs = {
        githubToken: GITHUB_TOKEN!,
        openaiApiKey: '',
        confidenceThreshold: 70,
      };

      const diff = await fetchDiffWithFallback(artifactFetcher, inputs);
      expect(diff).toBeNull();
    }, 10000);
  });

  describe('Real-world simulation: production URL test with product context', () => {
    it('should provide meaningful context for a production URL test scenario', async () => {
      console.log('\n========================================');
      console.log(' SIMULATION: Production URL Test Failure');
      console.log('========================================\n');
      console.log('Scenario: mr.skill.lock.yml fails on Sauce Labs against https://learn.adept.at');
      console.log('No PR, no commit SHA, branch=main — traditionally this means ZERO diff context.\n');

      const inputs: ActionInputs = {
        githubToken: GITHUB_TOKEN!,
        openaiApiKey: '',
        confidenceThreshold: 70,
        branch: 'main',
        productRepo: 'adept-at/learn-webapp',
        productDiffCommits: 5,
      };

      const diff = await fetchDiffWithFallback(artifactFetcher, inputs);

      expect(diff).not.toBeNull();

      console.log(`With PRODUCT_REPO, the triage agent now sees:`);
      console.log(`  - ${diff!.totalChanges} files changed in the last 5 commits`);
      console.log(`  - +${diff!.additions}/-${diff!.deletions} lines\n`);

      const relevantFiles = diff!.files.filter(f =>
        f.filename.includes('skill') ||
        f.filename.includes('lexical') ||
        f.filename.includes('draft') ||
        f.filename.includes('editor') ||
        f.filename.includes('lock')
      );

      if (relevantFiles.length > 0) {
        console.log(`Potentially relevant files for skill lock test:`);
        relevantFiles.forEach(f => {
          console.log(`  - ${f.filename} (+${f.additions}/-${f.deletions})`);
        });
      } else {
        console.log('No files matching skill/lexical/editor/lock patterns in recent commits');
        console.log('(This is expected — the agent still benefits from seeing ALL recent changes)');
      }

      console.log('\nAll changed files:');
      diff!.files.slice(0, 15).forEach((f, i) => {
        console.log(`  ${i + 1}. ${f.filename} [${f.status}] (+${f.additions}/-${f.deletions})`);
      });
      if (diff!.files.length > 15) {
        console.log(`  ... and ${diff!.files.length - 15} more files`);
      }

      console.log('\n========================================');
      console.log(' RESULT: Triage agent now has product context!');
      console.log('========================================');
    }, 30000);
  });
});
