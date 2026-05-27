import { Octokit } from '@octokit/rest';

export type Verdict =
  | 'TEST_ISSUE'
  | 'PRODUCT_ISSUE'
  | 'INCONCLUSIVE'
  | 'PENDING'
  | 'ERROR'
  | 'NO_FAILURE';

/**
 * Context for fetching source files from GitHub
 */
export interface SourceFetchContext {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
}

/**
 * AI-generated fix recommendation structure
 */
export interface AIRecommendation {
  confidence: number;
  reasoning: string;
  changes: AIChange[];
  evidence: string[];
  rootCause: string;
}

export interface AIChange {
  file: string;
  line?: number;
  oldCode?: string;
  newCode?: string;
  justification: string;
}

export interface ErrorData {
  message: string;
  stackTrace?: string;
  framework?: string;
  failureType?: string;
  context?: string;
  testName?: string;
  fileName?: string;
  screenshots?: Screenshot[];
  logs?: string[];
  testArtifactLogs?: string;
  prDiff?: PRDiff;
  /** Recent diff from the product repo (e.g. learn-webapp) — always fetched independently */
  productDiff?: PRDiff;
  structuredSummary?: StructuredErrorSummary;
}

export interface Screenshot {
  name: string;
  path: string;
  base64Data?: string;
  url?: string;
  timestamp?: string;
}

export interface RepairContext {
  // Location information
  testFile: string; // e.g., "cypress/e2e/auth/login.cy.ts"
  errorLine?: number; // e.g., 47
  testName: string; // e.g., "should login successfully"

  // Failure identification
  errorType: string; // e.g., "ELEMENT_NOT_FOUND", "TIMEOUT", "ASSERTION_FAILED"
  errorSelector?: string; // e.g., ".submit-btn" (if applicable)
  errorMessage: string; // Full error message

  // Repository context
  workflowRunId: string;
  jobName: string;
  commitSha: string;
  branch: string;
  repository: string;

  // Optional PR context
  prNumber?: string; // PR in test repo
  targetAppPrNumber?: string; // PR in app being tested (if known)
}

/** Stages inside the agentic repair orchestrator (for telemetry / budget). */
export type RepairStage =
  | 'analysis'
  | 'code_reading'
  | 'investigation'
  | 'fix_generation'
  | 'review';

/**
 * Repair lifecycle distinct from classifier verdict — surfaces in action
 * outputs and triage_json so Slack can show e.g. review rejection vs clean TEST_ISSUE.
 */
export type RepairStatus =
  | 'not_started'
  | 'skipped'
  | 'in_progress'
  | 'no_fix_generated'
  | 'review_rejected'
  | 'timed_out'
  | 'cancelled'
  | 'no_approved_fix'
  | 'approved'
  | 'applied'
  | 'validated'
  /**
   * Validation passed, but publish/PR creation failed afterward (e.g. push
   * rejected by branch protection, PAT scope insufficient). The fix was real;
   * only the delivery step failed. Distinguishing this from a fix failure is
   * critical for skill-store learning — Phase 0 of the architecture roadmap.
   */
  | 'validated_publish_failed'
  /**
   * Validation passed without a completed apply/publish having been attempted
   * for any other reason. Reserved for future ApplyResult shapes; not emitted
   * by current code paths.
   */
  | 'validated_not_published';

