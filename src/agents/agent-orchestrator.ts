/**
 * Agent Orchestrator
 * Coordinates the execution of multiple agents in the repair pipeline
 */

import * as core from '@actions/core';
import { OpenAIClient } from '../openai-client';
import { AgentContext, AgentResult } from './base-agent';
import { AnalysisAgent, AnalysisOutput } from './analysis-agent';
import { CodeReadingAgent, CodeReadingOutput } from './code-reading-agent';
import { InvestigationAgent, InvestigationOutput } from './investigation-agent';
import {
  FixGenerationAgent,
  FixGenerationOutput,
  CodeChange,
} from './fix-generation-agent';
import { ReviewAgent, ReviewOutput } from './review-agent';
import { FixRecommendation, ErrorData, SourceFetchContext } from '../types';
import { TriageSkill, FlakinessSignal, formatSkillsForPrompt } from '../services/skill-store';

/**
 * Configuration for the orchestrator
 */
export interface OrchestratorConfig {
  /** Maximum iterations for fix generation/review loop */
  maxIterations: number;
  /** Timeout for entire orchestration */
  totalTimeoutMs: number;
  /** Minimum confidence to accept a fix */
  minConfidence: number;
  /** Whether to require review agent approval */
  requireReview: boolean;
  /** Whether to fall back to single-shot on failure */
  fallbackToSingleShot: boolean;
}

/**
 * Default orchestrator configuration
 */
export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxIterations: 3,
  totalTimeoutMs: 120000,
  minConfidence: 70,
  requireReview: true,
  fallbackToSingleShot: true,
};

/**
 * Result of the orchestration
 */
export interface OrchestrationResult {
  /** Whether a valid fix was generated */
  success: boolean;
  /** The generated fix recommendation */
  fix?: FixRecommendation;
  /** Error message if orchestration failed */
  error?: string;
  /** Total execution time */
  totalTimeMs: number;
  /** Number of iterations used */
  iterations: number;
  /** Which approach was used */
  approach: 'agentic' | 'single-shot' | 'failed';
  /** Last OpenAI response ID for conversation chaining across outer iterations */
  lastResponseId?: string;
  /** Detailed results from each agent */
  agentResults: {
    analysis?: AgentResult<AnalysisOutput>;
    codeReading?: AgentResult<CodeReadingOutput>;
    investigation?: AgentResult<InvestigationOutput>;
    fixGeneration?: AgentResult<FixGenerationOutput>;
    review?: AgentResult<ReviewOutput>;
  };
}

/**
 * Agent Orchestrator
 * Manages the execution flow of multiple specialized agents
 */
export class AgentOrchestrator {
  private config: OrchestratorConfig;

  // Agents
  private analysisAgent: AnalysisAgent;
  private codeReadingAgent: CodeReadingAgent;
  private investigationAgent: InvestigationAgent;
  private fixGenerationAgent: FixGenerationAgent;
  private reviewAgent: ReviewAgent;

