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
exports.SkillStore = exports.MAX_SKILLS = void 0;
exports.normalizeFramework = normalizeFramework;
exports.buildSkill = buildSkill;
exports.describeFixPattern = describeFixPattern;
exports.normalizeError = normalizeError;
exports.formatSkillsForPrompt = formatSkillsForPrompt;
const core = __importStar(require("@actions/core"));
const crypto = __importStar(require("crypto"));
exports.MAX_SKILLS = 100;
const FLAKY_THRESHOLDS = {
    SHORT_WINDOW_DAYS: 3,
    SHORT_WINDOW_MAX: 1,
    LONG_WINDOW_DAYS: 7,
    LONG_WINDOW_MAX: 2,
};
const RETIRE_FAIL_RATE = 0.4;
const RETIRE_MIN_FAILURES = 3;
function sanitizeForPrompt(input, maxLength = 2000) {
    if (!input)
        return '';
    let sanitized = input
        .replace(/## SYSTEM:/gi, '## INFO:')
        .replace(/Ignore previous/gi, '[filtered]')
        .replace(/<\/?(?:system|instruction|prompt)[^>]*>/gi, '')
        .replace(/\[INST\]|\[\/INST\]/gi, '')
        .replace(/<<SYS>>|<<\/SYS>>/gi, '');
    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength) + '... [truncated]';
    }
    return sanitized;
}
function backfillDefaults(skill) {
    return {
        ...skill,
        successCount: skill.successCount ?? 0,
        failCount: skill.failCount ?? 0,
        lastUsedAt: skill.lastUsedAt ?? skill.createdAt,
        retired: skill.retired ?? false,
        investigationFindings: skill.investigationFindings ?? '',
        classificationOutcome: skill.classificationOutcome ?? 'unknown',
        rootCauseChain: skill.rootCauseChain ?? '',
        repoContext: skill.repoContext ?? '',
    };
}
function parseSkillTimestamp(value) {
    if (!value)
        return 0;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}
