import * as core from '@actions/core';
import * as crypto from 'crypto';
import { FailureModeTrace } from '../types';

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

  investigationFindings?: string;
  classificationOutcome?: 'correct' | 'incorrect' | 'unknown';
  rootCauseChain?: string;
  repoContext?: string;

  /**
   * Causal trace from the fix-gen agent that produced this fix (introduced
   * in v1.48.1, persisted to skills in v1.49.1). When present, future runs
   * against similar failures can surface this as a template for how the
   * prior successful fix reasoned about the failure — "originalState →
   * rootMechanism → newStateAfterFix → whyAssertionPassesNow." Without
   * this, prior causal reasoning was lost after the originating run.
   *
   * Optional for backward compatibility: skills saved before v1.49.1 don't
   * have it, and a fix that shipped without a trace (legacy fallback)
   * doesn't have one to persist either.
   */
  failureModeTrace?: FailureModeTrace;
}

export interface FlakinessSignal {
  isFlaky: boolean;
  fixCount: number;
  windowDays: number;
  message: string;
}

export const MAX_SKILLS = 100;

const FLAKY_THRESHOLDS = {
  SHORT_WINDOW_DAYS: 3,
  SHORT_WINDOW_MAX: 1,
  LONG_WINDOW_DAYS: 7,
  LONG_WINDOW_MAX: 2,
} as const;

const RETIRE_FAIL_RATE = 0.4;
const RETIRE_MIN_FAILURES = 3;

/**
 * Strip patterns that could be interpreted as prompt injection when
 * model-adjacent fields are interpolated into LLM prompts.
 *
 * Exported because the review agent applies the same treatment to
 * `failureModeTrace` sub-fields — those can embed adversarial strings
 * from error logs or test source that the fix-gen agent quoted into
 * the trace, and rendering them verbatim re-opens the cross-agent
 * injection surface this helper was built to close.
 */
export function sanitizeForPrompt(input: string, maxLength = 2000): string {
  if (!input) return '';
  let sanitized = input
    .replace(/## SYSTEM:/gi, '## INFO:')
    .replace(/Ignore previous/gi, '[filtered]')
    .replace(/<\/?(?:system|instruction|prompt)[^>]*>/gi, '')
    .replace(/\[INST\]|\[\/INST\]/gi, '')
    .replace(/<<SYS>>|<<\/SYS>>/gi, '');
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '... [truncated]';
  }
  return sanitized;
}

function backfillDefaults(skill: TriageSkill): TriageSkill {
  return {
    ...skill,
    successCount: skill.successCount ?? 0,
    failCount: skill.failCount ?? 0,
    lastUsedAt: skill.lastUsedAt ?? skill.createdAt,
    retired: skill.retired ?? false,
    investigationFindings: skill.investigationFindings ?? '',
    classificationOutcome: skill.classificationOutcome ?? 'unknown',
    rootCauseChain: skill.rootCauseChain ?? '',
    repoContext: skill.repoContext ?? '',
  };
}

function parseSkillTimestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareSkillRecency(a: TriageSkill, b: TriageSkill): number {
  const lastUsedDiff =
    parseSkillTimestamp(b.lastUsedAt) - parseSkillTimestamp(a.lastUsedAt);
  if (lastUsedDiff !== 0) return lastUsedDiff;

  const createdDiff =
    parseSkillTimestamp(b.createdAt) - parseSkillTimestamp(a.createdAt);
  if (createdDiff !== 0) return createdDiff;

  return a.id.localeCompare(b.id);
}

function compareOldestFirst(a: TriageSkill, b: TriageSkill): number {
  const createdDiff =
    parseSkillTimestamp(a.createdAt) - parseSkillTimestamp(b.createdAt);
  if (createdDiff !== 0) return createdDiff;
  return a.id.localeCompare(b.id);
}

function selectSkillsToPrune(
  skills: TriageSkill[],
  keepSkillId?: string
): TriageSkill[] {
  if (skills.length <= MAX_SKILLS) return [];
  const overflowCount = skills.length - MAX_SKILLS;
  return [...skills]
    .filter((skill) => skill.id !== keepSkillId)
    .sort(compareOldestFirst)
    .slice(0, overflowCount);
}

