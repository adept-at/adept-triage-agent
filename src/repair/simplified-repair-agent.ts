import * as core from '@actions/core';
import { OpenAIClient } from '../openai-client';
import {
  RepairContext,
  ErrorData,
  FixRecommendation,
  SourceFetchContext,
  RepairTelemetry,
} from '../types';
import { AGENT_CONFIG } from '../config/constants';
import {
  AgentOrchestrator,
  createOrchestrator,
  createAgentContext,
  OrchestratorConfig,
} from '../agents';
import { InvestigationOutput } from '../agents/investigation-agent';
import {
  TriageSkill,
  FlakinessSignal,
  sanitizeForPrompt,
} from '../services/skill-store';

/**
 * Per-field budgets for the retry-memory payload. Each sub-field is run
 * through `sanitizeForPrompt` with the cap below before being concatenated.
 * Total summary budget sits around ~3–4 KB / ~1000 tokens even at worst case,
 * which is compact next to the main prompt.
 */
const RETRY_CAPS = {
  FINDING_DESCRIPTION: 500,
  FINDING_RELATION: 300,
  EVIDENCE_ITEM: 200,
  RECOMMENDED_APPROACH: 500,
  SELECTOR_FIELD: 200,
  FIX_REASONING: 800,
  TRACE_FIELD: 500,
  ROOT_CAUSE: 300,
  CODE_BLOCK: 2000,
} as const;

/**
 * Configuration for the repair agent
 */
export interface RepairAgentConfig {
  /** Orchestrator configuration (for agentic mode) */
  orchestratorConfig?: Partial<OrchestratorConfig>;
  /** Override model for fix-generation agent (rollback lever) */
  modelOverrideFixGen?: string;
  /** Override model for review agent (rollback lever) */
  modelOverrideReview?: string;
}

/**
 * Shape of the prior-attempt payload that's threaded through agentic repair
 * retries. Keeping this in one place prevents the validator and repair agent
 * contracts from drifting apart.
 */
export interface PriorAttemptContext {
  iteration: number;
  previousFix: FixRecommendation;
  validationLogs: string;
  priorAgentRootCause?: string;
  priorAgentInvestigationFindings?: string;
}

/**
 * Render a prior failed attempt into a block that goes into the next
 * iteration's error context. This is intentionally richer than the
 * pre-R4 version: in addition to the diff + logs, it surfaces the
 * agents' own prior reasoning (root cause, investigation findings,
 * failureModeTrace, fix reasoning) so the fresh pipeline can actively
 * diverge from it rather than silently re-discovering the same
 * conclusions that led to the failed fix.
 *
 * @param logBudget Max chars of validation logs to include.
 */
/**
 * Collapse an `InvestigationOutput` into the structured-but-flat string
 * that `buildPriorAttemptContext` renders into the next iteration's
 * context under "Investigation findings:". The goal is to preserve as
 * much actionable signal as possible from the prior investigation —
 * verdict overrides, selector-update recommendations, isTestCodeFixable,
 * and per-finding evidence — so the fresh pipeline on iteration N+1 can
 * actively challenge or refine those conclusions rather than drifting
 * back to the same primary description.
 *
 * Historical note (pre-v1.49.1): this block was inline in tryAgenticRepair
 * and only captured primaryFinding.description, recommendedApproach, and
 * secondary findings' severity+description. selectorsToUpdate,
 * verdictOverride, isTestCodeFixable, and per-finding evidence were
 * silently dropped — the "carry prior reasoning forward" feature only
 * carried a sliver of it.
 */
