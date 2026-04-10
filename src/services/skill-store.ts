import * as core from '@actions/core';
import * as crypto from 'crypto';
import { Octokit } from '@octokit/rest';

/**
 * A recorded fix pattern that the agent can recall on future runs.
 * Skills are per-repo and per-framework.
 */
export interface TriageSkill {
  id: string;
  createdAt: string;
  repo: string;
  spec: string;
  testName: string;
  framework: 'cypress' | 'webdriverio' | 'unknown';

  errorPattern: string;
  rootCauseCategory: string;

  fix: {
    file: string;
    changeType: string;
    summary: string;
    pattern: string;
  };

  confidence: number;
  iterations: number;
  prUrl: string;
  validatedLocally: boolean;
  priorSkillCount: number;

  successCount: number;
  failCount: number;
  lastUsedAt: string;
  retired: boolean;
}

export interface RepairSkill extends TriageSkill {
  wasSuccessful: boolean;
}

export interface FlakinessSignal {
  isFlaky: boolean;
  fixCount: number;
  windowDays: number;
  message: string;
}

const SKILLS_BRANCH = 'triage-data';
const SKILLS_FILE = 'skills.json';

const MAX_SKILLS = 100;

const FLAKY_THRESHOLDS = {
  SHORT_WINDOW_DAYS: 3,
  SHORT_WINDOW_MAX: 1,
  LONG_WINDOW_DAYS: 7,
  LONG_WINDOW_MAX: 2,
} as const;

function backfillDefaults(skill: TriageSkill): TriageSkill {
  return {
    ...skill,
    successCount: skill.successCount ?? 0,
    failCount: skill.failCount ?? 0,
    lastUsedAt: skill.lastUsedAt ?? skill.createdAt,
    retired: skill.retired ?? false,
  };
}

/**
 * Stores and retrieves triage skills via the GitHub Contents API.
 * Skills live in a dedicated `triage-data` branch of each test repo —
 * one JSON file per repo, permanent, zero external dependencies.
 */
export class SkillStore {
  private skills: TriageSkill[] = [];
  private loaded = false;
  private fileSha: string | undefined;
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(octokit: Octokit, owner: string, repo: string) {
    this.octokit = octokit;
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Load existing skills from the triage-data branch.
   * Safe to call multiple times — only fetches once.
   */
  async load(): Promise<TriageSkill[]> {
    if (this.loaded) return this.skills;

    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: SKILLS_FILE,
        ref: SKILLS_BRANCH,
      });