/**
 * DynamoDB-backed skill store with in-memory query methods.
 *
 * Table schema (partition key = `pk`, sort key = `sk`):
 *   pk: `REPO#<owner>/<repo>`
 *   sk: `SKILL#<id>`
 *   remaining attributes: flat TriageSkill fields
 *
 * @invariant Mutating operations (`save`, `recordOutcome`,
 * `recordClassificationOutcome`) must be serialized by the caller. The
 * in-memory `skills` array is mutated in-place and is not safe for concurrent
 * writers. Read-only query methods are safe to call at any time.
 */
export class SkillStore {
  private skills: TriageSkill[] = [];
  private loaded = false;
  private loadSucceeded = false;
  private loadFailureReason?: string;
  private region: string;
  private tableName: string;
  private owner: string;
  private repo: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _cachedClient: any;

  constructor(
    region: string,
    tableName: string,
    owner: string,
    repo: string
  ) {
    this.region = region;
    this.tableName = tableName;
    this.owner = owner;
    this.repo = repo;
  }

  private async getDocClient() {
    if (this._cachedClient) return this._cachedClient;

    const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
    const raw = new DynamoDBClient({ region: this.region });
    this._cachedClient = DynamoDBDocumentClient.from(raw, {
      marshallOptions: { removeUndefinedValues: true },
    });
    return this._cachedClient;
  }