export function summarizeInvestigationForRetry(
  investigation: InvestigationOutput | undefined
): string | undefined {
  if (!investigation) return undefined;

  // Every interpolated field passes through sanitizeForPrompt with an
  // explicit per-field cap. The retry path feeds this string back into
  // the next iteration's agent prompt, where it joins other model-adjacent
  // content. Investigation output can quote error logs, test source, and
  // product-diff text — any of which could contain prompt-injection
  // patterns (`## SYSTEM:`, `Ignore previous`, `[INST]`, etc). Before
  // v1.49.2 this path rendered everything raw, which re-opened the
  // cross-agent injection surface sanitizeForPrompt was built to close
  // on the skill-store side.
  const s = sanitizeForPrompt;
  const parts: string[] = [];
  const primary = investigation.primaryFinding;

  if (primary) {
    parts.push(
      `Primary finding: [${primary.severity}] ${s(primary.description, RETRY_CAPS.FINDING_DESCRIPTION)}`
    );
    if (primary.relationToError) {
      parts.push(`  → Relation to error: ${s(primary.relationToError, RETRY_CAPS.FINDING_RELATION)}`);
    }
    if (primary.evidence?.length) {
      const items = primary.evidence
        .slice(0, 3)
        .map((e) => s(e, RETRY_CAPS.EVIDENCE_ITEM));
      parts.push(`  → Evidence: ${items.join('; ')}`);
    }
  }

  if (typeof investigation.isTestCodeFixable === 'boolean') {
    parts.push(`Is test-code fixable: ${investigation.isTestCodeFixable}`);
  }

  if (investigation.recommendedApproach) {
    parts.push(
      `Recommended approach: ${s(investigation.recommendedApproach, RETRY_CAPS.RECOMMENDED_APPROACH)}`
    );
  }

  if (investigation.verdictOverride) {
    const v = investigation.verdictOverride;
    parts.push(
      `Verdict override: ${v.suggestedLocation} (${v.confidence}% confidence)`
    );
    if (v.evidence?.length) {
      const items = v.evidence
        .slice(0, 3)
        .map((e) => s(e, RETRY_CAPS.EVIDENCE_ITEM));
      parts.push(`  → Evidence: ${items.join('; ')}`);
    }
  }

  if (investigation.selectorsToUpdate?.length) {
    parts.push('Selectors flagged for update:');
    for (const sel of investigation.selectorsToUpdate.slice(0, 5)) {
      const current = s(sel.current, RETRY_CAPS.SELECTOR_FIELD);
      const reason = s(sel.reason, RETRY_CAPS.SELECTOR_FIELD);
      const replacement = sel.suggestedReplacement
        ? ` → suggested: \`${s(sel.suggestedReplacement, RETRY_CAPS.SELECTOR_FIELD)}\``
        : '';
      parts.push(`  - \`${current}\`: ${reason}${replacement}`);
    }
  }

  if (investigation.findings?.length) {
    // Secondary findings — skip the one marked as primary to avoid
    // repeating it. We match by identity first (ref-equal); if the
    // orchestrator ever returns a cloned primary, fall back to matching
    // description + severity.
    const isPrimary = (f: typeof investigation.findings[number]): boolean => {
      if (!primary) return false;
      if (f === primary) return true;
      return (
        f.description === primary.description && f.severity === primary.severity
      );
    };
    const secondary = investigation.findings.filter((f) => !isPrimary(f)).slice(0, 3);
    if (secondary.length > 0) {
      parts.push('Other findings:');
      for (const f of secondary) {
        const rel = f.relationToError
          ? ` (${s(f.relationToError, RETRY_CAPS.FINDING_RELATION)})`
          : '';
        parts.push(
          `  - [${f.severity}] ${s(f.description, RETRY_CAPS.FINDING_DESCRIPTION)}${rel}`
        );
      }
    }
  }

  return parts.length > 0 ? parts.join('\n') : undefined;
}

