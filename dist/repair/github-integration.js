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
exports.GitHubIntegration = void 0;
const core = __importStar(require("@actions/core"));
class GitHubIntegration {
    octokit;
    constructor(octokit) {
        this.octokit = octokit;
    }
    async createRepairPR(owner, repo, changes, repairContext, repairConfidence, fetchedContext) {
        try {
            const { data: repoData } = await this.octokit.repos.get({
                owner,
                repo,
            });
            const baseBranch = repoData.default_branch;
            const repairBranch = `auto-repair/${repairContext.workflowRunId}-${Date.now()}`;
            core.info(`Creating repair branch: ${repairBranch}`);
            const { data: refData } = await this.octokit.git.getRef({
                owner,
                repo,
                ref: `heads/${baseBranch}`,
            });
            const baseSha = refData.object.sha;
            await this.octokit.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${repairBranch}`,
                sha: baseSha,
            });
            for (const change of changes) {
                await this.applyChange(owner, repo, repairBranch, change);
            }
            const prBody = this.generatePRBody(repairContext, repairConfidence, fetchedContext, changes);
            const { data: pr } = await this.octokit.pulls.create({
                owner,
                repo,
                title: `[Auto-Repair] Fix ${repairContext.errorType} in ${repairContext.testName}`,
                head: repairBranch,
                base: baseBranch,
                body: prBody,
                draft: false,
            });
            await this.octokit.issues.addLabels({
                owner,
                repo,
                issue_number: pr.number,
                labels: ['auto-repair', 'test-fix', `confidence-${Math.floor(repairConfidence / 10) * 10}`],
            });
            core.info(`Created PR #${pr.number}: ${pr.html_url}`);
            return pr.html_url;
        }
        catch (error) {
            core.error(`Failed to create PR: ${error}`);
            throw error;
        }
    }
    async applyChange(owner, repo, branch, change) {
        try {
            let currentContent = '';
            let fileSha;
            try {
                const { data: fileData } = await this.octokit.repos.getContent({
                    owner,
                    repo,
                    path: change.file,
                    ref: branch,
                });
                if ('content' in fileData) {
                    currentContent = Buffer.from(fileData.content, 'base64').toString();
                    fileSha = fileData.sha;
                }
            }
            catch (error) {
                if (error.status !== 404) {
                    throw error;
                }
                core.debug(`File ${change.file} not found, will create new`);
            }
            const newContent = this.applyChangeToContent(currentContent, change);
            await this.octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: change.file,
                message: this.generateCommitMessage(change),
                content: Buffer.from(newContent).toString('base64'),
                branch,
                sha: fileSha,
            });
            core.info(`Applied change to ${change.file}:${change.line}`);
        }
        catch (error) {
            core.error(`Failed to apply change to ${change.file}: ${error}`);
            throw error;
        }
    }
    applyChangeToContent(content, change) {
        const lines = content.split('\n');
        if (change.line > 0 && change.line <= lines.length) {
            const actualLine = lines[change.line - 1];
            const normalizedActual = actualLine.trim();
            const normalizedExpected = change.oldCode.trim();
            if (!normalizedActual.includes(normalizedExpected)) {
                core.warning(`Line ${change.line} content mismatch.\n` +
                    `Expected: "${change.oldCode}"\n` +
                    `Actual: "${actualLine}"\n` +
                    `Proceeding with replacement anyway...`);
            }
            lines[change.line - 1] = change.newCode;
        }
        else {
            throw new Error(`Invalid line number ${change.line} for file with ${lines.length} lines`);
        }
        return lines.join('\n');
    }
    generateCommitMessage(change) {
        const fileName = change.file.split('/').pop();
        return `fix: Auto-repair ${fileName} at line ${change.line}\n\n${change.justification}`;
    }
    generatePRBody(context, confidence, fetchedContext, changes) {
        const confidenceEmoji = this.getConfidenceEmoji(confidence);
        const changesSummary = this.generateChangesSummary(changes);
        return `## 🤖 Automated Test Repair

This PR was automatically generated to fix a failing test.

### 📊 Analysis Details
- **Verdict:** TEST_ISSUE
- **Confidence:** ${confidenceEmoji} ${confidence}%
- **Error Type:** \`${context.errorType}\`
- **Test File:** \`${context.testFile}\`
- **Test Name:** ${context.testName}
- **Failed Selector:** ${context.errorSelector ? `\`${context.errorSelector}\`` : 'N/A'}

