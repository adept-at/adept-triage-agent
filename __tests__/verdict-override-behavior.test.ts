/**
 * Behavioral tests for the orchestrator's investigation verdict-override
 * abort gate and the analysis→investigation selective-chaining boundary
 * (src/agents/agent-orchestrator.ts).
 *
 * These drive the REAL AgentOrchestrator with a mocked OpenAI client that
 * returns canned JSON per agent stage (dispatched on the stage's system
 * prompt), and assert BEHAVIOR:
 *   - whether the fix-generation stage is ever invoked
 *   - repairTelemetry status ('no_approved_fix' on abort)
 *   - the 'verdictOverrideAborts' gate counter
 *   - which previousResponseId the investigation call receives
 *
 * Semantics pinned (verified against source):
 *   - verdictOverride with suggestedLocation APP_CODE or BOTH AND
 *     confidence >= VERDICT_OVERRIDE_CONFIDENCE_THRESHOLD (70, absolute)
 *     aborts repair before fix generation and increments the
 *     verdictOverrideAborts gate.
 *   - TEST_CODE overrides never trigger the override abort at any confidence.
 *   - isTestCodeFixable:false aborts conservatively even when a
 *     sub-threshold or non-product-side override is present (no gate bump).
 *   - analysis confidence < AGENT_CONFIG.INVESTIGATION_CHAIN_CONFIDENCE (80)
 *     chains the analysis responseId into the investigation call; >= 80
 *     starts investigation fresh.
 *
 * No network calls: the code-reading agent is deterministic and uses the
 * pre-seeded context.sourceFileContent; every model-calling agent goes
 * through the mocked generateWithCustomPrompt.
 */
import { AgentOrchestrator } from '../src/agents/agent-orchestrator';
import { createAgentContext, AgentContext } from '../src/agents/base-agent';
import type { OpenAIClient } from '../src/openai-client';
import {
  getGateCounters,
  _resetGateCounters,
} from '../src/pipeline/run-telemetry';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_FILE = 'cypress/e2e/save-flow.cy.ts';

const TEST_SOURCE = [
  "describe('save flow', () => {",
  "  it('shows a toast after save', () => {",
  '    cy.get(\'[data-testid="save-button"]\').click();',
  '    cy.get(\'[data-testid="toast"]\').should(\'be.visible\');',
  '  });',
  '});',
].join('\n');

// Exact single occurrence in TEST_SOURCE so autoCorrectOldCode keeps the change.
const OLD_CODE = '    cy.get(\'[data-testid="save-button"]\').click();';
const NEW_CODE = '    cy.get(\'[data-testid="save-btn"]\').click();';

// Stage markers — stable substrings of each agent's system prompt.
const ANALYSIS_MARKER = 'expert test failure analyst';
const INVESTIGATION_MARKER = 'expert investigator';
const FIX_GEN_MARKER = 'expert test engineer';
const REVIEW_MARKER = 'senior QA engineer';

interface VerdictOverride {
  suggestedLocation: 'TEST_CODE' | 'APP_CODE' | 'BOTH';
  confidence: number;
  evidence: string[];
}

function analysisJson(confidence: number): object {
  return {
    rootCauseCategory: 'SELECTOR_MISMATCH',
    contributingFactors: [],
    confidence,
    explanation: 'The save button selector no longer matches.',
    selectors: ['[data-testid="save-button"]'],
    elements: ['save button'],
    issueLocation: 'TEST_CODE',
    patterns: {
      hasTimeout: true,
      hasVisibilityIssue: false,
      hasNetworkCall: false,
      hasStateAssertion: false,
      hasDynamicContent: false,
      hasResponsiveIssue: false,
    },
    suggestedApproach: 'Update the selector to the renamed data-testid.',
  };
}

