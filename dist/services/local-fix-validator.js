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
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const test_evidence_1 = require("./test-evidence");
const SECRET_ENV_KEYS = new Set([
    'GITHUB_TOKEN',
    'OPENAI_API_KEY',
    'CURSOR_API_KEY',
    'NPM_TOKEN',
    'CROSS_REPO_PAT',
    'INPUT_GITHUB_TOKEN',
    'INPUT_OPENAI_API_KEY',
    'INPUT_CURSOR_API_KEY',
    'INPUT_NPM_TOKEN',
    'INPUT_CROSS_REPO_PAT',
]);
function filterEnv(npmToken) {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined && !SECRET_ENV_KEYS.has(key)) {
            env[key] = value;
        }
    }
    if (npmToken) {
        env.NODE_AUTH_TOKEN = npmToken;
    }
    return env;
}
const DEFAULT_TEST_TIMEOUT_MS = 300_000;
const MAX_LOG_CHARS = 20_000;
const MAX_BUFFER = 10 * 1024 * 1024;
const BASELINE_PASS_COUNT = 3;
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
        (0, child_process_1.execFileSync)('git', ['clone', '--branch', this.config.branch, '--depth', '50', cloneUrl, this._workDir], {
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 300_000,
        });
        core.info('📦 Installing dependencies...');
        const npmrcPath = path.join(this._workDir, '.npmrc');
        if (!fs.existsSync(npmrcPath)) {
            fs.writeFileSync(npmrcPath, '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}\n@adept-at:registry=https://npm.pkg.github.com\n', 'utf-8');
        }
        const npmCacheDir = path.join(os.homedir(), '.npm');
        const lockPath = path.join(this._workDir, 'package-lock.json');
        let cacheKey = '';
        let cacheRestored = false;
        if (fs.existsSync(lockPath)) {
            const lockHash = crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex').slice(0, 16);
            cacheKey = `triage-npm-${process.platform}-${this.config.owner}-${this.config.repo}-${lockHash}`;
            try {
                const cacheModule = await import('@actions/cache');
                const hit = await cacheModule.restoreCache([npmCacheDir], cacheKey, [
                    `triage-npm-${process.platform}-${this.config.owner}-${this.config.repo}-`,
                ]);
                cacheRestored = !!hit;
                core.info(hit ? `📦 npm cache restored (key: ${hit})` : '📦 npm cache miss — full install');
            }
            catch (err) {
                core.info(`📦 npm cache restore failed (non-fatal): ${err}`);
            }
        }
        let cypressCacheKey = '';
        if (this.config.testCommand && this.config.testCommand.includes('cypress')) {
            const cypressCacheDir = path.join(os.homedir(), '.cache', 'Cypress');
            cypressCacheKey = `triage-cypress-${process.platform}-${this.config.owner}-${this.config.repo}`;
            try {
                const cacheModule = await import('@actions/cache');
                const hit = await cacheModule.restoreCache([cypressCacheDir], cypressCacheKey);
                core.info(hit ? `📦 Cypress binary cache restored (key: ${hit})` : '📦 Cypress binary cache miss — postinstall will download');
            }
            catch (err) {
                core.info(`📦 Cypress cache restore failed (non-fatal): ${err}`);
            }
        }
        const npmEnv = filterEnv(this.config.npmToken || this.config.githubToken);
        try {
            (0, child_process_1.execSync)('npm ci --ignore-scripts 2>&1', {
                cwd: this._workDir,
                encoding: 'utf-8',
                stdio: 'pipe',
                maxBuffer: MAX_BUFFER,
                env: npmEnv,
                timeout: 300_000,
            });
        }
        catch (ciErr) {
            const e = ciErr;
            const ciOutput = e.stdout || e.stderr || String(ciErr);
            core.info(`npm ci failed:\n${ciOutput.slice(-500)}`);
            core.info('Falling back to npm install...');
            try {
                (0, child_process_1.execSync)('npm install --ignore-scripts 2>&1', {
                    cwd: this._workDir,
                    encoding: 'utf-8',
                    stdio: 'pipe',
                    maxBuffer: MAX_BUFFER,
                    env: npmEnv,
                    timeout: 300_000,
                });
            }
            catch (installErr) {
                const ie = installErr;
                const installOutput = ie.stdout || ie.stderr || String(installErr);
                throw new Error(`npm install failed:\n${installOutput.slice(-1000)}`);
            }
        }
        if (this.config.testCommand && this.config.testCommand.includes('cypress')) {
            core.info('📦 Installing Cypress binary (postinstall was skipped by --ignore-scripts)...');
            try {
                (0, child_process_1.execSync)('npx cypress install 2>&1', {
                    cwd: this._workDir,
                    encoding: 'utf-8',
                    stdio: 'pipe',
                    maxBuffer: MAX_BUFFER,
                    env: npmEnv,
                    timeout: 300_000,
                });
                core.info('📦 Cypress binary installed');
            }
            catch (cypressErr) {
                core.warning(`Cypress install failed: ${cypressErr}`);
            }
        }
        if (cacheKey && !cacheRestored) {
            try {
                const cacheModule = await import('@actions/cache');
                await cacheModule.saveCache([npmCacheDir], cacheKey);
                core.info(`📦 npm cache saved (key: ${cacheKey})`);
            }
            catch (err) {
                core.info(`📦 npm cache save failed (non-fatal): ${err}`);
            }
        }
        if (cypressCacheKey) {
            const cypressCacheDir = path.join(os.homedir(), '.cache', 'Cypress');
            try {
                const cacheModule = await import('@actions/cache');
                await cacheModule.saveCache([cypressCacheDir], cypressCacheKey);
                core.info(`📦 Cypress binary cache saved (key: ${cypressCacheKey})`);
            }
            catch (err) {
                core.info(`📦 Cypress binary cache save failed (non-fatal): ${err}`);
            }
        }
        core.info('✅ Setup complete');
    }
    async baselineCheck() {
        core.info(`🔍 Running baseline check — does the test pass without any fix? ` +
            `(requires ${BASELINE_PASS_COUNT} consecutive passes)`);
        let totalDurationMs = 0;
        let lastResult;
        for (let pass = 1; pass <= BASELINE_PASS_COUNT; pass++) {
            core.info(`   Baseline pass ${pass}/${BASELINE_PASS_COUNT}...`);
            const result = await this.runTest();
            totalDurationMs += result.durationMs;
            lastResult = result;
            if (!result.passed) {
                core.info(`   ❌ Baseline failed on pass ${pass} — short-circuiting.`);
                return {
                    passed: false,
                    logs: result.logs,
                    exitCode: result.exitCode,
                    durationMs: totalDurationMs,
                };
            }
        }
        return {
            passed: true,
            logs: lastResult?.logs ?? '',
            exitCode: lastResult?.exitCode ?? 0,
            durationMs: totalDurationMs,
        };
    }
    async preValidateFix(changes) {
        for (const change of changes) {
            let resolved;
            try {
                resolved = this.resolveChangePath(change.file);
            }
            catch (error) {
                return {
                    valid: false,
                    reason: error instanceof Error ? error.message : String(error),
                };
            }
            const { cleanPath, filePath } = resolved;
            if (!fs.existsSync(filePath)) {
                return { valid: false, reason: `File not found: ${cleanPath}` };
            }
            const content = fs.readFileSync(filePath, 'utf-8');
            if (content.indexOf(change.oldCode) === -1) {
                return { valid: false, reason: `oldCode not found in ${cleanPath}` };
            }
            if (/\.tsx?$/.test(cleanPath)) {
                const typeCheck = this.quickTypeCheck(filePath);
                if (!typeCheck.passed) {
                    return {
                        valid: false,
                        reason: `TypeScript compilation failed: ${typeCheck.error}`,
                    };
                }
            }
        }
        return { valid: true };
    }
    resolveChangePath(rawPath) {
        const cleanPath = rawPath
            .replace(/^\.\//, '')
            .replace(/^\/home\/runner\/work\/[^/]+\/[^/]+\//, '');
        const workDirRoot = path.resolve(this._workDir);
        const filePath = path.resolve(workDirRoot, cleanPath);
        if (!filePath.startsWith(`${workDirRoot}${path.sep}`)) {
            throw new Error(`Path traversal rejected: ${cleanPath}`);
        }
        return { cleanPath, filePath };
    }
    quickTypeCheck(filePath) {
        const tscPath = path.join(this._workDir, 'node_modules', '.bin', 'tsc');
        if (!fs.existsSync(tscPath)) {
            return { passed: true };
        }
        try {
            (0, child_process_1.execFileSync)(tscPath, ['--noEmit', '--pretty', 'false', filePath], {
                cwd: this._workDir,
                timeout: 30000,
                stdio: 'pipe',
                encoding: 'utf-8',
            });
            return { passed: true };
        }
        catch (err) {
            const execErr = err;
            if (execErr.killed) {
                core.warning(`tsc type-check timed out for ${filePath} — skipping`);
                return { passed: true };
            }
            const output = execErr.stdout || execErr.stderr || String(err);
            const firstLine = output
                .split('\n')
                .find(l => l.trim()) || 'Unknown error';
            return { passed: false, error: firstLine };
        }
    }
    async applyFix(changes) {
        const preCheck = await this.preValidateFix(changes);
        if (!preCheck.valid) {
            throw new Error(`Pre-validation failed: ${preCheck.reason}`);
        }
        for (const change of changes) {
            const { cleanPath, filePath } = this.resolveChangePath(change.file);
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
            cmd = cmd.replaceAll('{spec}', this.config.spec);
        }
        if (this.config.previewUrl) {
            cmd = cmd.replaceAll('{url}', this.config.previewUrl);
        }
        const timeout = this.config.testTimeoutMs || DEFAULT_TEST_TIMEOUT_MS;
        const safeEnv = filterEnv(this.config.npmToken || this.config.githubToken);
        const start = Date.now();
        try {
            const output = (0, child_process_1.execSync)(cmd, {
                cwd: this._workDir,
                encoding: 'utf-8',
                timeout,
                env: safeEnv,
                maxBuffer: MAX_BUFFER,
                stdio: 'pipe',
            });
            const durationMs = Date.now() - start;
            const truncatedLogs = output.slice(-MAX_LOG_CHARS);
            const evidence = (0, test_evidence_1.verifyTestEvidence)(truncatedLogs);
            if (!evidence.trustworthy) {
                core.warning(`Test command exited 0 but ${evidence.reason} — treating as failed to avoid poisoning the skill store with a false validation.`);
                return {
                    passed: false,
                    logs: truncatedLogs,
                    exitCode: 0,
                    durationMs,
                };
            }
            core.info(`✅ Test evidence verified: ${evidence.reason}`);
            return {
                passed: true,
                logs: truncatedLogs,
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
        try {
            (0, child_process_1.execSync)('git checkout -- .', {
                cwd: this._workDir,
                encoding: 'utf-8',
                timeout: 30_000,
            });
        }
        catch (err) {
            core.warning(`git checkout reset failed: ${err}`);
        }
        try {
            (0, child_process_1.execSync)('git clean -fd', {
                cwd: this._workDir,
                encoding: 'utf-8',
                timeout: 30_000,
            });
        }
        catch (err) {
            core.warning(`git clean reset failed: ${err}`);
        }
    }
    async pushAndCreatePR(options) {
        const execOpts = { cwd: this._workDir, encoding: 'utf-8', timeout: 120_000 };
        (0, child_process_1.execFileSync)('git', ['config', 'user.name', 'adept-triage-agent[bot]'], execOpts);
        (0, child_process_1.execFileSync)('git', ['config', 'user.email', 'adept-triage-agent[bot]@users.noreply.github.com'], execOpts);
        (0, child_process_1.execFileSync)('git', ['checkout', '-b', options.branchName], execOpts);
        (0, child_process_1.execFileSync)('git', ['reset', 'HEAD'], execOpts);
        if (options.changedFiles && options.changedFiles.length > 0) {
            (0, child_process_1.execFileSync)('git', ['add', ...options.changedFiles], execOpts);
        }
        else {
            (0, child_process_1.execFileSync)('git', ['add', '-A'], execOpts);
            const scaffoldFiles = ['.npmrc', '.env', '.env.local'];
            for (const f of scaffoldFiles) {
                try {
                    (0, child_process_1.execFileSync)('git', ['reset', 'HEAD', f], { ...execOpts, stdio: 'pipe' });
                }
                catch {
                }
            }
        }
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