  constructor(
    openaiClient: OpenAIClient,
    config: Partial<OrchestratorConfig> = {},
    sourceFetchContext?: SourceFetchContext
  ) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };

    // Initialize agents
    this.analysisAgent = new AnalysisAgent(openaiClient);
    this.codeReadingAgent = new CodeReadingAgent(
      openaiClient,
      sourceFetchContext
    );
    this.investigationAgent = new InvestigationAgent(openaiClient);
    this.fixGenerationAgent = new FixGenerationAgent(openaiClient);
    this.reviewAgent = new ReviewAgent(openaiClient);
  }

  /**
   * Run the full agent pipeline
   */
  async orchestrate(
    context: AgentContext,
    errorData?: ErrorData,
    previousResponseId?: string,
    skills?: { relevant: TriageSkill[]; flakiness?: FlakinessSignal }
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const agentResults: OrchestrationResult['agentResults'] = {};
    let iterations = 0;

    core.info('🤖 Starting agentic repair pipeline...');

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      // Create timeout promise that cleans up after itself
      const timeoutPromise = new Promise<{ fix?: FixRecommendation; error?: string; iterations: number; lastResponseId?: string }>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(
              `Orchestration timed out after ${this.config.totalTimeoutMs}ms`
            )
          );
        }, this.config.totalTimeoutMs);
      });

      // Run the pipeline
      const pipelinePromise = this.runPipeline(
        context,
        errorData,
        agentResults,
        previousResponseId,
        skills
      );

      const result = await Promise.race([pipelinePromise, timeoutPromise]);
      clearTimeout(timeoutId);
      iterations = result.iterations;

      const totalTimeMs = Date.now() - startTime;

      if (result.fix) {
        core.info(
          `✅ Agentic repair completed in ${totalTimeMs}ms with ${iterations} iteration(s)`
        );
        return {
          success: true,
          fix: result.fix,
          totalTimeMs,
          iterations,
          approach: 'agentic',
          lastResponseId: result.lastResponseId,
          agentResults,
        };
      }

      // If agentic approach failed and fallback is enabled
      if (this.config.fallbackToSingleShot) {
        core.warning('Agentic approach failed, falling back to single-shot...');
        // Single-shot fallback would be handled by SimplifiedRepairAgent
        return {
          success: false,
          error: result.error || 'Agentic approach did not produce a valid fix',
          totalTimeMs,
          iterations,
          approach: 'single-shot',
          agentResults,
        };
      }

      return {
        success: false,
        error: result.error || 'Agentic approach did not produce a valid fix',
        totalTimeMs,
        iterations,
        approach: 'failed',
        agentResults,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const totalTimeMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      core.error(`Orchestration failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        totalTimeMs,
        iterations,
        approach: 'failed',
        agentResults,
      };
    }
  }

  /**
   * Run the agent pipeline
   */
  private async runPipeline(
    context: AgentContext,
    _errorData: ErrorData | undefined,
    agentResults: OrchestrationResult['agentResults'],
    previousResponseId?: string,
    skills?: { relevant: TriageSkill[]; flakiness?: FlakinessSignal }
  ): Promise<{ fix?: FixRecommendation; error?: string; iterations: number; lastResponseId?: string }> {
    let iterations = 0;
    let lastResponseId: string | undefined = previousResponseId;

    // Step 1: Analysis Agent
    core.info('📊 Step 1: Running Analysis Agent...');
    const analysisResult = await this.analysisAgent.execute({}, context, lastResponseId);
    agentResults.analysis = analysisResult;
    lastResponseId = analysisResult.responseId ?? lastResponseId;

    if (!analysisResult.success || !analysisResult.data) {
      return {
        error: `Analysis agent failed: ${analysisResult.error}`,
        iterations,
      lastResponseId,
      };
    }

    const analysis = analysisResult.data;
    core.info(`   Root cause: ${analysis.rootCauseCategory}`);
    core.info(`   Confidence: ${analysis.confidence}%`);

    context.includeScreenshots = false;

    // Step 2: Code Reading Agent
    core.info('📖 Step 2: Running Code Reading Agent...');
    const codeReadingResult = await this.codeReadingAgent.execute(
      {
        testFile: context.testFile,
        errorSelectors: analysis.selectors,
      },
      context
    );
    agentResults.codeReading = codeReadingResult;

    // Update context with code content (add line numbers for precise referencing)
    if (codeReadingResult.success && codeReadingResult.data) {
      const rawContent = codeReadingResult.data.testFileContent;
      context.sourceFileContent = addLineNumbers(rawContent);
      // Keep raw content for oldCode validation
      (context as AgentContextWithRaw)._rawSourceFileContent = rawContent;
      context.relatedFiles = new Map(
        codeReadingResult.data.relatedFiles.map((f) => [f.path, f.content])
      );
      core.info(`   Test file: ${rawContent.length} chars`);
      for (const f of codeReadingResult.data.relatedFiles) {
        core.info(`   Related: ${f.path} (${f.content.length} chars) — ${f.relevance}`);
      }
      core.info(
        `   Fetched ${codeReadingResult.data.relatedFiles.length + 1} files`
      );
    }

    // Log product diff availability
    if (context.productDiff && context.productDiff.files.length > 0) {
      core.info(`📦 Product diff available: ${context.productDiff.files.length} files changed`);
      for (const f of context.productDiff.files.slice(0, 5)) {
        core.info(`   Product: ${f.filename} (${f.status})`);
      }
    } else {
      core.info('📦 No product diff available — agents will treat failure as test-side issue');
    }

    // Inject skills into context for Investigation, Fix Gen, and Review agents
    if (skills && skills.relevant.length > 0) {
      core.info(`📝 ${skills.relevant.length} skill(s) available from prior runs`);
      if (skills.flakiness?.isFlaky) {
        core.warning(`⚠️ ${skills.flakiness.message}`);
      }
    }

    // Step 3: Investigation Agent
    core.info('🔍 Step 3: Running Investigation Agent...');
    const productDiffSummary = context.productDiff && context.productDiff.files.length > 0
      ? `${context.productDiff.files.length} files changed (${context.productDiff.files.slice(0, 3).map(f => f.filename).join(', ')}${context.productDiff.files.length > 3 ? '...' : ''})`
      : '';
    context.delegationContext = this.buildDelegationContext('investigation', { analysis, productDiffSummary });
    context.skillsPrompt = skills
      ? formatSkillsForPrompt(skills.relevant, 'investigation', skills.flakiness)
      : '';
    const investigationResult = await this.investigationAgent.execute(
      {
        analysis,
        codeContext: codeReadingResult.data,
      },
      context,
      undefined
    );
    agentResults.investigation = investigationResult;
    lastResponseId = investigationResult.responseId ?? lastResponseId;

    if (!investigationResult.success || !investigationResult.data) {
      return {
        error: `Investigation agent failed: ${investigationResult.error}`,
        iterations,
      lastResponseId,
      };
    }

    const investigation = investigationResult.data;
    core.info(`   Findings: ${investigation.findings.length}`);
    core.info(`   Test code fixable: ${investigation.isTestCodeFixable}`);
    core.info(`   Recommended approach: ${investigation.recommendedApproach}`);

    // Verdict override: if investigation contradicts the initial classification,
    // compare confidence levels directly instead of re-running the analysis agent.
    if (investigation.verdictOverride &&
        investigation.verdictOverride.suggestedLocation === 'APP_CODE' &&
        investigation.verdictOverride.confidence > analysis.confidence) {
      core.warning(`🛑 Investigation override: APP_CODE (${investigation.verdictOverride.confidence}% confidence) > Analysis (${analysis.confidence}%). Aborting repair.`);
      core.info(`   Evidence: ${investigation.verdictOverride.evidence.join('; ')}`);
      return {
        error: 'Investigation verdict override: product-side regression confirmed with higher confidence than initial classification',
        iterations,
        lastResponseId: investigationResult.responseId ?? lastResponseId,
      };
    }

    if (!investigation.isTestCodeFixable && !investigation.verdictOverride) {
      core.warning('🛑 Investigation says not test-code-fixable but no verdict override — aborting conservatively');
      return {
        error: 'Investigation determined issue is not test-code-fixable',
        iterations,
        lastResponseId: investigationResult.responseId ?? lastResponseId,
      };
    }

    // Step 4 & 5: Fix Generation and Review Loop
    let lastFix: FixGenerationOutput | null = null;
    let reviewFeedback: string | null = null;
    let fixReviewChainId: string | undefined;

    while (iterations < this.config.maxIterations) {
      iterations++;
      core.info(
        `🔧 Step 4: Running Fix Generation Agent (iteration ${iterations})...`
      );

      context.delegationContext = this.buildDelegationContext('fix_generation', {
        analysis,
        investigation,
        codeContext: codeReadingResult.data,
        productDiffSummary,
      });
      context.skillsPrompt = skills
        ? formatSkillsForPrompt(skills.relevant, 'fix_generation', skills.flakiness)
        : '';

      if (reviewFeedback) {
        core.info(`   📨 Sending previous review feedback to Fix Gen Agent:`);
        for (const line of reviewFeedback.split('\n')) {
          core.info(`      ${line}`);
        }
      }

      const fixGenResult = await this.fixGenerationAgent.execute(
        {
          analysis,
          investigation,
          previousFeedback: reviewFeedback,
        },
        context,
        fixReviewChainId
      );
      agentResults.fixGeneration = fixGenResult;
      fixReviewChainId = fixGenResult.responseId ?? fixReviewChainId;
      lastResponseId = fixGenResult.responseId ?? lastResponseId;

      if (!fixGenResult.success || !fixGenResult.data) {
        core.warning(`Fix generation failed on iteration ${iterations}`);
        continue;
      }

      lastFix = fixGenResult.data;
      core.info(`   Confidence: ${lastFix.confidence}%`);
      core.info(`   Changes: ${lastFix.changes.length}`);
      core.info(`   Summary: ${lastFix.summary}`);
      for (let ci = 0; ci < lastFix.changes.length; ci++) {
        const ch = lastFix.changes[ci];
        core.info(`   Change ${ci + 1}: ${ch.file}:${ch.line} (${ch.changeType})`);
        core.info(`   oldCode (${ch.oldCode.split('\n').length} lines): ${ch.oldCode.slice(0, 200)}${ch.oldCode.length > 200 ? '...' : ''}`);
        core.info(`   newCode (${ch.newCode.split('\n').length} lines): ${ch.newCode.slice(0, 200)}${ch.newCode.length > 200 ? '...' : ''}`);
      }

      if (lastFix.confidence < this.config.minConfidence) {
        const feedback = `Confidence too low (${lastFix.confidence}%). Please improve the fix.`;
        core.warning(`Fix confidence (${lastFix.confidence}%) below threshold (${this.config.minConfidence}%)`);
        core.info(`   📝 Feedback to next iteration: ${feedback}`);
        reviewFeedback = feedback;
        continue;
      }

      // Step 4b: Validate and auto-correct oldCode against actual source
      const rawSource = (context as AgentContextWithRaw)._rawSourceFileContent;
      const allSources = new Map<string, string>();
      if (rawSource && context.testFile) {
        allSources.set(context.testFile, rawSource);
      }
      if (context.relatedFiles) {
        for (const [path, content] of context.relatedFiles) {
          if (content) allSources.set(path, content);
        }
      }
      if (allSources.size > 0) {
        core.info(`   🔍 Running autoCorrectOldCode against ${allSources.size} source file(s)...`);
        const correctionResult = autoCorrectOldCode(lastFix.changes, allSources, context);
        core.info(`   autoCorrectOldCode result: ${correctionResult.changes.length} valid, ${correctionResult.correctedCount} corrected, ${correctionResult.droppedCount} dropped`);
        if (correctionResult.correctedCount > 0) {
          core.info(`   🔧 Auto-corrected oldCode for ${correctionResult.correctedCount} change(s)`);
        }
        if (correctionResult.droppedCount > 0) {
          core.warning(`   ⚠️ Dropped ${correctionResult.droppedCount} change(s) — could not match source`);
        }
        if (correctionResult.correctedCount === 0 && correctionResult.droppedCount === 0) {
          core.info(`   ✅ All oldCode blocks matched source exactly — no correction needed`);
        }
        lastFix.changes = correctionResult.changes;

        if (lastFix.changes.length === 0) {
          const feedback = 'All proposed changes had oldCode that could not be matched to the source file. Please copy oldCode EXACTLY from the numbered source lines provided.';
          core.info(`   📝 Feedback to next iteration: ${feedback}`);
          reviewFeedback = feedback;
          continue;
        }
      }

      // Step 5: Review Agent (if required)
      if (this.config.requireReview) {
        core.info('✅ Step 5: Running Review Agent...');
        context.delegationContext = this.buildDelegationContext('review', {
          analysis,
          investigation,
          productDiffSummary,
        });
        context.skillsPrompt = skills
          ? formatSkillsForPrompt(skills.relevant, 'review', skills.flakiness)
          : '';
        const reviewResult = await this.reviewAgent.execute(
          {
            proposedFix: lastFix,
            analysis,
            codeContext: codeReadingResult.data,
          },
          context,
          fixReviewChainId
        );
        agentResults.review = reviewResult;
        fixReviewChainId = reviewResult.responseId ?? fixReviewChainId;
        lastResponseId = reviewResult.responseId ?? lastResponseId;

        if (reviewResult.success && reviewResult.data) {
          const review = reviewResult.data;
          core.info(`   Approved: ${review.approved}`);
          core.info(`   Issues: ${review.issues.length}`);
          core.info(`   Fix confidence from reviewer: ${review.fixConfidence}%`);
          core.info(`   Assessment: ${review.assessment}`);
          for (const issue of review.issues) {
            core.info(`   [${issue.severity}] Change #${issue.changeIndex}: ${issue.description}${issue.suggestion ? ` → Suggestion: ${issue.suggestion}` : ''}`);
          }
          if (review.improvements && review.improvements.length > 0) {
            core.info(`   Improvements: ${review.improvements.join('; ')}`);
          }

          if (review.approved) {
            core.info(`   ✅ Fix APPROVED by Review Agent on iteration ${iterations}`);
            return {
              fix: this.convertToFixRecommendation(lastFix),
              iterations,
      lastResponseId,
            };
          } else {
            reviewFeedback = review.issues
              .map((i) => `[${i.severity}] ${i.description}`)
              .join('\n');
            core.warning(`Fix not approved. Issues: ${review.issues.length}`);
            core.info(`   📝 Feedback to next iteration:\n${reviewFeedback}`);
          }
        }
      } else {
        // No review required, return fix directly
        return {
          fix: this.convertToFixRecommendation(lastFix),
          iterations,
      lastResponseId,
        };
      }
    }

    if (lastFix && lastFix.confidence >= this.config.minConfidence) {
      core.warning(`Max iterations (${this.config.maxIterations}) reached — review never approved. Returning last fix as fallback.`);
      core.info(`   Fallback fix: confidence=${lastFix.confidence}%, changes=${lastFix.changes.length}, summary="${lastFix.summary}"`);
      core.info(`   ⚠️ This fix was NOT approved by the Review Agent — it is being applied because confidence (${lastFix.confidence}%) >= threshold (${this.config.minConfidence}%) and validation will be the final gate.`);
      return {
        fix: this.convertToFixRecommendation(lastFix),
        iterations,
      lastResponseId,
      };
    }

    core.error(`Max iterations (${this.config.maxIterations}) reached without a viable fix (last confidence: ${lastFix?.confidence ?? 'N/A'}%, threshold: ${this.config.minConfidence}%)`);
    return {
      error: `Max iterations (${this.config.maxIterations}) reached without valid fix`,
      iterations,
      lastResponseId,
    };
  }

  /**
   * Build a focused briefing for each agent stage based on what prior stages discovered.
   */
  private buildDelegationContext(
    stage: 'investigation' | 'fix_generation' | 'review',
    priorResults: {
      analysis?: AnalysisOutput;
      investigation?: InvestigationOutput;
      codeContext?: CodeReadingOutput;
      productDiffSummary?: string;
    }
  ): string {
    const lines: string[] = [];

    switch (stage) {
      case 'investigation': {
        const a = priorResults.analysis;
        if (!a) break;
        lines.push(
          `Root cause category: ${a.rootCauseCategory} (${a.confidence}% confidence)`,
          `Issue location: ${a.issueLocation}`,
        );
        if (a.selectors.length > 0) {
          lines.push(`Selectors found: ${a.selectors.join(', ')}`);
        }
        if (priorResults.productDiffSummary) {
          lines.push(`Product diff: ${priorResults.productDiffSummary}`);
        } else {
          lines.push('No product diff available — assume test-side issue.');
        }
        if (a.issueLocation === 'APP_CODE') {
          lines.push(
            'The analysis flagged APP_CODE as the issue location. Pay special attention to whether this is truly a product regression or if the test can be adapted.'
          );
        }
        break;
      }

      case 'fix_generation': {
        if (priorResults.productDiffSummary) {
          lines.push(
            `Product diff: ${priorResults.productDiffSummary}`,
            'The product changed intentionally — the fix should ADAPT the test to new behavior, not work around it.'
          );
        }
        const a = priorResults.analysis;
        if (a && a.confidence < 80) {
          lines.push(`⚠️ Analysis confidence is only ${a.confidence}% — proceed carefully.`);
        }
        break;
      }

      case 'review': {
        if (priorResults.productDiffSummary) {
          lines.push(`Product diff is present: ${priorResults.productDiffSummary}`);
        } else {
          lines.push('No product diff — failure is expected to be test-side only.');
        }
        lines.push(
          'Verify that the proposed fix is consistent with the PR diff and does not fabricate changes that the diff does not support.'
        );
        break;
      }
    }

    return lines.length > 0 ? lines.join('\n') : '';
  }

  /**
   * Convert agent output to FixRecommendation format
   */
  private convertToFixRecommendation(
    fix: FixGenerationOutput
  ): FixRecommendation {
    return {
      confidence: fix.confidence,
      summary: fix.summary,
      proposedChanges: fix.changes.map((change) => ({
        file: change.file,
        line: change.line,
        oldCode: change.oldCode,
        newCode: change.newCode,
        justification: change.justification,
      })),
      evidence: fix.evidence,
      reasoning: fix.reasoning,
    };
  }
}

