import OpenAI from 'openai';
import * as core from '@actions/core';
import { OpenAIResponse, FewShotExample, ErrorData, PRDiff } from './types';
import { LOG_LIMITS, OPENAI, ARTIFACTS } from './config/constants';

export class OpenAIClient {
  private openai: OpenAI;
  private maxRetries: number = OPENAI.MAX_RETRIES;
  private retryDelay: number = OPENAI.RETRY_DELAY_MS;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async analyze(errorData: ErrorData, examples: FewShotExample[]): Promise<OpenAIResponse> {
    const model = OPENAI.MODEL;
    core.info(`🧠 Using ${model} model for analysis (Responses API)`);
    
    const systemPrompt = this.getSystemPrompt();
    const userContent = this.buildUserContent(errorData, examples);
    
    // Debug: Log the actual prompt content
    if (typeof userContent === 'string') {
      if (userContent.includes('QUICK ANALYSIS SUMMARY')) {
        core.info('📊 Structured summary header included in prompt!');
        const summaryStart = userContent.indexOf('QUICK ANALYSIS SUMMARY');
        const summarySection = userContent.substring(summaryStart, summaryStart + 500);
        core.info(`Summary preview:\n${summarySection}...`);
      } else {
        core.info('⚠️  Structured summary header NOT found in prompt');
      }
    } else {
      // Multimodal content - check first text part
      const firstTextPart = userContent.find(p => p.type === 'text');
      if (firstTextPart && 'text' in firstTextPart) {
        if (firstTextPart.text.includes('QUICK ANALYSIS SUMMARY')) {
          core.info('📊 Structured summary header included in prompt!');
          const summaryStart = firstTextPart.text.indexOf('QUICK ANALYSIS SUMMARY');
          const summarySection = firstTextPart.text.substring(summaryStart, summaryStart + 500);
          core.info(`Summary preview:\n${summarySection}...`);
        } else {
          core.info('⚠️  Structured summary header NOT found in prompt');
        }
      }
    }
    
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
    
    // Debug: Check if structured summary exists in errorData
    if (errorData.structuredSummary) {
      core.info('📊 ErrorData contains structured summary!');
      core.info(`  - Error Type: ${errorData.structuredSummary.primaryError.type}`);
      core.info(`  - Test File: ${errorData.structuredSummary.testContext.testFile}`);
    } else {
      core.info('⚠️  ErrorData does NOT contain structured summary');
    }
    
    const input = this.convertToResponsesInput(userContent);
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        core.info(`Analyzing with ${model} (attempt ${attempt}/${this.maxRetries})`);
        
        const response = await this.openai.responses.create({
          model,
          instructions: systemPrompt,
          input,
          max_output_tokens: OPENAI.MAX_COMPLETION_TOKENS,
          text: { format: { type: 'json_object' as const } },
        });

        const content = response.output_text;
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

  /**
   * Convert Chat Completions content format to Responses API input format.
   * This allows agents to continue using Chat Completions types while
   * the client uses the Responses API internally.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertToResponsesInput(
    userContent: string | Array<OpenAI.Chat.Completions.ChatCompletionContentPartText | OpenAI.Chat.Completions.ChatCompletionContentPartImage>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any[] {
    if (typeof userContent === 'string') {
      return [{ role: 'user' as const, content: userContent }];
    }
    
    // Convert Chat Completions content parts to Responses API format
    const convertedParts = userContent.map((part) => {
      if (part.type === 'text') {
        return { type: 'input_text' as const, text: part.text };
      }
      if (part.type === 'image_url') {
        const imageUrl = part.image_url;
        return {
          type: 'input_image' as const,
          image_url: typeof imageUrl === 'string' ? imageUrl : imageUrl.url,
          detail: (typeof imageUrl === 'string' ? 'auto' : (imageUrl.detail || 'auto')) as 'auto' | 'low' | 'high',
        };
      }
      return part;
    });
    
    return [{ role: 'user' as const, content: convertedParts }];
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
    const basePrompt = `You are an expert at analyzing test failures and determining whether they are caused by issues in the test code itself (TEST_ISSUE), actual bugs in the product code (PRODUCT_ISSUE), or external execution/provider failures where the evidence is insufficient to blame either side (INCONCLUSIVE).

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
- Elements covered by overlays, tabs, modals, or other UI components
- Elements that exist but are not visible or accessible
- Viewport-specific rendering differences (mobile vs desktop)
- Long timeouts (>10s) that still fail, suggesting element state issues rather than missing functionality
- Tests checking visibility when elements may be legitimately obscured or conditionally rendered

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
- Login page or authentication flow completely failing to render (not just a slow load — the page content is wrong or missing)
- API endpoint misconfiguration causing all network requests to fail
- Environment/deployment issues where the app is deployed but non-functional (wrong API URL, missing env vars, broken build)

INCONCLUSIVE indicators:
- Sauce Labs / Selenium / WebDriver session termination
- Errors like "session is finished", "session has already finished", or "Requested session id ... is not known"
- Remote browser/provider idle timeouts, disconnections, or infrastructure collapse
- The runner loses the browser session before the app or test failure is proven
- Browser renderer crashes (e.g. "Chromium Renderer process just crashed")
- Cypress losing connection to the browser or the runner being force-killed
- Test runner process exiting unexpectedly before the test completed
- Logs show conflicting or incomplete evidence and the safest verdict is to avoid blame

When analyzing screenshots (if provided):
- PRIORITIZE looking for any error messages, alerts, or error dialogs visible in the UI
- Check for error states like "404 Not Found", "500 Internal Server Error", console errors displayed on screen
- Look for missing or broken UI elements that indicate application failures
- Identify loading spinners stuck, blank screens, or partially rendered pages
- Examine if expected UI elements are present but tests are using wrong selectors (TEST_ISSUE)
- Notice any validation errors, form submission failures, or API error responses shown in the UI
- Check if the application failed to load or render properly (PRODUCT_ISSUE)
- Look for visual bugs, layout issues, or incorrect rendering
- CRITICAL: If the screenshot shows a login page WITHOUT a password field, username field, or login form, the app failed to render — this is a PRODUCT_ISSUE, not a selector problem
- If the screenshot shows an error page, blank page, or unexpected page instead of the expected page, this is a PRODUCT_ISSUE

Screenshots often contain crucial error information that logs might miss. If an error is visible in a screenshot, it should be a key factor in your analysis.

COMMON MISCLASSIFICATION PATTERNS TO AVOID:
- Don't classify as TEST_ISSUE just because error happens in test file - check if it's exposing a real product bug
- Don't classify as PRODUCT_ISSUE just because of a timeout - many timeouts are test synchronization issues
- GraphQL/API errors during tests often indicate real product issues, not test problems
- "Element not found" can be either - check if UI actually rendered correctly in screenshots

CRITICAL — SHARED PRECONDITION FAILURES:
When tests fail during login, authentication, or other shared setup steps (e.g., "Expected to find element: #password" in a shared commands.js or login helper):
- This is almost NEVER a TEST_ISSUE. The login helper works for every other PR — it's a shared, stable dependency.
- If the login page fails to render its form fields, the APPLICATION is broken, not the test.
- Common root causes: wrong API endpoint configured, broken deployment, missing environment variables, authentication service down.
- If screenshots show a blank page, error page, or page without the login form, this is a PRODUCT_ISSUE.
- If the PR diff contains environment config changes, API URL changes, or build configuration changes, this strongly suggests PRODUCT_ISSUE.
- Only classify login failures as TEST_ISSUE if there is specific evidence that the login test code itself was recently changed and broken.
- When elements with alt text or aria-labels are "not found" but the screenshot shows the UI rendered correctly, the element is likely covered/obscured by overlays, tabs, or modals (TEST_ISSUE)
- Long timeouts (>10s) that still fail often indicate the element exists but isn't in the expected state (covered, not visible, or conditionally rendered) rather than actual missing functionality
- If placeholder content is visible instead of expected content, but no errors are shown, this may be normal application state rather than a bug
- Do not force provider/browser session termination or browser crashes into TEST_ISSUE or PRODUCT_ISSUE when the logs only prove the execution infrastructure failed; use INCONCLUSIVE instead
- Browser renderer crashes ("Chromium Renderer process just crashed"), Cypress runner force-kills, and unexpected test runner exits are infrastructure failures, not test or product defects

When PR changes are provided:
- Analyze if the test failure is related to the changed code
- If a test is failing and it tests functionality that was modified in the PR, lean towards PRODUCT_ISSUE
- If a test is failing in an area unrelated to the PR changes, it's more likely a TEST_ISSUE or ENVIRONMENT_ISSUE
- Look for correlations between changed files and the failing test file/functionality
- Consider if the PR introduced breaking changes that the test correctly caught

CAUSAL CONSISTENCY RULE (CRITICAL):
Your root cause explanation MUST be consistent with the PR diff evidence. Before finalizing your analysis:
1. State your hypothesis about what caused the failure
2. Check: does the diff actually show changes to the code/files your hypothesis requires?
3. If NOT — if your theory requires a change that does NOT appear in the diff — your theory is WRONG. Revise it.
4. If the failure is in code untouched by the PR (e.g., login flow, auth, shared infrastructure), the most likely causes are:
   - Pre-existing flaky test or environment drift (TEST_ISSUE)
   - Environment/infrastructure change outside this PR (TEST_ISSUE or INCONCLUSIVE)
   - Indirect side effect of PR changes (explain the causal chain specifically)
5. NEVER claim "the UI was changed" or "the code was modified" when the diff shows no such change
6. When the diff is unrelated to the failure area, say so explicitly in your reasoning

When determining a PRODUCT_ISSUE and PR changes are available:
- CRITICALLY IMPORTANT: Identify specific files and line numbers from the PR diff that likely contain the bug
- Correlate error stack traces with changed code locations
- Match error messages and symptoms to specific code changes in the diff
- Suggest which modified functions, methods, or components should be investigated
- Look for patterns like:
  * New null checks missing → NullPointerException
  * Changed API calls → Network errors
  * Modified component logic → Rendering issues
  * Updated validation → Form submission failures
- Include these source code locations in your reasoning with specific file paths and line numbers

CONFIDENCE LEVELS:
- HIGH (90-100%): Clear error patterns, obvious indicators, or explicit messages
- MEDIUM (60-89%): Multiple indicators pointing same direction but some ambiguity
- LOW (0-59%): Conflicting indicators or insufficient information

Always respond with a JSON object containing:
- verdict: "TEST_ISSUE", "PRODUCT_ISSUE", or "INCONCLUSIVE"
- reasoning: detailed explanation of your decision including what you observed in the screenshots (if any) and how PR changes influenced your decision (if applicable)
- indicators: array of specific indicators that led to your verdict
- suggestedSourceLocations: (ONLY for PRODUCT_ISSUE) array of objects with {file: "path/to/file", lines: "line range", reason: "why this location is suspicious"}. Return an empty array or omit this field for TEST_ISSUE and INCONCLUSIVE.`;
    
    return basePrompt;
  }

  private buildPrompt(errorData: ErrorData, examples: FewShotExample[]): string {
    // Build summary header if structured summary is available
    let summaryHeader = '';
    if (errorData.structuredSummary) {
      const summary = errorData.structuredSummary;
      summaryHeader = `## QUICK ANALYSIS SUMMARY

`;
      summaryHeader += `**Error Type:** ${summary.primaryError.type}\n`;
      summaryHeader += `**Error Message:** ${summary.primaryError.message}\n`;
      
      if (summary.primaryError.location) {
        const loc = summary.primaryError.location;
        summaryHeader += `**Error Location:** ${loc.file}:${loc.line} (${loc.isTestCode ? 'Test Code' : loc.isAppCode ? 'App Code' : 'Other'})\n`;
      }
      
      summaryHeader += `\n**Test Context:**\n`;
      summaryHeader += `- Test: ${summary.testContext.testName}\n`;
      summaryHeader += `- File: ${summary.testContext.testFile}\n`;
      summaryHeader += `- Framework: ${summary.testContext.framework}\n`;
      if (summary.testContext.browser) {
        summaryHeader += `- Browser: ${summary.testContext.browser}\n`;
      }
      if (summary.testContext.duration) {
        summaryHeader += `- Duration: ${summary.testContext.duration}\n`;
      }
      
      summaryHeader += `\n**Failure Indicators:**\n`;
      const indicators = [];
      if (summary.failureIndicators.hasVisibilityIssue) {
        indicators.push('Visibility/Overlay Issue');
      }
      if (summary.failureIndicators.hasLongTimeout) {
        indicators.push('Long Timeout (>10s)');
      }
      if (summary.failureIndicators.hasAltTextSelector) {
        indicators.push('Alt Text Selector Used');
      }
      if (summary.failureIndicators.hasElementExistenceCheck) {
        indicators.push('Element Existence Check');
      }
      if (summary.failureIndicators.hasViewportContext) {
        indicators.push('Viewport/Responsive Context');
      }
      if (summary.failureIndicators.hasNetworkErrors) indicators.push('Network Errors');
      if (summary.failureIndicators.hasNullPointerErrors) indicators.push('Null Pointer Errors');
      if (summary.failureIndicators.hasTimeoutErrors) indicators.push('Timeout Errors');
      if (summary.failureIndicators.hasDOMErrors) indicators.push('DOM Errors');
      if (summary.failureIndicators.hasAssertionErrors) indicators.push('Assertion Errors');
      summaryHeader += `- Detected: ${indicators.length > 0 ? indicators.join(', ') : 'None'}\n`;
      
      if (summary.prRelevance) {
        summaryHeader += `\n**PR Impact Analysis:**\n`;
        summaryHeader += `- Test File Modified: ${summary.prRelevance.testFileModified ? 'YES' : 'NO'}\n`;
        summaryHeader += `- Related Source Files Modified: ${summary.prRelevance.relatedSourceFilesModified.length > 0 ? summary.prRelevance.relatedSourceFilesModified.join(', ') : 'None'}\n`;
        summaryHeader += `- Risk Score: ${summary.prRelevance.riskScore.toUpperCase()}\n`;
      }
      
      summaryHeader += `\n**Key Metrics:**\n`;
      summaryHeader += `- Screenshots Available: ${summary.keyMetrics.hasScreenshots ? 'YES' : 'NO'}\n`;
      if (summary.keyMetrics.lastCommand) {
        summaryHeader += `- Last Cypress Command: ${summary.keyMetrics.lastCommand}\n`;
      }
      summaryHeader += `- Log Size: ${summary.keyMetrics.logSize} characters\n`;
      
      summaryHeader += `\n---\n\n`;
    }
    
    const prompt = `${summaryHeader}You are an expert test failure analyzer. Your task is to determine whether a test failure is a TEST_ISSUE (problem with the test code), a PRODUCT_ISSUE (bug in the product being tested), or INCONCLUSIVE (the evidence points to external execution/provider failure or is insufficient to blame either side).

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
- INCONCLUSIVE: Remote browser/session termination, browser renderer crashes, provider instability, runner force-kills, or ambiguous evidence where auto-fix would be unsafe

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
${this.capLogsForPrompt(errorData.logs)}

${errorData.screenshots?.length ? `\nScreenshots Available: ${errorData.screenshots.length} screenshot(s) captured` : ''}

Based on ALL the information provided (especially the PR changes if available), determine if this is a TEST_ISSUE, PRODUCT_ISSUE, or INCONCLUSIVE and explain your reasoning. Look carefully through the logs to find the actual error message and stack trace.

Respond with your analysis as a JSON object.`;

    return prompt;
  }

  private capLogsForPrompt(logs: string[] | undefined): string {
    if (!logs || logs.length === 0) return 'No logs available';
    const joined = logs.join('\n\n');
    const max = LOG_LIMITS.PROMPT_MAX_LOG_SIZE;
    if (joined.length <= max) return joined;

    core.warning(
      `Log payload (${joined.length} chars) exceeds PROMPT_MAX_LOG_SIZE (${max}). Truncating to tail.`
    );
    return (
      joined.substring(joined.length - max) +
      `\n\n[Logs truncated to last ${max} characters of ${joined.length} total]`
    );
  }

  private formatPRDiffSection(prDiff: PRDiff): string {
    let section = `\nPR Changes Analysis:
- Total files changed: ${prDiff.totalChanges}
- Lines added: ${prDiff.additions}
- Lines deleted: ${prDiff.deletions}

Changed Files Summary:
`;

    const maxFiles = ARTIFACTS.MAX_PR_DIFF_FILES;
    const maxPatchLines = ARTIFACTS.MAX_PATCH_LINES;
    
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
4. If test is failing in code areas NOT touched by the PR, it's more likely a TEST_ISSUE
5. NEVER hypothesize that code was "changed" or "updated" if the diff above does not show that change — the diff is the source of truth for what changed

CAUSAL CONSISTENCY CHECK:
- Review the list of changed files above. If the failure involves code/selectors/UI that is NOT in any changed file, do NOT claim the PR changed it.
- Example of WRONG reasoning: "The login UI was changed to passwordless" when no auth/login files appear in the diff.
- Example of CORRECT reasoning: "The login flow is failing but no auth code was changed in this PR, suggesting a pre-existing environment issue or flaky test."

FOR PRODUCT_ISSUES: You MUST analyze the diff patches above to:
- Identify the EXACT file paths and line numbers that likely contain the bug
- Match error symptoms to specific code changes
- Provide actionable source locations developers can investigate
- Example: "The null pointer error likely comes from the removed null check at src/components/UserForm.tsx lines 45-47"`;

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
      
      const verdictMatch = content.match(/verdict[:\s]*["']?(TEST_ISSUE|PRODUCT_ISSUE|INCONCLUSIVE)["']?/i);
      const reasoningMatch = content.match(/reasoning[:\s]*["']?([^"'\n]+)["']?/i);
      const indicatorsMatch = content.match(/indicators[:\s]*(?:\[([^\]]+)\]|([^\n]+))/i);
      
      if (verdictMatch && reasoningMatch) {
        const verdict = verdictMatch[1] as 'TEST_ISSUE' | 'PRODUCT_ISSUE' | 'INCONCLUSIVE';
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
      const altMatch = content.match(/(?:verdict|conclusion):\s*(TEST_ISSUE|PRODUCT_ISSUE|INCONCLUSIVE)[\s\S]*?(?:reasoning|explanation):\s*([^\n]+)[\s\S]*?(?:indicators|factors):\s*([^\n]+)/i);
      if (altMatch) {
        return {
          verdict: altMatch[1] as 'TEST_ISSUE' | 'PRODUCT_ISSUE' | 'INCONCLUSIVE',
          reasoning: altMatch[2].trim(),
          indicators: altMatch[3].split(/[,;]/).map(i => i.trim()).filter(i => i.length > 0)
        };
      }
      
      throw new Error('Could not parse response in any expected format');
    }
  }

  private validateResponse(response: unknown): void {
    const resp = response as Record<string, unknown>;
    if (!resp.verdict || !['TEST_ISSUE', 'PRODUCT_ISSUE', 'INCONCLUSIVE'].includes(resp.verdict as string)) {
      throw new Error('Invalid verdict in response');
    }
    
    if (!resp.reasoning || typeof resp.reasoning !== 'string') {
      throw new Error('Missing or invalid reasoning in response');
    }
    
    if (!resp.indicators || !Array.isArray(resp.indicators)) {
      resp.indicators = [];
    }
  }

  /**
   * Ensures the user content contains the word "json" — required by the
   * Responses API when using text.format = json_object. The instructions
   * field is NOT checked by the API, only input messages.
   */
  private ensureJsonMention(
    content: string | Array<OpenAI.Chat.Completions.ChatCompletionContentPartText | OpenAI.Chat.Completions.ChatCompletionContentPartImage>
  ): string | Array<OpenAI.Chat.Completions.ChatCompletionContentPartText | OpenAI.Chat.Completions.ChatCompletionContentPartImage> {
    const hasJson = (text: string) => /json/i.test(text);

    if (typeof content === 'string') {
      return hasJson(content) ? content : content + '\n\nRespond with a JSON object.';
    }

    const alreadyMentions = content.some(
      (part) => part.type === 'text' && hasJson(part.text)
    );
    if (alreadyMentions) return content;

    return [...content, { type: 'text' as const, text: 'Respond with a JSON object.' }];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generic entry point that allows callers to supply their own
   * system prompt and user content (text or multimodal parts). This is used
   * by the repair agent to request a structured JSON repair plan, without
   * going through the triage-specific prompt path.
   *
   * Uses the Responses API with the model configured in OPENAI.MODEL.
   * Note: temperature parameter is accepted for backward compatibility but
   * is not supported by Codex models and will be ignored.
   */
  async generateWithCustomPrompt(params: {
    systemPrompt: string;
    userContent: string | Array<OpenAI.Chat.Completions.ChatCompletionContentPartText | OpenAI.Chat.Completions.ChatCompletionContentPartImage>;
    responseAsJson?: boolean;
    temperature?: number;
  }): Promise<string> {
    const model = OPENAI.MODEL;
    const userContent = params.responseAsJson
      ? this.ensureJsonMention(params.userContent)
      : params.userContent;
    const input = this.convertToResponsesInput(userContent);

    const response = await this.openai.responses.create({
      model,
      instructions: params.systemPrompt,
      input,
      max_output_tokens: OPENAI.MAX_COMPLETION_TOKENS,
      text: params.responseAsJson ? { format: { type: 'json_object' as const } } : undefined,
    });

    const content = response.output_text;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }
    return content;
  }
} 