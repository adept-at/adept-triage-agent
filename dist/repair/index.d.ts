import { RepairConfig, RepairContext } from './types';
import { FixRecommendation } from '../types';
export declare class RepairAgent {
    private contextFetcher;
    private searchStrategy;
    private repairEngine;
    private validator;
    private openaiClient;
    constructor(config: RepairConfig);
    generateFixRecommendation(repairContext: RepairContext): Promise<FixRecommendation | null>;
    private generateFixSummary;
}
export * from './types';
//# sourceMappingURL=index.d.ts.map