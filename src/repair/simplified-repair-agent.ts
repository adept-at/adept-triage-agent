import * as core from '@actions/core';
import * as fs from 'fs';
import { OpenAIClient } from '../openai-client';
import { RepairContext, ErrorData, FixRecommendation, SourceFetchContext, AIRecommendation, AIChange } from '../types';
import { generateFixSummary } from '../analysis/summary-generator';
import { CONFIDENCE, AGENT_CONFIG, DEFAULT_PRODUCT_REPO } from '../config/constants';
import {
  AgentOrchestrator,
  createOrchestrator,
  createAgentContext,
  OrchestratorConfig,
} from '../agents';
import { getFrameworkLabel } from '../agents/base-agent';
import { CYPRESS_PATTERNS, WDIO_PATTERNS } from '../agents/fix-generation-agent';
import { TriageSkill, FlakinessSignal, formatSkillsForPrompt } from '../services/skill-store';

/**
 * Configuration for the repair agent
 */
export interface RepairAgentConfig {
  /** Enable agentic repair with multiple specialized agents */
  enableAgenticRepair?: boolean;
  /** Orchestrator configuration (for agentic mode) */
  orchestratorConfig?: Partial<OrchestratorConfig>;
}

/**
 * Simplified repair agent that generates fix recommendations
 * Supports both single-shot and agentic (multi-agent) repair modes
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
      enableAgenticRepair: AGENT_CONFIG.ENABLE_AGENTIC_REPAIR,
      ...config,
    };

    // Initialize orchestrator if agentic mode is enabled
    if (this.config.enableAgenticRepair && this.sourceFetchContext) {
      this.orchestrator = createOrchestrator(
        this.openaiClient,
        {
          maxIterations: AGENT_CONFIG.MAX_AGENT_ITERATIONS,
          totalTimeoutMs: AGENT_CONFIG.AGENT_TIMEOUT_MS,
          minConfidence: AGENT_CONFIG.REVIEW_REQUIRED_CONFIDENCE,
          ...this.config.orchestratorConfig,
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
   * If agentic repair is enabled, will attempt multi-agent approach first,
   * then fall back to single-shot if needed.
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
    },
    previousResponseId?: string,
    skills?: { relevant: TriageSkill[]; flakiness?: FlakinessSignal },
    priorInvestigationContext?: string
  ): Promise<{ fix: FixRecommendation; lastResponseId?: string } | null> {
    try {
      core.info('🔧 Generating fix recommendation...');

      // Try agentic repair first if enabled
      if (this.config.enableAgenticRepair && this.orchestrator) {
        core.info('🤖 Attempting agentic repair...');
        const agenticResult = await this.tryAgenticRepair(
          repairContext,
          errorData,
          previousAttempt,
          previousResponseId,
          skills,
          priorInvestigationContext
        );

        if (agenticResult) {
          core.info(
            `✅ Agentic repair succeeded with ${agenticResult.fix.confidence}% confidence`
          );
          return agenticResult;
        }

        core.info(
          '🔄 Agentic repair did not produce a fix, falling back to single-shot...'
        );
      }

      // Single-shot repair (original logic, no conversation chaining)
      const singleShotFix = await this.singleShotRepair(repairContext, errorData, previousAttempt, skills);
      return singleShotFix ? { fix: singleShotFix } : null;
    } catch (error) {
      core.warning(`Failed to generate fix recommendation: ${error}`);
      return null;
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
    },
    previousResponseId?: string,
    skills?: { relevant: TriageSkill[]; flakiness?: FlakinessSignal },
    priorInvestigationContext?: string
  ): Promise<{ fix: FixRecommendation; lastResponseId?: string } | null> {
    if (!this.orchestrator) {
      return null;
    }

    try {
      // Build agent context from repair context
      let enrichedErrorMessage = repairContext.errorMessage;
      if (previousAttempt) {
        const prevChanges = previousAttempt.previousFix.proposedChanges
          .map((c) => `File: ${c.file}\nOld:\n${c.oldCode}\nNew:\n${c.newCode}`)
          .join('\n---\n');
        enrichedErrorMessage += `\n\n## PREVIOUS FIX ATTEMPT (iteration ${previousAttempt.iteration}) — FAILED VALIDATION\n\nThe following fix was applied and the test was re-run, but it still failed.\n\n### Previous Fix:\n${prevChanges}\n\n### Validation Failure Logs:\n${previousAttempt.validationLogs.slice(0, 8000)}\n\nYou MUST try a DIFFERENT approach. Do NOT repeat the same fix.`;
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
        return { fix: result.fix, lastResponseId: result.lastResponseId };
      }

      core.info(
        `🤖 Agentic approach failed: ${result.error || 'No fix generated'}`
      );
      return null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      core.warning(`Agentic repair error: ${errorMsg}`);
      return null;
    }
  }

  /**
   * Single-shot repair (original implementation)
   */
  private async singleShotRepair(
    repairContext: RepairContext,
    errorData?: ErrorData,
    previousAttempt?: {
      iteration: number;
      previousFix: FixRecommendation;
      validationLogs: string;
    },
    skills?: { relevant: TriageSkill[]; flakiness?: FlakinessSignal }
  ): Promise<FixRecommendation | null> {
    // Try to fetch the actual source file content
    let sourceFileContent: string | null = null;
    const cleanFilePath = this.extractFilePath(repairContext.testFile);

    if (this.sourceFetchContext && cleanFilePath) {
      sourceFileContent = await this.fetchSourceFile(cleanFilePath);
      if (sourceFileContent) {
        core.info(
          `  ✅ Fetched source file: ${cleanFilePath} (${sourceFileContent.length} chars)`
        );
      }
    }

    // Build prompt for OpenAI
    const prompt = this.buildPrompt(
      repairContext,
      errorData,
      sourceFileContent,
      cleanFilePath,
      previousAttempt,
      skills
    );

    // Save prompt for debugging (optional)
    if (process.env.DEBUG_FIX_RECOMMENDATION) {
      const promptFile = `fix-prompt-${Date.now()}.md`;
      fs.writeFileSync(promptFile, prompt);
      core.info(`  📝 Full prompt saved to ${promptFile}`);
    }

    // Get recommendation from OpenAI using full error data if available
    const recommendation = await this.getRecommendationFromAI(
      prompt,
      repairContext,
      errorData
    );

    if (
      !recommendation ||
      recommendation.confidence < CONFIDENCE.MIN_FIX_CONFIDENCE
    ) {
      core.info('Cannot generate confident fix recommendation');
      return null;
    }

    // Validate oldCode against actual source for EACH change's target file.
    // Cache fetched files so multi-change fixes targeting the same file are cheap.
    if (this.sourceFetchContext && recommendation.changes) {
      const fileCache = new Map<string, string | null>();
      if (cleanFilePath && sourceFileContent) {
        fileCache.set(cleanFilePath, sourceFileContent);
      }

      const validChanges: typeof recommendation.changes = [];
      for (const change of recommendation.changes) {
        const changePath = this.extractFilePath(change.file);
        if (changePath && changePath !== change.file) {
          core.info(`  📂 Normalized path: "${change.file}" → "${changePath}"`);
          change.file = changePath;
        }

        if (!change.oldCode) {
          validChanges.push(change);
          continue;
        }

        if (!changePath) {
          core.warning(
            `⚠️ Could not resolve file path for change target "${change.file}" — rejecting change`
          );
          continue;
        }

        if (!fileCache.has(changePath)) {
          fileCache.set(changePath, await this.fetchSourceFile(changePath));
        }
        const fileContent = fileCache.get(changePath);

        if (!fileContent) {
          core.warning(
            `⚠️ Could not fetch source for "${changePath}" — rejecting change (cannot verify oldCode)`
          );
          continue;
        }

        if (!fileContent.includes(change.oldCode)) {
          core.warning(
            `⚠️ oldCode does not exist in ${changePath}: "${change.oldCode.substring(0, 80)}..." — rejecting (hallucinated)`
          );
          continue;
        }

        const firstIdx = fileContent.indexOf(change.oldCode);
        const secondIdx = fileContent.indexOf(change.oldCode, firstIdx + 1);
        if (secondIdx !== -1) {
          core.warning(
            `⚠️ oldCode matches multiple locations in ${changePath} — rejecting (ambiguous replacement)`
          );
          continue;
        }

        validChanges.push(change);
      }

      if (validChanges.length === 0) {
        core.warning(
          '❌ All proposed changes failed source validation — rejecting recommendation'
        );
        return null;
      }
      recommendation.changes = validChanges;
    }

    // Format the recommendation
    const fixRecommendation: FixRecommendation = {
      confidence: recommendation.confidence,
      summary: this.generateSummary(recommendation, repairContext),
      proposedChanges: (recommendation.changes || []).map((change) => ({
        file: this.extractFilePath(change.file) || change.file,
        line: change.line || 0,
        oldCode: change.oldCode || '',
        newCode: change.newCode || '',
        justification: change.justification,
      })),
      evidence: recommendation.evidence || [],
      reasoning:
        recommendation.reasoning || 'Fix based on error pattern analysis',
    };

    core.info(
      `✅ Fix recommendation generated with ${fixRecommendation.confidence}% confidence`
    );
    return fixRecommendation;
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

  /**
   * Walks outward from `lineIndex` (0-based) to find the enclosing function
   * boundaries so the model receives the full function body, not just a
   * narrow window around the crash line.
   */
  private findEnclosingFunction(
    lines: string[],
    lineIndex: number
  ): { fnStart: number; fnEnd: number } {
    const funcPattern =
      /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))|^\s*(?:async\s+)?\w+\s*\([^)]*\)\s*\{/;

    let fnStart = lineIndex;
    for (let i = lineIndex; i >= 0; i--) {
      if (funcPattern.test(lines[i])) {
        fnStart = i;
        break;
      }
    }

    // Walk forward from fnStart to find the matching closing brace
    let braceDepth = 0;
    let fnEnd = lines.length - 1;
    let foundOpen = false;
    for (let i = fnStart; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') {
          braceDepth++;
          foundOpen = true;
        } else if (ch === '}') {
          braceDepth--;
        }
      }
      if (foundOpen && braceDepth <= 0) {
        fnEnd = i;
        break;
      }
    }

    return { fnStart, fnEnd };
  }

  /**
   * Fetches source file content from GitHub
   */
  private async fetchSourceFile(filePath: string): Promise<string | null> {
    if (!this.sourceFetchContext) {
      return null;
    }

    const { octokit, owner, repo, branch = 'main' } = this.sourceFetchContext;

    try {
      core.debug(
        `Fetching source file: ${owner}/${repo}/${filePath} (branch: ${branch})`
      );

      const response = await octokit.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: branch,
      });

      // Ensure we got a file (not a directory)
      if (Array.isArray(response.data) || response.data.type !== 'file') {
        core.debug(`${filePath} is not a file`);
        return null;
      }

      const content = Buffer.from(response.data.content, 'base64').toString(
        'utf-8'
      );
      return content;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      core.debug(`Failed to fetch source file ${filePath}: ${errorMsg}`);
      return null;
    }
  }

  /**
   * Strips prompt-injection patterns and caps length for safe prompt interpolation
   */
  private sanitizeForPrompt(input: string, maxLength: number = 2000): string {
    if (!input) return '';
    let sanitized = input
      .replace(/```/g, '\u2032\u2032\u2032')
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

  /**
   * Builds the prompt for OpenAI to generate fix recommendation
   */
  private buildPrompt(
    context: RepairContext,
    errorData?: ErrorData,
    sourceFileContent?: string | null,
    cleanFilePath?: string | null,
    previousAttempt?: {
      iteration: number;
      previousFix: FixRecommendation;
      validationLogs: string;
    },
    skills?: { relevant: TriageSkill[]; flakiness?: FlakinessSignal }
  ): string {
    let contextInfo = `## Test Failure Context
- **Test File:** ${this.sanitizeForPrompt(context.testFile)}
- **Test Name:** ${this.sanitizeForPrompt(context.testName)}
- **Error Type:** ${this.sanitizeForPrompt(context.errorType)}
- **Error Message:** ${this.sanitizeForPrompt(context.errorMessage, 4000)}
- **Analyzed Repository:** ${this.sanitizeForPrompt(context.repository)}
- **Analyzed Branch:** ${this.sanitizeForPrompt(context.branch)}
- **Analyzed Commit SHA:** ${this.sanitizeForPrompt(context.commitSha)}
${
  context.errorSelector ? `- **Failed Selector:** ${this.sanitizeForPrompt(context.errorSelector)}` : ''
}
${context.errorLine ? `- **Error Line:** ${context.errorLine}` : ''}`;

    contextInfo += `\n- **Product Under Test:** ${DEFAULT_PRODUCT_REPO}`;

    if (this.sourceFetchContext) {
      contextInfo += `\n\n## Repair Source Context
- **Test Repository:** ${this.sourceFetchContext.owner}/${this.sourceFetchContext.repo}
- **Source Branch:** ${this.sourceFetchContext.branch}
- **Note:** You may ONLY propose changes to files in the test repository. Product source files (from ${DEFAULT_PRODUCT_REPO}) are provided for context only.`;
    }

    // Add the actual source file content if we fetched it
    if (sourceFileContent && cleanFilePath) {
      core.info('  ✅ Including actual source file content in prompt');

      const lines = sourceFileContent.split('\n');
      const errorLine = context.errorLine || 0;

      if (errorLine > 0 && errorLine <= lines.length) {
        // Find the enclosing function boundaries so the model sees the full
        // causal chain (e.g. the typing logic BEFORE the assertion that crashed)
        const { fnStart, fnEnd } = this.findEnclosingFunction(
          lines,
          errorLine - 1
        );
        const startLine = Math.max(0, Math.min(fnStart, errorLine - 40));
        const endLine = Math.min(
          lines.length,
          Math.max(fnEnd + 1, errorLine + 40)
        );
        const relevantLines = lines.slice(startLine, endLine);
        const numberedLines = relevantLines
          .map((line, i) => {
            const lineNum = startLine + i + 1;
            const marker = lineNum === errorLine ? '>>> ' : '    ';
            return `${marker}${lineNum}: ${line}`;
          })
          .join('\n');

        contextInfo += `\n\n## Source File: ${cleanFilePath} (lines ${
          startLine + 1
        }-${endLine})
