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
import { AGENT_MODEL, DEFAULT_PRODUCT_REPO, REASONING_EFFORT } from '../config/constants';
import { AnalysisOutput } from './analysis-agent';
import { CodeReadingOutput } from './code-reading-agent';
import { coerceEnum, coerceEnumOrNull } from '../utils/text-utils';
import { clampConfidence } from '../utils/number-utils';

/**
 * Whitelisted runtime values for InvestigationFinding's enum-like fields.
 * These match the TypeScript type declarations below; exposing them as
 * `as const` arrays lets `coerceEnum` validate parsed JSON against them
 * at the parse boundary so downstream renderers can't accidentally emit
 * adversarial strings as if they were types/severities.
 */
const FINDING_TYPES = [
  'SELECTOR_CHANGE',
  'MISSING_ELEMENT',
  'TIMING_GAP',
  'STATE_ISSUE',
  'CODE_CHANGE',
  'OTHER',
] as const;
const FINDING_SEVERITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
const SUGGESTED_LOCATIONS = ['TEST_CODE', 'APP_CODE', 'BOTH'] as const;

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
  /** Override the initial verdict when investigation contradicts analysis */
  verdictOverride?: {
    suggestedLocation: 'TEST_CODE' | 'APP_CODE' | 'BOTH';
    confidence: number;
    evidence: string[];
  };
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
    super(openaiClient, 'InvestigationAgent', {
      ...config,
      model: config?.model ?? AGENT_MODEL.investigation,
      reasoningEffort: config?.reasoningEffort ?? REASONING_EFFORT.investigation,
    });
  }

  /**
   * Execute the investigation
   */
  async execute(
    input: InvestigationInput,
    context: AgentContext,
    previousResponseId?: string
  ): Promise<AgentResult<InvestigationOutput>> {
    return this.executeWithTimeout(input, context, previousResponseId);
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
  "confidence": <0-100>,
  "verdictOverride": <optional object — ONLY include if your investigation reveals the failure is NOT fixable in test code. Include { "suggestedLocation": "APP_CODE"|"TEST_CODE"|"BOTH", "confidence": <0-100>, "evidence": ["reason1", "reason2"] }>
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
    const parts: string[] = [];

    if (context.delegationContext) {
      parts.push('### Orchestrator Briefing', context.delegationContext, '');
    }

    parts.push(
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
    );

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

    // Add product diff info
    if (context.productDiff && context.productDiff.files.length > 0) {
      parts.push(
        '',
        `### ⚠️ Recent Product Repo Changes (${DEFAULT_PRODUCT_REPO})`,
        'Review these carefully. If the product change looks like a BUG (missing null checks, broken logic, accidental deletion), classify as a product issue. If it looks like an INTENTIONAL behavior change (lazy loading, conditional rendering, lifecycle refactor, performance optimization) and the test fails because it has not adapted, note that the test needs to adapt to the new product behavior. Use this to inform your verdictOverride decision.'
      );
      for (const file of context.productDiff.files.slice(0, 5)) {
        parts.push(`- **${file.filename}** (${file.status})`);
        if (file.patch) {
          parts.push('```diff', file.patch.slice(0, 1000), '```');
        }
      }
    }

    // Add screenshots context
    if (context.includeScreenshots !== false && context.screenshots && context.screenshots.length > 0) {
      parts.push(
        '',
        '### Screenshots',
        `${context.screenshots.length} screenshot(s) are attached. Analyze them to see:`,
        '- What elements are visible',
        '- What the actual DOM state looks like',
        '- Any visual clues about the failure'
      );
    }

    if (context.skillsPrompt) {
      parts.push('', context.skillsPrompt);
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

      // Normalize a single finding — used for both findings[] and
      // primaryFinding so the enum whitelist is applied consistently
      // whether primaryFinding is a ref into findings[] or a fresh
      // object emitted alongside.
      const normalizeFinding = (
        f: Partial<InvestigationFinding> | null | undefined
      ): InvestigationFinding => ({
        type: coerceEnum(f?.type, FINDING_TYPES, 'OTHER'),
        severity: coerceEnum(f?.severity, FINDING_SEVERITIES, 'MEDIUM'),
        description: typeof f?.description === 'string' ? f.description : '',
        evidence: Array.isArray(f?.evidence) ? f!.evidence : [],
        location: f?.location,
        relationToError:
          typeof f?.relationToError === 'string' ? f.relationToError : '',
      });

      // Validate and normalize findings
      const findings: InvestigationFinding[] = Array.isArray(parsed.findings)
        ? parsed.findings.map(normalizeFinding)
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

      // verdictOverride is a *signal*, not a default. An invalid
      // suggestedLocation means "the model didn't give us a usable
      // override," not "default to APP_CODE." Pre-v1.49.3 this parser
      // used coerceEnum(..., 'APP_CODE'), so adversarial or malformed
      // payloads turned into real APP_CODE overrides, which
      // AgentOrchestrator then treats as a hard product-side signal
      // and aborts repair on. v1.49.3 drops the entire override when
      // suggestedLocation isn't whitelisted and logs a warning so a
      // prompt-injection attempt against this specific signal is
      // visible in run logs (otherwise a silent drop would make the
      // pipeline indistinguishable from the model simply choosing not
      // to emit an override).
      const suggestedLocation = parsed.verdictOverride
        ? coerceEnumOrNull(
            parsed.verdictOverride.suggestedLocation,
            SUGGESTED_LOCATIONS
          )
        : undefined;
      if (parsed.verdictOverride && !suggestedLocation) {
        this.log(
          `Dropping verdictOverride with invalid suggestedLocation ` +
            `(received ${typeof parsed.verdictOverride.suggestedLocation}); ` +
            `treating as "no override" to avoid unsafe APP_CODE promotion.`,
          'warning'
        );
      }
      const verdictOverride = suggestedLocation
        ? {
            suggestedLocation,
            confidence: clampConfidence(parsed.verdictOverride.confidence),
            evidence: Array.isArray(parsed.verdictOverride.evidence)
              ? parsed.verdictOverride.evidence
              : [],
          }
        : undefined;

      // Normalize primaryFinding through the same pipeline so its
      // enum fields can't bypass the whitelist. If parsed doesn't
      // provide one, fall back to findings[0] (already normalized).
      const primaryFinding = parsed.primaryFinding
        ? normalizeFinding(parsed.primaryFinding)
        : findings[0];

      return {
        findings,
        primaryFinding,
        isTestCodeFixable: parsed.isTestCodeFixable !== false,
        recommendedApproach: parsed.recommendedApproach || '',
        selectorsToUpdate,
        confidence: clampConfidence(parsed.confidence),
        verdictOverride,
      };
    } catch (error) {
      this.log(`Failed to parse response: ${error}`, 'warning');
      return null;
    }
  }
}