export function buildPriorAttemptContext(
  prior: PriorAttemptContext,
  opts: { logBudget?: number } = {}
): string {
  const logBudget = opts.logBudget ?? 8000;
  const s = sanitizeForPrompt;

  // Every interpolated text field — root cause, investigation summary,
  // fix-gen reasoning, trace sub-fields, file paths, validation logs,
  // and the code blocks — is run through sanitizeForPrompt before
  // being rendered into the next iteration's prompt. sanitizeForPrompt
  // (as of v1.49.2) also escapes triple backticks, so any stray ``` in
  // untrusted content can't break out of the fenced blocks we render
  // below and masquerade as a new prompt section.
  const prevChanges = prior.previousFix.proposedChanges
    .map(
      (c) =>
        `File: ${s(c.file, 200)}\noldCode:\n\`\`\`\n${s(c.oldCode, RETRY_CAPS.CODE_BLOCK)}\n\`\`\`\nnewCode:\n\`\`\`\n${s(c.newCode, RETRY_CAPS.CODE_BLOCK)}\n\`\`\``
    )
    .join('\n---\n');

  const sections: string[] = [
    `\n\n## PREVIOUS FIX ATTEMPT #${prior.iteration} — FAILED VALIDATION`,
    '',
    'The following fix was applied and the test was re-run, but it still failed.',
  ];

  // Surface the prior iteration's agent reasoning so the fresh pipeline
  // can see — and explicitly challenge — the conclusions that produced
  // the failed fix. Without this, the outer loop's iteration 2 tends to
  // reproduce iteration 1's conclusions because the fresh agents only
  // see the error logs, not the reasoning chain that was applied.
  const hasPriorReasoning =
    prior.priorAgentRootCause ||
    prior.priorAgentInvestigationFindings ||
    prior.previousFix.failureModeTrace ||
    prior.previousFix.reasoning;

  if (hasPriorReasoning) {
    sections.push('', "### Prior iteration's agent reasoning (the chain that produced the failed fix)");
    if (prior.priorAgentRootCause) {
      sections.push(`- **Root cause (from analysis):** ${s(prior.priorAgentRootCause, RETRY_CAPS.ROOT_CAUSE)}`);
    }
    if (prior.priorAgentInvestigationFindings) {
      // Already sanitized by summarizeInvestigationForRetry upstream; a
      // second pass is idempotent (no double-redaction) and caps total
      // length as defense-in-depth against runaway model output.
      sections.push(`- **Investigation findings:** ${s(prior.priorAgentInvestigationFindings, 4000)}`);
    }
    if (prior.previousFix.reasoning) {
      sections.push(`- **Fix-gen's reasoning:** ${s(prior.previousFix.reasoning, RETRY_CAPS.FIX_REASONING)}`);
    }
    if (prior.previousFix.failureModeTrace) {
      const t = prior.previousFix.failureModeTrace;
      const traceField = (v?: string): string =>
        v ? s(v, RETRY_CAPS.TRACE_FIELD) : '(empty)';
      sections.push(
        '- **Fix-gen\'s own causal trace (failureModeTrace):**',
        `  - originalState: ${traceField(t.originalState)}`,
        `  - rootMechanism: ${traceField(t.rootMechanism)}`,
        `  - newStateAfterFix: ${traceField(t.newStateAfterFix)}`,
        `  - whyAssertionPassesNow: ${traceField(t.whyAssertionPassesNow)}`
      );
    }
  }

  sections.push(
    '',
    '### Previous Fix That Was Tried',
    prevChanges,
    '',
    '### Validation Failure Logs (tail)',
    '```',
    // Sanitize validation logs: they're untrusted output from the
    // test runner (Sauce Labs, WDIO/Cypress runners) and can include
    // arbitrary text that users / pages produced. sanitizeForPrompt
    // escapes triple backticks so logs can't close this fence, and
    // strips known prompt-injection keyword patterns. logBudget is
    // preserved as the length cap since logs are the largest field
    // here and the agent wants the tail (most-recent errors), not an
    // arbitrary middle slice.
    s(prior.validationLogs, logBudget),
    '```',
    '',
    '### Instructions for this iteration',
    'The prior reasoning chain above led to a fix that did NOT resolve the failure. You MUST try a DIFFERENT approach. Concretely:',
    '1. Was the root-cause diagnosis wrong? Re-analyze from scratch; do NOT anchor on the prior category.',
    '2. Was the fix mechanism wrong even if the root cause was right? The fix may have changed the wrong state.',
    '3. Does the validation failure log reveal a distinct failure signature from the original — i.e., did the fix create a new problem?',
    'Do NOT repeat the same fix or minor variants of it.'
  );

  return sections.join('\n');
}