/**
 * Extended context that also carries the raw (un-numbered) source for oldCode matching
 */
interface AgentContextWithRaw extends AgentContext {
  _rawSourceFileContent?: string;
}

/**
 * Adds line numbers to source code for the LLM prompt
 */
function addLineNumbers(source: string): string {
  if (!source) return source;
  const lines = source.split('\n');
  return lines.map((line, i) => `${String(i + 1).padStart(4)}: ${line}`).join('\n');
}

/**
 * Result of auto-correcting oldCode
 */
interface AutoCorrectResult {
  changes: CodeChange[];
  correctedCount: number;
  droppedCount: number;
}

/**
 * Validate each change's oldCode against the source files (test file + related files).
 * If oldCode doesn't match, attempt to find the correct code at the given line number.
 */
function autoCorrectOldCode(
  changes: CodeChange[],
  sourceFiles: Map<string, string>,
  _context: AgentContext
): AutoCorrectResult {
  const validChanges: CodeChange[] = [];
  let correctedCount = 0;
  let droppedCount = 0;

  for (const change of changes) {
    if (!change.oldCode) {
      validChanges.push(change);
      continue;
    }

    // Find the right source file for this change
    let rawSource: string | undefined;
    for (const [path, content] of sourceFiles) {
      if (change.file.endsWith(path) || path.endsWith(change.file) || change.file.includes(path) || path.includes(change.file)) {
        rawSource = content;
        break;
      }
    }
    // Fallback: try matching by filename
    if (!rawSource) {
      const changeBasename = change.file.split('/').pop() || '';
      for (const [path, content] of sourceFiles) {
        if (path.split('/').pop() === changeBasename) {
          rawSource = content;
          break;
        }
      }
    }
    // Last resort: check all source files for a match
    if (!rawSource) {
      for (const [, content] of sourceFiles) {
        if (content.includes(change.oldCode)) {
          rawSource = content;
          break;
        }
      }
    }

    if (!rawSource) {
      core.warning(`   ⚠️ No source file found for ${change.file} — keeping change as-is`);
      validChanges.push(change);
      continue;
    }

    const sourceLines = rawSource.split('\n');

    // Check exact match first
    if (rawSource.includes(change.oldCode)) {
      const firstIdx = rawSource.indexOf(change.oldCode);
      const secondIdx = rawSource.indexOf(change.oldCode, firstIdx + 1);
      if (secondIdx === -1) {
        validChanges.push(change);
        continue;
      }
    }

    // Exact match failed — try corrections
    core.info(`   🔍 oldCode not found verbatim, attempting auto-correction for ${change.file}:${change.line}`);

    // Strategy 1: Strip line number prefixes (LLM may have copied numbered lines)
    const strippedOldCode = change.oldCode
      .split('\n')
      .map((line) => line.replace(/^\s*\d+:\s?/, ''))
      .join('\n');
    if (strippedOldCode !== change.oldCode && rawSource.includes(strippedOldCode)) {
      const firstIdx = rawSource.indexOf(strippedOldCode);
      const secondIdx = rawSource.indexOf(strippedOldCode, firstIdx + 1);
      if (secondIdx === -1) {
        core.info(`   ✅ Corrected by stripping line number prefixes`);
        change.oldCode = strippedOldCode;
        validChanges.push(change);
        correctedCount++;
        continue;
      }
    }

    // Strategy 2: Whitespace-normalized matching
    const normalizedOld = normalizeWhitespace(change.oldCode);
    const normalizedSource = normalizeWhitespace(rawSource);
    const normIdx = normalizedSource.indexOf(normalizedOld);
    if (normIdx !== -1) {
      const extracted = extractMatchingRegion(rawSource, change.oldCode);
      if (extracted) {
        core.info(`   ✅ Corrected via whitespace-normalized matching`);
        change.oldCode = extracted;
        validChanges.push(change);
        correctedCount++;
        continue;
      }
    }

    // Strategy 3: Line-range extraction using approximate line number
    if (change.line > 0) {
      const oldCodeLineCount = change.oldCode.split('\n').length;
      const startLine = Math.max(0, change.line - 3);
      const endLine = Math.min(sourceLines.length, change.line + oldCodeLineCount + 2);
      const regionLines = sourceLines.slice(startLine, endLine);
      const region = regionLines.join('\n');

      // Try to find a substring of the region that overlaps with the intent
      const keySignatures = extractKeySignatures(change.oldCode);
      if (keySignatures.length > 0) {
        const matchedRegion = findRegionBySignatures(sourceLines, keySignatures, change.line, oldCodeLineCount);
        if (matchedRegion) {
          const secondIdx = rawSource.indexOf(matchedRegion, rawSource.indexOf(matchedRegion) + 1);
          if (secondIdx === -1) {
            core.info(`   ✅ Corrected via line-range + signature matching (around line ${change.line})`);
            change.oldCode = matchedRegion;
            validChanges.push(change);
            correctedCount++;
            continue;
          }
        }
      }

      // Last resort: use the exact region at the line number if it contains distinctive keywords
      const keywordsInOld = change.oldCode.match(/\b(?:throw|if|const|return|await|expect|assert)\b.*?[;)}\]]/g) || [];
      const keywordsInRegion = region.match(/\b(?:throw|if|const|return|await|expect|assert)\b.*?[;)}\]]/g) || [];
      const overlap = keywordsInOld.filter((kw) =>
        keywordsInRegion.some((rk) => normalizeWhitespace(rk).includes(normalizeWhitespace(kw).slice(0, 30)))
      );
      if (overlap.length > 0 && overlap.length >= keywordsInOld.length * 0.5) {
        const secondIdx = rawSource.indexOf(region, rawSource.indexOf(region) + 1);
        if (secondIdx === -1) {
          core.info(`   ✅ Corrected via line-range extraction (lines ${startLine + 1}-${endLine})`);
          change.oldCode = region;
          validChanges.push(change);
          correctedCount++;
          continue;
        }
      }
    }

    core.warning(`   ❌ Could not auto-correct oldCode for ${change.file}:${change.line} — dropping change`);
    droppedCount++;
  }

  return { changes: validChanges, correctedCount, droppedCount };
}