      if ('content' in data && data.content) {
        const raw = Buffer.from(data.content, 'base64').toString('utf-8');
        this.skills = (JSON.parse(raw) as TriageSkill[]).map(backfillDefaults);
        this.fileSha = data.sha;
        core.info(`📝 Loaded ${this.skills.length} skill(s) from ${this.owner}/${this.repo}@${SKILLS_BRANCH}`);
      }
      this.loaded = true;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        this.loaded = true;
        core.info(`📝 No existing skills found for ${this.owner}/${this.repo} — starting fresh`);
      } else {
        core.warning(`Failed to load skills (will retry on next call): ${err}`);
      }
    }

    return this.skills;
  }

  /**
   * Save a new skill by appending to the skills file on the triage-data branch.
   * Creates the branch if it doesn't exist.
   */
  async save(skill: TriageSkill): Promise<void> {
    if (!this.loaded) {
      await this.load();
    }

    this.skills.push(skill);
    if (this.skills.length > MAX_SKILLS) {
      this.skills = this.skills.slice(-MAX_SKILLS);
    }

    const commitMsg = `chore: update triage skills (${skill.spec})`;

    try {
      await this.persist(commitMsg);
      core.info(`📝 Saved skill ${skill.id} (${this.skills.length} total for ${this.owner}/${this.repo})`);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 409) {
        try {
          const { data } = await this.octokit.repos.getContent({
            owner: this.owner,
            repo: this.repo,
            path: SKILLS_FILE,
            ref: SKILLS_BRANCH,
          });
          if (!('content' in data) || !data.content) {
            throw new Error('Unexpected empty skills file');
          }
          const raw = Buffer.from(data.content, 'base64').toString('utf-8');
          const remoteSkills = (JSON.parse(raw) as TriageSkill[]).map(backfillDefaults);
          this.skills = [...remoteSkills, skill];
          this.fileSha = data.sha;
          await this.persist(commitMsg);
          core.info(`📝 Saved skill ${skill.id} (${this.skills.length} total for ${this.owner}/${this.repo})`);
        } catch (retryErr) {
          this.skills.pop();
          core.warning(`Failed to save skill: ${retryErr}`);
        }
      } else {
        this.skills.pop();
        core.warning(`Failed to save skill: ${err}`);
      }
    }
  }

  async recordOutcome(skillId: string, success: boolean): Promise<void> {
    if (!this.loaded) {
      await this.load();
    }

    const skill = this.skills.find(s => s.id === skillId);
    if (!skill) {
      core.warning(`Skill ${skillId} not found — cannot record outcome`);
      return;
    }

    if (success) {
      skill.successCount++;
    } else {
      skill.failCount++;
    }
    skill.lastUsedAt = new Date().toISOString();

    const totalAttempts = (skill.successCount || 0) + (skill.failCount || 0);
    const failRate = totalAttempts > 0 ? (skill.failCount || 0) / totalAttempts : 0;
    if (failRate > 0.4 && (skill.failCount || 0) >= 3) {
      skill.retired = true;
      core.warning(`⚠️ Skill ${skillId} retired — ${Math.round(failRate * 100)}% failure rate (${skill.failCount} failures in ${totalAttempts} attempts)`);
    }

    const commitMsg = `chore: record ${success ? 'success' : 'failure'} for skill ${skillId}`;

    try {
      await this.persist(commitMsg);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 409) {
        try {
          const { data } = await this.octokit.repos.getContent({
            owner: this.owner,
            repo: this.repo,
            path: SKILLS_FILE,
            ref: SKILLS_BRANCH,
          });
          if (!('content' in data) || !data.content) {
            throw new Error('Unexpected empty skills file');
          }
          const raw = Buffer.from(data.content, 'base64').toString('utf-8');
          const remoteSkills = (JSON.parse(raw) as TriageSkill[]).map(backfillDefaults);
          const remoteSkill = remoteSkills.find(s => s.id === skillId);
          if (!remoteSkill) {
            core.warning(`Skill ${skillId} not found in remote data — skipping outcome persist`);
            return;
          }
          if (success) {
            remoteSkill.successCount++;
          } else {
            remoteSkill.failCount++;
          }
          remoteSkill.lastUsedAt = skill.lastUsedAt;
          const remoteTotalAttempts = (remoteSkill.successCount || 0) + (remoteSkill.failCount || 0);
          const remoteFailRate = remoteTotalAttempts > 0 ? (remoteSkill.failCount || 0) / remoteTotalAttempts : 0;
          if (remoteFailRate > 0.4 && (remoteSkill.failCount || 0) >= 3) {
            remoteSkill.retired = true;
          }
          this.skills = remoteSkills;
          this.fileSha = data.sha;
          await this.persist(commitMsg);
        } catch (retryErr) {
          core.warning(`Failed to persist skill outcome: ${retryErr}`);
        }
      } else {
        core.warning(`Failed to persist skill outcome: ${err}`);
      }
    }
  }

  /**
   * Find skills relevant to the current failure.
   * Exact spec matches scored highest, then same-framework matches by error similarity.
   */
  findRelevant(opts: {
    framework: string;
    spec?: string;
    errorMessage?: string;
    limit?: number;
  }): TriageSkill[] {
    const limit = opts.limit ?? 5;
    const normalized = normalizeFramework(opts.framework);
    const frameworkSkills = this.skills.filter(
      (s) => (s.framework === normalized || s.framework === 'unknown') && !s.retired
    );
    if (frameworkSkills.length === 0) return [];

    const scored = frameworkSkills.map((skill) => {
      let score = 0;
      if (opts.spec && skill.spec === opts.spec) score += 10;
      if (opts.errorMessage) {
        score += errorSimilarity(skill.errorPattern, normalizeError(opts.errorMessage)) * 5;
      }
      return { skill, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.skill);
  }

  /**
   * Find skills most relevant for classification decisions.
   * Only includes validated skills; heavily weights spec match and recency.
   */
  findForClassifier(opts: {
    framework: string;
    spec?: string;
    errorMessage?: string;
  }): TriageSkill[] {
    const normalized = normalizeFramework(opts.framework);
    const candidates = this.skills.filter(
      (s) =>
        (s.framework === normalized || s.framework === 'unknown') &&
        !s.retired &&
        s.validatedLocally === true
    );
    if (candidates.length === 0) return [];

    const now = Date.now();
    const SEVEN_DAYS = 7 * 86_400_000;

    const scored = candidates.map((skill) => {
      let score = 0;
      if (opts.spec && skill.spec === opts.spec) score += 15;
      if (opts.errorMessage) {
        score +=
          errorSimilarity(skill.errorPattern, normalizeError(opts.errorMessage)) * 5;
      }
      if (now - new Date(skill.lastUsedAt).getTime() < SEVEN_DAYS) score += 3;
      return { skill, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((s) => s.skill);
  }

  /**
   * Find skills most relevant for fix generation.
   * Includes both validated and failed trajectories so the repair agent
   * can learn what NOT to do as well as what worked.
   */
  findForRepair(opts: {
    framework: string;
    spec?: string;
    errorMessage?: string;
    rootCauseCategory?: string;
  }): RepairSkill[] {
    const normalized = normalizeFramework(opts.framework);
    const candidates = this.skills.filter(
      (s) => (s.framework === normalized || s.framework === 'unknown') && !s.retired
    );
    if (candidates.length === 0) return [];

    const scored = candidates.map((skill) => {
      let score = 0;
      if (opts.rootCauseCategory && skill.rootCauseCategory === opts.rootCauseCategory)
        score += 10;
      if (opts.spec && skill.spec === opts.spec) score += 8;
      if (opts.errorMessage) {
        score +=
          errorSimilarity(skill.errorPattern, normalizeError(opts.errorMessage)) * 5;
      }
      if (skill.confidence > 80) score += 2;
      const repairSkill: RepairSkill = {
        ...skill,
        wasSuccessful: skill.validatedLocally,
      };
      return { skill: repairSkill, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((s) => s.skill);
  }

  /**
   * Detect flakiness for a given spec based on skill history.
   */
  detectFlakiness(spec: string): FlakinessSignal {
    const now = Date.now();
    const specSkills = this.skills.filter((s) => s.spec === spec);

    const inShortWindow = specSkills.filter(
      (s) => now - new Date(s.createdAt).getTime() < FLAKY_THRESHOLDS.SHORT_WINDOW_DAYS * 86_400_000
    );
    const inLongWindow = specSkills.filter(
      (s) => now - new Date(s.createdAt).getTime() < FLAKY_THRESHOLDS.LONG_WINDOW_DAYS * 86_400_000
    );

    if (inShortWindow.length > FLAKY_THRESHOLDS.SHORT_WINDOW_MAX) {
      return {
        isFlaky: true,
        fixCount: inShortWindow.length,
        windowDays: FLAKY_THRESHOLDS.SHORT_WINDOW_DAYS,
        message: `This spec has been auto-fixed ${inShortWindow.length} times in ${FLAKY_THRESHOLDS.SHORT_WINDOW_DAYS} days — likely chronically flaky.`,
      };
    }

    if (inLongWindow.length > FLAKY_THRESHOLDS.LONG_WINDOW_MAX) {
      return {
        isFlaky: true,
        fixCount: inLongWindow.length,
        windowDays: FLAKY_THRESHOLDS.LONG_WINDOW_DAYS,
        message: `This spec has been auto-fixed ${inLongWindow.length} times in ${FLAKY_THRESHOLDS.LONG_WINDOW_DAYS} days — recurring instability.`,
      };
    }

    return {
      isFlaky: false,
      fixCount: specSkills.length,
      windowDays: FLAKY_THRESHOLDS.LONG_WINDOW_DAYS,
      message: '',
    };
  }

  countForSpec(spec: string): number {
    return this.skills.filter((s) => s.spec === spec).length;
  }

  formatForClassifier(opts: {
    framework: string;
    spec?: string;
    errorMessage?: string;
  }): string {
    const relevant = this.findForClassifier(opts);
    if (relevant.length === 0) return '';

    return relevant
      .map(
        (s, i) =>
          `${i + 1}. errorPattern: ${s.errorPattern}\n` +
          `   rootCauseCategory: ${s.rootCauseCategory}\n` +
          `   fix: ${s.fix.summary}\n` +
          `   confidence: ${s.confidence}%`
      )
      .join('\n');
  }

  formatForRepair(opts: {
    framework: string;
    spec?: string;
    errorMessage?: string;
    rootCauseCategory?: string;
  }): string {
    const relevant = this.findForRepair(opts);
    if (relevant.length === 0) return '';

    return relevant
      .map((s, i) => {
        const tag = s.wasSuccessful ? 'SUCCESS' : 'FAILED';
        const suffix = s.wasSuccessful ? '' : ' (this approach did NOT work)';
        return (
          `${i + 1}. [${tag}] errorPattern: ${s.errorPattern}\n` +
          `   rootCause: ${s.rootCauseCategory}\n` +
          `   fix: ${s.fix.summary}${suffix}`
        );
      })
      .join('\n');
  }

  private async persist(commitMessage: string): Promise<void> {
    await this.ensureBranch();
    const content = Buffer.from(JSON.stringify(this.skills, null, 2)).toString('base64');
    const { data } = await this.octokit.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path: SKILLS_FILE,
      message: commitMessage,
      content,
      branch: SKILLS_BRANCH,
      ...(this.fileSha ? { sha: this.fileSha } : {}),
    });
    this.fileSha = data.content?.sha;
  }

  private async ensureBranch(): Promise<void> {
    try {
      await this.octokit.repos.getBranch({
        owner: this.owner,
        repo: this.repo,
        branch: SKILLS_BRANCH,
      });
    } catch (err: unknown) {
      if ((err as { status?: number }).status !== 404) throw err;

      const { data: defaultBranch } = await this.octokit.repos.get({
        owner: this.owner,
        repo: this.repo,
      });
      const { data: ref } = await this.octokit.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${defaultBranch.default_branch}`,
      });

      await this.octokit.git.createRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${SKILLS_BRANCH}`,
        sha: ref.object.sha,
      });
      core.info(`📝 Created ${SKILLS_BRANCH} branch in ${this.owner}/${this.repo}`);
    }
  }
}

/**
 * Normalize any raw framework string to one of the three canonical values.
 * The analyzer can emit 'javascript', 'unknown', or leave it undefined —
 * this collapses those to the right bucket so write and read paths agree.
 */
export function normalizeFramework(raw?: string): TriageSkill['framework'] {
  switch (raw?.toLowerCase()) {
    case 'cypress':
      return 'cypress';
    case 'webdriverio':
      return 'webdriverio';
    default:
      return 'unknown';
  }
}

/**
 * Build a TriageSkill from a successful fix result.
 */
export function buildSkill(params: {
  repo: string;
  spec: string;
  testName: string;
  framework: string;
  errorMessage: string;
  rootCauseCategory: string;
  fix: {
    file: string;
    changeType: string;
    summary: string;
    pattern: string;
  };
  confidence: number;
  iterations: number;
  prUrl: string;
  validatedLocally: boolean;
  priorSkillCount: number;
}): TriageSkill {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    repo: params.repo,
    spec: params.spec,
    testName: params.testName,
    framework: normalizeFramework(params.framework),
    errorPattern: normalizeError(params.errorMessage),
    rootCauseCategory: params.rootCauseCategory,
    fix: params.fix,
    confidence: params.confidence,
    iterations: params.iterations,
    prUrl: params.prUrl,
    validatedLocally: params.validatedLocally,
    priorSkillCount: params.priorSkillCount,
    successCount: 0,
    failCount: 0,
    lastUsedAt: new Date().toISOString(),
    retired: false,
  };
}

/**
 * Describe the fix as a reusable pattern (not exact code).
 */
export function describeFixPattern(changes: Array<{
  file: string;
  oldCode: string;
  newCode: string;
  justification?: string;
  changeType?: string;
}>): string {
  return changes
    .map((c) => {
      const prefix = c.changeType ? `[${c.changeType}] ` : '';
      return `${prefix}${c.justification || `Modified ${c.file}`}`;
    })
    .join('; ');
}

/**
 * Normalize an error message for pattern matching.
 * Strips dynamic values (timeouts, line numbers, SHAs) to find structural similarity.
 */
export function normalizeError(msg: string): string {
  return msg
    .replace(/after \d+ms/g, 'after {timeout}ms')
    .replace(/:\d+:\d+/g, ':{line}:{col}')
    .replace(/\b[0-9a-f]{7,40}\b/g, '{sha}')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.Z]+/g, '{timestamp}')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/**
 * Rough similarity between two normalized error strings (0–1).
 * Token overlap via Jaccard index.
 */
function errorSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/));
  const tokensB = new Set(b.toLowerCase().split(/\s+/));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Format skills for injection into agent prompts.
 * Different framing per agent role to avoid anchoring bias.
 */