function investigationJson(opts: {
  verdictOverride?: VerdictOverride;
  isTestCodeFixable?: boolean;
}): object {
  const finding = {
    type: 'SELECTOR_CHANGE',
    severity: 'HIGH',
    description: 'save-button testid was renamed to save-btn',
    evidence: ['product diff renamed the attribute'],
    location: { file: TEST_FILE, line: 3, code: OLD_CODE.trim() },
    relationToError: 'The stale selector caused the timeout.',
  };
  return {
    findings: [finding],
    primaryFinding: finding,
    isTestCodeFixable: opts.isTestCodeFixable ?? true,
    recommendedApproach: 'Update the selector in the spec.',
    selectorsToUpdate: [],
    confidence: 85,
    ...(opts.verdictOverride ? { verdictOverride: opts.verdictOverride } : {}),
  };
}

function fixJson(): object {
  return {
    changes: [
      {
        file: TEST_FILE,
        line: 3,
        oldCode: OLD_CODE,
        newCode: NEW_CODE,
        justification: 'Adopt the renamed data-testid.',
        changeType: 'SELECTOR_UPDATE',
      },
    ],
    confidence: 90,
    summary: 'Update the save button selector.',
    reasoning: 'The product renamed the testid; the spec must match.',
    evidence: ['diff shows save-button → save-btn'],
    risks: [],
    alternatives: [],
    failureModeTrace: {
      originalState: 'cy.get timed out after 4000ms on save-button',
      rootMechanism: 'testid was renamed in the product, selector is stale',
      newStateAfterFix: 'selector matches the rendered save-btn element',
      whyAssertionPassesNow: 'the element is found immediately',
    },
  };
}

function reviewJson(): object {
  return {
    approved: true,
    issues: [],
    assessment: 'Fix matches the product change.',
    fixConfidence: 90,
    improvements: [],
  };
}

// ---------------------------------------------------------------------------
// Mock OpenAI client — dispatches canned JSON per agent stage
// ---------------------------------------------------------------------------

interface CannedResponses {
  analysis: object;
  investigation: object;
  fix?: object;
  review?: object;
}

type MockedClient = OpenAIClient & { generateWithCustomPrompt: jest.Mock };

function makeMockClient(responses: CannedResponses): MockedClient {
  const generateWithCustomPrompt = jest.fn(
    async (params: { systemPrompt: string }) => {
      const sp = params.systemPrompt;
      const reply = (payload: object, stage: string) => ({
        text: JSON.stringify(payload),
        responseId: `resp-${stage}`,
        tokensUsed: 10,
      });
      if (sp.includes(ANALYSIS_MARKER)) {
        return reply(responses.analysis, 'analysis');
      }
      if (sp.includes(INVESTIGATION_MARKER)) {
        return reply(responses.investigation, 'investigation');
      }
      if (sp.includes(FIX_GEN_MARKER)) {
        return reply(responses.fix ?? fixJson(), 'fixgen');
      }
      if (sp.includes(REVIEW_MARKER)) {
        return reply(responses.review ?? reviewJson(), 'review');
      }
      throw new Error(`Unrecognized agent system prompt: ${sp.slice(0, 80)}`);
    }
  );
  return { generateWithCustomPrompt } as unknown as MockedClient;
}

function stageCalls(
  client: MockedClient,
  marker: string
): Array<{ systemPrompt: string; previousResponseId?: string }> {
  return client.generateWithCustomPrompt.mock.calls
    .map(([params]) => params)
    .filter((p: { systemPrompt: string }) => p.systemPrompt.includes(marker));
}

function makeContext(): AgentContext {
  return createAgentContext({
    errorMessage:
      'Timed out retrying after 4000ms: Expected to find element: ' +
      '[data-testid="save-button"], but never found it.',
    testFile: TEST_FILE,
    testName: 'shows a toast after save',
    framework: 'cypress',
    sourceFileContent: TEST_SOURCE,
  });
}

function makeOrchestrator(client: MockedClient): AgentOrchestrator {
  // requireReview:false keeps the pipeline to analysis → code reading →
  // investigation → fix generation, which is the surface under test.
  return new AgentOrchestrator(client, { requireReview: false });
}