export interface RepairTelemetry {
  status: RepairStatus;
  summary: string;
  iterations: number;
  lastStage?: RepairStage;
  lastReviewIssues?: string[];
  lastReviewAssessment?: string;
  lastFixSummary?: string;
  lastFixConfidence?: number;
  /** Orchestrator wall-clock budget (ms) when repair ran under AgentOrchestrator */
  timeoutMs?: number;
  elapsedMs: number;
  /**
   * Set when the InvestigationAgent flagged the failure as product-side
   * (`APP_CODE`) with confidence at or above
   * `VERDICT_OVERRIDE_CONFIDENCE_THRESHOLD`. The orchestrator already
   * uses this signal to abort repair, but historically the data was
   * thrown away after that — the action's exported `verdict` stayed at
   * the original classifier value (`TEST_ISSUE`), so consumers received
   * a contradictory pair of signals: a product-side override warning in
   * logs but a test-side verdict in outputs.
   *
   * Surfacing the override here lets the coordinator authoritatively
   * swap the exported verdict to `PRODUCT_ISSUE` and embed the
   * investigation evidence in the reasoning, instead of relying on
   * downstream consumers to reconcile two different signals.
   *
   * `suggestedSourceLocations` carries the file/line tuples the
   * investigation already collected on `findings[].location` so the
   * swapped `PRODUCT_ISSUE` verdict has the same `triage_json`
   * `suggestedSourceLocations` shape as a classifier-direct
   * `PRODUCT_ISSUE` verdict. Without this, swap-path PRODUCT_ISSUE
   * outputs would be the only ones missing source locations — exactly
   * the case where they're most actionable.
   */
  investigationVerdictOverride?: {
    suggestedLocation: 'APP_CODE' | 'TEST_CODE' | 'BOTH';
    confidence: number;
    evidence: string[];
    suggestedSourceLocations?: Array<{
      file: string;
      lines: string;
      reason: string;
    }>;
  };
  /**
   * Original classifier confidence captured before
   * `applyInvestigationVerdictOverride` overwrites `result.confidence`
   * with the override confidence. Preserved for accuracy tracking and
   * post-mortems — without this, dashboards plotting "average confidence
   * on PRODUCT_ISSUE" would silently include override-path numbers
   * (typically 70–90%) alongside classifier-direct numbers (typically
   * 90+) and not realize they are different distributions.
   */
  priorClassifierConfidence?: number;
}

export interface AnalysisResult {
  verdict: Verdict;
  confidence: number;
  reasoning: string;
  summary?: string;
  indicators?: string[];
  suggestedSourceLocations?: SourceLocation[];
  evidence?: string[];
  category?: string;
  fixRecommendation?: FixRecommendation;
  /** OpenAI Responses API ID from the classification call — threads into repair pipeline */
  responseId?: string;
  /** Agentic repair outcome — orthogonal to classifier verdict */
  repairTelemetry?: RepairTelemetry;
  /**
   * Set when a policy gate (chronic flakiness, blast-radius scaling, etc.)
   * intentionally held back an auto-fix that would otherwise have been
   * applied. Emitted as the `auto_fix_skipped` / `auto_fix_skipped_reason`
   * run outputs so downstream Slack / dashboards can distinguish
   * safety-withheld fixes from "no fix possible".
   */
  autoFixSkipped?: boolean;
  autoFixSkippedReason?: string;
}

/**
 * Structured causal reasoning that the fix-generation agent must attach to
 * every fix. The review agent inspects this trace to verify the fix actually
 * addresses the specific failure mode, not just a plausible-sounding abstraction.
 *
 * Rationale: the agent occasionally produces fixes that look reasonable but
 * don't actually change the runtime state that caused the failure (e.g.,
 * adding a new AND-clause to a condition that was already failing — makes
 * the condition stricter, not more likely to succeed). Forcing the agent to
 * articulate (a) what specifically was in the runtime state at failure time,
 * (b) how the new code changes that state, and (c) why the assertion will
 * now succeed, makes the reasoning gap auditable.
 */
export interface FailureModeTrace {
  /**
   * The concrete runtime state at the moment of failure. Should reference
   * specific values from the error message / logs when available
   * (e.g., "currentTime was 6.02s, pausedTime was captured as 0s, drift 6.02
   * > tolerance 0.25"). Generic phrases like "timing issue" or "flaky check"
   * should be rejected by the review agent.
   */
  originalState: string;
  /**
   * The specific causal mechanism that produced the failure. Not "strict
   * timeout" but "pausedTime was captured before the player actually paused,
   * so subsequent currentTime reads always drifted past pausedTime".
   */
  rootMechanism: string;
  /**
   * The specific change in runtime state after the fix — what values or
   * events will be different when the test replays the same scenario.
   */
  newStateAfterFix: string;
  /**
   * Why the assertion will now succeed. If the new condition is logically
   * stronger than the original (e.g., adds an AND-clause), this field MUST
   * explain why the additional requirement is guaranteed to hold in the
   * exact failure scenario.
   */
  whyAssertionPassesNow: string;
}

export interface FixRecommendation {
  confidence: number;
  summary: string;
  proposedChanges: {
    file: string;
    line: number;
    oldCode: string;
    newCode: string;
    justification: string;
  }[];
  evidence: string[];
  reasoning: string;
  /**
   * Optional during the migration to v1.48+. New fixes should always include
   * this. The review agent treats a missing trace as a CRITICAL issue.
   */
  failureModeTrace?: FailureModeTrace;
}