/**
 * Simplified repair agent that generates fix recommendations
 * using the agentic (multi-agent) repair pipeline.
 */
export class SimplifiedRepairAgent {
  private openaiClient: OpenAIClient;
  private sourceFetchContext?: SourceFetchContext;
  private config: RepairAgentConfig;
  private orchestrator?: AgentOrchestrator;

  /**
   * Creates a new SimplifiedRepairAgent
   * @param openaiClientOrApiKey - Either an OpenAIClient instance or an API key string
   * @param sourceFetchContext - Optional context for fetching source files from GitHub
   * @param config - Optional configuration for repair behavior
   */
  constructor(
    openaiClientOrApiKey: OpenAIClient | string,
    sourceFetchContext?: SourceFetchContext,
    config?: RepairAgentConfig
  ) {
    if (typeof openaiClientOrApiKey === 'string') {
      this.openaiClient = new OpenAIClient(openaiClientOrApiKey);
    } else {
      this.openaiClient = openaiClientOrApiKey;
    }
    this.sourceFetchContext = sourceFetchContext;
    this.config = {
      ...config,
    };

    // Initialize orchestrator when source-fetch context is available. Without
    // source access, the agentic repair pipeline cannot ground fixes in the
    // target repo and must fail honestly rather than falling back to a weaker
    // retry prompt.
    if (this.sourceFetchContext) {
      this.orchestrator = createOrchestrator(
        this.openaiClient,
        {
          maxIterations: AGENT_CONFIG.MAX_AGENT_ITERATIONS,
          totalTimeoutMs: AGENT_CONFIG.AGENT_TIMEOUT_MS,
          minConfidence: AGENT_CONFIG.REVIEW_REQUIRED_CONFIDENCE,
          ...this.config.orchestratorConfig,
          modelOverrideFixGen: this.config.modelOverrideFixGen,
          modelOverrideReview: this.config.modelOverrideReview,
        },
        {
          octokit: this.sourceFetchContext.octokit,
          owner: this.sourceFetchContext.owner,
          repo: this.sourceFetchContext.repo,
          branch: this.sourceFetchContext.branch || 'main',
        }
      );
    }
  }

  /**
   * Generates a fix recommendation for a test failure
   * Returns null if no fix can be recommended
   *
   * Agentic repair is the only supported repair path. If the orchestrator
   * cannot produce an approved fix, return null and let the coordinator
   * surface an honest "no safe fix generated" result. This intentionally
   * avoids the old one-shot fallback, which bypassed investigation,
   * review, causal trace enforcement, and the stronger fix-gen model.
   *
   * @param previousAttempt - Optional feedback from a prior fix-validate iteration
   */
  async generateFixRecommendation(
    repairContext: RepairContext,
    errorData?: ErrorData,
    previousAttempt?: {
      iteration: number;
      previousFix: FixRecommendation;
      validationLogs: string;
      /**
       * Agent-reported root cause from the prior failed iteration. When
       * present, gets rendered into the next iteration's error context so
       * analysis and investigation can explicitly reject / refine it
       * rather than re-discovering the same category.
       */
      priorAgentRootCause?: string;
      /**
       * Agent-reported investigation findings from the prior failed
       * iteration. Same intent as priorAgentRootCause — give the fresh
       * pipeline the context its prior self reasoned through, so it can
       * actively diverge rather than drift back to the same conclusion.
       */
      priorAgentInvestigationFindings?: string;
    },
    previousResponseId?: string,
    skills?: { relevant: TriageSkill[]; flakiness?: FlakinessSignal },
    priorInvestigationContext?: string,
    /**
     * Pre-rendered repo conventions block (from `.adept-triage/context.md`)
     * that the coordinator fetched once for this run. Threaded through to
     * agent system prompts so every repair agent sees the same baseline repo
     * knowledge. Empty string for repos that haven't opted in.
     */
    repoContext?: string
  ): Promise<{
    fix: FixRecommendation | null;
    lastResponseId?: string;
    agentRootCause?: string;
    agentInvestigationFindings?: string;
    repairTelemetry?: RepairTelemetry;
  }> {
    try {
      core.info('🔧 Generating fix recommendation...');

      if (!this.orchestrator) {
        core.warning(
          'Agentic repair is unavailable because source-fetch context is missing; no fallback repair path will run.'
        );
        return {
          fix: null,
          repairTelemetry: {
            status: 'no_fix_generated',
            summary:
              'No auto-fix applied. Agentic repair is unavailable (source-fetch context missing).',
            iterations: 0,
            elapsedMs: 0,
          },
        };
      }

      core.info('🤖 Attempting agentic repair...');
      const agenticResult = await this.tryAgenticRepair(
        repairContext,
        errorData,
        previousAttempt,
        previousResponseId,
        skills,
        priorInvestigationContext,
        repoContext
      );

      if (agenticResult.fix) {
        core.info(
          `✅ Agentic repair succeeded with ${agenticResult.fix.confidence}% confidence`
        );
      } else {
        core.warning(
          '🤖 Agentic repair did not produce an approved fix; no weaker fallback repair path will run.'
        );
      }
      return agenticResult;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      core.warning(`Failed to generate fix recommendation: ${error}`);
      return {
        fix: null,
        repairTelemetry: {
          status: 'no_fix_generated',
          summary: `No auto-fix applied. Repair failed: ${msg}`,
          iterations: 0,
          elapsedMs: 0,
        },
      };
    }
  }

