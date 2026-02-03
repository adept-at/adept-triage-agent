/**
 * Review Agent
 * Validates proposed fixes before they are applied
 */

import {
  BaseAgent,
  AgentContext,
  AgentResult,
  AgentConfig,
} from './base-agent';
import { OpenAIClient } from '../openai-client';
import { AnalysisOutput } from './analysis-agent';
import { CodeReadingOutput } from './code-reading-agent';
import { FixGenerationOutput, CodeChange } from './fix-generation-agent';

/**
 * An issue found during review
 */
export interface ReviewIssue {
  /** Severity of the issue */
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  /** Which change this issue applies to (index) */
  changeIndex: number;
  /** Description of the issue */
  description: string;
  /** Suggested resolution */
  suggestion?: string;
}

/**
 * Output from the Review Agent
 */
export interface ReviewOutput {
  /** Whether the fix is approved */
  approved: boolean;
  /** Issues found during review */
  issues: ReviewIssue[];
  /** Overall assessment */
  assessment: string;
  /** Confidence that the fix will work */
  fixConfidence: number;
  /** Suggestions for improvement */
  improvements?: string[];
}

/**
 * Input for the Review Agent
 */
export interface ReviewInput {
  /** The proposed fix */
  proposedFix: FixGenerationOutput;
  /** Original analysis */
  analysis: AnalysisOutput;
  /** Code context */
  codeContext?: CodeReadingOutput;
}

/**
 * Review Agent Implementation
 */
export class ReviewAgent extends BaseAgent<ReviewInput, ReviewOutput> {
  constructor(openaiClient: OpenAIClient, config?: Partial<AgentConfig>) {
    super(openaiClient, 'ReviewAgent', config);
  }

  /**
   * Execute the review
   */
  async execute(
    input: ReviewInput,
    context: AgentContext
  ): Promise<AgentResult<ReviewOutput>> {
    return this.executeWithTimeout(input, context);
  }

  /**
   * Get the system prompt
   */
  protected getSystemPrompt(): string {
    return `You are a senior QA engineer reviewing proposed test fixes.

## Your Role

Review code changes proposed to fix failing tests. Your job is to:
1. Verify the fix addresses the root cause
2. Check that oldCode matches the actual file content
3. Ensure newCode is syntactically valid
4. Validate the fix won't introduce new issues
5. Confirm the fix follows best practices

## Review Criteria

### CRITICAL Issues (Must Fix)
- oldCode doesn't match the file content
- Syntax errors in newCode
- Fix doesn't address the root cause
- Fix could cause other tests to fail
- Security vulnerabilities

### WARNING Issues (Should Fix)
- Suboptimal selector choice
- Missing error handling
- Fragile timing assumptions
- Hardcoded values that should be configurable

### SUGGESTION Issues (Nice to Have)
- Code style inconsistencies
- Opportunities for better readability
- Minor improvements

## Output Format

You MUST respond with a JSON object matching this schema:
{
  "approved": <boolean - true only if no CRITICAL issues>,
  "issues": [
    {
      "severity": "<CRITICAL|WARNING|SUGGESTION>",
      "changeIndex": <index of the change with the issue>,
      "description": "<what's wrong>",
      "suggestion": "<how to fix it>"
    }
  ],
  "assessment": "<overall assessment paragraph>",
  "fixConfidence": <0-100 - likelihood the fix will work>,
  "improvements": ["<optional suggestions for improvement>"]
}

## Approval Rules

- Approve if: No CRITICAL issues AND fix addresses root cause
- Reject if: Any CRITICAL issues OR fix doesn't address the problem
- CRITICAL issues automatically mean rejection`;
  }

  /**
   * Build the user prompt
   */
  protected buildUserPrompt(input: ReviewInput, context: AgentContext): string {
    const parts: string[] = [
      '## Fix Review Request',
      '',
      '### Root Cause Being Fixed',
      `- **Category:** ${input.analysis.rootCauseCategory}`,
      `- **Explanation:** ${input.analysis.explanation}`,
      '',
      '### Proposed Fix',
      `- **Summary:** ${input.proposedFix.summary}`,
      `- **Confidence:** ${input.proposedFix.confidence}%`,
      `- **Reasoning:** ${input.proposedFix.reasoning}`,
      '',
      '### Code Changes',
    ];

    // Add each change
    for (let i = 0; i < input.proposedFix.changes.length; i++) {
      const change = input.proposedFix.changes[i];
      parts.push(
        '',
        `#### Change ${i + 1}: ${change.file}`,
        `Line: ${change.line}`,
        `Type: ${change.changeType}`,
        `Justification: ${change.justification}`,
        '',
        '**Old Code:**',
        '```',
        change.oldCode,
        '```',
        '',
        '**New Code:**',
        '```',
        change.newCode,
        '```'
      );
    }

    // Add original file content for verification
    if (context.sourceFileContent) {
      parts.push(
        '',
        '### Original File Content (for verification)',
        '```javascript',
        context.sourceFileContent,
        '```'
      );
    }

    // Add risks identified
    if (input.proposedFix.risks.length > 0) {
      parts.push(
        '',
        '### Identified Risks',
        input.proposedFix.risks.map((r) => `- ${r}`).join('\n')
      );
    }

    parts.push(
      '',
      '## Review Instructions',
      '1. For each change, verify oldCode appears EXACTLY in the file',
      '2. Check that newCode is syntactically valid',
      '3. Verify the fix addresses the root cause',
      '4. Look for potential side effects',
      '5. Assess overall likelihood of success',
      '',
      'Respond with the JSON object as specified in the system prompt.'
    );

    return parts.join('\n');
  }

  /**
   * Parse the response
   */
  protected parseResponse(response: string): ReviewOutput | null {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.log('No JSON found in response', 'warning');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Normalize issues
      const issues: ReviewIssue[] = Array.isArray(parsed.issues)
        ? parsed.issues.map((i: ReviewIssue) => ({
            severity: i.severity || 'WARNING',
            changeIndex: typeof i.changeIndex === 'number' ? i.changeIndex : 0,
            description: i.description || '',
            suggestion: i.suggestion,
          }))
        : [];

      // Determine approval based on critical issues
      const hasCritical = issues.some((i) => i.severity === 'CRITICAL');
      const approved = !hasCritical && parsed.approved !== false;

      return {
        approved,
        issues,
        assessment: parsed.assessment || '',
        fixConfidence:
          typeof parsed.fixConfidence === 'number' ? parsed.fixConfidence : 50,
        improvements: Array.isArray(parsed.improvements)
          ? parsed.improvements
          : undefined,
      };
    } catch (error) {
      this.log(`Failed to parse response: ${error}`, 'warning');
      return null;
    }
  }

  /**
   * Perform a quick validation that oldCode exists in the file
   * This is done locally without an API call
   */
  validateOldCodeExists(
    changes: CodeChange[],
    fileContent: string
  ): ReviewIssue[] {
    const issues: ReviewIssue[] = [];

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      if (!fileContent.includes(change.oldCode)) {
        issues.push({
          severity: 'CRITICAL',
          changeIndex: i,
          description: `oldCode not found in file. The code to replace doesn't exist in ${change.file}`,
          suggestion:
            'Verify the exact code content including whitespace and indentation',
        });
      }
    }

    return issues;
  }
}
