import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';
import { sanitizeForPrompt } from './skill-store';
import { getBundledRepoContext } from './bundled-repo-contexts';

/**
 * Convention path: each consumer repo can commit a small markdown file
 * describing repo-level conventions, page-object patterns, framework
 * quirks, and "always do this / never do that" rules. The triage agent
 * reads this file once per run and prepends it to every agent's system
 * prompt so analysis, investigation, fix-gen, and review all share the
 * same baseline understanding of the repo.
 *
 * Stable filename so authors don't need to consult docs every time:
 * `.adept-triage/context.md` at the repo root, on the same branch the
 * test was run against.
 *
 * Two-path design: for high-traffic product repos we bundle the context
 * inside adept-triage-agent instead of committing it to the consumer
 * repo — see `bundled-repo-contexts.ts`. Bundled entries short-circuit
 * this path entirely (no `getContent` call, no 404 cost), so adding a
 * repo to the bundle map is the explicit "keep the context here" signal.
 */
export const REPO_CONTEXT_PATH = '.adept-triage/context.md';

/**
 * Per-prompt cap on the repo-context block. Repo-level conventions
 * should be a tight cheat-sheet, not a manual. ~6KB ≈ 1.5K tokens —
 * enough for ~80–120 lines of high-signal conventions (page-object
 * map, selector strategy, wait rules, auth setup, framework quirks)
 * without dominating the system prompt.
 *
 * Anything longer is truncated with a `[truncated]` marker via
 * `sanitizeForPrompt`, which also escapes prompt-injection patterns
 * — the file lives in a consumer repo and could be edited by anyone
 * with commit access, so we treat it as untrusted prompt-adjacent
 * content rather than as trusted system text.
 */
export const REPO_CONTEXT_MAX_CHARS = 6500;

/**
 * In-memory, per-instance cache. Triage runs are short-lived (one
 * GitHub Action invocation), so a per-process Map is enough — we never
 * need cross-run caching here. Keyed by `owner/repo@ref` so tests
 * against different branches don't collide.
 */
type CacheKey = string;

/**
 * Fetches the optional `.adept-triage/context.md` file from a target
 * repo and renders it as a system-prompt-ready block. Designed to fail
 * quietly: a missing file, network blip, or auth error returns `''`
 * rather than throwing — repo context is a smarter-prompts feature,
 * not a critical-path dependency. The triage agent must keep working
 * for repos that haven't opted in.
 */
export class RepoContextFetcher {
  private cache = new Map<CacheKey, string>();
  private octokit: Octokit;

  constructor(octokit: Octokit) {
    this.octokit = octokit;
  }

  /**
   * Returns the rendered context block (or `''` if none). The block
   * is wrapped in a markdown header so it slots cleanly into a system
   * prompt without the consuming agent needing to know the convention.
   *
   * Caching is intentional: every agent in a single run (analysis,
   * investigation, fix-gen, review, plus single-shot fallback) calls
   * this with the same owner/repo/ref, and we don't want to hit the
   * GitHub API once per agent.
   */
  async fetch(owner: string, repo: string, ref: string = 'main'): Promise<string> {
    const key = `${owner}/${repo}@${ref}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    // Bundled-overrides short-circuit. When a repo ships its context
    // inside adept-triage-agent (see `bundled-repo-contexts.ts`), we
    // render it directly and skip the remote GitHub call entirely.
    // This is the explicit "keep it here" signal — we do NOT also
    // try the in-repo `.adept-triage/context.md`, because the two
    // would compete for source-of-truth, and for repos on this list
    // the whole point is to avoid committing anything to them.
    const bundled = getBundledRepoContext(owner, repo);
    if (bundled !== undefined) {
      const rendered = this.renderBundled(bundled, owner, repo);
      this.cache.set(key, rendered);
      return rendered;
    }

    const rendered = await this.fetchAndRender(owner, repo, ref);
    this.cache.set(key, rendered);
    return rendered;
  }

  /**
   * Render a bundled context body the same way the remote path does:
   * sanitized, length-capped, and wrapped with the standard
   * "## Repository Conventions" header. The only visible difference
   * in logs is the `(bundled in adept-triage-agent)` source tag so
   * operators can tell at a glance which path produced the context
   * for a given run.
   *
   * Sanitization is applied even though the bundle ships with the
   * agent itself — treating it uniformly with remote content is a
   * defense-in-depth choice: a future maintainer editing this file
   * shouldn't accidentally land unescaped triple-backticks or
   * injection-keyword sequences and change behavior only for
   * bundled-path repos.
   */
  private renderBundled(body: string, owner: string, repo: string): string {
    const trimmed = body.trim();
    if (!trimmed) return '';
    const safe = sanitizeForPrompt(trimmed, REPO_CONTEXT_MAX_CHARS);
    core.info(
      `📘 Loaded repo context for ${owner}/${repo} (bundled in adept-triage-agent, ${safe.length} chars)`
    );
    return [
      '## Repository Conventions',
      '',
      `Source: bundled in adept-triage-agent for ${owner}/${repo}.`,
      'These conventions describe how this repository writes and structures tests.',
      'Treat them as authoritative for repo style; defer to current evidence on the specific failure.',
      '',
      safe,
      '',
    ].join('\n');
  }

  private async fetchAndRender(owner: string, repo: string, ref: string): Promise<string> {
    try {
      const response = await this.octokit.repos.getContent({
        owner,
        repo,
        path: REPO_CONTEXT_PATH,
        ref,
      });

      if (Array.isArray(response.data) || response.data.type !== 'file') {
        return '';
      }

      const raw = Buffer.from(response.data.content, 'base64').toString('utf-8').trim();
      if (!raw) return '';

      // sanitizeForPrompt also caps length and escapes injection
      // patterns + triple backticks, so a malicious context.md cannot
      // break out of the system-prompt block we render below.
      const safe = sanitizeForPrompt(raw, REPO_CONTEXT_MAX_CHARS);
      core.info(
        `📘 Loaded repo context from ${owner}/${repo}/${REPO_CONTEXT_PATH}@${ref} (${safe.length} chars)`
      );
      return [
        '## Repository Conventions',
        '',
        `Source: \`${REPO_CONTEXT_PATH}\` in ${owner}/${repo}@${ref}.`,
        'These conventions describe how this repository writes and structures tests.',
        'Treat them as authoritative for repo style; defer to current evidence on the specific failure.',
        '',
        safe,
        '',
      ].join('\n');
    } catch (err) {
      // 404 is the common case — most repos haven't opted in yet.
      // Silent at info level (one line per run is enough) and only
      // bubbles to debug for non-404 issues so genuine misconfig
      // doesn't disappear.
      const status = (err as { status?: number })?.status;
      if (status === 404) {
        core.debug(
          `No repo context at ${owner}/${repo}/${REPO_CONTEXT_PATH}@${ref} — proceeding without it.`
        );
        return '';
      }
      core.debug(
        `Failed to fetch repo context from ${owner}/${repo}/${REPO_CONTEXT_PATH}@${ref}: ${err}`
      );
      return '';
    }
  }
}