  /**
   * Attempts agentic repair using the orchestrator
   */
  private async tryAgenticRepair(
    repairContext: RepairContext,
    errorData?: ErrorData,
    previousAttempt?: {
      iteration: number;
      previousFix: FixRecommendation;
      validationLogs: string;
      /**
       * Agent-reported root cause from the prior failed iteration. When
       * present, gets rendered into the next iteration's error context so
       * analysis and investigation can explicitly reject / refine it
       * rather than re-discovering the same category.
       */
      priorAgentRootCause?: string;
      /**
       * Agent-reported investigation findings from the prior failed
       * iteration. Same intent as priorAgentRootCause — give the fresh
       * pipeline the context its prior self reasoned through, so it can
       * actively diverge rather than drift back to the same conclusion.
       */
      priorAgentInvestigationFindings?: string;
    },
    previousResponseId?: string,
    skills?: { relevant: TriageSkill[]; flakiness?: FlakinessSignal },
    priorInvestigationContext?: string,
    repoContext?: string
  ): Promise<{
    fix: FixRecommendation | null;
    lastResponseId?: string;
    agentRootCause?: string;
    agentInvestigationFindings?: string;
    repairTelemetry?: RepairTelemetry;
  }> {
    if (!this.orchestrator) {
      return {
        fix: null,
        repairTelemetry: {
          status: 'no_fix_generated',
          summary: 'No auto-fix applied. Orchestrator was not initialized.',
          iterations: 0,
          elapsedMs: 0,
        },
      };
    }

    try {
      // Build agent context from repair context
      let enrichedErrorMessage = repairContext.errorMessage;
      if (previousAttempt) {
        enrichedErrorMessage += buildPriorAttemptContext(previousAttempt);
      }

      const agentContext = createAgentContext({
        errorMessage: enrichedErrorMessage,
        testFile: repairContext.testFile,
        testName: repairContext.testName,
        errorType: repairContext.errorType,
        errorSelector: repairContext.errorSelector,
        stackTrace: errorData?.stackTrace,
        screenshots: errorData?.screenshots,
        logs: errorData?.logs,
        prDiff: errorData?.prDiff
          ? {
              files: errorData.prDiff.files.map((f) => ({
                filename: f.filename,
                patch: f.patch,
                status: f.status,
              })),
            }
          : undefined,
        productDiff: errorData?.productDiff
          ? {
              files: errorData.productDiff.files.map((f) => ({
                filename: f.filename,
                patch: f.patch,
                status: f.status,
              })),
            }
          : undefined,
        framework: errorData?.framework,
        repoContext,
      });

      if (priorInvestigationContext) {
        agentContext.priorInvestigationContext = priorInvestigationContext;
      }

      // Run the orchestration
      const result = await this.orchestrator.orchestrate(
        agentContext,
        errorData,
        previousResponseId,
        skills
      );

      if (result.success && result.fix) {
        core.info(
          `🤖 Agentic approach: ${result.approach}, iterations: ${result.iterations}, time: ${result.totalTimeMs}ms`
        );
        for (const change of result.fix.proposedChanges) {
          const cleaned = this.extractFilePath(change.file);
          if (cleaned && cleaned !== change.file) {
            core.info(`  📂 Normalized path: "${change.file}" → "${cleaned}"`);
            change.file = cleaned;
          }
        }

        const analysis = result.agentResults.analysis?.data;
        const investigation = result.agentResults.investigation?.data;
        const agentRootCause = analysis?.rootCauseCategory;
        const agentInvestigationFindings = summarizeInvestigationForRetry(investigation);

        return {
          fix: result.fix,
          lastResponseId: result.lastResponseId,
          agentRootCause,
          agentInvestigationFindings,
          repairTelemetry: result.repairTelemetry,
        };
      }

      core.info(
        `🤖 Agentic approach failed: ${result.error || 'No fix generated'}`
      );
      const analysis = result.agentResults.analysis?.data;
      const investigation = result.agentResults.investigation?.data;
      return {
        fix: null,
        lastResponseId: result.lastResponseId,
        agentRootCause: analysis?.rootCauseCategory,
        agentInvestigationFindings: summarizeInvestigationForRetry(investigation),
        repairTelemetry: result.repairTelemetry,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      core.warning(`Agentic repair error: ${errorMsg}`);
      return {
        fix: null,
        repairTelemetry: {
          status: 'no_fix_generated',
          summary: `No auto-fix applied. Repair error: ${errorMsg}`,
          iterations: 0,
          elapsedMs: 0,
        },
      };
    }
  }
  /**
   * Extracts the actual file path from webpack URLs, CI runner paths, or other formats.
   * e.g., "webpack://lib-cypress-13/./cypress/support/lexicalHelpers.js" -> "cypress/support/lexicalHelpers.js"
   * e.g., "/home/runner/work/repo/repo/test/specs/foo.ts" -> "test/specs/foo.ts"
   */
  private extractFilePath(rawPath: string): string | null {
    if (!rawPath) return null;

    // Handle webpack:// URLs
    const webpackMatch = rawPath.match(/webpack:\/\/[^/]+\/\.\/(.+)/);
    if (webpackMatch) {
      return webpackMatch[1];
    }

    // Handle file:// URLs
    const fileMatch = rawPath.match(/file:\/\/(.+)/);
    if (fileMatch) {
      return fileMatch[1];
    }

    // Handle CI runner absolute paths (e.g., /home/runner/work/repo-name/repo-name/path)
    const ciRunnerMatch = rawPath.match(
      /\/(?:home\/runner\/work|github\/workspace)\/[^/]+\/[^/]+\/(.+)/
    );
    if (ciRunnerMatch) {
      return ciRunnerMatch[1];
    }

    // Handle generic absolute paths — extract from known source directories
    if (rawPath.startsWith('/')) {
      const knownPrefixes = [
        'test/', 'tests/', 'spec/', 'specs/',
        'src/', 'lib/', 'cypress/', 'e2e/',
      ];
      for (const prefix of knownPrefixes) {
        const idx = rawPath.indexOf(`/${prefix}`);
        if (idx !== -1) {
          return rawPath.slice(idx + 1);
        }
      }
    }

    // Handle paths that start with ./
    if (rawPath.startsWith('./')) {
      return rawPath.slice(2);
    }

    // If it looks like a relative path already, return it
    if (rawPath.includes('/') && !rawPath.startsWith('http')) {
      return rawPath;
    }

    return null;
  }
}