\`\`\`javascript
${numberedLines}
\`\`\``;
      } else {
        // Show first 150 lines if no specific error line
        const previewLines = lines.slice(0, 150);
        const numberedLines = previewLines
          .map((line, i) => `${i + 1}: ${line}`)
          .join('\n');

        contextInfo += `\n\n## Source File: ${cleanFilePath} (first 150 lines)
\`\`\`javascript
${numberedLines}
${lines.length > 150 ? `\n... (${lines.length - 150} more lines)` : ''}
\`\`\``;
      }
    }

    // Add additional context from ErrorData if available
    if (errorData) {
      core.info('\n📋 Adding full context to fix recommendation prompt:');

      if (errorData.stackTrace) {
        core.info('  ✅ Including stack trace');
        contextInfo += `\n\n## Stack Trace\n\`\`\`\n${errorData.stackTrace}\n\`\`\``;
      }

      if (errorData.logs && errorData.logs.length > 0) {
        core.info(
          `  ✅ Including ${errorData.logs.length} log entries (first 1000 chars)`
        );
        const logPreview = errorData.logs.join('\n').substring(0, 1000);
        contextInfo += `\n\n## Test Logs\n\`\`\`\n${logPreview}\n\`\`\``;
      }

      if (errorData.screenshots && errorData.screenshots.length > 0) {
        core.info(
          `  ✅ Including ${errorData.screenshots.length} screenshot(s) metadata`
        );
        contextInfo += `\n\n## Screenshots\n${errorData.screenshots.length} screenshot(s) available showing the UI state at failure`;
        // Add screenshot names if available
        errorData.screenshots.forEach((screenshot, index) => {
          contextInfo += `\n- Screenshot ${index + 1}: ${screenshot.name}`;
          if (screenshot.timestamp) {
            contextInfo += ` (at ${screenshot.timestamp})`;
          }
        });
      }

      if (errorData.testArtifactLogs) {
        core.info('  ✅ Including test artifact logs (first 1000 chars)');
        const logsPreview = errorData.testArtifactLogs.substring(0, 1000);
        contextInfo += `\n\n## Test Artifact Logs\n\`\`\`\n${logsPreview}\n\`\`\``;
      }

      if (errorData.prDiff) {
        core.info(
          `  ✅ Including test-repo diff (${errorData.prDiff.totalChanges} files changed)`
        );
        contextInfo += `\n\n## Recent Changes in Test Repo\nThese are changes in the test repository (commit/PR).\n`;
        contextInfo += `- **Total Files Changed:** ${errorData.prDiff.totalChanges}\n`;
        contextInfo += `- **Lines Added:** ${errorData.prDiff.additions}\n`;
        contextInfo += `- **Lines Deleted:** ${errorData.prDiff.deletions}\n`;

        if (errorData.prDiff.files && errorData.prDiff.files.length > 0) {
          contextInfo += `\n### Changed Files:\n`;
          const relevantFiles = errorData.prDiff.files.slice(0, 10);
          relevantFiles.forEach((file) => {
            contextInfo += `\n#### ${file.filename} (${file.status})\n`;
            contextInfo += `- Changes: +${file.additions || 0}/-${
              file.deletions || 0
            } lines\n`;
            if (file.patch) {
              const patchPreview = file.patch.substring(0, 500);
              contextInfo += `\n\`\`\`diff\n${patchPreview}${
                file.patch.length > 500 ? '\n... (truncated)' : ''
              }\n\`\`\`\n`;
            }
          });
          if (errorData.prDiff.files.length > 10) {
            contextInfo += `\n... and ${
              errorData.prDiff.files.length - 10
            } more files changed\n`;
          }
        }
      }

      if (errorData.productDiff) {
        core.info(
          `  ✅ Including product-repo diff (${errorData.productDiff.totalChanges} files changed from ${DEFAULT_PRODUCT_REPO})`
        );
        contextInfo += `\n\n## ⚠️ Recent Product Repo Changes (${DEFAULT_PRODUCT_REPO})\nThese are READ-ONLY changes from the product codebase. You MUST review these to determine if a product change caused the failure.\n`;
        contextInfo += `- **Total Files Changed:** ${errorData.productDiff.totalChanges}\n`;
        contextInfo += `- **Lines Added:** ${errorData.productDiff.additions}\n`;
        contextInfo += `- **Lines Deleted:** ${errorData.productDiff.deletions}\n`;

        if (errorData.productDiff.files && errorData.productDiff.files.length > 0) {
          contextInfo += `\n### Changed Product Files:\n`;
          const relevantFiles = errorData.productDiff.files.slice(0, 10);
          relevantFiles.forEach((file) => {
            contextInfo += `\n#### ${file.filename} (${file.status})\n`;
            contextInfo += `- Changes: +${file.additions || 0}/-${
              file.deletions || 0
            } lines\n`;
            if (file.patch) {
              const patchPreview = file.patch.substring(0, 2000);
              contextInfo += `\n\`\`\`diff\n${patchPreview}${
                file.patch.length > 2000 ? '\n... (truncated)' : ''
              }\n\`\`\`\n`;
            }
          });
          if (errorData.productDiff.files.length > 10) {
            contextInfo += `\n... and ${
              errorData.productDiff.files.length - 10
            } more files changed\n`;
          }
        }
      }
    } else {
      core.info('⚠️  No ErrorData provided - using minimal context');
    }

    if (skills && skills.relevant.length > 0) {
      const skillsText = formatSkillsForPrompt(skills.relevant, 'fix_generation', skills.flakiness);
      contextInfo += `\n\n${skillsText}`;
    } else if (skills?.flakiness?.isFlaky) {
      contextInfo += `\n\n⚠️ FLAKINESS SIGNAL: ${skills.flakiness.message}`;
    }

    if (previousAttempt) {
      const prevChanges = previousAttempt.previousFix.proposedChanges
        .map(
          (c) =>
            `File: ${c.file}\noldCode:\n\`\`\`\n${c.oldCode}\n\`\`\`\nnewCode:\n\`\`\`\n${c.newCode}\n\`\`\``
        )
        .join('\n---\n');

      contextInfo += `\n\n## PREVIOUS FIX ATTEMPT #${previousAttempt.iteration} — FAILED VALIDATION

The following fix was applied to a branch and the test was re-run on Sauce Labs, but it **still failed**.

### Previous Fix That Was Tried:
${prevChanges}

### Validation Failure Logs (tail):
\`\`\`
${previousAttempt.validationLogs.slice(0, 6000)}
\`\`\`

**CRITICAL: You MUST try a DIFFERENT approach.** Analyze WHY the previous fix failed and address the root cause. Do NOT repeat the same change.`;
    }

    const frameworkPatterns = errorData?.framework === 'cypress'
      ? CYPRESS_PATTERNS
      : errorData?.framework === 'webdriverio'
        ? WDIO_PATTERNS
        : CYPRESS_PATTERNS + WDIO_PATTERNS;

    return `You are a test repair expert. Analyze this test failure and provide a fix recommendation.

${contextInfo}

${frameworkPatterns}

## Your Task
Based on the error type and message, provide a fix recommendation. Focus on the most likely cause and solution.

**CRITICAL — ABSOLUTE RULES FOR oldCode:**
1. You MUST copy oldCode **verbatim** from the Source File content provided above — character for character
2. You MUST NOT invent, paraphrase, or reconstruct code from memory
3. If no Source File content was provided above, set confidence below 50 and leave oldCode empty
4. The oldCode will be used for an exact string match (find-and-replace). If it does not appear verbatim in the file, the fix WILL FAIL
5. Include enough surrounding lines (3-5) to make the match unique in the file
6. Preserve all whitespace, quotes, semicolons, variable names, and formatting exactly as shown in the source

**IMPORTANT — COMPLETE FIX SCOPE:**
1. oldCode MUST cover the ENTIRE block of code affected by the fix, from first changed line to last
2. When adding a null/undefined guard (if/else), include ALL downstream lines that use the guarded variable — not just the first usage. Trace the variable through to the last line that reads or calls it.
3. If a variable like \`result\` is checked for null, then every subsequent line that calls \`JSON.parse(result)\`, reads \`result.something\`, or asserts on a value derived from \`result\` MUST be inside the guard.
4. newCode must be a complete, self-contained replacement — the file must be valid after substitution
5. NEVER fix only the first symptom and leave subsequent lines that will still crash. Walk through the code line by line after your proposed \`oldCode\` ends and ask: "will the next line crash too?" If yes, extend oldCode to include it.

**IMPORTANT — ROOT CAUSE TRACING (do NOT just fix the crash site):**
1. When a value is null/undefined/wrong, trace BACKWARD through the code: WHY is it null? What upstream step failed to produce it?
2. Example chain: \`expect(result).toBeTruthy()\` fails → result is undefined → \`sauceGqlHelper\` returned null → the GraphQL mutation never fired → the text was never typed into the editor → \`document.execCommand('insertText')\` silently failed. The ROOT CAUSE is execCommand, not the assertion.
3. Read the ENTIRE function containing the error, not just the crash line. The bug is often 10-30 lines BEFORE the crash.
4. Ask: "If I only add a null guard, will the test still be TESTING anything meaningful, or am I just silencing a real problem?"

**FIX HIERARCHY — prefer root cause fixes over defensive guards:**
1. BEST: Fix the root cause (e.g., replace broken \`execCommand\` with native keyboard actions)
2. GOOD: Fix root cause AND add a defensive guard for flaky infrastructure
3. ACCEPTABLE: Add a defensive guard when the root cause is external/unfixable (e.g., third-party service timing)
4. BAD: Only add a null guard that silences the failure without fixing why the value is null
5. You may propose MULTIPLE changes — one for the root cause and one for the defensive guard. Use separate entries in the "changes" array.

**KNOWN BROWSER AUTOMATION ANTI-PATTERNS (these are likely root causes):**
- \`document.execCommand('insertText'|'selectAll'|'delete')\` — DEPRECATED, silently fails in modern Chrome/Chromium especially with Lexical, ProseMirror, Draft.js, and other frameworks using \`beforeinput\` events. Replace with native WebDriver keyboard actions: \`element.keys('text')\`, \`browser.keys(['Control', 'a'])\`, \`browser.keys(['Backspace'])\`.
- \`element.setValue()\` or \`element.clearValue()\` on contenteditable — often bypasses framework event handlers. Prefer \`element.click()\` then \`browser.keys()\`.
- \`element.innerHTML = ...\` via \`execute()\` — bypasses React/framework state entirely.
- Hardcoded \`browser.pause()\` instead of \`waitUntil()\` — flaky timing.

**Important:** If PR changes are provided, analyze whether recent code changes may have caused the test failure. Look for:
- Changed selectors or UI components that the test depends on
- Modified API endpoints or data structures
- Changes to the test file itself
- Timing or async behavior changes

## Response Format (JSON)
{
  "confidence": 0-100,
  "reasoning": "explanation of the issue AND the causal chain traced backward to root cause",
  "changes": [
    {
      "file": "path/to/file",
      "line": line_number_if_known,
      "oldCode": "EXACT verbatim code from the file that needs to be replaced",
      "newCode": "suggested fix",
      "justification": "why this fixes the issue"
    }
  ],
  "evidence": ["facts supporting this fix"],
  "rootCause": "the DEEPEST cause in the causal chain, not just the crash site"
}

## Common Patterns to Consider:
- ELEMENT_NOT_FOUND: Selector likely changed or element removed
- TIMEOUT: Element may be loading slowly or conditionally rendered
- ASSERTION_FAILED: Expected value may have changed — but ALSO ask WHY the value is wrong. Trace backward.
- ELEMENT_NOT_VISIBLE: Element may be hidden or overlapped
- NULL/UNDEFINED RESULT: The producing function failed upstream — trace the data flow backward

Respond with JSON only. If you cannot provide a confident fix, set confidence below 50.`;
  }

  /**
   * Gets fix recommendation from OpenAI
   */
  private async getRecommendationFromAI(
    prompt: string,
    context: RepairContext,
    fullErrorData?: ErrorData
  ): Promise<AIRecommendation | null> {
    try {
      const frameworkLabel = getFrameworkLabel(fullErrorData?.framework);
      // Build a repair-specific system prompt that enforces JSON output
      const systemPrompt = `You are a test repair expert. Produce a concrete, review-ready fix plan for a ${frameworkLabel} TEST_ISSUE.

ABSOLUTE RULES — VIOLATION MEANS THE FIX WILL FAIL:
1. The "oldCode" field MUST be copied character-for-character from the "Source File" section in the user prompt.
2. You MUST NOT invent, paraphrase, or reconstruct code. Only quote verbatim from the provided source.
3. If no source file content is provided, set confidence below 50 and omit oldCode.
4. oldCode is used for exact string find-and-replace. Any deviation — even whitespace — causes failure.

COMPLETE FIX SCOPE — YOUR FIX MUST COVER ALL AFFECTED LINES:
5. oldCode MUST span from the first affected line to the LAST affected line. Do NOT stop at the first symptom.
6. When adding a null/undefined guard, include ALL downstream lines that depend on the guarded variable.
7. After writing your fix, walk through every line after oldCode ends. If it will still crash, extend.
8. A partial fix is WORSE than no fix — it still crashes but now in a different place.

ROOT CAUSE TRACING — DO NOT JUST FIX THE CRASH SITE:
9. When a value is null/undefined, trace BACKWARD: WHY is it null? What upstream step failed?
10. Read the ENTIRE function, not just the crash line. The bug is often 10-30 lines BEFORE the crash.
11. Example: assertion fails on \`result\` → helper returned null → mutation never fired → text never entered editor → \`document.execCommand\` silently failed. The root cause is execCommand, not the assertion.
12. Ask: "If I only add a null guard, does the test still test anything meaningful?"

FIX HIERARCHY:
13. BEST: Fix the root cause (e.g., replace broken API with working alternative)
14. GOOD: Fix root cause AND add defensive guard for flaky infrastructure
15. ACCEPTABLE: Defensive guard only when root cause is external/unfixable
16. You may propose MULTIPLE changes in the "changes" array.

KNOWN BROWSER ANTI-PATTERNS (likely root causes — replace, don't guard):
- \`document.execCommand('insertText'|'selectAll'|'delete')\` — deprecated, silently fails with Lexical/ProseMirror/Draft.js. Replace with WebDriver \`keys()\` or \`browser.keys(['Control','a'])\`.
- \`element.setValue()\`/\`clearValue()\` on contenteditable — bypasses framework handlers.
- \`element.innerHTML = ...\` via execute() — bypasses React/framework state.

You MUST respond in strict JSON only with this schema:
{
  "confidence": number (0-100),
  "reasoning": string (include causal chain traced to root cause),
  "rootCause": string (the DEEPEST cause, not just the crash site),
  "evidence": string[],
  "changes": [
    {
      "file": string,
      "line"?: number,
      "oldCode"?: string (MUST be exact verbatim match from source),
      "newCode": string,
      "justification": string
    }
  ]
}`;

      // Compose multimodal user content: the textual prompt and any screenshots
      type ContentPart =
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'auto' | 'high' } };
      const userParts: ContentPart[] = [{ type: 'text', text: prompt }];
      if (
        fullErrorData?.screenshots &&
        fullErrorData.screenshots.length > 0
      ) {
        for (const s of fullErrorData.screenshots) {
          if (s.base64Data) {
            userParts.push({
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${s.base64Data}`,
                detail: 'high',
              },
            });
            userParts.push({
              type: 'text',
              text: `Screenshot: ${s.name}${
                s.timestamp ? ` (at ${s.timestamp})` : ''
              }`,
            });
          }
        }
      }

      const { text: content } = await this.openaiClient.generateWithCustomPrompt({
        systemPrompt,
        userContent: userParts,
        responseAsJson: true,
        temperature: 0.3,
      });

      try {
        return JSON.parse(content) as AIRecommendation;
      } catch (parseErr) {
        core.warning(
          `Repair JSON parse failed, falling back to heuristic extraction: ${parseErr}`
        );
        return {
          confidence: 60,
          reasoning: content,
          changes: this.extractChangesFromText(content, context),
          evidence: [],
          rootCause: 'Derived from repair response text',
        };
      }
    } catch (error) {
      core.warning(`AI analysis failed: ${error}`);
      return null;
    }
  }

  /**
   * Extracts possible changes from text response
   */
  private extractChangesFromText(
    _text: string,
    context: RepairContext
  ): AIChange[] {
    const changes = [];

    // If we have a selector error, suggest updating the selector
    if (context.errorSelector && context.errorType === 'ELEMENT_NOT_FOUND') {
      changes.push({
        file: context.testFile,
        line: context.errorLine || 0,
        oldCode: context.errorSelector,
        newCode: '// TODO: Update selector to match current application',
        justification:
          'Selector not found - needs to be updated to match current DOM',
      });
    }

    // For timeout errors, suggest adding wait or retry
    if (context.errorType === 'TIMEOUT') {
      changes.push({
        file: context.testFile,
        line: context.errorLine || 0,
        oldCode: '// Timeout occurred here',
        newCode:
          'cy.wait(1000); // Consider adding explicit wait or retry logic',
        justification: 'Adding wait time to handle slow-loading elements',
      });
    }

    return changes;
  }

  /**
   * Generates a human-readable summary of the fix
   */
  private generateSummary(
    recommendation: AIRecommendation,
    context: RepairContext
  ): string {
    // Use consolidated summary generator (no code blocks for Slack compatibility)
    return generateFixSummary(recommendation, context, false);
  }
}
