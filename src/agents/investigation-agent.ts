/**
 * Investigation Agent
 * Cross-references analysis results with code context to identify specific issues
 */

import {
  BaseAgent,
  AgentContext,
  AgentResult,
  AgentConfig,
  getFrameworkLabel,
} from './base-agent';
import { OpenAIClient } from '../openai-client';
import { AnalysisOutput } from './analysis-agent';
import { CodeReadingOutput } from './code-reading-agent';

/**
 * A specific finding from the investigation
 */
export interface InvestigationFinding {
  /** Type of finding */
  type:
    | 'SELECTOR_CHANGE'
    | 'MISSING_ELEMENT'
    | 'TIMING_GAP'
    | 'STATE_ISSUE'
    | 'CODE_CHANGE'
    | 'OTHER';
  /** Severity of the finding */
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Description of what was found */
  description: string;
  /** Evidence supporting this finding */
  evidence: string[];
  /** Specific location in code */
  location?: {
    file: string;
    line?: number;
    code?: string;
  };
  /** How this relates to the error */
  relationToError: string;
}

/**
 * Output from the Investigation Agent
 */
export interface InvestigationOutput {
  /** All findings from the investigation */
  findings: InvestigationFinding[];
  /** The most likely cause (primary finding) */
  primaryFinding?: InvestigationFinding;
  /** Whether the issue is fixable in test code */
  isTestCodeFixable: boolean;
  /** Recommended approach for fixing */
  recommendedApproach: string;
  /** Specific selectors that need updating */
  selectorsToUpdate: Array<{
    current: string;
    reason: string;
    suggestedReplacement?: string;
  }>;
  /** Confidence in the investigation */
  confidence: number;
}

/**
 * Input for the Investigation Agent
 */
export interface InvestigationInput {
  /** Analysis from the Analysis Agent */
  analysis: AnalysisOutput;
  /** Code context from the Code Reading Agent */
  codeContext?: CodeReadingOutput;
}

/**
 * Investigation Agent Implementation
 */
export class InvestigationAgent extends BaseAgent<
  InvestigationInput,
  InvestigationOutput
