"use strict";
exports.id = 442;
exports.ids = [442];
exports.modules = {

/***/ 61442:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


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
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DynamoSkillStore = void 0;
const core = __importStar(__webpack_require__(37484));
const skill_store_js_1 = __webpack_require__(60215);
const rest_1 = __webpack_require__(65772);
function parseRetentionTimestamp(value) {
    if (!value)
        return 0;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}
function compareOldestFirst(a, b) {
    const createdDiff = parseRetentionTimestamp(a.createdAt) - parseRetentionTimestamp(b.createdAt);
    if (createdDiff !== 0)
        return createdDiff;
    return a.id.localeCompare(b.id);
}
function selectSkillsToPrune(skills, keepSkillId) {
    if (skills.length <= skill_store_js_1.MAX_SKILLS)
        return [];
    const overflowCount = skills.length - skill_store_js_1.MAX_SKILLS;
    return [...skills]
        .filter((skill) => skill.id !== keepSkillId)
        .sort(compareOldestFirst)
        .slice(0, overflowCount);
}
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
        const { DynamoDBClient } = await __webpack_require__.e(/* import() */ 305).then(__webpack_require__.t.bind(__webpack_require__, 64305, 23));
        const { DynamoDBDocumentClient } = await Promise.all(/* import() */[__webpack_require__.e(305), __webpack_require__.e(907)]).then(__webpack_require__.t.bind(__webpack_require__, 58907, 19));
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
            const { QueryCommand } = await Promise.all(/* import() */[__webpack_require__.e(305), __webpack_require__.e(907)]).then(__webpack_require__.t.bind(__webpack_require__, 58907, 19));
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
            this.skills = this.hydrateLoadedSkills(allItems.map(({ pk: _pk, sk: _sk, ...rest }) => rest));
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
            const { DeleteCommand, PutCommand } = await Promise.all(/* import() */[__webpack_require__.e(305), __webpack_require__.e(907)]).then(__webpack_require__.t.bind(__webpack_require__, 58907, 19));
            const client = await this.getDocClient();
            const pk = `REPO#${this.owner}/${this.repo}`;
            const sk = `SKILL#${skill.id}`;
            await client.send(new PutCommand({
                TableName: this.tableName,
                Item: { pk, sk, ...skill },
            }));
            const pruneCandidates = selectSkillsToPrune(this.skills, skill.id);
            if (pruneCandidates.length > 0) {
                const deletedSkillIds = new Set();
                for (const candidate of pruneCandidates) {
                    try {
                        await client.send(new DeleteCommand({
                            TableName: this.tableName,
                            Key: { pk, sk: `SKILL#${candidate.id}` },
                            ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
                        }));
                        deletedSkillIds.add(candidate.id);
                    }
                    catch (deleteErr) {
                        core.warning(`Failed to prune DynamoDB skill ${candidate.id}: ${deleteErr}`);
                    }
                }
                if (deletedSkillIds.size > 0) {
                    this.skills = this.skills.filter((entry) => !deletedSkillIds.has(entry.id));
                    core.info(`🧹 Pruned ${deletedSkillIds.size} old skill(s) from DynamoDB to maintain the ${skill_store_js_1.MAX_SKILLS}-skill cap`);
                }
            }
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
            const { UpdateCommand } = await Promise.all(/* import() */[__webpack_require__.e(305), __webpack_require__.e(907)]).then(__webpack_require__.t.bind(__webpack_require__, 58907, 19));
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
            const { UpdateCommand } = await Promise.all(/* import() */[__webpack_require__.e(305), __webpack_require__.e(907)]).then(__webpack_require__.t.bind(__webpack_require__, 58907, 19));
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

/***/ })

};
;
//# sourceMappingURL=442.index.js.map