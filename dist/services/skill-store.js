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
exports.SkillStore = void 0;
exports.sanitizeForPrompt = sanitizeForPrompt;
exports.normalizeFramework = normalizeFramework;
exports.buildSkill = buildSkill;
exports.describeFixPattern = describeFixPattern;
exports.normalizeSpec = normalizeSpec;
exports.normalizeError = normalizeError;
exports.formatSkillsForPrompt = formatSkillsForPrompt;
exports.formatFailedTrajectoriesForPrompt = formatFailedTrajectoriesForPrompt;
const core = __importStar(require("@actions/core"));
const crypto = __importStar(require("crypto"));
const FLAKY_THRESHOLDS = {
    SHORT_WINDOW_DAYS: 3,
    SHORT_WINDOW_MAX: 1,
    LONG_WINDOW_DAYS: 7,
    LONG_WINDOW_MAX: 2,
};
const SKILL_TELEMETRY_PREFIX = 'skill-telemetry';
function logSkillTelemetry(role, skillIds) {
    if (skillIds.length === 0)
        return;
    try {
        core.info(`📝 ${SKILL_TELEMETRY_PREFIX} role=${role} count=${skillIds.length} ` +
            `ids=${skillIds.join(',')}`);
    }
    catch {
    }
}
function sanitizeForPrompt(input, maxLength = 2000) {
    if (input === null || input === undefined)
        return '';
    let normalized;
    if (typeof input === 'string') {
        normalized = input;
    }
    else {
        try {
            const stringified = JSON.stringify(input);
            normalized = typeof stringified === 'string' ? stringified : String(input);
        }
        catch {
            core.warning(`sanitizeForPrompt: JSON.stringify failed for typeof ${typeof input}; ` +
                `falling back to String() — any original payload content will be ` +
                `rendered as an opaque marker.`);
            normalized = String(input);
        }
    }
    if (!normalized)
        return '';
    let sanitized = normalized
        .replace(/```/g, '\u2032\u2032\u2032')
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
        failedFixEvidence: skill.failedFixEvidence,
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
class SkillStore {
    skills = [];
    loaded = false;
    region;
    tableName;
    owner;
    repo;
    _cachedClient;
    usageStats = {
        loaded: 0,
        saved: 0,
        surfacedIds: new Set(),
    };
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
            this.usageStats.loaded = this.skills.length;
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
        const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
        const client = await this.getDocClient();
        const pk = `REPO#${this.owner}/${this.repo}`;
        const sk = `SKILL#${skill.id}`;
        try {
            await client.send(new PutCommand({
                TableName: this.tableName,
                Item: { pk, sk, ...skill },
            }));
            this.usageStats.saved += 1;
        }
        catch (err) {
            this.skills = this.skills.filter((s) => s.id !== skill.id);
            core.warning(`DynamoDB skill save failed for ${this.tableName}: ${err}`);
            return false;
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
        }
        catch (err) {
            core.warning(`DynamoDB recordOutcome failed: ${err}`);
        }
    }
    async reinforceSkill(skillId, outcome) {
        if (!this.loaded)
            await this.load();
        const skill = this.skills.find((s) => s.id === skillId);
        if (!skill) {
            core.warning(`Skill ${skillId} not found in DynamoDB in-memory cache for ${this.owner}/${this.repo} — skipping reinforcement`);
            return;
        }
        const now = new Date().toISOString();
        try {
            const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
            const client = await this.getDocClient();
            const counterField = outcome.success ? 'successCount' : 'failCount';
            const values = { ':inc': 1, ':now': now };
            const setClauses = ['lastUsedAt = :now'];
            if (outcome.validatedLocally === true) {
                values[':true'] = true;
                setClauses.push('validatedLocally = :true');
                if (typeof outcome.prUrl === 'string' && outcome.prUrl.length > 0) {
                    values[':prUrl'] = outcome.prUrl;
                    setClauses.push('prUrl = :prUrl');
                }
                if (typeof outcome.confidence === 'number') {
                    values[':confidence'] = Math.max(skill.confidence ?? 0, outcome.confidence);
                    setClauses.push('confidence = :confidence');
                }
            }
            const updateExpression = `ADD ${counterField} :inc SET ${setClauses.join(', ')}`;
            const result = await client.send(new UpdateCommand({
                TableName: this.tableName,
                Key: { pk: `REPO#${this.owner}/${this.repo}`, sk: `SKILL#${skillId}` },
                UpdateExpression: updateExpression,
                ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
                ExpressionAttributeValues: values,
                ReturnValues: 'ALL_NEW',
            }));
            const attributes = result.Attributes;
            skill.successCount = attributes?.successCount ?? skill.successCount ?? 0;
            skill.failCount = attributes?.failCount ?? skill.failCount ?? 0;
            skill.lastUsedAt = attributes?.lastUsedAt ?? now;
            skill.validatedLocally =
                attributes?.validatedLocally ?? skill.validatedLocally;
            skill.prUrl = attributes?.prUrl ?? skill.prUrl;
            skill.confidence = attributes?.confidence ?? skill.confidence;
        }
        catch (err) {
            core.warning(`DynamoDB reinforceSkill failed: ${err}`);
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
        const frameworkSkills = this.skills.filter((s) => {
            if (s.retired)
                return false;
            if (normalized === 'unknown')
                return true;
            return s.framework === normalized || s.framework === 'unknown';
        });
        if (frameworkSkills.length === 0)
            return [];
        const querySpec = normalizeSpec(opts.spec);
        const scored = frameworkSkills.map((skill) => {
            let score = 0;
            if (querySpec && normalizeSpec(skill.spec) === querySpec)
                score += 10;
            if (opts.errorMessage) {
                score += errorSimilarity(skill.errorPattern, normalizeError(opts.errorMessage)) * 5;
            }
            return { skill, score };
        });
        const result = scored
            .filter((s) => s.score > 0)
            .sort((a, b) => {
            const scoreDiff = b.score - a.score;
            if (scoreDiff !== 0)
                return scoreDiff;
            return compareSkillRecency(a.skill, b.skill);
        })
            .slice(0, limit)
            .map((s) => s.skill);
        for (const s of result)
            this.usageStats.surfacedIds.add(s.id);
        return result;
    }
    findRelevantForInvestigation(opts) {
        return this.findRelevant(opts).filter((s) => s.isSeed === true || s.validatedLocally === true);
    }
    findFailedTrajectories(opts) {
        const limit = opts.limit ?? 3;
        return this.findRelevant({ ...opts, limit: limit * 2 })
            .filter((s) => !s.isSeed &&
            s.validatedLocally !== true &&
            (s.failCount ?? 0) > 0)
            .slice(0, limit);
    }
    findForClassifier(opts) {
        const normalized = normalizeFramework(opts.framework);
        const candidates = this.skills.filter((s) => {
            if (s.retired || s.validatedLocally !== true)
                return false;
            if (normalized === 'unknown')
                return true;
            return s.framework === normalized || s.framework === 'unknown';
        });
        if (candidates.length === 0)
            return [];
        const now = Date.now();
        const SEVEN_DAYS = 7 * 86_400_000;
        const querySpec = normalizeSpec(opts.spec);
        const scored = candidates.map((skill) => {
            let score = 0;
            if (querySpec && normalizeSpec(skill.spec) === querySpec)
                score += 15;
            if (opts.errorMessage) {
                score +=
                    errorSimilarity(skill.errorPattern, normalizeError(opts.errorMessage)) * 5;
            }
            if (now - parseSkillTimestamp(skill.lastUsedAt) < SEVEN_DAYS)
                score += 3;
            return { skill, score };
        });
        const result = scored
            .filter((s) => s.score > 0)
            .sort((a, b) => {
            const scoreDiff = b.score - a.score;
            if (scoreDiff !== 0)
                return scoreDiff;
            return compareSkillRecency(a.skill, b.skill);
        })
            .slice(0, 3)
            .map((s) => s.skill);
        for (const s of result)
            this.usageStats.surfacedIds.add(s.id);
        return result;
    }
    findNonFixableMatch(opts) {
        const NON_FIXABLE_SIMILARITY_THRESHOLD = 0.3;
        const normalized = normalizeFramework(opts.framework);
        const querySpec = normalizeSpec(opts.spec);
        const queryError = normalizeError(opts.errorMessage);
        const candidates = this.skills.filter((s) => s.nonFixable === true &&
            !s.retired &&
            (s.framework === normalized || s.framework === 'unknown') &&
            normalizeSpec(s.spec) === querySpec);
        if (candidates.length === 0)
            return undefined;
        let best;
        for (const skill of candidates) {
            const score = errorSimilarity(skill.errorPattern, queryError);
            if (score >= NON_FIXABLE_SIMILARITY_THRESHOLD && (!best || score > best.score)) {
                best = { skill, score };
            }
        }
        return best?.skill;
    }
    detectFlakiness(spec) {
        const now = Date.now();
        const querySpec = normalizeSpec(spec);
        const specSkills = this.skills.filter((s) => normalizeSpec(s.spec) === querySpec && !s.isSeed);
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
    countRecentFailedTrajectories(spec, windowMs) {
        const now = Date.now();
        const querySpec = normalizeSpec(spec);
        if (!querySpec)
            return 0;
        return this.skills.filter((s) => !s.isSeed &&
            !s.retired &&
            s.validatedLocally === false &&
            normalizeSpec(s.spec) === querySpec &&
            now - parseSkillTimestamp(s.createdAt) < windowMs).length;
    }
    findRecentFailedFingerprints(spec, windowMs) {
        const now = Date.now();
        const querySpec = normalizeSpec(spec);
        if (!querySpec)
            return [];
        return this.skills
            .filter((s) => !s.isSeed &&
            !s.retired &&
            s.validatedLocally === false &&
            !!s.fixFingerprint &&
            normalizeSpec(s.spec) === querySpec &&
            now - parseSkillTimestamp(s.createdAt) < windowMs)
            .map((s) => s.fixFingerprint);
    }
    findReinforcementTarget(opts) {
        if (!opts.fixFingerprint)
            return undefined;
        const querySpec = normalizeSpec(opts.spec);
        const matches = this.skills.filter((s) => !s.retired &&
            !s.isSeed &&
            s.fixFingerprint === opts.fixFingerprint &&
            normalizeSpec(s.spec) === querySpec);
        if (matches.length === 0)
            return undefined;
        if (matches.length === 1)
            return matches[0];
        const testNameMatches = matches.filter((s) => s.testName === opts.testName);
        const pool = testNameMatches.length > 0 ? testNameMatches : matches;
        return [...pool].sort(compareSkillRecency)[0];
    }
    countForSpec(spec) {
        const querySpec = normalizeSpec(spec);
        return this.skills.filter((s) => normalizeSpec(s.spec) === querySpec && !s.retired).length;
    }
    getUsageStats() {
        return {
            loaded: this.usageStats.loaded,
            surfaced: this.usageStats.surfacedIds.size,
            saved: this.usageStats.saved,
        };
    }
    logRunSummary() {
        try {
            const stats = this.getUsageStats();
            core.info(`📊 skill-telemetry-summary loaded=${stats.loaded} ` +
                `surfaced=${stats.surfaced} saved=${stats.saved}`);
        }
        catch {
        }
    }
    formatSkillsForClassifierContext(relevant) {
        if (relevant.length === 0)
            return '';
        logSkillTelemetry('classifier', relevant.map((s) => s.id));
        return relevant
            .map((s, i) => {
            const lines = [
                `${i + 1}. errorPattern: ${sanitizeForPrompt(s.errorPattern)}`,
                `   rootCauseCategory: ${sanitizeForPrompt(s.rootCauseCategory)}`,
                `   fix: ${sanitizeForPrompt(s.fix.summary)}`,
                `   confidence: ${s.confidence}%`,
            ];
            if (s.isSeed) {
                lines.push('   source: curated seed skill (operator-provided guidance, not runtime outcome evidence)');
            }
            if (s.nonFixable === true) {
                lines.push('   nonFixable: true — this failure mode cannot be repaired by editing code in this repo (exhausted test data, admin-only remediation, or similar). When the current error matches this pattern, the coordinator skips repair and surfaces manual-intervention guidance. Treat the matching test failure as a TEST_ISSUE that needs human action, not a code fix.');
            }
            if (!s.isSeed &&
                (s.classificationOutcome === 'correct' ||
                    s.classificationOutcome === 'incorrect')) {
                lines.push(`   classificationOutcome: ${s.classificationOutcome}`);
            }
            return lines.join('\n');
        })
            .join('\n');
    }
    formatForClassifier(opts) {
        return this.formatSkillsForClassifierContext(this.findForClassifier(opts));
    }
    formatForInvestigation(opts) {
        const relevant = this.findRelevantForInvestigation({
            framework: opts.framework,
            spec: opts.spec,
            errorMessage: opts.errorMessage,
        }).filter(s => s.investigationFindings);
        if (relevant.length === 0)
            return '';
        const rendered = relevant.slice(0, 3);
        logSkillTelemetry('investigation', rendered.map((s) => s.id));
        return rendered
            .map((s, i) => {
            const date = s.createdAt.split('T')[0];
            const outcome = s.classificationOutcome ?? 'unknown';
            let entry = `${i + 1}. Prior investigation for ${sanitizeForPrompt(s.spec)} (${date}):`;
            if (s.isSeed) {
                entry += '\n   Source: curated seed skill (operator-provided guidance, not runtime outcome evidence)';
            }
            entry += `\n   Finding: ${sanitizeForPrompt(s.investigationFindings)}`;
            if (s.rootCauseChain) {
                entry += `\n   Root cause: ${sanitizeForPrompt(s.rootCauseChain)}`;
            }
            entry += s.isSeed
                ? '\n   Outcome: curated seed'
                : `\n   Outcome: ${outcome}`;
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
        spec: normalizeSpec(params.spec),
        testName: params.testName,
        framework: normalizeFramework(params.framework),
        errorPattern: normalizeError(params.errorMessage),
        rootCauseCategory: params.rootCauseCategory,
        fix: params.fix,
        ...(params.fixFingerprint ? { fixFingerprint: params.fixFingerprint } : {}),
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
        ...(params.failureModeTrace ? { failureModeTrace: params.failureModeTrace } : {}),
        ...(params.failedFixEvidence ? { failedFixEvidence: params.failedFixEvidence } : {}),
        ...(params.nonFixable === true ? { nonFixable: true } : {}),
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
function normalizeSpec(raw) {
    if (!raw)
        return raw ?? '';
    const linuxMatch = raw.match(/^\/home\/runner\/work\/[^/]+\/[^/]+\/(.+)$/);
    if (linuxMatch)
        return linuxMatch[1];
    const winMatch = raw.match(/^[A-Za-z]:[\\/]a[\\/][^\\/]+[\\/][^\\/]+[\\/](.+)$/);
    if (winMatch)
        return winMatch[1].replace(/\\/g, '/');
    if (raw.startsWith('./'))
        return raw.slice(2);
    return raw;
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
    if (skills.length > 0) {
        logSkillTelemetry(role, skills.map((s) => s.id));
    }
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
            'The following patterns were applied in prior runs. Not all were validated — use them as context, not guarantees. Where a pattern is from a validated (successful) fix, that is noted on the skill. Where it is from a failed attempt, treat it as "what did NOT work" rather than a template to follow.',
            'CONSIDER validated approaches as starting points. If you see a better approach, explain why and use it instead.',
            'When a prior **validated** fix includes a causal trace, use it as a reasoning template — the trace shows how that successful fix diagnosed the failure (originalState → rootMechanism → newStateAfterFix → whyAssertionPassesNow). Traces from unvalidated/failed attempts are NOT shown, to avoid anchoring on reasoning that did not work. Your own failureModeTrace does NOT need to copy the prior one; it should reflect the CURRENT failure\'s concrete values.',
        ].join('\n'),
        review: [
            '### Agent Memory: Prior Fixes',
            '',
            'Check if the proposed fix aligns with patterns that have worked before. Each skill includes a track record ("X/Y successful") indicating whether the pattern has been validated. Traces shown in this memory come only from validated fixes.',
            'Flag if the fix contradicts a prior validated pattern without justification.',
            'When a prior **validated** fix includes a causal trace, compare the CURRENT fix\'s failureModeTrace to it. A new trace that is markedly weaker than the validated prior trace for the same kind of failure is a WARNING signal — the current fix may not have reasoned as rigorously as the validated predecessor.',
        ].join('\n'),
    };
    const includeTrace = role === 'fix_generation' || role === 'review';
    const TRACE_FIELD_MAX = 200;
    const renderTraceField = (field) => {
        if (!field)
            return '(empty)';
        return sanitizeForPrompt(field, TRACE_FIELD_MAX);
    };
    const entries = skills.map((s, i) => {
        const successes = s.successCount ?? 0;
        const failures = s.failCount ?? 0;
        const total = successes + failures;
        let trackRecord;
        if (s.isSeed) {
            trackRecord = 'curated seed, not runtime outcome evidence';
        }
        else if (total > 0) {
            trackRecord = `${successes}/${total} successful`;
        }
        else if (s.validatedLocally === true) {
            trackRecord = 'validated on save, no runtime track record yet';
        }
        else {
            trackRecord = 'untested';
        }
        const outcome = !s.isSeed && s.classificationOutcome && s.classificationOutcome !== 'unknown'
            ? `, classification: ${s.classificationOutcome}`
            : '';
        const lines = [
            `**Fix ${i + 1}** (${s.createdAt.split('T')[0]}, ${s.confidence}% confidence, ${s.iterations} iteration${s.iterations !== 1 ? 's' : ''})`,
            `- Spec: ${sanitizeForPrompt(s.spec)}`,
        ];
        if (s.isSeed) {
            lines.push('- Source: curated seed skill (operator-provided guidance, not runtime validation)');
        }
        if (s.testName && s.testName.trim()) {
            lines.push(`- Test: ${sanitizeForPrompt(s.testName)}`);
        }
        lines.push(`- Error: ${sanitizeForPrompt(s.errorPattern)}`, `- Root cause: ${sanitizeForPrompt(s.rootCauseCategory)}`, `- Pattern: ${sanitizeForPrompt(s.fix.pattern)}`, `- Change type: ${sanitizeForPrompt(s.fix.changeType)} in ${sanitizeForPrompt(s.fix.file)}`, `- Track record: ${trackRecord}${outcome}`);
        const shouldRenderPrUrl = (role === 'fix_generation' || role === 'review') &&
            s.prUrl &&
            s.prUrl.trim();
        if (shouldRenderPrUrl) {
            lines.push(`- Shipped as: ${sanitizeForPrompt(s.prUrl)} (prior validated fix landed as this PR — strong trust signal)`);
        }
        if ((role === 'fix_generation' || role === 'review') && s.failedFixEvidence) {
            const failed = s.failedFixEvidence;
            lines.push('- Prior failed validation (do not repeat as a proven pattern):', `  - originalFailure: ${sanitizeForPrompt(failed.originalFailureSignature, 200)}`, `  - validationFailure: ${sanitizeForPrompt(failed.validationFailureSignature, 200)}`, `  - failureStage: ${sanitizeForPrompt(failed.failureStage, 80)}`, `  - changedFailureSignature: ${failed.changedFailureSignature}`);
            if (failed.failedAssertion) {
                lines.push(`  - failedAssertion: ${sanitizeForPrompt(failed.failedAssertion, 200)}`);
            }
            if (failed.reasonTheFixWasWrong) {
                lines.push(`  - whyItFailed: ${sanitizeForPrompt(failed.reasonTheFixWasWrong, 200)}`);
            }
        }
        const runtimeContradicts = total >= 3 && successes === 0;
        const isValidated = !runtimeContradicts &&
            (s.validatedLocally === true || successes > 0);
        if (includeTrace && s.failureModeTrace && isValidated) {
            const t = s.failureModeTrace;
            lines.push('- Prior causal trace (from a validated fix — use as reasoning template):', `  - originalState: ${renderTraceField(t.originalState)}`, `  - rootMechanism: ${renderTraceField(t.rootMechanism)}`, `  - newStateAfterFix: ${renderTraceField(t.newStateAfterFix)}`, `  - whyAssertionPassesNow: ${renderTraceField(t.whyAssertionPassesNow)}`);
        }
        return lines.join('\n');
    });
    const parts = [headers[role], '', ...entries];
    if (flakiness?.isFlaky) {
        parts.push('', `⚠️ FLAKINESS SIGNAL: ${flakiness.message}`);
    }
    return parts.join('\n');
}
function formatFailedTrajectoriesForPrompt(skills) {
    if (skills.length === 0)
        return '';
    logSkillTelemetry('failed_trajectory', skills.map((s) => s.id));
    const lines = skills.map((s, i) => {
        const failures = s.failCount ?? 0;
        const total = failures + (s.successCount ?? 0);
        return [
            `${i + 1}. Failed trajectory (${total > 0 ? `${failures}/${total} failed` : 'unvalidated'}) on ${sanitizeForPrompt(s.spec)}`,
            `   Error pattern: ${sanitizeForPrompt(s.errorPattern)}`,
            `   Attempted pattern: ${sanitizeForPrompt(s.fix.pattern)}`,
            s.failedFixEvidence?.reasonTheFixWasWrong
                ? `   Why it failed: ${sanitizeForPrompt(s.failedFixEvidence.reasonTheFixWasWrong)}`
                : '   Why it failed: validation did not pass with this fix',
        ].join('\n');
    });
    return [
        '### Negative Evidence: Prior Failed Fix Attempts',
        '',
        'These fixes were tried and did NOT validate. Do NOT repeat them unless you can explain why they will succeed now.',
        '',
        ...lines,
    ].join('\n');
}
//# sourceMappingURL=skill-store.js.map