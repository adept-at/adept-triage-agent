import { Octokit } from '@octokit/rest';
export interface TriageSkill {
    id: string;
    createdAt: string;
    repo: string;
    spec: string;
    testName: string;
    framework: 'cypress' | 'webdriverio' | 'unknown';
    errorPattern: string;
    rootCauseCategory: string;
    fix: {
        file: string;
        changeType: string;
        summary: string;
        pattern: string;
    };
    confidence: number;
    iterations: number;
    prUrl: string;
    validatedLocally: boolean;
    priorSkillCount: number;
    successCount: number;
    failCount: number;
    lastUsedAt: string;
    retired: boolean;
    investigationFindings?: string;
    classificationOutcome?: 'correct' | 'incorrect' | 'unknown';
    rootCauseChain?: string;
    repoContext?: string;
}
export interface RepairSkill extends TriageSkill {
    wasSuccessful: boolean;
}
export interface FlakinessSignal {
    isFlaky: boolean;
    fixCount: number;
    windowDays: number;
    message: string;
}
export declare class SkillStore {
    protected skills: TriageSkill[];
    protected loaded: boolean;
    private fileSha;
    private octokit;
    protected owner: string;
    protected repo: string;
    constructor(octokit: Octokit, owner: string, repo: string);
    load(): Promise<TriageSkill[]>;
    save(skill: TriageSkill): Promise<void>;
    recordOutcome(skillId: string, success: boolean): Promise<void>;
    recordClassificationOutcome(skillId: string, outcome: 'correct' | 'incorrect'): Promise<void>;
    findRelevant(opts: {
        framework: string;
        spec?: string;
        errorMessage?: string;
        limit?: number;
    }): TriageSkill[];
    findForClassifier(opts: {
        framework: string;
        spec?: string;
        errorMessage?: string;
    }): TriageSkill[];
    findForRepair(opts: {
        framework: string;
        spec?: string;
        errorMessage?: string;
        rootCauseCategory?: string;
    }): RepairSkill[];
    detectFlakiness(spec: string): FlakinessSignal;
    countForSpec(spec: string): number;
    formatForClassifier(opts: {
        framework: string;
        spec?: string;
        errorMessage?: string;
    }): string;
    formatForRepair(opts: {
        framework: string;
        spec?: string;
        errorMessage?: string;
        rootCauseCategory?: string;
    }): string;
    formatForInvestigation(opts: {
        framework: string;
        spec?: string;
        errorMessage?: string;
    }): string;
    private persist;
    private ensureBranch;
}
export declare function normalizeFramework(raw?: string): TriageSkill['framework'];
export declare function buildSkill(params: {
    repo: string;
    spec: string;
    testName: string;
    framework: string;
    errorMessage: string;
    rootCauseCategory: string;
    fix: {
        file: string;
        changeType: string;
        summary: string;
        pattern: string;
    };
    confidence: number;
    iterations: number;
    prUrl: string;
    validatedLocally: boolean;
    priorSkillCount: number;
    investigationFindings?: string;
    rootCauseChain?: string;
    repoContext?: string;
}): TriageSkill;
export declare function describeFixPattern(changes: Array<{
    file: string;
    oldCode: string;
    newCode: string;
    justification?: string;
    changeType?: string;
}>): string;
export declare function normalizeError(msg: string): string;
export declare function formatSkillsForPrompt(skills: TriageSkill[], role: 'investigation' | 'fix_generation' | 'review', flakiness?: FlakinessSignal): string;
//# sourceMappingURL=skill-store.d.ts.map