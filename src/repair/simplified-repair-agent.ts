import * as core from '@actions/core';
import * as fs from 'fs';
import { Octokit } from '@octokit/rest';
import { OpenAIClient } from '../openai-client';
import { RepairContext, ErrorData } from '../types';
import { FixRecommendation } from '../types';
import { generateFixSummary } from '../analysis/summary-generator';
import { CONFIDENCE } from '../config/constants';

// Internal type for AI response structure
interface AIRecommendation {
  confidence: number;
  reasoning: string;
  changes: AIChange[];
  evidence: string[];
  rootCause: string;
}

interface AIChange {
  file: string;
  line?: number;
  oldCode?: string;
  newCode?: string;
  justification: string;
}

/**
 * Context for fetching source files from GitHub
 */
export interface SourceFetchContext {
  octokit: Octokit;
  owner: string;
  repo: string;
  /** Branch to fetch from (defaults to 'main') */
  branch?: string;
}

/**
 * Simplified repair agent that generates fix recommendations
 * without complex context fetching or PR creation
 */
export class SimplifiedRepairAgent {
  private openaiClient: OpenAIClient;
  private sourceFetchContext?: SourceFetchContext;

  /**
   * Creates a new SimplifiedRepairAgent
   * @param openaiClientOrApiKey - Either an OpenAIClient instance or an API key string
   * @param sourceFetchContext - Optional context for fetching source files from GitHub
   */
  constructor(openaiClientOrApiKey: OpenAIClient | string, sourceFetchContext?: SourceFetchContext) {
    if (typeof openaiClientOrApiKey === 'string') {
      this.openaiClient = new OpenAIClient(openaiClientOrApiKey);
    } else {
      this.openaiClient = openaiClientOrApiKey;
    }
    this.sourceFetchContext = sourceFetchContext;
  }

  /**
   * Generates a fix recommendation for a test failure
   * Returns null if no fix can be recommended
   */
  async generateFixRecommendation(repairContext: RepairContext, errorData?: ErrorData): Promise<FixRecommendation | null> {
    try {
      core.info('🔧 Generating fix recommendation...');

      // Try to fetch the actual source file content
      let sourceFileContent: string | null = null;
      const cleanFilePath = this.extractFilePath(repairContext.testFile);

      if (this.sourceFetchContext && cleanFilePath) {
        sourceFileContent = await this.fetchSourceFile(cleanFilePath);
        if (sourceFileContent) {
          core.info(`  ✅ Fetched source file: ${cleanFilePath} (${sourceFileContent.length} chars)`);
        }
      }

      // Build prompt for OpenAI
      const prompt = this.buildPrompt(repairContext, errorData, sourceFileContent, cleanFilePath);

      // Save prompt for debugging (optional)
      if (process.env.DEBUG_FIX_RECOMMENDATION) {
        const promptFile = `fix-prompt-${Date.now()}.md`;
        fs.writeFileSync(promptFile, prompt);
        core.info(`  📝 Full prompt saved to ${promptFile}`);
      }

      // Get recommendation from OpenAI using full error data if available
      const recommendation = await this.getRecommendationFromAI(prompt, repairContext, errorData);

      if (!recommendation || recommendation.confidence < CONFIDENCE.MIN_FIX_CONFIDENCE) {
        core.info('Cannot generate confident fix recommendation');
        return null;
      }

      // Format the recommendation
      const fixRecommendation: FixRecommendation = {
        confidence: recommendation.confidence,
        summary: this.generateSummary(recommendation, repairContext),
        proposedChanges: (recommendation.changes || []).map(change => ({
          file: change.file,
          line: change.line || 0, // Default to 0 if line is not specified
          oldCode: change.oldCode || '',
          newCode: change.newCode || '',
          justification: change.justification
        })),
        evidence: recommendation.evidence || [],
        reasoning: recommendation.reasoning || 'Fix based on error pattern analysis'
      };

      core.info(`✅ Fix recommendation generated with ${fixRecommendation.confidence}% confidence`);
      return fixRecommendation;

    } catch (error) {
      core.warning(`Failed to generate fix recommendation: ${error}`);
      return null;
    }
  }

  /**
   * Extracts the actual file path from webpack URLs or other formats
   * e.g., "webpack://lib-cypress-13/./cypress/support/lexicalHelpers.js" -> "cypress/support/lexicalHelpers.js"
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
   * Fetches source file content from GitHub
   */
  private async fetchSourceFile(filePath: string): Promise<string | null> {
    if (!this.sourceFetchContext) {
      return null;
    }

    const { octokit, owner, repo, branch = 'main' } = this.sourceFetchContext;

    try {
      core.debug(`Fetching source file: ${owner}/${repo}/${filePath} (branch: ${branch})`);

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

      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      return content;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      core.debug(`Failed to fetch source file ${filePath}: ${errorMsg}`);
      return null;
    }
  }

