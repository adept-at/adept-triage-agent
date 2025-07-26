import OpenAI from 'openai';
import * as core from '@actions/core';
import { OpenAIResponse, FewShotExample, ErrorData, PRDiff } from './types';

export class OpenAIClient {
  private openai: OpenAI;
  private maxRetries: number = 3;
  private retryDelay: number = 1000;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async analyze(errorData: ErrorData, examples: FewShotExample[]): Promise<OpenAIResponse> {
    // Always use GPT-4.1 model
    const model = 'gpt-4.1';
    core.info('🧠 Using GPT-4.1 model for analysis');
    
    const messages = this.buildMessages(errorData, examples);
    
    // Log what we're sending
    if (errorData.screenshots && errorData.screenshots.length > 0) {
      core.info(`📸 Sending multimodal content to ${model}:`);
      core.info(`  - Text context: ${errorData.logs?.[0]?.length || 0} characters`);
      core.info(`  - Screenshots: ${errorData.screenshots.length} image(s)`);
      errorData.screenshots.forEach((screenshot, idx) => {
        core.info(`    ${idx + 1}. ${screenshot.name} (${screenshot.base64Data ? 'with data' : 'no data'})`);
      });
    } else {
      core.info(`📝 Sending text-only content to ${model}`);
    }
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        core.info(`Analyzing with ${model} (attempt ${attempt}/${this.maxRetries})`);
        
        const requestParams = {
          model,
          messages,
          temperature: 0.3,
          max_tokens: 32768,  // GPT-4.1 supports up to 32,768 output tokens
          response_format: { type: 'json_object' as const }
        };
        
        const response = await this.openai.chat.completions.create(requestParams);

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('Empty response from OpenAI');
        }

