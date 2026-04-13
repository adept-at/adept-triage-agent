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
exports.normalizeFramework = normalizeFramework;
exports.buildSkill = buildSkill;
exports.describeFixPattern = describeFixPattern;
exports.normalizeError = normalizeError;
exports.formatSkillsForPrompt = formatSkillsForPrompt;
const core = __importStar(require("@actions/core"));
const crypto = __importStar(require("crypto"));
const SKILLS_BRANCH = 'triage-data';
const SKILLS_FILE = 'skills.json';
const MAX_SKILLS = 100;
const FLAKY_THRESHOLDS = {
    SHORT_WINDOW_DAYS: 3,
    SHORT_WINDOW_MAX: 1,
    LONG_WINDOW_DAYS: 7,
    LONG_WINDOW_MAX: 2,
};
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
class SkillStore {
    skills = [];
    loaded = false;
    fileSha;
    octokit;
    owner;
    repo;
    constructor(octokit, owner, repo) {
        this.octokit = octokit;
        this.owner = owner;
        this.repo = repo;
    }
    async load() {
        if (this.loaded)
            return this.skills;
        try {
            const { data } = await this.octokit.repos.getContent({
                owner: this.owner,
                repo: this.repo,
                path: SKILLS_FILE,
                ref: SKILLS_BRANCH,
            });
            if ('content' in data && data.content) {
                const raw = Buffer.from(data.content, 'base64').toString('utf-8');
                this.skills = JSON.parse(raw).map(backfillDefaults);
                this.fileSha = data.sha;
                core.info(`📝 Loaded ${this.skills.length} skill(s) from ${this.owner}/${this.repo}@${SKILLS_BRANCH}`);
            }
            this.loaded = true;
        }
        catch (err) {
            const status = err.status;
            if (status === 404) {
                this.loaded = true;
                core.info(`📝 No existing skills found for ${this.owner}/${this.repo} — starting fresh`);
            }
            else {
                core.warning(`Failed to load skills (will retry on next call): ${err}`);
            }
        }
        return this.skills;
    }
    async save(skill) {
        if (!this.loaded) {
            await this.load();
        }
        this.skills.push(skill);
        if (this.skills.length > MAX_SKILLS) {
            this.skills = this.skills.slice(-MAX_SKILLS);
        }
        const commitMsg = `chore: update triage skills (${skill.spec})`;
        try {
            await this.persist(commitMsg);
            core.info(`📝 Saved skill ${skill.id} (${this.skills.length} total for ${this.owner}/${this.repo})`);
        }
        catch (err) {
            const status = err.status;
            if (status === 409) {
                try {
                    const { data } = await this.octokit.repos.getContent({
                        owner: this.owner,
                        repo: this.repo,
                        path: SKILLS_FILE,
                        ref: SKILLS_BRANCH,
                    });
                    if (!('content' in data) || !data.content) {
                        throw new Error('Unexpected empty skills file');
                    }
                    const raw = Buffer.from(data.content, 'base64').toString('utf-8');
                    const remoteSkills = JSON.parse(raw).map(backfillDefaults);
                    this.skills = [...remoteSkills, skill];
                    this.fileSha = data.sha;
                    await this.persist(commitMsg);
                    core.info(`📝 Saved skill ${skill.id} (${this.skills.length} total for ${this.owner}/${this.repo})`);
                }
                catch (retryErr) {
                    this.skills.pop();
                    core.warning(`Failed to save skill: ${retryErr}`);
                }
            }
            else {
                this.skills.pop();
                core.warning(`Failed to save skill: ${err}`);
            }
        }
    }
    async recordOutcome(skillId, success) {
        if (!this.loaded) {
            await this.load();
        }
        const skill = this.skills.find(s => s.id === skillId);
        if (!skill) {
            core.warning(`Skill ${skillId} not found — cannot record outcome`);
            return;
        }
        if (success) {
            skill.successCount++;
        }
        else {
            skill.failCount++;
        }
        skill.lastUsedAt = new Date().toISOString();
        const totalAttempts = (skill.successCount || 0) + (skill.failCount || 0);
        const failRate = totalAttempts > 0 ? (skill.failCount || 0) / totalAttempts : 0;
        if (failRate > 0.4 && (skill.failCount || 0) >= 3) {
            skill.retired = true;
            core.warning(`⚠️ Skill ${skillId} retired — ${Math.round(failRate * 100)}% failure rate (${skill.failCount} failures in ${totalAttempts} attempts)`);
        }
        const commitMsg = `chore: record ${success ? 'success' : 'failure'} for skill ${skillId}`;
        try {
            await this.persist(commitMsg);
        }
        catch (err) {
            const status = err.status;
            if (status === 409) {
                try {
                    const { data } = await this.octokit.repos.getContent({
                        owner: this.owner,
                        repo: this.repo,
                        path: SKILLS_FILE,
                        ref: SKILLS_BRANCH,
                    });
                    if (!('content' in data) || !data.content) {
                        throw new Error('Unexpected empty skills file');
                    }
                    const raw = Buffer.from(data.content, 'base64').toString('utf-8');
                    const remoteSkills = JSON.parse(raw).map(backfillDefaults);
                    const remoteSkill = remoteSkills.find(s => s.id === skillId);
                    if (!remoteSkill) {
                        core.warning(`Skill ${skillId} not found in remote data — skipping outcome persist`);
                        return;
                    }
                    if (success) {
                        remoteSkill.successCount++;
                    }
                    else {
                        remoteSkill.failCount++;
                    }
                    remoteSkill.lastUsedAt = skill.lastUsedAt;
                    const remoteTotalAttempts = (remoteSkill.successCount || 0) + (remoteSkill.failCount || 0);
                    const remoteFailRate = remoteTotalAttempts > 0 ? (remoteSkill.failCount || 0) / remoteTotalAttempts : 0;
                    if (remoteFailRate > 0.4 && (remoteSkill.failCount || 0) >= 3) {
                        remoteSkill.retired = true;
                    }
                    this.skills = remoteSkills;
                    this.fileSha = data.sha;
                    await this.persist(commitMsg);
                }
                catch (retryErr) {
                    core.warning(`Failed to persist skill outcome: ${retryErr}`);
                }
            }
            else {
                core.warning(`Failed to persist skill outcome: ${err}`);
            }
        }
    }
    async recordClassificationOutcome(skillId, outcome) {
        if (!this.loaded) {
            await this.load();
        }
        const skill = this.skills.find(s => s.id === skillId);
        if (!skill) {
            core.warning(`Skill ${skillId} not found — cannot record classification outcome`);
            return;
        }
        skill.classificationOutcome = outcome;
        const commitMsg = `chore: record classification ${outcome} for skill ${skillId}`;
        try {
            await this.persist(commitMsg);
        }
        catch (err) {
            const status = err.status;
            if (status === 409) {
                try {
                    const { data } = await this.octokit.repos.getContent({
                        owner: this.owner,
                        repo: this.repo,
                        path: SKILLS_FILE,
                        ref: SKILLS_BRANCH,
                    });
                    if (!('content' in data) || !data.content) {
                        throw new Error('Unexpected empty skills file');
                    }
                    const raw = Buffer.from(data.content, 'base64').toString('utf-8');
                    const remoteSkills = JSON.parse(raw).map(backfillDefaults);
                    const remoteSkill = remoteSkills.find(s => s.id === skillId);
                    if (!remoteSkill) {
                        core.warning(`Skill ${skillId} not found in remote data — skipping classification persist`);
                        return;
                    }
                    remoteSkill.classificationOutcome = outcome;
                    this.skills = remoteSkills;
                    this.fileSha = data.sha;
                    await this.persist(commitMsg);
                }
                catch (retryErr) {
                    core.warning(`Failed to persist classification outcome: ${retryErr}`);
                }
            }
            else {
                core.warning(`Failed to persist classification outcome: ${err}`);
            }
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
            .sort((a, b) => b.score - a.score)
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
            if (now - new Date(skill.lastUsedAt).getTime() < SEVEN_DAYS)
                score += 3;
            return { skill, score };
        });
        return scored
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map((s) => s.skill);
    }
    findForRepair(opts) {
        const normalized = normalizeFramework(opts.framework);
        const candidates = this.skills.filter((s) => (s.framework === normalized || s.framework === 'unknown') && !s.retired);
        if (candidates.length === 0)
            return [];
        const scored = candidates.map((skill) => {
            let score = 0;
            if (opts.rootCauseCategory && skill.rootCauseCategory === opts.rootCauseCategory)
                score += 10;
            if (opts.spec && skill.spec === opts.spec)
                score += 8;
            if (opts.errorMessage) {
                score +=
                    errorSimilarity(skill.errorPattern, normalizeError(opts.errorMessage)) * 5;
            }
            if (skill.confidence > 80)
                score += 2;
            const repairSkill = {
                ...skill,
                wasSuccessful: skill.validatedLocally,
            };
            return { skill: repairSkill, score };
        });
        return scored
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map((s) => s.skill);
    }
    detectFlakiness(spec) {
        const now = Date.now();
        const specSkills = this.skills.filter((s) => s.spec === spec);
        const inShortWindow = specSkills.filter((s) => now - new Date(s.createdAt).getTime() < FLAKY_THRESHOLDS.SHORT_WINDOW_DAYS * 86_400_000);
        const inLongWindow = specSkills.filter((s) => now - new Date(s.createdAt).getTime() < FLAKY_THRESHOLDS.LONG_WINDOW_DAYS * 86_400_000);
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
    async persist(commitMessage) {
        await this.ensureBranch();
        const content = Buffer.from(JSON.stringify(this.skills, null, 2)).toString('base64');
        const { data } = await this.octokit.repos.createOrUpdateFileContents({
            owner: this.owner,
            repo: this.repo,
            path: SKILLS_FILE,
            message: commitMessage,
            content,
            branch: SKILLS_BRANCH,
            ...(this.fileSha ? { sha: this.fileSha } : {}),
        });
        this.fileSha = data.content?.sha;
    }
    async ensureBranch() {
        try {
            await this.octokit.repos.getBranch({
                owner: this.owner,
                repo: this.repo,
                branch: SKILLS_BRANCH,
            });
        }
        catch (err) {
            if (err.status !== 404)
                throw err;
            const { data: defaultBranch } = await this.octokit.repos.get({
                owner: this.owner,
                repo: this.repo,
            });
            const { data: ref } = await this.octokit.git.getRef({
                owner: this.owner,
                repo: this.repo,
                ref: `heads/${defaultBranch.default_branch}`,
            });
            await this.octokit.git.createRef({
                owner: this.owner,
                repo: this.repo,
                ref: `refs/heads/${SKILLS_BRANCH}`,
                sha: ref.object.sha,
            });
            core.info(`📝 Created ${SKILLS_BRANCH} branch in ${this.owner}/${this.repo}`);
        }
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
    const entries = skills.map((s, i) => [
        `**Fix ${i + 1}** (${s.createdAt.split('T')[0]}, ${s.confidence}% confidence, ${s.iterations} iteration${s.iterations !== 1 ? 's' : ''})`,
        `- Spec: ${sanitizeForPrompt(s.spec)}`,
        `- Error: ${sanitizeForPrompt(s.errorPattern)}`,
        `- Root cause: ${sanitizeForPrompt(s.rootCauseCategory)}`,
        `- Pattern: ${sanitizeForPrompt(s.fix.pattern)}`,
        `- Change type: ${sanitizeForPrompt(s.fix.changeType)} in ${sanitizeForPrompt(s.fix.file)}`,
    ].join('\n'));
    const parts = [headers[role], '', ...entries];
    if (flakiness?.isFlaky) {
        parts.push('', `⚠️ FLAKINESS SIGNAL: ${flakiness.message}`);
    }
    return parts.join('\n');
}
//# sourceMappingURL=skill-store.js.map