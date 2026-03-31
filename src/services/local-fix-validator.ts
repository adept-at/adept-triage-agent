import * as core from '@actions/core';
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

    execSync(
      `git clone --branch ${this.config.branch} --depth 50 ${cloneUrl} ${this._workDir}`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );

    core.info('📦 Installing dependencies...');
    try {
      execSync('npm ci 2>&1', {
        cwd: this._workDir,
        encoding: 'utf-8',
        stdio: 'pipe',
        maxBuffer: MAX_BUFFER,
      });
    } catch {
      core.info('npm ci failed, falling back to npm install');
      execSync('npm install 2>&1', {
        cwd: this._workDir,
        encoding: 'utf-8',
        stdio: 'pipe',
        maxBuffer: MAX_BUFFER,
      });
    }

    core.info('✅ Setup complete');
  }

  async applyFix(changes: Array<{ file: string; oldCode: string; newCode: string }>): Promise<void> {
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
      cmd = cmd.replace('{spec}', this.config.spec);
    }
    if (this.config.previewUrl) {
      cmd = cmd.replace('{url}', this.config.previewUrl);
    }

    const timeout = this.config.testTimeoutMs || DEFAULT_TEST_TIMEOUT_MS;
    const start = Date.now();

    try {
      const output = execSync(cmd, {
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
  }): Promise<PushResult> {
    const execOpts = { cwd: this._workDir, encoding: 'utf-8' as const };

    execFileSync('git', ['config', 'user.name', 'adept-triage-agent[bot]'], execOpts);
    execFileSync('git', ['config', 'user.email', 'adept-triage-agent[bot]@users.noreply.github.com'], execOpts);
    execFileSync('git', ['checkout', '-b', options.branchName], execOpts);
    execFileSync('git', ['add', '-A'], execOpts);
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