export function formatSkillsForPrompt(
  skills: TriageSkill[],
  role: 'investigation' | 'fix_generation' | 'review',
  flakiness?: FlakinessSignal
): string {
  if (skills.length === 0 && !flakiness?.isFlaky) return '';

  const headers: Record<typeof role, string> = {
    investigation: [
      '### Agent Memory: Prior Fixes for This Spec',
      '',
      'These patterns have been applied before. Use them as background context.',
      'Your findings should be based on the CURRENT evidence — do NOT anchor on prior patterns.',
      'If your findings match a prior pattern, note that. If they differ, explain why.',
    ].join('\n'),
    fix_generation: [
      '### Agent Memory: Proven Fix Patterns',
      '',
      'The following fixes were previously applied successfully and validated locally.',
      'CONSIDER these proven approaches as starting points. If you see a better approach than the prior pattern, explain why and use the better approach instead.',
    ].join('\n'),
    review: [
      '### Agent Memory: Prior Successful Fixes',
      '',
      'Check if the proposed fix aligns with patterns that have worked before.',
      'Flag if the fix contradicts a proven approach without justification.',
    ].join('\n'),
  };

  const entries = skills.map((s, i) => [
    `**Fix ${i + 1}** (${s.createdAt.split('T')[0]}, ${s.confidence}% confidence, ${s.iterations} iteration${s.iterations !== 1 ? 's' : ''})`,
    `- Spec: ${s.spec}`,
    `- Error: ${s.errorPattern}`,
    `- Root cause: ${s.rootCauseCategory}`,
    `- Pattern: ${s.fix.pattern}`,
    `- Change type: ${s.fix.changeType} in ${s.fix.file}`,
  ].join('\n'));

  const parts = [headers[role], '', ...entries];

  if (flakiness?.isFlaky) {
    parts.push('', `⚠️ FLAKINESS SIGNAL: ${flakiness.message}`);
  }

  return parts.join('\n');
}
