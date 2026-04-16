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
  /** Enable multi-agent repair pipeline for higher quality fixes */
  enableAgenticRepair?: boolean;
  /** Product repository (owner/repo). All browser-test repos target learn-webapp. */
  productRepo: string;
  /** Number of recent product commits to include in diff (default: 5) */
  productDiffCommits?: number;
  /** AWS region for DynamoDB skill store */
  triageAwsRegion?: string;
  /** DynamoDB table name for skill store */
  triageDynamoTable?: string;
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

