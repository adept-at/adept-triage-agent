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
exports.RepoContextFetcher = exports.REPO_CONTEXT_MAX_CHARS = exports.REPO_CONTEXT_PATH = void 0;
const core = __importStar(require("@actions/core"));
const skill_store_1 = require("./skill-store");
const bundled_repo_contexts_1 = require("./bundled-repo-contexts");
exports.REPO_CONTEXT_PATH = '.adept-triage/context.md';
exports.REPO_CONTEXT_MAX_CHARS = 6500;
class RepoContextFetcher {
    cache = new Map();
    octokit;
    constructor(octokit) {
        this.octokit = octokit;
    }
    async fetch(owner, repo, ref = 'main') {
        const key = `${owner}/${repo}@${ref}`;
        const cached = this.cache.get(key);
        if (cached !== undefined)
            return cached;
        const bundled = (0, bundled_repo_contexts_1.getBundledRepoContext)(owner, repo);
        if (bundled !== undefined) {
            const rendered = this.renderBundled(bundled, owner, repo);
            this.cache.set(key, rendered);
            return rendered;
        }
        const rendered = await this.fetchAndRender(owner, repo, ref);
        this.cache.set(key, rendered);
        return rendered;
    }
    renderBundled(body, owner, repo) {
        const trimmed = body.trim();
        if (!trimmed)
            return '';
        const safe = (0, skill_store_1.sanitizeForPrompt)(trimmed, exports.REPO_CONTEXT_MAX_CHARS);
        core.info(`📘 Loaded repo context for ${owner}/${repo} (bundled in adept-triage-agent, ${safe.length} chars)`);
        return [
            '## Repository Conventions',
            '',
            `Source: bundled in adept-triage-agent for ${owner}/${repo}.`,
            'These conventions describe how this repository writes and structures tests.',
            'Treat them as authoritative for repo style; defer to current evidence on the specific failure.',
            '',
            safe,
            '',
        ].join('\n');
    }
    async fetchAndRender(owner, repo, ref) {
        try {
            const response = await this.octokit.repos.getContent({
                owner,
                repo,
                path: exports.REPO_CONTEXT_PATH,
                ref,
            });
            if (Array.isArray(response.data) || response.data.type !== 'file') {
                return '';
            }
            const raw = Buffer.from(response.data.content, 'base64').toString('utf-8').trim();
            if (!raw)
                return '';
            const safe = (0, skill_store_1.sanitizeForPrompt)(raw, exports.REPO_CONTEXT_MAX_CHARS);
            core.info(`📘 Loaded repo context from ${owner}/${repo}/${exports.REPO_CONTEXT_PATH}@${ref} (${safe.length} chars)`);
            return [
                '## Repository Conventions',
                '',
                `Source: \`${exports.REPO_CONTEXT_PATH}\` in ${owner}/${repo}@${ref}.`,
                'These conventions describe how this repository writes and structures tests.',
                'Treat them as authoritative for repo style; defer to current evidence on the specific failure.',
                '',
                safe,
                '',
            ].join('\n');
        }
        catch (err) {
            const status = err?.status;
            if (status === 404) {
                core.debug(`No repo context at ${owner}/${repo}/${exports.REPO_CONTEXT_PATH}@${ref} — proceeding without it.`);
                return '';
            }
            core.debug(`Failed to fetch repo context from ${owner}/${repo}/${exports.REPO_CONTEXT_PATH}@${ref}: ${err}`);
            return '';
        }
    }
}
exports.RepoContextFetcher = RepoContextFetcher;
//# sourceMappingURL=repo-context-fetcher.js.map