import { ProposedChange } from './types';
export declare class RepairValidator {
    validateChanges(changes: ProposedChange[], testFileContent: string): {
        valid: boolean;
        errors: string[];
        warnings: string[];
    };
    applyChanges(changes: ProposedChange[], testFileContent: string): string;
    validateSyntax(repairedContent: string): Promise<{
        valid: boolean;
        errors: string[];
    }>;
    private fuzzyMatch;
    private validateCypressBestPractices;
    private checkBalancedBraces;
    private checkBalancedQuotes;
    private checkCypressCommands;
    private checkCypressChains;
    private removeStringsAndComments;
}
//# sourceMappingURL=validator.d.ts.map