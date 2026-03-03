"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRepairContext = buildRepairContext;
const error_classifier_1 = require("./analysis/error-classifier");
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
//# sourceMappingURL=repair-context.js.map