export type ValidationStatus =
  | 'pending'
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'inconclusive';

export interface ValidationResult {
  status: ValidationStatus;
  mode: 'local' | 'remote';
  runId?: number;
  url?: string;
  conclusion?: string;
  testEvidence?: {
    trustworthy: boolean;
    reason: string;
    matched?: string;
  };
  failure?: {
    primaryError: string;
    failedAssertion?: string;
    failureStage: 'baseline' | 'apply' | 'validation' | 'post_validation';
    changedFailureSignature?: boolean;
  };
}

export interface FailedFixEvidence {
  fixCommit?: string;
  validationRunId?: number;
  originalFailureSignature: string;
  validationFailureSignature: string;
  failedAssertion?: string;
  failureStage: string;
  reasonTheFixWasWrong?: string;
  changedFailureSignature: boolean;
}

export interface SourceLocation {
  file: string;
  lines: string;
  reason: string;
}

export interface OpenAIResponse {
  verdict: Verdict;
  reasoning: string;
  indicators: string[];
  suggestedSourceLocations?: SourceLocation[];
  tokensUsed?: number;
}

export interface FewShotExample {
  error: string;
  verdict: Verdict;
  reasoning: string;
}

export interface ActionInputs {
  githubToken: string;
  openaiApiKey: string;
  errorMessage?: string;
  workflowRunId?: string;
  jobName?: string;
  confidenceThreshold: number;
  prNumber?: string;
  commitSha?: string;
  repository?: string;
  testFrameworks?: string;
  enableAutoFix?: boolean;
  autoFixBaseBranch?: string;
  autoFixMinConfidence?: number;
  autoFixTargetRepo?: string;
  /** Branch being tested (for fetching branch diff when no PR number) */
  branch?: string;
  /** Enable validation of auto-fixes before accepting (default path: remote workflow_dispatch) */
  enableValidation?: boolean;
  /** Run validation test in-container (clone + apply + test + push on pass). When false, uses remote workflow_dispatch. */
  enableLocalValidation?: boolean;
  /** Name of the validation workflow file (used by remote path) */
  validationWorkflow?: string;
  /** Preview URL for validation tests (if different from original) */
  validationPreviewUrl?: string;
  /** Spec file for validation tests (if different from detected) */
  validationSpec?: string;
  /** Original test command template with {spec} and {url} placeholders */
  validationTestCommand?: string;
  /** Token for npm registry auth (GitHub Packages). Falls back to githubToken. */
  npmToken?: string;
  /** Product repository (owner/repo). All browser-test repos target learn-webapp. */
  productRepo: string;
  /** Number of recent product commits to include in diff (default: 5) */
  productDiffCommits?: number;
  /** AWS region for DynamoDB skill store */
  triageAwsRegion?: string;
  /** DynamoDB table name for skill store */
  triageDynamoTable?: string;
  /** Override model for fix-generation agent (rollback lever) */
  modelOverrideFixGen?: string;
  /** Override model for review agent (rollback lever) */
  modelOverrideReview?: string;
}

export interface PRDiff {
  files: PRDiffFile[];
  totalChanges: number;
  additions: number;
  deletions: number;
}

export interface PRDiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface StructuredErrorSummary {
  primaryError: {
    type: string; // AssertionError, NetworkError, etc.
    message: string;
    location?: {
      file: string;
      line: number;
      isTestCode: boolean;
      isAppCode: boolean;
    };
  };
  testContext: {
    testName: string;
    testFile: string;
    duration?: string;
    browser?: string;
    framework: string;
  };
  failureIndicators: {
    hasNetworkErrors: boolean;
    hasNullPointerErrors: boolean;
    hasTimeoutErrors: boolean;
    hasDOMErrors: boolean;
    hasAssertionErrors: boolean;
    isMobileTest: boolean;
    hasLongTimeout: boolean;
    hasAltTextSelector: boolean;
    hasElementExistenceCheck: boolean;
    hasVisibilityIssue: boolean;
    hasViewportContext: boolean;
  };
  prRelevance?: {
    testFileModified: boolean;
    relatedSourceFilesModified: string[];
    riskScore: 'high' | 'medium' | 'low' | 'none';
  };
  keyMetrics: {
    totalTestCommands?: number;
    lastCommand?: string;
    hasScreenshots: boolean;
    logSize: number;
  };
}

