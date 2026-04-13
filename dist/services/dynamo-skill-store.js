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
    accessKeyId;
    secretAccessKey;
    constructor(region, tableName, owner, repo, accessKeyId, secretAccessKey) {
        const dummyOctokit = new rest_1.Octokit();
        super(dummyOctokit, owner, repo);
        this.region = region;
        this.tableName = tableName;
        this.accessKeyId = accessKeyId;
        this.secretAccessKey = secretAccessKey;
    }
    async getDocClient() {
        const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
        const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
        const raw = new DynamoDBClient({
            region: this.region,
            credentials: {
                accessKeyId: this.accessKeyId,
                secretAccessKey: this.secretAccessKey,
            },
        });
        return DynamoDBDocumentClient.from(raw, {
            marshallOptions: { removeUndefinedValues: true },
        });
    }
    async load() {
        if (this.loaded)
            return this.skills;
        try {
            const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
            const client = await this.getDocClient();
            const pk = `REPO#${this.owner}/${this.repo}`;
            const result = await client.send(new QueryCommand({
                TableName: this.tableName,
                KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
                ExpressionAttributeValues: { ':pk': pk, ':prefix': 'SKILL#' },
            }));
            this.skills = (result.Items ?? []).map(({ pk: _pk, sk: _sk, ...rest }) => rest);
            this.loaded = true;
            core.info(`📝 Loaded ${this.skills.length} skill(s) from DynamoDB (${this.tableName}) for ${this.owner}/${this.repo}`);
        }
        catch (err) {
            core.warning(`DynamoDB skill load failed: ${err}`);
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
    async recordClassificationOutcome(skillId, outcome) {
        const skill = this.skills.find((s) => s.id === skillId);
        if (!skill)
            return;
        if (outcome === 'correct') {
            skill.successCount = (skill.successCount ?? 0) + 1;
        }
        else {
            skill.failCount = (skill.failCount ?? 0) + 1;
        }
        skill.classificationOutcome = outcome;
        try {
            const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
            const client = await this.getDocClient();
            const pk = `REPO#${this.owner}/${this.repo}`;
            const sk = `SKILL#${skillId}`;
            await client.send(new UpdateCommand({
                TableName: this.tableName,
                Key: { pk, sk },
                UpdateExpression: 'SET successCount = :sc, failCount = :fc, classificationOutcome = :co',
                ExpressionAttributeValues: {
                    ':sc': skill.successCount,
                    ':fc': skill.failCount,
                    ':co': outcome,
                },
            }));
        }
        catch (err) {
            core.warning(`DynamoDB recordClassificationOutcome failed: ${err}`);
        }
    }
}
exports.DynamoSkillStore = DynamoSkillStore;
//# sourceMappingURL=dynamo-skill-store.js.map