/**
 * Collapse whitespace for fuzzy comparison
 */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Given raw source and an approximate oldCode, find the actual matching region
 * by matching line-by-line with normalized whitespace.
 */
function extractMatchingRegion(rawSource: string, approxOldCode: string): string | null {
  const sourceLines = rawSource.split('\n');
  const oldLines = approxOldCode.split('\n').map((l) => normalizeWhitespace(l)).filter(Boolean);
  if (oldLines.length === 0) return null;

  for (let i = 0; i < sourceLines.length; i++) {
    if (normalizeWhitespace(sourceLines[i]).includes(oldLines[0])) {
      let matched = true;
      for (let j = 1; j < oldLines.length && i + j < sourceLines.length; j++) {
        if (!normalizeWhitespace(sourceLines[i + j]).includes(oldLines[j])) {
          matched = false;
          break;
        }
      }
      if (matched) {
        const region = sourceLines.slice(i, i + oldLines.length).join('\n');
        if (rawSource.indexOf(region) !== -1) {
          return region;
        }
      }
    }
  }
  return null;
}

/**
 * Extract distinctive code signatures from oldCode for fuzzy line matching
 */
function extractKeySignatures(code: string): string[] {
  const sigs: string[] = [];
  for (const line of code.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 15 && /[a-zA-Z]/.test(trimmed)) {
      // Extract identifiers and operators as a signature
      const sig = trimmed.replace(/\s+/g, ' ');
      sigs.push(sig);
    }
  }
  return sigs;
}

