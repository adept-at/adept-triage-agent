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
class DynamoSkillStore extends skill_store_js_1.SkillStore {
    region;
    tableName;
    accessKeyId;
    secretAccessKey;
    _cachedClient;
    constructor(region, tableName, owner, repo, accessKeyId, secretAccessKey) {
        const dummyOctokit = new rest_1.Octokit();
        super(dummyOctokit, owner, repo);
        this.region = region;
        this.tableName = tableName;
        this.accessKeyId = accessKeyId;
        this.secretAccessKey = secretAccessKey;
    }
    async getDocClient() {
        if (this._cachedClient)
            return this._cachedClient;
        const { DynamoDBClient } = await __webpack_require__.e(/* import() */ 305).then(__webpack_require__.t.bind(__webpack_require__, 64305, 23));
        const { DynamoDBDocumentClient } = await Promise.all(/* import() */[__webpack_require__.e(305), __webpack_require__.e(907)]).then(__webpack_require__.t.bind(__webpack_require__, 58907, 19));
        const clientConfig = { region: this.region };
        if (this.accessKeyId && this.secretAccessKey) {
            clientConfig.credentials = {
                accessKeyId: this.accessKeyId,
                secretAccessKey: this.secretAccessKey,
            };
        }
        const raw = new DynamoDBClient(clientConfig);
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
            this.skills = allItems.map(({ pk: _pk, sk: _sk, ...rest }) => rest);
            this.loaded = true;
            core.info(`📝 Loaded ${this.skills.length} skill(s) from DynamoDB (${this.tableName}) for ${this.owner}/${this.repo}`);
        }
        catch (err) {
            core.warning(`DynamoDB skill load failed: ${err}`);
            this.loaded = true;
        }
        return this.skills;
    }
    async save(skill) {
        if (!this.loaded)
            await this.load();
        this.skills.push(skill);
        try {
            const { PutCommand } = await Promise.all(/* import() */[__webpack_require__.e(305), __webpack_require__.e(907)]).then(__webpack_require__.t.bind(__webpack_require__, 58907, 19));
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
        if (!skill)
            return;
        if (success) {
            skill.successCount = (skill.successCount ?? 0) + 1;
        }
        else {
            skill.failCount = (skill.failCount ?? 0) + 1;
        }
        skill.lastUsedAt = new Date().toISOString();
        const totalAttempts = (skill.successCount || 0) + (skill.failCount || 0);
        const failRate = totalAttempts > 0 ? (skill.failCount || 0) / totalAttempts : 0;
        if (failRate > 0.4 && (skill.failCount || 0) >= 3) {
            skill.retired = true;
            core.warning(`⚠️ Skill ${skillId} retired — ${Math.round(failRate * 100)}% failure rate`);
        }
        try {
            const { UpdateCommand } = await Promise.all(/* import() */[__webpack_require__.e(305), __webpack_require__.e(907)]).then(__webpack_require__.t.bind(__webpack_require__, 58907, 19));
            const client = await this.getDocClient();
            await client.send(new UpdateCommand({
                TableName: this.tableName,
                Key: { pk: `REPO#${this.owner}/${this.repo}`, sk: `SKILL#${skillId}` },
                UpdateExpression: 'SET successCount = :sc, failCount = :fc, lastUsedAt = :lu, retired = :r',
                ExpressionAttributeValues: {
                    ':sc': skill.successCount,
                    ':fc': skill.failCount,
                    ':lu': skill.lastUsedAt,
                    ':r': skill.retired,
                },
            }));
        }
        catch (err) {
            core.warning(`DynamoDB recordOutcome failed: ${err}`);
        }
    }
    async recordClassificationOutcome(skillId, outcome) {
        if (!this.loaded)
            await this.load();
        const skill = this.skills.find((s) => s.id === skillId);
        if (!skill)
            return;
        skill.classificationOutcome = outcome;
        try {
            const { UpdateCommand } = await Promise.all(/* import() */[__webpack_require__.e(305), __webpack_require__.e(907)]).then(__webpack_require__.t.bind(__webpack_require__, 58907, 19));
            const client = await this.getDocClient();
            await client.send(new UpdateCommand({
                TableName: this.tableName,
                Key: { pk: `REPO#${this.owner}/${this.repo}`, sk: `SKILL#${skillId}` },
                UpdateExpression: 'SET classificationOutcome = :co',
                ExpressionAttributeValues: { ':co': outcome },
            }));
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