  /**
   * Builds the prompt for OpenAI to generate fix recommendation
   */
  private buildPrompt(context: RepairContext, errorData?: ErrorData, sourceFileContent?: string | null, cleanFilePath?: string | null): string {
    let contextInfo = `## Test Failure Context
- **Test File:** ${context.testFile}
- **Test Name:** ${context.testName}
- **Error Type:** ${context.errorType}
- **Error Message:** ${context.errorMessage}
${context.errorSelector ? `- **Failed Selector:** ${context.errorSelector}` : ''}
${context.errorLine ? `- **Error Line:** ${context.errorLine}` : ''}`;

    // Add the actual source file content if we fetched it
    if (sourceFileContent && cleanFilePath) {
      core.info('  ✅ Including actual source file content in prompt');

      // If we have an error line, show context around it
      const lines = sourceFileContent.split('\n');
      const errorLine = context.errorLine || 0;

      if (errorLine > 0 && errorLine <= lines.length) {
        // Show 20 lines before and after the error line
        const startLine = Math.max(0, errorLine - 20);
        const endLine = Math.min(lines.length, errorLine + 20);
        const relevantLines = lines.slice(startLine, endLine);
        const numberedLines = relevantLines.map((line, i) => {
          const lineNum = startLine + i + 1;
          const marker = lineNum === errorLine ? '>>> ' : '    ';
          return `${marker}${lineNum}: ${line}`;
        }).join('\n');

        contextInfo += `\n\n## Source File: ${cleanFilePath} (lines ${startLine + 1}-${endLine})
\`\`\`javascript
${numberedLines}
\`\`\``;
      } else {
        // Show first 100 lines if no specific error line
        const previewLines = lines.slice(0, 100);
        const numberedLines = previewLines.map((line, i) => `${i + 1}: ${line}`).join('\n');

        contextInfo += `\n\n## Source File: ${cleanFilePath} (first 100 lines)
\`\`\`javascript
${numberedLines}
${lines.length > 100 ? `\n... (${lines.length - 100} more lines)` : ''}
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
        core.info(`  ✅ Including ${errorData.logs.length} log entries (first 1000 chars)`);
        const logPreview = errorData.logs.join('\n').substring(0, 1000);
        contextInfo += `\n\n## Test Logs\n\`\`\`\n${logPreview}\n\`\`\``;
      }

      if (errorData.screenshots && errorData.screenshots.length > 0) {
        core.info(`  ✅ Including ${errorData.screenshots.length} screenshot(s) metadata`);
        contextInfo += `\n\n## Screenshots\n${errorData.screenshots.length} screenshot(s) available showing the UI state at failure`;
        // Add screenshot names if available
        errorData.screenshots.forEach((screenshot, index) => {
          contextInfo += `\n- Screenshot ${index + 1}: ${screenshot.name}`;
          if (screenshot.timestamp) {
            contextInfo += ` (at ${screenshot.timestamp})`;
          }
        });
      }

      if (errorData.cypressArtifactLogs) {
        core.info('  ✅ Including Cypress artifact logs (first 1000 chars)');
        const cypressPreview = errorData.cypressArtifactLogs.substring(0, 1000);
        contextInfo += `\n\n## Cypress Logs\n\`\`\`\n${cypressPreview}\n\`\`\``;
      }

      // Include PR diff if available - crucial for understanding what changed
      if (errorData.prDiff) {
        core.info(`  ✅ Including PR diff (${errorData.prDiff.totalChanges} files changed)`);
        contextInfo += `\n\n## Pull Request Changes\n`;
        contextInfo += `- **Total Files Changed:** ${errorData.prDiff.totalChanges}\n`;
        contextInfo += `- **Lines Added:** ${errorData.prDiff.additions}\n`;
        contextInfo += `- **Lines Deleted:** ${errorData.prDiff.deletions}\n`;

        if (errorData.prDiff.files && errorData.prDiff.files.length > 0) {
          contextInfo += `\n### Changed Files (Most Relevant):\n`;

          // Show up to 10 most relevant files with their changes
          const relevantFiles = errorData.prDiff.files.slice(0, 10);
          relevantFiles.forEach(file => {
            contextInfo += `\n#### ${file.filename} (${file.status})\n`;
            contextInfo += `- Changes: +${file.additions || 0}/-${file.deletions || 0} lines\n`;

            // Include patch preview if available (first 500 chars)
            if (file.patch) {
              const patchPreview = file.patch.substring(0, 500);
              contextInfo += `\n\`\`\`diff\n${patchPreview}${file.patch.length > 500 ? '\n... (truncated)' : ''}\n\`\`\`\n`;
            }
          });

          if (errorData.prDiff.files.length > 10) {
            contextInfo += `\n... and ${errorData.prDiff.files.length - 10} more files changed\n`;
          }
        }
      }
    } else {
      core.info('⚠️  No ErrorData provided - using minimal context');
    }

    return `You are a test repair expert. Analyze this test failure and provide a fix recommendation.

${contextInfo}

## Your Task
Based on the error type and message, provide a fix recommendation. Focus on the most likely cause and solution.

**CRITICAL FOR AUTO-FIX:** You have been provided with the ACTUAL SOURCE FILE CONTENT above. When specifying "oldCode" in your changes:
- Copy the EXACT code from the source file, including whitespace, quotes, and formatting
- The oldCode must be a verbatim substring that exists in the file
- Do NOT paraphrase or reformat the code
- Include enough context (multiple lines if needed) to make the match unique

**Important:** If PR changes are provided, analyze whether recent code changes may have caused the test failure. Look for:
- Changed selectors or UI components that the test depends on
- Modified API endpoints or data structures
- Changes to the test file itself
- Timing or async behavior changes

## Response Format (JSON)
{
  "confidence": 0-100,
  "reasoning": "explanation of the issue and fix",
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
  "rootCause": "brief description of root cause"
}

## Common Patterns to Consider:
- ELEMENT_NOT_FOUND: Selector likely changed or element removed
- TIMEOUT: Element may be loading slowly or conditionally rendered
- ASSERTION_FAILED: Expected value may have changed
- ELEMENT_NOT_VISIBLE: Element may be hidden or overlapped

Respond with JSON only. If you cannot provide a confident fix, set confidence below 50.`;
  }

