import { FailureModeTrace } from '../types';
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
    failureModeTrace?: FailureModeTrace;
}
export interface FlakinessSignal {
    isFlaky: boolean;
    fixCount: number;
    windowDays: number;
    message: string;
}
export declare const MAX_SKILLS = 100;
export declare function sanitizeForPrompt(input: string, maxLength?: number): string;
export declare class SkillStore {
    private skills;
    private loaded;
    private loadSucceeded;
    private loadFailureReason?;
    private region;
    private tableName;
    private owner;
    private repo;
    private _cachedClient;
    constructor(region: string, tableName: string, owner: string, repo: string);
    private getDocClient;
    load(): Promise<TriageSkill[]>;
    save(skill: TriageSkill): Promise<boolean>;
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
    detectFlakiness(spec: string): FlakinessSignal;
    countForSpec(spec: string): number;
    formatForClassifier(opts: {
        framework: string;
        spec?: string;
        errorMessage?: string;
    }): string;
    formatForInvestigation(opts: {
        framework: string;
        spec?: string;
        errorMessage?: string;
    }): string;
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
    failureModeTrace?: FailureModeTrace;
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