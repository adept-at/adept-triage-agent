"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamoSkillStore = void 0;
const core = __importStar(require("@actions/core"));
const skill_store_js_1 = require("./skill-store.js");
const rest_1 = require("@octokit/rest");
class DynamoSkillStore extends skill_store_js_1.SkillStore {
    region;
    tableName;
    _cachedClient;
    constructor(region, tableName, owner, repo) {
        const dummyOctokit = new rest_1.Octokit();
        super(dummyOctokit, owner, repo);
        this.region = region;
        this.tableName = tableName;
    }
    async getDocClient() {
        if (this._cachedClient)
            return this._cachedClient;
        const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
        const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
        const raw = new DynamoDBClient({ region: this.region });
        this._cachedClient = DynamoDBDocumentClient.from(raw, {
            marshallOptions: { removeUndefinedValues: true },
        });
        return this._cachedClient;
    }
    async load() {
        if (this.loaded)
            return this.skills;
        try {
            const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
            const client = await this.getDocClient();
            const pk = `REPO#${this.owner}/${this.repo}`;
            const allItems = [];
            let lastKey;
            do {
                const result = await client.send(new QueryCommand({
                    TableName: this.tableName,
                    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
                    ExpressionAttributeValues: { ':pk': pk, ':prefix': 'SKILL#' },
                    ExclusiveStartKey: lastKey,
                }));
                allItems.push(...(result.Items ?? []));
                lastKey = result.LastEvaluatedKey;
            } while (lastKey);
            this.skills = allItems.map(({ pk: _pk, sk: _sk, ...rest }) => rest);
            this.loaded = true;
            core.info(`📝 Loaded ${this.skills.length} skill(s) from DynamoDB (${this.tableName}) for ${this.owner}/${this.repo}`);
        }
        catch (err) {
            core.warning(`DynamoDB skill load failed for ${this.owner}/${this.repo} in ${this.tableName}: ${err}`);
            core.warning('Continuing with an empty in-memory skill cache for this run to avoid retry loops and preserve any new skills saved later in the run.');
            this.loaded = true;
        }
        return this.skills;
    }
    async save(skill) {
        if (!this.loaded)
            await this.load();
        this.skills.push(skill);
        try {
            const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
            const client = await this.getDocClient();
            const pk = `REPO#${this.owner}/${this.repo}`;
            const sk = `SKILL#${skill.id}`;
            await client.send(new PutCommand({
                TableName: this.tableName,
                Item: { pk, sk, ...skill },
            }));
            core.info(`📝 Saved skill ${skill.id} to DynamoDB (${this.skills.length} total)`);
        }
        catch (err) {
            this.skills.pop();
            core.warning(`DynamoDB skill save failed: ${err}`);
        }
    }
    async recordOutcome(skillId, success) {
        if (!this.loaded)
            await this.load();
        const skill = this.skills.find((s) => s.id === skillId);
        if (!skill) {
            core.warning(`Skill ${skillId} not found in DynamoDB in-memory cache for ${this.owner}/${this.repo} — skipping outcome write`);
            return;
        }
        const now = new Date().toISOString();
        try {
            const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
            const client = await this.getDocClient();
            const counterField = success ? 'successCount' : 'failCount';
            const result = await client.send(new UpdateCommand({
                TableName: this.tableName,
                Key: { pk: `REPO#${this.owner}/${this.repo}`, sk: `SKILL#${skillId}` },
                UpdateExpression: `ADD ${counterField} :inc SET lastUsedAt = :lu`,
                ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
                ExpressionAttributeValues: {
                    ':inc': 1,
                    ':lu': now,
                },
                ReturnValues: 'ALL_NEW',
            }));
            const attributes = result.Attributes;
            skill.successCount = attributes?.successCount ?? skill.successCount ?? 0;
            skill.failCount = attributes?.failCount ?? skill.failCount ?? 0;
            skill.lastUsedAt = attributes?.lastUsedAt ?? now;
            skill.retired = attributes?.retired ?? skill.retired ?? false;
            const totalAttempts = (skill.successCount || 0) + (skill.failCount || 0);
            const failRate = totalAttempts > 0 ? (skill.failCount || 0) / totalAttempts : 0;
            const shouldRetire = failRate > 0.4 && (skill.failCount || 0) >= 3;
            if (shouldRetire && !skill.retired) {
                await client.send(new UpdateCommand({
                    TableName: this.tableName,
                    Key: { pk: `REPO#${this.owner}/${this.repo}`, sk: `SKILL#${skillId}` },
                    UpdateExpression: 'SET retired = :r',
                    ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
                    ExpressionAttributeValues: {
                        ':r': true,
                    },
                }));
                skill.retired = true;
                core.warning(`⚠️ Skill ${skillId} retired — ${Math.round(failRate * 100)}% failure rate`);
            }
        }
        catch (err) {
            core.warning(`DynamoDB recordOutcome failed: ${err}`);
        }
    }
    async recordClassificationOutcome(skillId, outcome) {
        if (!this.loaded)
            await this.load();
        const skill = this.skills.find((s) => s.id === skillId);
        if (!skill) {
            core.warning(`Skill ${skillId} not found in DynamoDB in-memory cache for ${this.owner}/${this.repo} — skipping classification outcome write`);
            return;
        }
        try {
            const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
            const client = await this.getDocClient();
            await client.send(new UpdateCommand({
                TableName: this.tableName,
                Key: { pk: `REPO#${this.owner}/${this.repo}`, sk: `SKILL#${skillId}` },
                UpdateExpression: 'SET classificationOutcome = :co',
                ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
                ExpressionAttributeValues: { ':co': outcome },
            }));
            skill.classificationOutcome = outcome;
        }
        catch (err) {
            core.warning(`DynamoDB recordClassificationOutcome failed: ${err}`);
        }
    }
}
exports.DynamoSkillStore = DynamoSkillStore;
//# sourceMappingURL=dynamo-skill-store.js.map