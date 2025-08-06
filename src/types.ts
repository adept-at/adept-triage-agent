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

export interface AnalysisResult {
  verdict: Verdict;
  confidence: number;
  reasoning: string;
  summary: string;
  indicators?: string[];
  suggestedSourceLocations?: SourceLocation[];
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