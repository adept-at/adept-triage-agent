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
exports.LocalFixValidator = void 0;
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const DEFAULT_TEST_TIMEOUT_MS = 300_000;
const MAX_LOG_CHARS = 20_000;
const MAX_BUFFER = 10 * 1024 * 1024;
class LocalFixValidator {
    config;
    octokit;
    _workDir;
    constructor(config, octokit) {
        this.config = config;
        this.octokit = octokit;
        this._workDir = '';
    }
    get workDir() {
        return this._workDir;
    }
    async setup() {
        this._workDir = path.join(os.tmpdir(), 'triage-fix-' + Date.now());
        core.setSecret(this.config.githubToken);
        const cloneUrl = `https://x-access-token:${this.config.githubToken}@github.com/${this.config.owner}/${this.config.repo}.git`;
        const maskedUrl = cloneUrl.replace(this.config.githubToken, '***');
        core.info(`📂 Cloning ${this.config.owner}/${this.config.repo}@${this.config.branch} into ${this._workDir}`);
        core.info(`  git clone --branch ${this.config.branch} --depth 50 ${maskedUrl}`);
        (0, child_process_1.execSync)(`git clone --branch ${this.config.branch} --depth 50 ${cloneUrl} ${this._workDir}`, { encoding: 'utf-8', stdio: 'pipe' });
        core.info('📦 Installing dependencies...');
        const npmrcPath = path.join(this._workDir, '.npmrc');
        if (!fs.existsSync(npmrcPath)) {
            fs.writeFileSync(npmrcPath, '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}\n@adept-at:registry=https://npm.pkg.github.com\n', 'utf-8');
        }
        const npmEnv = { ...process.env, NODE_AUTH_TOKEN: this.config.npmToken || this.config.githubToken };
        try {
            (0, child_process_1.execSync)('npm ci 2>&1', {
                cwd: this._workDir,
                encoding: 'utf-8',
                stdio: 'pipe',
                maxBuffer: MAX_BUFFER,
                env: npmEnv,
            });
        }
        catch (ciErr) {
            const e = ciErr;
            const ciOutput = e.stdout || e.stderr || String(ciErr);
            core.info(`npm ci failed:\n${ciOutput.slice(-500)}`);
            core.info('Falling back to npm install...');
            try {
                (0, child_process_1.execSync)('npm install 2>&1', {
                    cwd: this._workDir,
                    encoding: 'utf-8',
                    stdio: 'pipe',
                    maxBuffer: MAX_BUFFER,
                    env: npmEnv,
                });
            }
            catch (installErr) {
                const ie = installErr;
                const installOutput = ie.stdout || ie.stderr || String(installErr);
                throw new Error(`npm install failed:\n${installOutput.slice(-1000)}`);
            }
        }
        core.info('✅ Setup complete');
    }
    async applyFix(changes) {
        for (const change of changes) {
            const cleanPath = change.file
                .replace(/^\.\//, '')
                .replace(/^\/home\/runner\/work\/[^/]+\/[^/]+\//, '');
            const filePath = path.join(this._workDir, cleanPath);
            if (!filePath.startsWith(this._workDir)) {
                throw new Error(`Path traversal rejected: ${cleanPath}`);
            }
            const content = fs.readFileSync(filePath, 'utf-8');
            const idx = content.indexOf(change.oldCode);
            if (idx === -1) {
                throw new Error(`Could not find oldCode in ${cleanPath}. Expected to find:\n${change.oldCode.slice(0, 200)}`);
            }
            const secondIdx = content.indexOf(change.oldCode, idx + 1);
            if (secondIdx !== -1) {
                throw new Error(`Ambiguous match: oldCode appears more than once in ${cleanPath}`);
            }
            const updated = content.slice(0, idx) + change.newCode + content.slice(idx + change.oldCode.length);
            fs.writeFileSync(filePath, updated, 'utf-8');
        }
    }
    async runTest() {
        if (!this.config.testCommand) {
            throw new Error('No testCommand configured — cannot run validation');
        }
        let cmd = this.config.testCommand;
        if (this.config.spec) {
            cmd = cmd.replace('{spec}', this.config.spec);
        }
        if (this.config.previewUrl) {
            cmd = cmd.replace('{url}', this.config.previewUrl);
        }
        const timeout = this.config.testTimeoutMs || DEFAULT_TEST_TIMEOUT_MS;
        const start = Date.now();
        try {
            const output = (0, child_process_1.execSync)(cmd, {
                cwd: this._workDir,
                encoding: 'utf-8',
                timeout,
                env: { ...process.env },
                maxBuffer: MAX_BUFFER,
                stdio: 'pipe',
            });
            const durationMs = Date.now() - start;
            return {
                passed: true,
                logs: output.slice(-MAX_LOG_CHARS),
                exitCode: 0,
                durationMs,
            };
        }
        catch (err) {
            const durationMs = Date.now() - start;
            const execErr = err;
            if (execErr.killed) {
                return {
                    passed: false,
                    logs: `Test timed out after ${timeout}ms`,
                    exitCode: 1,
                    durationMs,
                };
            }
            const combined = [execErr.stdout || '', execErr.stderr || ''].join('\n');
            return {
                passed: false,
                logs: combined.slice(-MAX_LOG_CHARS),
                exitCode: execErr.status ?? 1,
                durationMs,
            };
        }
    }
    async reset() {
        (0, child_process_1.execSync)('git checkout -- .', {
            cwd: this._workDir,
            encoding: 'utf-8',
        });
        (0, child_process_1.execSync)('git clean -fd', {
            cwd: this._workDir,
            encoding: 'utf-8',
        });
    }
    async pushAndCreatePR(options) {
        const execOpts = { cwd: this._workDir, encoding: 'utf-8' };
        (0, child_process_1.execFileSync)('git', ['config', 'user.name', 'adept-triage-agent[bot]'], execOpts);
        (0, child_process_1.execFileSync)('git', ['config', 'user.email', 'adept-triage-agent[bot]@users.noreply.github.com'], execOpts);
        (0, child_process_1.execFileSync)('git', ['checkout', '-b', options.branchName], execOpts);
        (0, child_process_1.execFileSync)('git', ['add', '-A'], execOpts);
        (0, child_process_1.execFileSync)('git', ['commit', '-m', options.commitMessage], execOpts);
        (0, child_process_1.execFileSync)('git', ['push', 'origin', options.branchName], { ...execOpts, stdio: 'pipe' });
        const commitSha = (0, child_process_1.execFileSync)('git', ['rev-parse', 'HEAD'], execOpts).trim();
        const { data: pr } = await this.octokit.pulls.create({
            owner: this.config.owner,
            repo: this.config.repo,
            title: options.prTitle,
            body: options.prBody,
            head: options.branchName,
            base: options.baseBranch,
        });
        return {
            branchName: options.branchName,
            commitSha,
            prUrl: pr.html_url,
            prNumber: pr.number,
        };
    }
    async cleanup() {
        try {
            fs.rmSync(this._workDir, { recursive: true, force: true });
        }
        catch (err) {
            core.warning(`Failed to clean up ${this._workDir}: ${err}`);
        }
    }
}
exports.LocalFixValidator = LocalFixValidator;
//# sourceMappingURL=local-fix-validator.js.map