### 🔍 Context Fetched
The repair agent analyzed the following sources:
${fetchedContext.map(ctx => `- ✅ ${this.formatContextSource(ctx)}`).join('\n')}

### 🛠️ Proposed Changes
${changesSummary}

<details>
<summary>📝 Original Error Message</summary>

\`\`\`
${context.errorMessage}
\`\`\`

</details>

<details>
<summary>🔗 Related Information</summary>

- **Workflow Run:** [${context.workflowRunId}](https://github.com/${context.repository}/actions/runs/${context.workflowRunId})
- **Job:** ${context.jobName}
- **Commit:** [\`${context.commitSha.substring(0, 7)}\`](https://github.com/${context.repository}/commit/${context.commitSha})
- **Branch:** \`${context.branch}\`
${context.prNumber ? `- **Test Repository PR:** #${context.prNumber}` : ''}
${context.targetAppPrNumber ? `- **Application PR:** [#${context.targetAppPrNumber}](https://github.com/${this.extractAppRepo(context)}/pull/${context.targetAppPrNumber})` : ''}

</details>

### ⚠️ Review Checklist
Before merging this PR, please ensure:
- [ ] The fix addresses the root cause of the failure
- [ ] No unintended side effects are introduced
- [ ] The fix follows project conventions
- [ ] Tests pass locally
- [ ] The selector/assertion change is appropriate

### 🎯 Confidence Level: ${confidence}%
${this.getConfidenceExplanation(confidence)}

---
*Generated by [Adept Repair Agent](https://github.com/adept/adept-triage-agent) v2.0*`;
    }
    generateChangesSummary(changes) {
        if (changes.length === 0) {
            return 'No changes proposed.';
        }
        let summary = '';
        for (const change of changes) {
            const fileName = change.file.split('/').pop();
            summary += `
#### 📄 \`${fileName}\` (Line ${change.line})

**Justification:** ${change.justification}

\`\`\`diff
- ${change.oldCode}
+ ${change.newCode}
\`\`\`
`;
        }
        return summary;
    }
    formatContextSource(source) {
        const sourceMap = {
            'testFile': '📄 Test file content',
            'testHistory': '📜 Test history',
            'appPrDiff': '🔄 Application PR diff',
            'appComponents': '🧩 Application components',
            'appSelectors': '🎯 Available selectors',
            'networkPatterns': '🌐 Network patterns',
            'similarTests': '🔍 Similar tests'
        };
        return sourceMap[source] || source;
    }
    getConfidenceEmoji(confidence) {
        if (confidence >= 90)
            return '🟢';
        if (confidence >= 70)
            return '🟡';
        if (confidence >= 50)
            return '🟠';
        return '🔴';
    }
    getConfidenceExplanation(confidence) {
        if (confidence >= 90) {
            return '✅ **High confidence**: Strong evidence supports this fix.';
        }
        if (confidence >= 70) {
            return '⚠️ **Medium confidence**: Good evidence, but please review carefully.';
        }
        if (confidence >= 50) {
            return '⚠️ **Low confidence**: Limited evidence, thorough review required.';
        }
        return '❌ **Very low confidence**: Minimal evidence, consider manual investigation.';
    }
    extractAppRepo(_context) {
        return 'organization/app-repo';
    }
    async commentOnPR(owner, repo, prNumber, repairResult) {
        try {
            let comment = '## 🤖 Automated Test Repair Analysis\n\n';
            if (repairResult.canRepair) {
                comment += `✅ **Repair possible** with ${repairResult.confidence}% confidence\n\n`;
                comment += 'A separate PR will be created with the proposed fix.\n';
            }
            else {
                comment += `❌ **Cannot auto-repair**: ${repairResult.reason}\n\n`;
                if (repairResult.missingInformation && repairResult.missingInformation.length > 0) {
                    comment += '### 📋 Missing Information\n';
                    comment += 'The following information would help enable automatic repair:\n';
                    comment += repairResult.missingInformation.map(info => `- ${info}`).join('\n');
                }
            }
            await this.octokit.issues.createComment({
                owner,
                repo,
                issue_number: prNumber,
                body: comment,
            });
            core.info(`Posted repair analysis comment on PR #${prNumber}`);
        }
        catch (error) {
            core.error(`Failed to comment on PR: ${error}`);
        }
    }
}
exports.GitHubIntegration = GitHubIntegration;
//# sourceMappingURL=github-integration.js.map