function compareSkillRecency(a, b) {
    const lastUsedDiff = parseSkillTimestamp(b.lastUsedAt) - parseSkillTimestamp(a.lastUsedAt);
    if (lastUsedDiff !== 0)
        return lastUsedDiff;
    const createdDiff = parseSkillTimestamp(b.createdAt) - parseSkillTimestamp(a.createdAt);
    if (createdDiff !== 0)
        return createdDiff;
    return a.id.localeCompare(b.id);
}
function compareOldestFirst(a, b) {
    const createdDiff = parseSkillTimestamp(a.createdAt) - parseSkillTimestamp(b.createdAt);
    if (createdDiff !== 0)
        return createdDiff;
    return a.id.localeCompare(b.id);
}
function selectSkillsToPrune(skills, keepSkillId) {
    if (skills.length <= exports.MAX_SKILLS)
        return [];
    const overflowCount = skills.length - exports.MAX_SKILLS;
    return [...skills]
        .filter((skill) => skill.id !== keepSkillId)
        .sort(compareOldestFirst)
        .slice(0, overflowCount);
}
class SkillStore {
    skills = [];
    loaded = false;
    loadSucceeded = false;
    loadFailureReason;
    region;
    tableName;
    owner;
    repo;
    _cachedClient;
    constructor(region, tableName, owner, repo) {
        this.region = region;
        this.tableName = tableName;
        this.owner = owner;
        this.repo = repo;
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
            this.skills = allItems
                .map(({ pk: _pk, sk: _sk, ...rest }) => rest)
                .map(backfillDefaults);
            this.loaded = true;
            this.loadSucceeded = true;
            core.info(`📝 Loaded ${this.skills.length} skill(s) from DynamoDB (${this.tableName}) for ${this.owner}/${this.repo}`);
        }
        catch (err) {
            this.loadFailureReason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
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
        const { DeleteCommand, PutCommand } = await import('@aws-sdk/lib-dynamodb');
        const client = await this.getDocClient();
        const pk = `REPO#${this.owner}/${this.repo}`;
        const sk = `SKILL#${skill.id}`;
        try {
            await client.send(new PutCommand({
                TableName: this.tableName,
                Item: { pk, sk, ...skill },
            }));
        }
        catch (err) {
            this.skills = this.skills.filter((s) => s.id !== skill.id);
            core.warning(`DynamoDB skill save failed for ${this.tableName}: ${err}`);
            return false;
        }
        if (!this.loadSucceeded) {
            const reason = this.loadFailureReason
                ? ` (load failed: ${this.loadFailureReason})`
                : '';
            core.info(`📝 Saved skill ${skill.id} to DynamoDB (${this.tableName}); skipping prune because load was degraded${reason}`);
            return true;
        }
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
                core.info(`🧹 Pruned ${deletedSkillIds.size} old skill(s) from DynamoDB to maintain the ${exports.MAX_SKILLS}-skill cap`);
            }
        }
        core.info(`📝 Saved skill ${skill.id} to DynamoDB (${this.skills.length} total)`);
        return true;
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
            const shouldRetire = failRate > RETIRE_FAIL_RATE && (skill.failCount || 0) >= RETIRE_MIN_FAILURES;
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
    findRelevant(opts) {
        const limit = opts.limit ?? 5;
        const normalized = normalizeFramework(opts.framework);
        const frameworkSkills = this.skills.filter((s) => (s.framework === normalized || s.framework === 'unknown') && !s.retired);
        if (frameworkSkills.length === 0)
            return [];
        const scored = frameworkSkills.map((skill) => {
            let score = 0;
            if (opts.spec && skill.spec === opts.spec)
                score += 10;
            if (opts.errorMessage) {
                score += errorSimilarity(skill.errorPattern, normalizeError(opts.errorMessage)) * 5;
            }
            return { skill, score };
        });
        return scored
            .filter((s) => s.score > 0)
            .sort((a, b) => {
            const scoreDiff = b.score - a.score;
            if (scoreDiff !== 0)
                return scoreDiff;
            return compareSkillRecency(a.skill, b.skill);
        })
            .slice(0, limit)
            .map((s) => s.skill);
    }
    findForClassifier(opts) {
        const normalized = normalizeFramework(opts.framework);
        const candidates = this.skills.filter((s) => (s.framework === normalized || s.framework === 'unknown') &&
            !s.retired &&
            s.validatedLocally === true);
        if (candidates.length === 0)
            return [];
        const now = Date.now();
        const SEVEN_DAYS = 7 * 86_400_000;
        const scored = candidates.map((skill) => {
            let score = 0;
            if (opts.spec && skill.spec === opts.spec)
                score += 15;
            if (opts.errorMessage) {
                score +=
                    errorSimilarity(skill.errorPattern, normalizeError(opts.errorMessage)) * 5;
            }
            if (now - parseSkillTimestamp(skill.lastUsedAt) < SEVEN_DAYS)
                score += 3;
            return { skill, score };
        });
        return scored
            .filter((s) => s.score > 0)
            .sort((a, b) => {
            const scoreDiff = b.score - a.score;
            if (scoreDiff !== 0)
                return scoreDiff;
            return compareSkillRecency(a.skill, b.skill);
        })
            .slice(0, 3)
            .map((s) => s.skill);
    }
    detectFlakiness(spec) {
        const now = Date.now();
        const specSkills = this.skills.filter((s) => s.spec === spec);
        const inShortWindow = specSkills.filter((s) => now - parseSkillTimestamp(s.createdAt) < FLAKY_THRESHOLDS.SHORT_WINDOW_DAYS * 86_400_000);
        const inLongWindow = specSkills.filter((s) => now - parseSkillTimestamp(s.createdAt) < FLAKY_THRESHOLDS.LONG_WINDOW_DAYS * 86_400_000);
        if (inShortWindow.length > FLAKY_THRESHOLDS.SHORT_WINDOW_MAX) {
            return {
                isFlaky: true,
                fixCount: inShortWindow.length,
                windowDays: FLAKY_THRESHOLDS.SHORT_WINDOW_DAYS,
                message: `This spec has been auto-fixed ${inShortWindow.length} times in ${FLAKY_THRESHOLDS.SHORT_WINDOW_DAYS} days — likely chronically flaky.`,
            };
        }
        if (inLongWindow.length > FLAKY_THRESHOLDS.LONG_WINDOW_MAX) {
            return {
                isFlaky: true,
                fixCount: inLongWindow.length,
                windowDays: FLAKY_THRESHOLDS.LONG_WINDOW_DAYS,
                message: `This spec has been auto-fixed ${inLongWindow.length} times in ${FLAKY_THRESHOLDS.LONG_WINDOW_DAYS} days — recurring instability.`,
            };
        }
        return {
            isFlaky: false,
            fixCount: specSkills.length,
            windowDays: FLAKY_THRESHOLDS.LONG_WINDOW_DAYS,
            message: '',
        };
    }
    countForSpec(spec) {
        return this.skills.filter((s) => s.spec === spec).length;
    }
    formatForClassifier(opts) {
        const relevant = this.findForClassifier(opts);
        if (relevant.length === 0)
            return '';
        return relevant
            .map((s, i) => `${i + 1}. errorPattern: ${sanitizeForPrompt(s.errorPattern)}\n` +
            `   rootCauseCategory: ${sanitizeForPrompt(s.rootCauseCategory)}\n` +
            `   fix: ${sanitizeForPrompt(s.fix.summary)}\n` +
            `   confidence: ${s.confidence}%`)
            .join('\n');
    }
    formatForInvestigation(opts) {
        const relevant = this.findRelevant({
            framework: opts.framework,
            spec: opts.spec,
            errorMessage: opts.errorMessage,
        }).filter(s => s.investigationFindings);
        if (relevant.length === 0)
            return '';
        return relevant
            .slice(0, 3)
            .map((s, i) => {
            const date = s.createdAt.split('T')[0];
            const outcome = s.classificationOutcome ?? 'unknown';
            let entry = `${i + 1}. Prior investigation for ${sanitizeForPrompt(s.spec)} (${date}):`;
            entry += `\n   Finding: ${sanitizeForPrompt(s.investigationFindings)}`;
            if (s.rootCauseChain) {
                entry += `\n   Root cause: ${sanitizeForPrompt(s.rootCauseChain)}`;
            }
            entry += `\n   Outcome: ${outcome}`;
            if (s.repoContext) {
                entry += `\n   Repo note: ${sanitizeForPrompt(s.repoContext)}`;
            }
            return entry;
        })
            .join('\n');
    }
}
exports.SkillStore = SkillStore;
function normalizeFramework(raw) {
    switch (raw?.toLowerCase()) {
        case 'cypress':
            return 'cypress';
        case 'webdriverio':
            return 'webdriverio';
        default:
            return 'unknown';
    }
}
function buildSkill(params) {
    return {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        repo: params.repo,
        spec: params.spec,
        testName: params.testName,
        framework: normalizeFramework(params.framework),
        errorPattern: normalizeError(params.errorMessage),
        rootCauseCategory: params.rootCauseCategory,
        fix: params.fix,
        confidence: params.confidence,
        iterations: params.iterations,
        prUrl: params.prUrl,
        validatedLocally: params.validatedLocally,
        priorSkillCount: params.priorSkillCount,
        successCount: 0,
        failCount: 0,
        lastUsedAt: new Date().toISOString(),
        retired: false,
        investigationFindings: params.investigationFindings ?? '',
        classificationOutcome: 'unknown',
        rootCauseChain: params.rootCauseChain ?? '',
        repoContext: params.repoContext ?? '',
    };
}
function describeFixPattern(changes) {
    return changes
        .map((c) => {
        const prefix = c.changeType ? `[${c.changeType}] ` : '';
        return `${prefix}${c.justification || `Modified ${c.file}`}`;
    })
        .join('; ');
}
function normalizeError(msg) {
    return msg
        .replace(/after \d+ms/g, 'after {timeout}ms')
        .replace(/:\d+:\d+/g, ':{line}:{col}')
        .replace(/\b[0-9a-f]{7,40}\b/g, '{sha}')
        .replace(/\d{4}-\d{2}-\d{2}T[\d:.Z]+/g, '{timestamp}')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
}
function errorSimilarity(a, b) {
    const tokensA = new Set(a.toLowerCase().split(/\s+/));
    const tokensB = new Set(b.toLowerCase().split(/\s+/));
    if (tokensA.size === 0 || tokensB.size === 0)
        return 0;
    let intersection = 0;
    for (const t of tokensA) {
        if (tokensB.has(t))
            intersection++;
    }
    const union = tokensA.size + tokensB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}
