import { ErrorType, TestIssueCategory } from '../config/constants';
export declare function classifyErrorType(error: string): ErrorType;
export declare function categorizeTestIssue(errorMessage: string): TestIssueCategory;
export declare function extractSelector(error: string): string | undefined;
export declare function extractTestIssueEvidence(errorMessage: string): string[];
//# sourceMappingURL=error-classifier.d.ts.map