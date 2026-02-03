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
} from './fix-generation-agent';
import { ReviewAgent, ReviewOutput } from './review-agent';
import { FixRecommendation, ErrorData } from '../types';
import { Octokit } from '@octokit/rest';

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
 * Context for source file fetching
 */
export interface SourceFetchContext {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
}

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

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
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

    // Update context with code content
    if (codeReadingResult.success && codeReadingResult.data) {
      context.sourceFileContent = codeReadingResult.data.testFileContent;
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
 * Factory function for creating an orchestrator
 */
export function createOrchestrator(
  openaiClient: OpenAIClient,
  config?: Partial<OrchestratorConfig>,
  sourceFetchContext?: SourceFetchContext
): AgentOrchestrator {
  return new AgentOrchestrator(openaiClient, config, sourceFetchContext);
}