function formatSkillsForPrompt(skills, role, flakiness) {
    if (skills.length === 0 && !flakiness?.isFlaky)
        return '';
    const headers = {
        investigation: [
            '### Agent Memory: Prior Fixes for This Spec',
            '',
            'These patterns have been applied before. Use them as background context.',
            'Your findings should be based on the CURRENT evidence — do NOT anchor on prior patterns.',
            'If your findings match a prior pattern, note that. If they differ, explain why.',
        ].join('\n'),
        fix_generation: [
            '### Agent Memory: Prior Fix Patterns',
            '',
            'The following patterns were applied in prior runs. Not all were validated — use them as context, not guarantees.',
            'CONSIDER these approaches as starting points. If you see a better approach, explain why and use it instead.',
        ].join('\n'),
        review: [
            '### Agent Memory: Prior Successful Fixes',
            '',
            'Check if the proposed fix aligns with patterns that have worked before.',
            'Flag if the fix contradicts a prior pattern without justification.',
        ].join('\n'),
    };
    const entries = skills.map((s, i) => {
        const successes = s.successCount ?? 0;
        const failures = s.failCount ?? 0;
        const total = successes + failures;
        const trackRecord = total > 0 ? `${successes}/${total} successful` : 'untested';
        const outcome = s.classificationOutcome && s.classificationOutcome !== 'unknown'
            ? `, classification: ${s.classificationOutcome}`
            : '';
        return [
            `**Fix ${i + 1}** (${s.createdAt.split('T')[0]}, ${s.confidence}% confidence, ${s.iterations} iteration${s.iterations !== 1 ? 's' : ''})`,
            `- Spec: ${sanitizeForPrompt(s.spec)}`,
            `- Error: ${sanitizeForPrompt(s.errorPattern)}`,
            `- Root cause: ${sanitizeForPrompt(s.rootCauseCategory)}`,
            `- Pattern: ${sanitizeForPrompt(s.fix.pattern)}`,
            `- Change type: ${sanitizeForPrompt(s.fix.changeType)} in ${sanitizeForPrompt(s.fix.file)}`,
            `- Track record: ${trackRecord}${outcome}`,
        ].join('\n');
    });
    const parts = [headers[role], '', ...entries];
    if (flakiness?.isFlaky) {
        parts.push('', `⚠️ FLAKINESS SIGNAL: ${flakiness.message}`);
    }
    return parts.join('\n');
}
//# sourceMappingURL=skill-store.js.map