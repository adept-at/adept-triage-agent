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
    errorData?: ErrorData
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const agentResults: OrchestrationResult['agentResults'] = {};
    let iterations = 0;

    core.info('🤖 Starting agentic repair pipeline...');

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      // Create timeout promise that cleans up after itself
      const timeoutPromise = new Promise<{ fix?: FixRecommendation; error?: string; iterations: number }>((_, reject) => {
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
        agentResults
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
    agentResults: OrchestrationResult['agentResults']
  ): Promise<{ fix?: FixRecommendation; error?: string; iterations: number }> {
    let iterations = 0;

    // Step 1: Analysis Agent
    core.info('📊 Step 1: Running Analysis Agent...');
    const analysisResult = await this.analysisAgent.execute({}, context);
    agentResults.analysis = analysisResult;

    if (!analysisResult.success || !analysisResult.data) {
      return {
        error: `Analysis agent failed: ${analysisResult.error}`,
        iterations,
      };
    }

    const analysis = analysisResult.data;
    core.info(`   Root cause: ${analysis.rootCauseCategory}`);
    core.info(`   Confidence: ${analysis.confidence}%`);

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
      core.info(
        `   Fetched ${codeReadingResult.data.relatedFiles.length + 1} files`
      );
    }

    // Step 3: Investigation Agent
    core.info('🔍 Step 3: Running Investigation Agent...');
    const investigationResult = await this.investigationAgent.execute(
      {
        analysis,
        codeContext: codeReadingResult.data,
      },
      context
    );
    agentResults.investigation = investigationResult;

    if (!investigationResult.success || !investigationResult.data) {
      return {
        error: `Investigation agent failed: ${investigationResult.error}`,
        iterations,
      };
    }

    const investigation = investigationResult.data;
    core.info(`   Findings: ${investigation.findings.length}`);
    core.info(`   Recommended approach: ${investigation.recommendedApproach}`);

    // Step 4 & 5: Fix Generation and Review Loop
    let lastFix: FixGenerationOutput | null = null;
    let reviewFeedback: string | null = null;

    while (iterations < this.config.maxIterations) {
      iterations++;
      core.info(
        `🔧 Step 4: Running Fix Generation Agent (iteration ${iterations})...`
      );

      const fixGenResult = await this.fixGenerationAgent.execute(
        {
          analysis,
          investigation,
          previousFeedback: reviewFeedback,
        },
        context
      );
      agentResults.fixGeneration = fixGenResult;

      if (!fixGenResult.success || !fixGenResult.data) {
        core.warning(`Fix generation failed on iteration ${iterations}`);
        continue;
      }

      lastFix = fixGenResult.data;
      core.info(`   Confidence: ${lastFix.confidence}%`);
      core.info(`   Changes: ${lastFix.changes.length}`);

      // Check if confidence meets threshold
      if (lastFix.confidence < this.config.minConfidence) {
        core.warning(
          `Fix confidence (${lastFix.confidence}%) below threshold (${this.config.minConfidence}%)`
        );
        reviewFeedback = `Confidence too low (${lastFix.confidence}%). Please improve the fix.`;
        continue;
      }

      // Step 4b: Validate and auto-correct oldCode against actual source
      const rawSource = (context as AgentContextWithRaw)._rawSourceFileContent;
      if (rawSource) {
        const correctionResult = autoCorrectOldCode(lastFix.changes, rawSource, context);
        if (correctionResult.correctedCount > 0) {
          core.info(`   🔧 Auto-corrected oldCode for ${correctionResult.correctedCount} change(s)`);
        }
        if (correctionResult.droppedCount > 0) {
          core.warning(`   ⚠️ Dropped ${correctionResult.droppedCount} change(s) — could not match source`);
        }
        lastFix.changes = correctionResult.changes;

        if (lastFix.changes.length === 0) {
          reviewFeedback = 'All proposed changes had oldCode that could not be matched to the source file. Please copy oldCode EXACTLY from the numbered source lines provided.';
          continue;
        }
      }

      // Step 5: Review Agent (if required)
      if (this.config.requireReview) {
        core.info('✅ Step 5: Running Review Agent...');
        const reviewResult = await this.reviewAgent.execute(
          {
            proposedFix: lastFix,
            analysis,
            codeContext: codeReadingResult.data,
          },
          context
        );
        agentResults.review = reviewResult;

        if (reviewResult.success && reviewResult.data) {
          const review = reviewResult.data;
          core.info(`   Approved: ${review.approved}`);
          core.info(`   Issues: ${review.issues.length}`);

          if (review.approved) {
            // Fix is approved, return it
            return {
              fix: this.convertToFixRecommendation(lastFix),
              iterations,
            };
          } else {
            // Not approved, get feedback for next iteration
            reviewFeedback = review.issues
              .map((i) => `[${i.severity}] ${i.description}`)
              .join('\n');
            core.warning(`Fix not approved. Issues: ${review.issues.length}`);
          }
        }
      } else {
        // No review required, return fix directly
        return {
          fix: this.convertToFixRecommendation(lastFix),
          iterations,
        };
      }
    }

    // Max iterations reached
    if (lastFix && lastFix.confidence >= this.config.minConfidence) {
      // Return the last fix even without review approval
      core.warning('Max iterations reached, returning best fix');
      return {
        fix: this.convertToFixRecommendation(lastFix),
        iterations,
      };
    }

    return {
      error: `Max iterations (${this.config.maxIterations}) reached without valid fix`,
      iterations,
    };
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
 * Validate each change's oldCode against the raw source file.
 * If oldCode doesn't match, attempt to find the correct code at the given line number.
 */
function autoCorrectOldCode(
  changes: CodeChange[],
  rawSource: string,
  _context: AgentContext
): AutoCorrectResult {
  const sourceLines = rawSource.split('\n');
  const validChanges: CodeChange[] = [];
  let correctedCount = 0;
  let droppedCount = 0;

  for (const change of changes) {
    if (!change.oldCode) {
      validChanges.push(change);
      continue;
    }

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