async function runPipeline(responses: CannedResponses) {
  const client = makeMockClient(responses);
  const orchestrator = makeOrchestrator(client);
  const result = await orchestrator.orchestrate(makeContext());
  return { client, result };
}

beforeEach(() => {
  _resetGateCounters();
});

// ---------------------------------------------------------------------------
// 1. Threshold boundary matrix
// ---------------------------------------------------------------------------

describe('verdict-override abort gate — threshold boundary matrix', () => {
  it.each([70, 71])(
    'APP_CODE @ %d aborts repair before fix generation',
    async (confidence) => {
      const { client, result } = await runPipeline({
        analysis: analysisJson(90),
        investigation: investigationJson({
          verdictOverride: {
            suggestedLocation: 'APP_CODE',
            confidence,
            evidence: ['product regression confirmed'],
          },
        }),
      });

      expect(stageCalls(client, FIX_GEN_MARKER)).toHaveLength(0);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Investigation verdict override');
      expect(result.repairTelemetry?.status).toBe('no_approved_fix');
      expect(result.repairTelemetry?.lastStage).toBe('investigation');
      expect(getGateCounters().verdictOverrideAborts).toBe(1);
    }
  );

  it('APP_CODE @ 69 falls through to repair (fix generation runs)', async () => {
    const { client, result } = await runPipeline({
      analysis: analysisJson(90),
      investigation: investigationJson({
        isTestCodeFixable: true,
        verdictOverride: {
          suggestedLocation: 'APP_CODE',
          confidence: 69,
          evidence: ['weak product-side signal'],
        },
      }),
    });

    expect(stageCalls(client, FIX_GEN_MARKER)).toHaveLength(1);
    expect(result.success).toBe(true);
    expect(result.repairTelemetry?.status).toBe('approved');
    expect(getGateCounters().verdictOverrideAborts).toBe(0);
  });

  it('BOTH @ 70 aborts repair before fix generation', async () => {
    const { client, result } = await runPipeline({
      analysis: analysisJson(90),
      investigation: investigationJson({
        verdictOverride: {
          suggestedLocation: 'BOTH',
          confidence: 70,
          evidence: ['product component implicated alongside the test'],
        },
      }),
    });

    expect(stageCalls(client, FIX_GEN_MARKER)).toHaveLength(0);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Investigation verdict override');
    expect(result.repairTelemetry?.status).toBe('no_approved_fix');
    expect(result.repairTelemetry?.lastStage).toBe('investigation');
    expect(getGateCounters().verdictOverrideAborts).toBe(1);
  });

  it('BOTH @ 69 falls through to repair when test code is fixable', async () => {
    const { client, result } = await runPipeline({
      analysis: analysisJson(90),
      investigation: investigationJson({
        isTestCodeFixable: true,
        verdictOverride: {
          suggestedLocation: 'BOTH',
          confidence: 69,
          evidence: ['weak mixed signal'],
        },
      }),
    });

    expect(stageCalls(client, FIX_GEN_MARKER)).toHaveLength(1);
    expect(result.success).toBe(true);
    expect(getGateCounters().verdictOverrideAborts).toBe(0);
  });

  it.each([69, 70, 71, 100])(
    'TEST_CODE @ %d never triggers the override abort',
    async (confidence) => {
      const { client, result } = await runPipeline({
        analysis: analysisJson(90),
        investigation: investigationJson({
          isTestCodeFixable: true,
          verdictOverride: {
            suggestedLocation: 'TEST_CODE',
            confidence,
            evidence: ['failure is test-side'],
          },
        }),
      });

      expect(stageCalls(client, FIX_GEN_MARKER)).toHaveLength(1);
      expect(result.success).toBe(true);
      expect(getGateCounters().verdictOverrideAborts).toBe(0);
    }
  );
});

// ---------------------------------------------------------------------------
// 2. Conservative not-fixable abort interaction
// ---------------------------------------------------------------------------

