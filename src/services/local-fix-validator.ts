import * as core from '@actions/core';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync, execFileSync } from 'child_process';
import { Octokit } from '@octokit/rest';

export interface LocalValidatorConfig {
  owner: string;
  repo: string;
  branch: string;
  githubToken: string;
  npmToken?: string;
  testCommand: string;
  spec?: string;
  previewUrl?: string;
  testTimeoutMs?: number;
}

export interface TestRunResult {
  passed: boolean;
  logs: string;
  exitCode: number;
  durationMs: number;
}

export interface PushResult {
  branchName: string;
  commitSha: string;
  prUrl?: string;
  prNumber?: number;
}


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

function filterEnv(npmToken?: string): Record<string, string> {
  const env: Record<string, string> = {};
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

export class LocalFixValidator {
  private config: LocalValidatorConfig;
  private octokit: Octokit;
  private _workDir: string;

  constructor(config: LocalValidatorConfig, octokit: Octokit) {
    this.config = config;
    this.octokit = octokit;
    this._workDir = '';
  }

  get workDir(): string {
    return this._workDir;
  }

  async setup(): Promise<void> {
    this._workDir = path.join(os.tmpdir(), 'triage-fix-' + Date.now());

    core.setSecret(this.config.githubToken);

    const cloneUrl = `https://x-access-token:${this.config.githubToken}@github.com/${this.config.owner}/${this.config.repo}.git`;
    const maskedUrl = cloneUrl.replace(this.config.githubToken, '***');

    core.info(`📂 Cloning ${this.config.owner}/${this.config.repo}@${this.config.branch} into ${this._workDir}`);
    core.info(`  git clone --branch ${this.config.branch} --depth 50 ${maskedUrl}`);

    execFileSync('git', ['clone', '--branch', this.config.branch, '--depth', '50', cloneUrl, this._workDir], {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 300_000,
    });

    core.info('📦 Installing dependencies...');
    const npmrcPath = path.join(this._workDir, '.npmrc');
    if (!fs.existsSync(npmrcPath)) {
      fs.writeFileSync(
        npmrcPath,
        '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}\n@adept-at:registry=https://npm.pkg.github.com\n',
        'utf-8'
      );
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
      } catch (err) {
        core.info(`📦 npm cache restore failed (non-fatal): ${err}`);
      }
    }

    const npmEnv = filterEnv(this.config.npmToken || this.config.githubToken);
    try {
      execSync('npm ci --ignore-scripts 2>&1', {
        cwd: this._workDir,
        encoding: 'utf-8',
        stdio: 'pipe',
        maxBuffer: MAX_BUFFER,
        env: npmEnv,
        timeout: 300_000,
      });
    } catch (ciErr: unknown) {
      const e = ciErr as { stdout?: string; stderr?: string };
      const ciOutput = e.stdout || e.stderr || String(ciErr);
      core.info(`npm ci failed:\n${ciOutput.slice(-500)}`);
      core.info('Falling back to npm install...');
      try {
        execSync('npm install --ignore-scripts 2>&1', {
          cwd: this._workDir,
          encoding: 'utf-8',
          stdio: 'pipe',
          maxBuffer: MAX_BUFFER,
          env: npmEnv,
          timeout: 300_000,
        });
      } catch (installErr: unknown) {
        const ie = installErr as { stdout?: string; stderr?: string };
        const installOutput = ie.stdout || ie.stderr || String(installErr);
        throw new Error(`npm install failed:\n${installOutput.slice(-1000)}`);
      }
    }

    if (this.config.testCommand && this.config.testCommand.includes('cypress')) {
      const cypressCacheDir = path.join(os.homedir(), '.cache', 'Cypress');
      const cypressCacheKey = `triage-cypress-${process.platform}-${this.config.owner}-${this.config.repo}`;
      let cypressCacheRestored = false;

      try {
        const cacheModule = await import('@actions/cache');
        const hit = await cacheModule.restoreCache([cypressCacheDir], cypressCacheKey);
        cypressCacheRestored = !!hit;
        core.info(hit ? `📦 Cypress binary cache restored (key: ${hit})` : '📦 Cypress binary cache miss');
      } catch (err) {
        core.info(`📦 Cypress cache restore failed (non-fatal): ${err}`);
      }

      if (!cypressCacheRestored) {
        core.info('📦 Installing Cypress binary...');
        try {
          execSync('npx cypress install 2>&1', {
            cwd: this._workDir,
            encoding: 'utf-8',
            stdio: 'pipe',
            maxBuffer: MAX_BUFFER,
            env: npmEnv,
            timeout: 300_000,
          });
        } catch (cypressErr) {
          core.warning(`Cypress install failed (non-fatal): ${cypressErr}`);
        }

        try {
          const cacheModule = await import('@actions/cache');
          await cacheModule.saveCache([cypressCacheDir], cypressCacheKey);
          core.info(`📦 Cypress binary cache saved (key: ${cypressCacheKey})`);
        } catch (err) {
          core.info(`📦 Cypress binary cache save failed (non-fatal): ${err}`);
        }
      }
    }

    if (cacheKey && !cacheRestored) {
      try {
        const cacheModule = await import('@actions/cache');
        await cacheModule.saveCache([npmCacheDir], cacheKey);
        core.info(`📦 npm cache saved (key: ${cacheKey})`);
      } catch (err) {
        core.info(`📦 npm cache save failed (non-fatal): ${err}`);
      }
    }

    core.info('✅ Setup complete');
  }

  async baselineCheck(): Promise<TestRunResult> {
    core.info('🔍 Running baseline check — does the test pass without any fix?');
    return this.runTest();
  }

  async preValidateFix(
    changes: Array<{ file: string; oldCode: string; newCode: string }>
  ): Promise<{ valid: boolean; reason?: string }> {
    for (const change of changes) {
      const cleanPath = change.file
        .replace(/^\.\//, '')
        .replace(/^\/home\/runner\/work\/[^/]+\/[^/]+\//, '');

      const filePath = path.join(this._workDir, cleanPath);

      if (!filePath.startsWith(this._workDir)) {
        return { valid: false, reason: `Path traversal rejected: ${cleanPath}` };
      }

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

  private quickTypeCheck(filePath: string): {
    passed: boolean;
    error?: string;
  } {
    const tscPath = path.join(this._workDir, 'node_modules', '.bin', 'tsc');
    if (!fs.existsSync(tscPath)) {
      return { passed: true };
    }

    try {
      execFileSync(tscPath, ['--noEmit', '--pretty', 'false', filePath], {
        cwd: this._workDir,
        timeout: 30000,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      return { passed: true };
    } catch (err: unknown) {
      const execErr = err as {
        stdout?: string;
        stderr?: string;
        killed?: boolean;
      };
      if (execErr.killed) {
        core.warning(`tsc type-check timed out for ${filePath} — skipping`);
        return { passed: true };
      }
      const output = execErr.stdout || execErr.stderr || String(err);
      const firstLine =
        output
          .split('\n')
          .find(l => l.trim()) || 'Unknown error';
      return { passed: false, error: firstLine };
    }
  }

  async applyFix(changes: Array<{ file: string; oldCode: string; newCode: string }>): Promise<void> {
    const preCheck = await this.preValidateFix(changes);
    if (!preCheck.valid) {
      throw new Error(`Pre-validation failed: ${preCheck.reason}`);
    }

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
        throw new Error(
          `Could not find oldCode in ${cleanPath}. Expected to find:\n${change.oldCode.slice(0, 200)}`
        );
      }

      const secondIdx = content.indexOf(change.oldCode, idx + 1);
      if (secondIdx !== -1) {
        throw new Error(
          `Ambiguous match: oldCode appears more than once in ${cleanPath}`
        );
      }

      const updated = content.slice(0, idx) + change.newCode + content.slice(idx + change.oldCode.length);
      fs.writeFileSync(filePath, updated, 'utf-8');
    }
  }

  async runTest(): Promise<TestRunResult> {
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
    const safeEnv = filterEnv(this.config.npmToken);
    const start = Date.now();

    try {
      const output = execSync(cmd, {
        cwd: this._workDir,
        encoding: 'utf-8',
        timeout,
        env: safeEnv,
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
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      const execErr = err as { status?: number; stdout?: string; stderr?: string; killed?: boolean };

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

  async reset(): Promise<void> {
    execSync('git checkout -- .', {
      cwd: this._workDir,
      encoding: 'utf-8',
    });
    execSync('git clean -fd', {
      cwd: this._workDir,
      encoding: 'utf-8',
    });
  }

  async pushAndCreatePR(options: {
    branchName: string;
    commitMessage: string;
    prTitle: string;
    prBody: string;
    baseBranch: string;
    changedFiles?: string[];
  }): Promise<PushResult> {
    const execOpts = { cwd: this._workDir, encoding: 'utf-8' as const };

    execFileSync('git', ['config', 'user.name', 'adept-triage-agent[bot]'], execOpts);
    execFileSync('git', ['config', 'user.email', 'adept-triage-agent[bot]@users.noreply.github.com'], execOpts);
    execFileSync('git', ['checkout', '-b', options.branchName], execOpts);

    execFileSync('git', ['reset', 'HEAD'], execOpts);
    if (options.changedFiles && options.changedFiles.length > 0) {
      execFileSync('git', ['add', ...options.changedFiles], execOpts);
    } else {
      execFileSync('git', ['add', '-A'], execOpts);
      const scaffoldFiles = ['.npmrc', '.env', '.env.local'];
      for (const f of scaffoldFiles) {
        try {
          execFileSync('git', ['reset', 'HEAD', f], { ...execOpts, stdio: 'pipe' });
        } catch {
          // file not staged — fine
        }
      }
    }
    execFileSync('git', ['commit', '-m', options.commitMessage], execOpts);
    execFileSync('git', ['push', 'origin', options.branchName], { ...execOpts, stdio: 'pipe' });

    const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], execOpts).trim();

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

  async cleanup(): Promise<void> {
    try {
      fs.rmSync(this._workDir, { recursive: true, force: true });
    } catch (err) {
      core.warning(`Failed to clean up ${this._workDir}: ${err}`);
    }
  }
}