  /**
   * Gets fix recommendation from OpenAI
   */
  private async getRecommendationFromAI(prompt: string, context: RepairContext, fullErrorData?: ErrorData): Promise<AIRecommendation | null> {
    try {
      const clientAny = this.openaiClient as unknown as {
        generateWithCustomPrompt?: (args: {
          systemPrompt: string;
          userContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'auto' | 'high' } }> | string;
          responseAsJson?: boolean;
          temperature?: number;
        }) => Promise<string>;
        analyze: (errorData: ErrorData, examples: []) => Promise<{ reasoning: string; indicators?: string[] }>;
      };

      if (typeof clientAny.generateWithCustomPrompt === 'function') {
        // Build a repair-specific system prompt that enforces JSON output
        const systemPrompt = `You are a test repair expert. Produce a concrete, review-ready fix plan for a Cypress TEST_ISSUE.

CRITICAL: When providing "oldCode" in your changes, you MUST copy the EXACT code from the source file provided.
The oldCode must be a verbatim match - including whitespace, quotes, semicolons, and formatting.
If you cannot find the exact code to replace, set confidence below 50.

You MUST respond in strict JSON only with this schema:
{
  "confidence": number (0-100),
  "reasoning": string,
  "rootCause": string,
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
        const userParts: Array<
          | { type: 'text'; text: string }
          | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'auto' | 'high' } }
        > = [
          { type: 'text', text: prompt }
        ];
        if (fullErrorData?.screenshots && fullErrorData.screenshots.length > 0) {
          for (const s of fullErrorData.screenshots) {
            if (s.base64Data) {
              userParts.push({
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${s.base64Data}`, detail: 'high' }
              });
              userParts.push({ type: 'text', text: `Screenshot: ${s.name}${s.timestamp ? ` (at ${s.timestamp})` : ''}` });
            }
          }
        }

        const content = await clientAny.generateWithCustomPrompt({
          systemPrompt,
          userContent: userParts,
          responseAsJson: true,
          temperature: 0.3
        });

        try {
          const recommendation = JSON.parse(content) as AIRecommendation;
          return recommendation;
        } catch (parseErr) {
          core.warning(`Repair JSON parse failed, falling back to heuristic extraction: ${parseErr}`);
          return {
            confidence: 60,
            reasoning: content,
            changes: this.extractChangesFromText(content, context),
            evidence: [],
            rootCause: 'Derived from repair response text'
          };
        }
      }

      // Fallback to original triage-oriented analyze if custom method is not available (e.g., in tests)
      const errorData = fullErrorData || {
        message: prompt,
        framework: 'cypress',
        testName: context.testName,
        fileName: context.testFile
      };
      const triageLike = await clientAny.analyze(errorData, []);
      try {
        const recommendation = JSON.parse(triageLike.reasoning) as AIRecommendation;
        return recommendation;
      } catch {
        return {
          confidence: 60,
          reasoning: triageLike.reasoning,
          changes: this.extractChangesFromText(triageLike.reasoning, context),
          evidence: triageLike.indicators || [],
          rootCause: 'Error pattern suggests test needs update'
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
  private extractChangesFromText(_text: string, context: RepairContext): AIChange[] {
    const changes = [];

    // If we have a selector error, suggest updating the selector
    if (context.errorSelector && context.errorType === 'ELEMENT_NOT_FOUND') {
      changes.push({
        file: context.testFile,
        line: context.errorLine || 0,
        oldCode: context.errorSelector,
        newCode: '// TODO: Update selector to match current application',
        justification: 'Selector not found - needs to be updated to match current DOM'
      });
    }

    // For timeout errors, suggest adding wait or retry
    if (context.errorType === 'TIMEOUT') {
      changes.push({
        file: context.testFile,
        line: context.errorLine || 0,
        oldCode: '// Timeout occurred here',
        newCode: 'cy.wait(1000); // Consider adding explicit wait or retry logic',
        justification: 'Adding wait time to handle slow-loading elements'
      });
    }

    return changes;
  }

  /**
   * Generates a human-readable summary of the fix
   */
  private generateSummary(recommendation: AIRecommendation, context: RepairContext): string {
    // Use consolidated summary generator (no code blocks for Slack compatibility)
    return generateFixSummary(recommendation, context, false);
  }
}
