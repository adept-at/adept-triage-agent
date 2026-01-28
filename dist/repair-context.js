"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractSelector = exports.classifyErrorType = void 0;
exports.buildRepairContext = buildRepairContext;
exports.enhanceAnalysisWithRepairContext = enhanceAnalysisWithRepairContext;
const error_classifier_1 = require("./analysis/error-classifier");
Object.defineProperty(exports, "classifyErrorType", { enumerable: true, get: function () { return error_classifier_1.classifyErrorType; } });
Object.defineProperty(exports, "extractSelector", { enumerable: true, get: function () { return error_classifier_1.extractSelector; } });
function buildRepairContext(analysisData) {
    const errorType = (0, error_classifier_1.classifyErrorType)(analysisData.errorMessage);
    const errorSelector = (0, error_classifier_1.extractSelector)(analysisData.errorMessage);
    return {
        testFile: analysisData.testFile,
        errorLine: analysisData.errorLine,
        testName: analysisData.testName,
        errorType,
        errorSelector,
        errorMessage: analysisData.errorMessage,
        workflowRunId: analysisData.workflowRunId,
        jobName: analysisData.jobName,
        commitSha: analysisData.commitSha,
        branch: analysisData.branch,
        repository: analysisData.repository,
        prNumber: analysisData.prNumber,
        targetAppPrNumber: analysisData.targetAppPrNumber
    };
}
function enhanceAnalysisWithRepairContext(analysisResult, testData) {
    if (analysisResult.verdict !== 'TEST_ISSUE') {
        return analysisResult;
    }
    const repairContext = buildRepairContext(testData);
    return {
        ...analysisResult,
        repairContext
    };
}
//# sourceMappingURL=repair-context.js.map