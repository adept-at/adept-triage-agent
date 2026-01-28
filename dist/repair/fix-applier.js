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
exports.GitHubFixApplier = void 0;
exports.createFixApplier = createFixApplier;
exports.generateFixBranchName = generateFixBranchName;
exports.generateFixCommitMessage = generateFixCommitMessage;
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const fs = __importStar(require("fs/promises"));
const constants_1 = require("../config/constants");
class GitHubFixApplier {
    config;
    constructor(config) {
        this.config = config;
    }
    canApply(recommendation) {
        if (recommendation.confidence < this.config.minConfidence) {
            core.info(`Fix confidence (${recommendation.confidence}%) is below threshold (${this.config.minConfidence}%)`);
            return false;
        }
        if (!recommendation.proposedChanges || recommendation.proposedChanges.length === 0) {
            core.info('No proposed changes in fix recommendation');
            return false;
        }
        return true;
    }
    async applyFix(recommendation) {
        const modifiedFiles = [];
        let branchName = '';
        let commitSha = '';
        try {
            const testFile = recommendation.proposedChanges[0]?.file || 'unknown';
            branchName = generateFixBranchName(testFile);
            core.info(`Creating fix branch: ${branchName}`);
            await this.execGit(['fetch', 'origin', this.config.baseBranch]);
            await this.execGit(['checkout', '-b', branchName, `origin/${this.config.baseBranch}`]);
            for (const change of recommendation.proposedChanges) {
                const filePath = change.file;
                try {
                    const currentContent = await fs.readFile(filePath, 'utf-8');
                    if (change.oldCode && change.newCode) {
                        const newContent = currentContent.replace(change.oldCode, change.newCode);
                        if (newContent === currentContent) {
                            core.warning(`Could not find old code to replace in ${filePath}`);
                            continue;
                        }
                        await fs.writeFile(filePath, newContent, 'utf-8');
                        modifiedFiles.push(filePath);
                        core.info(`Modified: ${filePath}`);
                    }
                }
                catch (fileError) {
                    core.warning(`Failed to modify ${filePath}: ${fileError}`);
                }
            }
            if (modifiedFiles.length === 0) {
                await this.execGit(['checkout', '-']);
                await this.execGit(['branch', '-D', branchName]);
                return {
                    success: false,
                    modifiedFiles: [],
                    error: 'No files were successfully modified',
                };
            }
            await this.execGit(['add', ...modifiedFiles]);
            const commitMessage = generateFixCommitMessage(recommendation);
            await this.execGit(['commit', '-m', commitMessage]);
            commitSha = await this.getCommitSha();
            await this.execGit(['push', '-u', 'origin', branchName]);
            core.info(`Successfully pushed fix branch: ${branchName}`);
            core.info(`Commit SHA: ${commitSha}`);
            return {
                success: true,
                modifiedFiles,
                commitSha,
                branchName,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            core.error(`Failed to apply fix: ${errorMessage}`);
            try {
                await this.execGit(['checkout', '-']);
                if (branchName) {
                    await this.execGit(['branch', '-D', branchName]);
                }
            }
            catch {
            }
            return {
                success: false,
                modifiedFiles,
                error: errorMessage,
            };
        }
    }
    async execGit(args) {
        const exitCode = await exec.exec('git', args);
        if (exitCode !== 0) {
            throw new Error(`Git command failed: git ${args.join(' ')}`);
        }
    }
    async getCommitSha() {
        let output = '';
        await exec.exec('git', ['rev-parse', 'HEAD'], {
            listeners: {
                stdout: (data) => {
                    output += data.toString();
                },
            },
        });
        return output.trim();
    }
}
exports.GitHubFixApplier = GitHubFixApplier;
function createFixApplier(config) {
    return new GitHubFixApplier(config);
}
function generateFixBranchName(testFile, timestamp = new Date()) {
    const sanitizedFile = testFile
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);
    const dateStr = timestamp.toISOString().slice(0, 10).replace(/-/g, '');
    return `${constants_1.AUTO_FIX.BRANCH_PREFIX}${sanitizedFile}-${dateStr}`;
}
function generateFixCommitMessage(recommendation) {
    const files = recommendation.proposedChanges.map(c => c.file).join(', ');
    const summary = recommendation.summary.slice(0, 50);
    return `fix(test): ${summary}

Automated fix generated by adept-triage-agent.

Files modified: ${files}
Confidence: ${recommendation.confidence}%

${recommendation.reasoning}`;
}
//# sourceMappingURL=fix-applier.js.map