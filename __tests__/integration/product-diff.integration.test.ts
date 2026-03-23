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

  describe('fetchDiffWithFallback no longer includes product repo (v1.25.0)', () => {
    it('should return null when no PR/branch/commit context — product diff is fetched separately', async () => {
      const inputs: ActionInputs = {
        githubToken: GITHUB_TOKEN!,
        openaiApiKey: '',
        confidenceThreshold: 70,
        productRepo: 'adept-at/learn-webapp',
        productDiffCommits: 3,
      };

      const diff = await fetchDiffWithFallback(artifactFetcher, inputs);
      expect(diff).toBeNull();
    }, 10000);
  });

  describe('Real-world simulation: product diff fetched independently', () => {
    it('should fetch product diff directly via fetchRecentProductDiff', async () => {
      const diff = await artifactFetcher.fetchRecentProductDiff(
        'adept-at/learn-webapp',
        5
      );

      expect(diff).not.toBeNull();
      expect(diff!.files.length).toBeGreaterThan(0);

      console.log('\n========================================');
      console.log(' SIMULATION: Product diff (always fetched in parallel)');
      console.log('========================================');
      console.log(`Files: ${diff!.totalChanges}, +${diff!.additions}/-${diff!.deletions}`);
      diff!.files.slice(0, 10).forEach((f, i) => {
        console.log(`  ${i + 1}. ${f.filename} [${f.status}]`);
      });
    }, 30000);
  });
});