> {
  constructor(openaiClient: OpenAIClient, config?: Partial<AgentConfig>) {
    super(openaiClient, 'InvestigationAgent', config);
  }

  /**
   * Execute the investigation
   */
  async execute(
    input: InvestigationInput,
    context: AgentContext
  ): Promise<AgentResult<InvestigationOutput>> {
    return this.executeWithTimeout(input, context);
  }

  /**
   * Get the system prompt
   */
  protected getSystemPrompt(): string {
    return `You are an expert investigator for test failures. Your job is to cross-reference error analysis with actual code to identify the specific cause of failures.

## Investigation Process

1. **Compare Selectors**: Check if selectors in the test exist in the codebase
2. **Trace Changes**: Look for recent changes that might have caused the issue
3. **Check Timing**: Identify potential timing issues between test expectations and app behavior
4. **Validate State**: Verify if test assumptions about state are correct
5. **Cross-Reference**: Match error patterns with code patterns

## Finding Types

- SELECTOR_CHANGE: A selector in the test no longer matches elements in the app
- MISSING_ELEMENT: An element the test expects doesn't exist
- TIMING_GAP: Test is too fast/slow for the app's behavior
- STATE_ISSUE: Test depends on state that isn't set up correctly
- CODE_CHANGE: Recent code changes broke the test
- OTHER: Something else

## Output Format

You MUST respond with a JSON object matching this schema:
{
  "findings": [
    {
      "type": "<finding type>",
      "severity": "<HIGH|MEDIUM|LOW>",
      "description": "<what was found>",
      "evidence": ["<supporting evidence>"],
      "location": {
        "file": "<file path>",
        "line": <line number>,
        "code": "<relevant code snippet>"
      },
      "relationToError": "<how this finding explains the error>"
    }
  ],
  "primaryFinding": <the most important finding object>,
  "isTestCodeFixable": <boolean - can this be fixed by changing test code?>,
  "recommendedApproach": "<one paragraph describing the fix approach>",
  "selectorsToUpdate": [
    {
      "current": "<current selector>",
      "reason": "<why it needs updating>",
      "suggestedReplacement": "<suggested new selector if known>"
    }
  ],
  "confidence": <0-100>
}`;
  }

  /**
   * Build the user prompt
   */
  protected buildUserPrompt(
    input: InvestigationInput,
    context: AgentContext
  ): string {
    const frameworkLabel = getFrameworkLabel(context.framework);
    const parts: string[] = [
      '## Investigation Request',
      '',
      `**Test framework:** ${frameworkLabel}`,
      '',
      '### Error Analysis Results',
      `- **Root Cause Category:** ${input.analysis.rootCauseCategory}`,
      `- **Analysis Confidence:** ${input.analysis.confidence}%`,
      `- **Issue Location:** ${input.analysis.issueLocation}`,
      `- **Explanation:** ${input.analysis.explanation}`,
      '',
      '### Identified Selectors',
      input.analysis.selectors.length > 0
        ? input.analysis.selectors.map((s) => `- \`${s}\``).join('\n')
        : '- No selectors identified',
      '',
      '### Detected Patterns',
      `- Timeout: ${input.analysis.patterns.hasTimeout}`,
      `- Visibility Issue: ${input.analysis.patterns.hasVisibilityIssue}`,
      `- Network Call: ${input.analysis.patterns.hasNetworkCall}`,
      `- State Assertion: ${input.analysis.patterns.hasStateAssertion}`,
      `- Dynamic Content: ${input.analysis.patterns.hasDynamicContent}`,
      `- Responsive Issue: ${input.analysis.patterns.hasResponsiveIssue}`,
    ];

    // Add code context if available
    if (input.codeContext) {
      parts.push(
        '',
        '### Test File Content',
        '```javascript',
        input.codeContext.testFileContent.slice(0, 4000),
        '```'
      );

      if (input.codeContext.relatedFiles.length > 0) {
        parts.push('', '### Related Files');
        for (const file of input.codeContext.relatedFiles.slice(0, 3)) {
          parts.push(
            '',
            `#### ${file.path}`,
            `Relevance: ${file.relevance}`,
            '```',
            file.content.slice(0, 1500),
            '```'
          );
        }
      }

      if (input.codeContext.customCommands.length > 0) {
        const cmdPrefix = context.framework === 'webdriverio' ? 'browser' : 'cy';
        parts.push(
          '',
          '### Custom Commands',
          input.codeContext.customCommands
            .map((c) => `- \`${cmdPrefix}.${c.name}()\` in ${c.file}`)
            .join('\n')
        );
      }
    }

    // Add PR diff info
    if (context.prDiff && context.prDiff.files.length > 0) {
      parts.push('', '### Recent Changes (PR Diff)');
      for (const file of context.prDiff.files.slice(0, 5)) {
        parts.push(`- **${file.filename}** (${file.status})`);
        if (file.patch) {
          parts.push('```diff', file.patch.slice(0, 1000), '```');
        }
      }
    }

    // Add screenshots context
    if (context.screenshots && context.screenshots.length > 0) {
      parts.push(
        '',
        '### Screenshots',
        `${context.screenshots.length} screenshot(s) are attached. Analyze them to see:`,
        '- What elements are visible',
        '- What the actual DOM state looks like',
        '- Any visual clues about the failure'
      );
    }

    parts.push(
      '',
      '## Instructions',
      'Based on all the information above:',
      '1. Identify all findings that explain or contribute to the failure',
      '2. Determine the primary cause',
      '3. Check if the issue can be fixed in test code',
      '4. List any selectors that need to be updated',
      '5. Provide a recommended fix approach',
      '',
      'Respond with the JSON object as specified in the system prompt.'
    );

    return parts.join('\n');
  }

  /**
   * Parse the response
   */
  protected parseResponse(response: string): InvestigationOutput | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.log('No JSON found in response', 'warning');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and normalize findings
      const findings: InvestigationFinding[] = Array.isArray(parsed.findings)
        ? parsed.findings.map((f: InvestigationFinding) => ({
            type: f.type || 'OTHER',
            severity: f.severity || 'MEDIUM',
            description: f.description || '',
            evidence: Array.isArray(f.evidence) ? f.evidence : [],
            location: f.location,
            relationToError: f.relationToError || '',
          }))
        : [];

      // Normalize selectors to update
      const selectorsToUpdate = Array.isArray(parsed.selectorsToUpdate)
        ? parsed.selectorsToUpdate.map(
            (s: {
              current: string;
              reason: string;
              suggestedReplacement?: string;
            }) => ({
              current: s.current || '',
              reason: s.reason || '',
              suggestedReplacement: s.suggestedReplacement,
            })
          )
        : [];

      return {
        findings,
        primaryFinding: parsed.primaryFinding || findings[0],
        isTestCodeFixable: parsed.isTestCodeFixable !== false,
        recommendedApproach: parsed.recommendedApproach || '',
        selectorsToUpdate,
        confidence:
          typeof parsed.confidence === 'number' ? parsed.confidence : 50,
      };
    } catch (error) {
      this.log(`Failed to parse response: ${error}`, 'warning');
      return null;
    }
  }
}