describe('conservative abort interaction with sub-threshold overrides', () => {
  it('sub-threshold APP_CODE override (60) + isTestCodeFixable:false still aborts (conservative path, not the override gate)', async () => {
    const { client, result } = await runPipeline({
      analysis: analysisJson(90),
      investigation: investigationJson({
        isTestCodeFixable: false,
        verdictOverride: {
          suggestedLocation: 'APP_CODE',
          confidence: 60,
          evidence: ['low-confidence product-side signal'],
        },
      }),
    });

    expect(stageCalls(client, FIX_GEN_MARKER)).toHaveLength(0);
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'Investigation determined issue is not test-code-fixable'
    );
    expect(result.repairTelemetry?.status).toBe('no_approved_fix');
    expect(result.repairTelemetry?.lastStage).toBe('investigation');
    // The conservative path must NOT count as an override abort.
    expect(getGateCounters().verdictOverrideAborts).toBe(0);
  });

  it('sub-threshold APP_CODE override (60) + isTestCodeFixable:true proceeds to fix generation', async () => {
    const { client, result } = await runPipeline({
      analysis: analysisJson(90),
      investigation: investigationJson({
        isTestCodeFixable: true,
        verdictOverride: {
          suggestedLocation: 'APP_CODE',
          confidence: 60,
          evidence: ['low-confidence product-side signal'],
        },
      }),
    });

    expect(stageCalls(client, FIX_GEN_MARKER)).toHaveLength(1);
    expect(result.success).toBe(true);
    expect(getGateCounters().verdictOverrideAborts).toBe(0);
  });

  it('high-confidence TEST_CODE override + isTestCodeFixable:false aborts conservatively (override gate does not fire)', async () => {
    const { client, result } = await runPipeline({
      analysis: analysisJson(90),
      investigation: investigationJson({
        isTestCodeFixable: false,
        verdictOverride: {
          suggestedLocation: 'TEST_CODE',
          confidence: 95,
          evidence: ['test-side but not safely fixable'],
        },
      }),
    });

    expect(stageCalls(client, FIX_GEN_MARKER)).toHaveLength(0);
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'Investigation determined issue is not test-code-fixable'
    );
    expect(result.repairTelemetry?.status).toBe('no_approved_fix');
    expect(getGateCounters().verdictOverrideAborts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Control case — no verdictOverride at all
// ---------------------------------------------------------------------------

describe('control — no verdictOverride', () => {
  it('proceeds to fix generation and returns an approved fix', async () => {
    const { client, result } = await runPipeline({
      analysis: analysisJson(90),
      investigation: investigationJson({ isTestCodeFixable: true }),
    });

    expect(stageCalls(client, FIX_GEN_MARKER)).toHaveLength(1);
    expect(result.success).toBe(true);
    expect(result.fix?.proposedChanges).toHaveLength(1);
    expect(result.repairTelemetry?.status).toBe('approved');
    expect(getGateCounters().verdictOverrideAborts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Selective analysis→investigation chaining boundary
// ---------------------------------------------------------------------------

describe('selective analysis→investigation chaining boundary', () => {
  it('analysis confidence 79 chains the analysis responseId into investigation', async () => {
    const { client } = await runPipeline({
      analysis: analysisJson(79),
      investigation: investigationJson({ isTestCodeFixable: true }),
    });

    const investigationCalls = stageCalls(client, INVESTIGATION_MARKER);
    expect(investigationCalls).toHaveLength(1);
    expect(investigationCalls[0].previousResponseId).toBe('resp-analysis');
  });

  it.each([80, 81])(
    'analysis confidence %d starts investigation fresh (no previousResponseId)',
    async (confidence) => {
      const { client } = await runPipeline({
        analysis: analysisJson(confidence),
        investigation: investigationJson({ isTestCodeFixable: true }),
      });

      const investigationCalls = stageCalls(client, INVESTIGATION_MARKER);
      expect(investigationCalls).toHaveLength(1);
      expect(investigationCalls[0].previousResponseId).toBeUndefined();
    }
  );
});
