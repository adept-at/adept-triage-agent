import { RepairContext, AnalysisResult } from './types';
import { classifyErrorType, extractSelector } from './analysis/error-classifier';

// Re-export for backward compatibility
export { classifyErrorType, extractSelector };

/**
 * Builds a RepairContext from analysis data
 */
export function buildRepairContext(analysisData: {
  testFile: string;
  errorLine?: number;
  testName: string;
  errorMessage: string;
  workflowRunId: string;
  jobName: string;
  commitSha: string;
  branch: string;
  repository: string;
  prNumber?: string;
  targetAppPrNumber?: string;
}): RepairContext {
  const errorType = classifyErrorType(analysisData.errorMessage);
  const errorSelector = extractSelector(analysisData.errorMessage);

  return {
    // Location information
    testFile: analysisData.testFile,
    errorLine: analysisData.errorLine,
    testName: analysisData.testName,

    // Failure identification
    errorType,
    errorSelector,
    errorMessage: analysisData.errorMessage,

    // Repository context
    workflowRunId: analysisData.workflowRunId,
    jobName: analysisData.jobName,
    commitSha: analysisData.commitSha,
    branch: analysisData.branch,
    repository: analysisData.repository,

    // Optional PR context
    prNumber: analysisData.prNumber,
    targetAppPrNumber: analysisData.targetAppPrNumber
  };
}

/**
 * Enhances an AnalysisResult with RepairContext if it's a TEST_ISSUE
 */
export function enhanceAnalysisWithRepairContext(
  analysisResult: AnalysisResult,
  testData: {
    testFile: string;
    errorLine?: number;
    testName: string;
    errorMessage: string;
    workflowRunId: string;
    jobName: string;
    commitSha: string;
    branch: string;
    repository: string;
    prNumber?: string;
    targetAppPrNumber?: string;
  }
): AnalysisResult {
  // Only add repair context for TEST_ISSUE verdicts
  if (analysisResult.verdict !== 'TEST_ISSUE') {
    return analysisResult;
  }

  const repairContext = buildRepairContext(testData);

  return {
    ...analysisResult,
    repairContext
  };
}