        // Parse response - handle both JSON and text responses
        const result = this.parseResponse(content);
        this.validateResponse(result);
        return result;

      } catch (error) {
        core.warning(`OpenAI API attempt ${attempt} failed: ${error}`);
        
        if (attempt === this.maxRetries) {
          throw new Error(`Failed to get analysis from OpenAI after ${this.maxRetries} attempts: ${error}`);
        }
        
        await this.delay(this.retryDelay * attempt);
      }
    }

    throw new Error('Failed to get analysis from OpenAI after all retries');
  }

  private buildMessages(errorData: ErrorData, examples: FewShotExample[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: this.getSystemPrompt()
      }
    ];

    // Build user message content
    const userContent = this.buildUserContent(errorData, examples);
    
    // Add user message based on whether we have screenshots
    if (errorData.screenshots && errorData.screenshots.length > 0) {
      messages.push({
        role: 'user',
        content: userContent
      });
    } else {
      messages.push({
        role: 'user',
        content: userContent
      });
    }

    return messages;
  }

  private buildUserContent(errorData: ErrorData, examples: FewShotExample[]): string | Array<OpenAI.Chat.Completions.ChatCompletionContentPartText | OpenAI.Chat.Completions.ChatCompletionContentPartImage> {
    // If we have screenshots, build multimodal content
    if (errorData.screenshots && errorData.screenshots.length > 0) {
      const content: Array<OpenAI.Chat.Completions.ChatCompletionContentPartText | OpenAI.Chat.Completions.ChatCompletionContentPartImage> = [];
      
      // Add text content
      content.push({
        type: 'text',
        text: this.buildPrompt(errorData, examples)
      });

      // Add screenshot analysis prompt
      content.push({
        type: 'text',
        text: `\n📸 IMPORTANT: ${errorData.screenshots.length} screenshot(s) attached. Please carefully analyze each screenshot for:
- Any visible error messages, alerts, or error dialogs
- Application state at the time of failure
- Missing or broken UI elements
- Any visual indicators of what went wrong\n`
      });

      // Add screenshots
      for (const screenshot of errorData.screenshots) {
        if (screenshot.base64Data) {
          content.push({
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${screenshot.base64Data}`,
              detail: 'high'
            }
          } as OpenAI.Chat.Completions.ChatCompletionContentPartImage);
          
          // Add screenshot context
          content.push({
            type: 'text',
            text: `Screenshot: ${screenshot.name}${screenshot.timestamp ? ` (taken at ${screenshot.timestamp})` : ''}`
          });
        }
      }

      return content;
    }
    
    // Otherwise, return simple text prompt
    return this.buildPrompt(errorData, examples);
  }

  private getSystemPrompt(): string {
    const basePrompt = `You are an expert at analyzing test failures and determining whether they are caused by issues in the test code itself (TEST_ISSUE) or actual bugs in the product code (PRODUCT_ISSUE).

Your task is to analyze the complete test execution context including:
- Full error messages and failure details
- Stack traces showing where the error occurred
- Test execution logs showing what happened before the failure
- Console errors or warnings during test execution
- Screenshots showing the state when the test failed (if provided)
- Test environment and browser information

Use all available context to make an informed determination.

TEST_ISSUE indicators:
- Timing issues (timeouts, race conditions)
- Test environment setup problems
- Mock/stub configuration errors
- Test data issues
- Flaky test behavior
- Incorrect assertions
- Test framework errors
- Element not found due to incorrect selectors
- Test synchronization issues

PRODUCT_ISSUE indicators:
- Application errors (500, 404, etc.)
- Database/service connection failures
- Missing implementations
- Business logic errors
- Validation failures in product code
- Null reference exceptions in product code
- API contract violations
- UI components not rendering correctly
- Missing or broken functionality

When analyzing screenshots (if provided):
- PRIORITIZE looking for any error messages, alerts, or error dialogs visible in the UI
- Check for error states like "404 Not Found", "500 Internal Server Error", console errors displayed on screen
- Look for missing or broken UI elements that indicate application failures
- Identify loading spinners stuck, blank screens, or partially rendered pages
- Examine if expected UI elements are present but tests are using wrong selectors (TEST_ISSUE)
- Notice any validation errors, form submission failures, or API error responses shown in the UI
- Check if the application failed to load or render properly (PRODUCT_ISSUE)
- Look for visual bugs, layout issues, or incorrect rendering

Screenshots often contain crucial error information that logs might miss. If an error is visible in a screenshot, it should be a key factor in your analysis.

When PR changes are provided:
- Analyze if the test failure is related to the changed code
- If a test is failing and it tests functionality that was modified in the PR, lean towards PRODUCT_ISSUE
- If a test is failing in an area unrelated to the PR changes, it's more likely a TEST_ISSUE
- Look for correlations between changed files and the failing test file/functionality
- Consider if the PR introduced breaking changes that the test correctly caught

Always respond with a JSON object containing:
- verdict: "TEST_ISSUE" or "PRODUCT_ISSUE"
- reasoning: detailed explanation of your decision including what you observed in the screenshots (if any) and how PR changes influenced your decision (if applicable)
- indicators: array of specific indicators that led to your verdict`;
    
    return basePrompt;
  }

  private buildPrompt(errorData: ErrorData, examples: FewShotExample[]): string {
    const prompt = `You are an expert test failure analyzer. Your task is to determine whether a test failure is a TEST_ISSUE (problem with the test code) or a PRODUCT_ISSUE (bug in the product being tested).

IMPORTANT: Carefully analyze the FULL LOGS provided to find the actual error. Look for patterns like:
- TypeError: Cannot read properties of null (reading 'isValid')
- ReferenceError: variable is not defined
- AssertionError: expected X but got Y
- Network errors, timeouts, connection issues
- GraphQL errors or API failures
- Any stack traces or error messages

The error message field may just say "see full context" - you MUST examine the logs section to find the real error.

Guidelines:
- TEST_ISSUE: Flaky tests, timing issues, incorrect selectors, mock/stub problems, test environment issues
- PRODUCT_ISSUE: Actual bugs, crashes, network failures, incorrect behavior, data issues

Examples to learn from:
${examples.map(ex => `
Error: ${ex.error}
Verdict: ${ex.verdict}
Reasoning: ${ex.reasoning}
`).join('\n')}

Now analyze this test failure:

Error Context:
- Framework: ${errorData.framework || 'unknown'}
- Test Name: ${errorData.testName || 'unknown'}
- File: ${errorData.fileName || 'unknown'}
${errorData.context ? `- Additional Context: ${errorData.context}` : ''}

${errorData.prDiff ? this.formatPRDiffSection(errorData.prDiff) : ''}

Full Logs and Context:
${errorData.logs ? errorData.logs.join('\n\n') : 'No logs available'}

${errorData.screenshots?.length ? `\nScreenshots Available: ${errorData.screenshots.length} screenshot(s) captured` : ''}

Based on ALL the information provided (especially the PR changes if available), determine if this is a TEST_ISSUE or PRODUCT_ISSUE and explain your reasoning. Look carefully through the logs to find the actual error message and stack trace.`;

    return prompt;
  }

  private formatPRDiffSection(prDiff: PRDiff): string {
    let section = `\nPR Changes Analysis:
- Total files changed: ${prDiff.totalChanges}
- Lines added: ${prDiff.additions}
- Lines deleted: ${prDiff.deletions}

Changed Files Summary:
`;

    // Prioritize files related to the test failure
    // Show up to 30 files but with limited patch context
    const maxFiles = 30;
    const maxPatchLines = 20; // Reduced from 30 to save tokens
    
    const relevantFiles = prDiff.files.slice(0, maxFiles);
    
    for (const file of relevantFiles) {
      section += `\n${file.filename} (+${file.additions}/-${file.deletions})`;
      
      if (file.patch && file.patch.length > 0) {
        // For large patches, focus on the most important parts
        const patchLines = file.patch.split('\n');
        
        if (patchLines.length <= maxPatchLines) {
          // Small patch, include everything
          section += '\n```diff\n' + file.patch + '\n```\n';
        } else {
          // Large patch, extract key sections
          const addedLines = patchLines.filter(line => line.startsWith('+') && !line.startsWith('+++'));
          const removedLines = patchLines.filter(line => line.startsWith('-') && !line.startsWith('---'));
          const contextLines = patchLines.filter(line => line.startsWith('@@'));
          
          // Build a condensed view
          let condensedPatch = [];
          
          // Include hunks
          if (contextLines.length > 0) {
            condensedPatch.push(contextLines[0]);
          }
          
          // Include some key changes
          const changedLinesToShow = Math.min(10, addedLines.length + removedLines.length);
          condensedPatch = condensedPatch.concat(
            removedLines.slice(0, Math.floor(changedLinesToShow / 2)),
            addedLines.slice(0, Math.ceil(changedLinesToShow / 2))
          );
          
          if (condensedPatch.length > 0) {
            section += '\n```diff\n' + condensedPatch.join('\n') + '\n... (patch truncated)\n```\n';
          }
        }
      }
    }

    if (prDiff.files.length > maxFiles) {
      section += `\n... and ${prDiff.files.length - maxFiles} more files`;
    }

    section += `\n\nCRITICAL: When analyzing test failures with PR changes:
1. Check if the failing test file or related files were modified in the PR
2. Look for changes that could break existing functionality
3. Consider if new code introduced bugs that tests are correctly catching
4. If test is failing in code areas NOT touched by the PR, it's more likely a TEST_ISSUE`;

    return section;
  }

  private parseResponse(content: string): OpenAIResponse {
    try {
      // First try to parse as JSON
      return JSON.parse(content) as OpenAIResponse;
    } catch (e) {
      // If JSON parsing fails, try to extract from structured text
      // Vision models might return formatted text instead of JSON
      core.info('Response is not JSON, attempting to parse structured text');
      
      const verdictMatch = content.match(/verdict[:\s]*["']?(TEST_ISSUE|PRODUCT_ISSUE)["']?/i);
      const reasoningMatch = content.match(/reasoning[:\s]*["']?([^"'\n]+)["']?/i);
      const indicatorsMatch = content.match(/indicators[:\s]*(?:\[([^\]]+)\]|([^\n]+))/i);
      
      if (verdictMatch && reasoningMatch) {
        const verdict = verdictMatch[1] as 'TEST_ISSUE' | 'PRODUCT_ISSUE';
        const reasoning = reasoningMatch[1].trim();
        let indicators: string[] = [];
        
        if (indicatorsMatch) {
          // Handle both formats: [item1, item2] and item1, item2
          const indicatorString = indicatorsMatch[1] || indicatorsMatch[2];
          indicators = indicatorString.split(',').map(i => i.trim().replace(/["'[\]]/g, ''));
        }
        
        return {
          verdict,
          reasoning,
          indicators
        };
      }
      
      // Try another format
      const altMatch = content.match(/(?:verdict|conclusion):\s*(TEST_ISSUE|PRODUCT_ISSUE)[\s\S]*?(?:reasoning|explanation):\s*([^\n]+)[\s\S]*?(?:indicators|factors):\s*([^\n]+)/i);
      if (altMatch) {
        return {
          verdict: altMatch[1] as 'TEST_ISSUE' | 'PRODUCT_ISSUE',
          reasoning: altMatch[2].trim(),
          indicators: altMatch[3].split(/[,;]/).map(i => i.trim()).filter(i => i.length > 0)
        };
      }
      
      throw new Error('Could not parse response in any expected format');
    }
  }

  private validateResponse(response: unknown): void {
    const resp = response as Record<string, unknown>;
    if (!resp.verdict || !['TEST_ISSUE', 'PRODUCT_ISSUE'].includes(resp.verdict as string)) {
      throw new Error('Invalid verdict in response');
    }
    
    if (!resp.reasoning || typeof resp.reasoning !== 'string') {
      throw new Error('Missing or invalid reasoning in response');
    }
    
    if (!resp.indicators || !Array.isArray(resp.indicators)) {
      resp.indicators = [];
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 