export type Verdict = 'TEST_ISSUE' | 'PRODUCT_ISSUE';

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
  cypressArtifactLogs?: string;
  prDiff?: PRDiff;
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
  suggestedAction?: string;
  category?: string;
  affectedTests?: string[];
  patterns?: Record<string, unknown>;
  repairContext?: RepairContext; // Only populated for TEST_ISSUE
  fixRecommendation?: FixRecommendation; // Fix suggestion for TEST_ISSUE
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

export interface LogExtractor {
  framework: string;
  patterns: RegExp[];
  extract: (log: string) => ErrorData | null;
}

export interface StructuredErrorSummary {
  primaryError: {
    type: string;  // AssertionError, NetworkError, etc.
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
    totalCypressCommands?: number;
    lastCommand?: string;
    hasScreenshots: boolean;
    logSize: number;
  };
} 