  /**
   * Load all skills for this repo into the in-memory cache.
   *
   * @invariant This method must never reject. All failures are caught,
   * logged, and leave the store in a usable state: `loaded` is set to `true`
   * to prevent retry thrash, `loadSucceeded` stays `false`, and
   * `loadFailureReason` captures the error for downstream log correlation.
   * The coordinator relies on this contract and awaits without a `.catch`.
   */
  async load(): Promise<TriageSkill[]> {
    if (this.loaded) return this.skills;

    try {
      const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
      const client = await this.getDocClient();

      const pk = `REPO#${this.owner}/${this.repo}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allItems: any[] = [];
      let lastKey: Record<string, unknown> | undefined;

      do {
        const result = await client.send(
          new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
            ExpressionAttributeValues: { ':pk': pk, ':prefix': 'SKILL#' },
            ExclusiveStartKey: lastKey,
          })
        );
        allItems.push(...(result.Items ?? []));
        lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (lastKey);

      this.skills = allItems
        .map(({ pk: _pk, sk: _sk, ...rest }: Record<string, unknown>) => rest as unknown as TriageSkill)
        .map(backfillDefaults);
      this.loaded = true;
      this.loadSucceeded = true;
      core.info(`📝 Loaded ${this.skills.length} skill(s) from DynamoDB (${this.tableName}) for ${this.owner}/${this.repo}`);
    } catch (err) {
      this.loadFailureReason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      core.warning(`DynamoDB skill load failed for ${this.owner}/${this.repo} in ${this.tableName}: ${err}`);
      core.warning(
        'Continuing with an empty in-memory skill cache for this run to avoid retry loops and preserve any new skills saved later in the run.'
      );
      // Mark loaded to prevent retry thrash; loadSucceeded stays false so
      // save() knows not to prune against an incomplete view of the table.
      this.loaded = true;
    }

    return this.skills;
  }

  /**
   * Persist a new skill to DynamoDB and keep the in-memory cache in sync.
   *
   * Returns `true` when the PutCommand completes; callers (e.g. the pipeline
   * coordinator) should use this to gate follow-up calls to `recordOutcome` /
   * `recordClassificationOutcome`. Returning `false` means the skill is not in
   * the in-memory cache, so those follow-ups would hit the "skill not found"
   * warning path and produce misleading logs.
   */
  async save(skill: TriageSkill): Promise<boolean> {
    if (!this.loaded) await this.load();

    this.skills.push(skill);

    const { DeleteCommand, PutCommand } = await import('@aws-sdk/lib-dynamodb');
    const client = await this.getDocClient();
    const pk = `REPO#${this.owner}/${this.repo}`;
    const sk = `SKILL#${skill.id}`;

    try {
      await client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: { pk, sk, ...skill },
        })
      );
    } catch (err) {
      this.skills = this.skills.filter((s) => s.id !== skill.id);
      core.warning(`DynamoDB skill save failed for ${this.tableName}: ${err}`);
      return false;
    }

    // Skip pruning when load() did not complete — the in-memory list is not
    // a trustworthy view of the table, so we cannot safely pick oldest skills
    // to remove.
    if (!this.loadSucceeded) {
      const reason = this.loadFailureReason
        ? ` (load failed: ${this.loadFailureReason})`
        : '';
      core.info(
        `📝 Saved skill ${skill.id} to DynamoDB (${this.tableName}); skipping prune because load was degraded${reason}`
      );
      return true;
    }

    const pruneCandidates = selectSkillsToPrune(this.skills, skill.id);
    if (pruneCandidates.length > 0) {
      const deletedSkillIds = new Set<string>();
      for (const candidate of pruneCandidates) {
        try {
          await client.send(
            new DeleteCommand({
              TableName: this.tableName,
              Key: { pk, sk: `SKILL#${candidate.id}` },
              ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
            })
          );
          deletedSkillIds.add(candidate.id);
        } catch (deleteErr) {
          core.warning(`Failed to prune DynamoDB skill ${candidate.id}: ${deleteErr}`);
        }
      }

      if (deletedSkillIds.size > 0) {
        this.skills = this.skills.filter((entry) => !deletedSkillIds.has(entry.id));
        core.info(
          `🧹 Pruned ${deletedSkillIds.size} old skill(s) from DynamoDB to maintain the ${MAX_SKILLS}-skill cap`
        );
      }
    }

    core.info(`📝 Saved skill ${skill.id} to DynamoDB (${this.skills.length} total)`);
    return true;
  }

  /**
   * Record a success/failure outcome for a previously-saved skill. On enough
   * failures, auto-retires the skill via a second UpdateCommand.
   *
   * @invariant This method must never reject. All DynamoDB errors are caught
   * and logged. Missing-skill cases short-circuit with a warning. The
   * coordinator awaits without a `.catch`.
   */
  async recordOutcome(skillId: string, success: boolean): Promise<void> {
    if (!this.loaded) await this.load();
    const skill = this.skills.find((s) => s.id === skillId);
    if (!skill) {
      core.warning(
        `Skill ${skillId} not found in DynamoDB in-memory cache for ${this.owner}/${this.repo} — skipping outcome write`
      );
      return;
    }

    const now = new Date().toISOString();

    try {
      const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
      const client = await this.getDocClient();
      const counterField = success ? 'successCount' : 'failCount';

      const result = await client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { pk: `REPO#${this.owner}/${this.repo}`, sk: `SKILL#${skillId}` },
          UpdateExpression: `ADD ${counterField} :inc SET lastUsedAt = :lu`,
          ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
          ExpressionAttributeValues: {
            ':inc': 1,
            ':lu': now,
          },
          ReturnValues: 'ALL_NEW',
        })
      );

      const attributes = result.Attributes as Partial<TriageSkill> | undefined;
      skill.successCount = attributes?.successCount ?? skill.successCount ?? 0;
      skill.failCount = attributes?.failCount ?? skill.failCount ?? 0;
      skill.lastUsedAt = attributes?.lastUsedAt ?? now;
      skill.retired = attributes?.retired ?? skill.retired ?? false;

      const totalAttempts = (skill.successCount || 0) + (skill.failCount || 0);
      const failRate =
        totalAttempts > 0 ? (skill.failCount || 0) / totalAttempts : 0;
      const shouldRetire =
        failRate > RETIRE_FAIL_RATE && (skill.failCount || 0) >= RETIRE_MIN_FAILURES;

      if (shouldRetire && !skill.retired) {
        await client.send(
          new UpdateCommand({
            TableName: this.tableName,
            Key: { pk: `REPO#${this.owner}/${this.repo}`, sk: `SKILL#${skillId}` },
            UpdateExpression: 'SET retired = :r',
            ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
            ExpressionAttributeValues: {
              ':r': true,
            },
          })
        );
        skill.retired = true;
        core.warning(
          `⚠️ Skill ${skillId} retired — ${Math.round(failRate * 100)}% failure rate`
        );
      }
    } catch (err) {
      core.warning(`DynamoDB recordOutcome failed: ${err}`);
    }
  }

  /**
   * Record whether the classifier's verdict was correct for this skill.
   * Only `'correct'` is currently written by the pipeline (see
   * `PipelineCoordinator.execute`); the `'incorrect'` case is reserved for
   * future feedback mechanisms.
   *
   * @invariant This method must never reject. All DynamoDB errors are caught
   * and logged. Missing-skill cases short-circuit with a warning. The
   * coordinator awaits without a `.catch`.
   */
  async recordClassificationOutcome(
    skillId: string,
    outcome: 'correct' | 'incorrect'
  ): Promise<void> {
    if (!this.loaded) await this.load();
    const skill = this.skills.find((s) => s.id === skillId);
    if (!skill) {
      core.warning(
        `Skill ${skillId} not found in DynamoDB in-memory cache for ${this.owner}/${this.repo} — skipping classification outcome write`
      );
      return;
    }

    try {
      const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
      const client = await this.getDocClient();

      await client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { pk: `REPO#${this.owner}/${this.repo}`, sk: `SKILL#${skillId}` },
          UpdateExpression: 'SET classificationOutcome = :co',
          ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
          ExpressionAttributeValues: { ':co': outcome },
        })
      );
      skill.classificationOutcome = outcome;
    } catch (err) {
      core.warning(`DynamoDB recordClassificationOutcome failed: ${err}`);
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
      .sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (scoreDiff !== 0) return scoreDiff;
        return compareSkillRecency(a.skill, b.skill);
      })
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
      if (now - parseSkillTimestamp(skill.lastUsedAt) < SEVEN_DAYS) score += 3;
      return { skill, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (scoreDiff !== 0) return scoreDiff;
        return compareSkillRecency(a.skill, b.skill);
      })
      .slice(0, 3)
      .map((s) => s.skill);
  }

  /**
   * Detect flakiness for a given spec based on skill history.
   */
  detectFlakiness(spec: string): FlakinessSignal {
    const now = Date.now();
    const specSkills = this.skills.filter((s) => s.spec === spec);

    const inShortWindow = specSkills.filter(
      (s) => now - parseSkillTimestamp(s.createdAt) < FLAKY_THRESHOLDS.SHORT_WINDOW_DAYS * 86_400_000
    );
    const inLongWindow = specSkills.filter(
      (s) => now - parseSkillTimestamp(s.createdAt) < FLAKY_THRESHOLDS.LONG_WINDOW_DAYS * 86_400_000
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
          `${i + 1}. errorPattern: ${sanitizeForPrompt(s.errorPattern)}\n` +
          `   rootCauseCategory: ${sanitizeForPrompt(s.rootCauseCategory)}\n` +
          `   fix: ${sanitizeForPrompt(s.fix.summary)}\n` +
          `   confidence: ${s.confidence}%`
      )
      .join('\n');
  }

  formatForInvestigation(opts: { framework: string; spec?: string; errorMessage?: string }): string {
    const relevant = this.findRelevant({
      framework: opts.framework,
      spec: opts.spec,
      errorMessage: opts.errorMessage,
    }).filter(s => s.investigationFindings);

    if (relevant.length === 0) return '';

    return relevant
      .slice(0, 3)
      .map((s, i) => {
        const date = s.createdAt.split('T')[0];
        const outcome = s.classificationOutcome ?? 'unknown';
        let entry = `${i + 1}. Prior investigation for ${sanitizeForPrompt(s.spec)} (${date}):`;
        entry += `\n   Finding: ${sanitizeForPrompt(s.investigationFindings!)}`;
        if (s.rootCauseChain) {
          entry += `\n   Root cause: ${sanitizeForPrompt(s.rootCauseChain)}`;
        }
        entry += `\n   Outcome: ${outcome}`;
        if (s.repoContext) {
          entry += `\n   Repo note: ${sanitizeForPrompt(s.repoContext)}`;
        }
        return entry;
      })
      .join('\n');
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
  investigationFindings?: string;
  rootCauseChain?: string;
  repoContext?: string;
  /**
   * R3: persist the fix-gen agent's causal trace so prior reasoning
   * survives across runs. When the originating fix shipped without one
   * (legacy / single-shot fallback), leave undefined — the skill is
   * still useful without it.
   */
  failureModeTrace?: FailureModeTrace;
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
    investigationFindings: params.investigationFindings ?? '',
    classificationOutcome: 'unknown',
    rootCauseChain: params.rootCauseChain ?? '',
    repoContext: params.repoContext ?? '',
    // Only set failureModeTrace on the skill when we actually have one.
    // Leaving it undefined (rather than setting an empty object) keeps
    // DynamoDB items lean and makes the "skill has trace?" check simple
    // (`skill.failureModeTrace` is truthy or not).
    ...(params.failureModeTrace ? { failureModeTrace: params.failureModeTrace } : {}),
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
      '### Agent Memory: Prior Fix Patterns',
      '',
      'The following patterns were applied in prior runs. Not all were validated — use them as context, not guarantees.',
      'CONSIDER these approaches as starting points. If you see a better approach, explain why and use it instead.',
      'When a prior fix includes a causal trace, use it as a reasoning template — the trace shows how the prior successful fix diagnosed the failure (originalState → rootMechanism → newStateAfterFix → whyAssertionPassesNow). Your own failureModeTrace does NOT need to copy the prior one; it should reflect the CURRENT failure\'s concrete values.',
    ].join('\n'),
    review: [
      '### Agent Memory: Prior Successful Fixes',
      '',
      'Check if the proposed fix aligns with patterns that have worked before.',
      'Flag if the fix contradicts a prior pattern without justification.',
      'When a prior fix includes a causal trace, compare the CURRENT fix\'s failureModeTrace to it. A new trace that is markedly weaker than the prior trace for the same kind of failure is a WARNING signal — the current fix may not have reasoned as rigorously as the prior successful one.',
    ].join('\n'),
  };

  // R3: surface the persisted causal trace for downstream agents that
  // reason about fix correctness. Investigation deliberately does NOT get
  // the trace — its job is fresh evidence gathering and a prior trace
  // would anchor its findings. Fix-gen benefits because the trace shows
  // how the prior successful fix reasoned about the same kind of failure.
  // Review benefits because review enforces trace quality on the CURRENT
  // fix; seeing a prior high-quality trace gives the reviewer a template
  // to compare against.
  const includeTrace = role === 'fix_generation' || role === 'review';

  // Per-sub-field truncation so the trace block doesn't dominate the
  // skill context. 200 chars × 4 fields × 3 skills ≈ 2.4K chars of trace.
  const TRACE_FIELD_MAX = 200;
  const renderTraceField = (field?: string): string => {
    if (!field) return '(empty)';
    return sanitizeForPrompt(field, TRACE_FIELD_MAX);
  };

  const entries = skills.map((s, i) => {
    const successes = s.successCount ?? 0;
    const failures = s.failCount ?? 0;
    const total = successes + failures;
    const trackRecord = total > 0 ? `${successes}/${total} successful` : 'untested';
    const outcome = s.classificationOutcome && s.classificationOutcome !== 'unknown'
      ? `, classification: ${s.classificationOutcome}`
      : '';

    const lines: string[] = [
      `**Fix ${i + 1}** (${s.createdAt.split('T')[0]}, ${s.confidence}% confidence, ${s.iterations} iteration${s.iterations !== 1 ? 's' : ''})`,
      `- Spec: ${sanitizeForPrompt(s.spec)}`,
      `- Error: ${sanitizeForPrompt(s.errorPattern)}`,
      `- Root cause: ${sanitizeForPrompt(s.rootCauseCategory)}`,
      `- Pattern: ${sanitizeForPrompt(s.fix.pattern)}`,
      `- Change type: ${sanitizeForPrompt(s.fix.changeType)} in ${sanitizeForPrompt(s.fix.file)}`,
      `- Track record: ${trackRecord}${outcome}`,
    ];

    if (includeTrace && s.failureModeTrace) {
      const t = s.failureModeTrace;
      lines.push(
        '- Prior causal trace (how the successful fix reasoned):',
        `  - originalState: ${renderTraceField(t.originalState)}`,
        `  - rootMechanism: ${renderTraceField(t.rootMechanism)}`,
        `  - newStateAfterFix: ${renderTraceField(t.newStateAfterFix)}`,
        `  - whyAssertionPassesNow: ${renderTraceField(t.whyAssertionPassesNow)}`
      );
    }

    return lines.join('\n');
  });

  const parts = [headers[role], '', ...entries];

  if (flakiness?.isFlaky) {
    parts.push('', `⚠️ FLAKINESS SIGNAL: ${flakiness.message}`);
  }

  return parts.join('\n');
}