/**
 * Find a region in sourceLines that best matches the given signatures near a target line
 */
function findRegionBySignatures(
  sourceLines: string[],
  signatures: string[],
  targetLine: number,
  expectedLength: number
): string | null {
  const searchStart = Math.max(0, targetLine - 10);
  const searchEnd = Math.min(sourceLines.length, targetLine + expectedLength + 10);

  let bestStart = -1;
  let bestScore = 0;

  for (let i = searchStart; i < searchEnd; i++) {
    let score = 0;
    for (let j = 0; j < signatures.length && i + j < sourceLines.length; j++) {
      const sourceLine = sourceLines[i + j].trim().replace(/\s+/g, ' ');
      const sig = signatures[j];
      // Check if the source line contains key parts of the signature
      const sigTokens = sig.split(/\s+/).filter((t) => t.length > 2);
      const matchedTokens = sigTokens.filter((t) => sourceLine.includes(t));
      if (matchedTokens.length >= sigTokens.length * 0.6) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  if (bestStart >= 0 && bestScore >= signatures.length * 0.5) {
    return sourceLines.slice(bestStart, bestStart + expectedLength).join('\n');
  }
  return null;
}

/**
 * Factory function for creating an orchestrator
 */
export function createOrchestrator(
  openaiClient: OpenAIClient,
  config?: Partial<OrchestratorConfig>,
  sourceFetchContext?: SourceFetchContext
): AgentOrchestrator {
  return new AgentOrchestrator(openaiClient, config, sourceFetchContext);
}
