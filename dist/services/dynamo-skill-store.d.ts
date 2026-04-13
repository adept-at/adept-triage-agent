import { SkillStore, TriageSkill } from './skill-store.js';
export declare class DynamoSkillStore extends SkillStore {
    private region;
    private tableName;
    private _cachedClient;
    constructor(region: string, tableName: string, owner: string, repo: string);
    private getDocClient;
    load(): Promise<TriageSkill[]>;
    save(skill: TriageSkill): Promise<void>;
    recordOutcome(skillId: string, success: boolean): Promise<void>;
    recordClassificationOutcome(skillId: string, outcome: 'correct' | 'incorrect'): Promise<void>;
}
//# sourceMappingURL=dynamo-skill-store.d.ts.map