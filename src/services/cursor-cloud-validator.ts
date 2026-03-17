/**
 * Cursor Cloud Agent Validator
 *
 * Launches a Cursor cloud agent to validate a fix by running the actual
 * test suite against the fix branch. The agent runs in an isolated VM
 * with full browser/desktop capabilities.
 *
 * This is an alternative validation path to the GitHub Actions
 * workflow_dispatch approach in fix-applier.ts. The firing workflow
 * chooses which path to use via the ENABLE_CURSOR_VALIDATION input.
 */

import * as core from '@actions/core';
import { CURSOR_CLOUD } from '../config/constants';
import {
  CursorValidationResult,
  CursorAgentMessage,
  CursorAgentArtifact,
} from '../types';
import { buildValidationPrompt } from './cursor-prompt-builder';

export interface CursorValidationParams {
  /** GitHub repository URL (e.g., https://github.com/adept-at/lib-wdio-8-multi-remote) */
  repositoryUrl: string;
  /** Branch containing the fix to validate */
  branch: string;
  /** Spec file to run */
  spec: string;
  /** Base URL for the test target */
  previewUrl: string;
  /** Test framework: 'cypress' or 'webdriverio' */
  framework?: string;
  /** Test command template with {spec} and {url} placeholders */
  testCommand?: string;
  /** Triage run ID for traceability */
  triageRunId?: string;
}

interface CursorAgentResponse {
  id: string;
  name?: string;
  status: string;
  source?: {
    repository: string;
    ref?: string;
  };
  target?: {
    branchName?: string;
    url?: string;
    prUrl?: string;
    autoCreatePr?: boolean;
  };
  summary?: string;
  createdAt?: string;
}

interface CursorConversationResponse {
  id: string;
  messages: CursorAgentMessage[];
}

interface CursorArtifactsResponse {
  artifacts: CursorAgentArtifact[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CursorCloudValidator {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || CURSOR_CLOUD.API_BASE_URL;
  }

  /**
   * Launch a Cursor cloud agent to validate the fix, then optionally
   * poll for completion and parse results.
   */
  async validate(
    params: CursorValidationParams,
    mode: 'poll' | 'async' = 'poll',
    timeoutMs?: number
  ): Promise<CursorValidationResult> {
    const agentId = await this.launchAgent(params);

    if (mode === 'async') {
      core.info(
        `Cursor cloud agent launched in async mode: ${this.agentUrl(agentId)}`
      );
      return {
        agentId,
        status: 'CREATING',
        testPassed: null,
        summary: 'Cursor cloud agent launched. Results will be available asynchronously.',
        agentUrl: this.agentUrl(agentId),
      };
    }

    const finalStatus = await this.pollForCompletion(
      agentId,
      timeoutMs || CURSOR_CLOUD.VALIDATION_TIMEOUT_MS
    );
    return this.buildResult(agentId, finalStatus);
  }

  private async launchAgent(params: CursorValidationParams): Promise<string> {
    const prompt = buildValidationPrompt(params);

    core.info(`Launching Cursor cloud agent for ${params.repositoryUrl}`);
    core.info(`  Branch: ${params.branch}`);
    core.info(`  Spec: ${params.spec}`);

    const body = {
      prompt: { text: prompt },
      source: {
        repository: params.repositoryUrl,
        ref: params.branch,
      },
      target: {
        autoCreatePr: false,
      },
    };

    const response = await this.request<CursorAgentResponse>(
      'POST',
      '/v0/agents',
      body
    );

    core.info(`Cursor cloud agent created: ${response.id}`);
    core.info(`  URL: ${this.agentUrl(response.id)}`);

    return response.id;
  }

  private async pollForCompletion(
    agentId: string,
    timeoutMs: number
  ): Promise<string> {
    core.info(`Waiting for Cursor cloud agent ${agentId} to complete...`);

    await sleep(CURSOR_CLOUD.INITIAL_DELAY_MS);

    const deadline = Date.now() + timeoutMs;
    let attempts = 0;

    while (Date.now() < deadline && attempts < CURSOR_CLOUD.MAX_POLL_ATTEMPTS) {
      attempts++;

      const agent = await this.getAgentStatus(agentId);
      core.info(
        `  Poll ${attempts}: status=${agent.status} (${Math.round((deadline - Date.now()) / 1000)}s remaining)`
      );

      if (CURSOR_CLOUD.TERMINAL_STATUSES.includes(agent.status)) {
        core.info(`Cursor cloud agent reached terminal status: ${agent.status}`);
        return agent.status;
      }

      await sleep(CURSOR_CLOUD.POLL_INTERVAL_MS);
    }

    core.warning(
      `Cursor cloud agent ${agentId} did not complete within ${timeoutMs}ms`
    );
    return 'TIMEOUT';
  }

  private async buildResult(
    agentId: string,
    finalStatus: string
  ): Promise<CursorValidationResult> {
    const result: CursorValidationResult = {
      agentId,
      status: finalStatus as CursorValidationResult['status'],
      testPassed: null,
      summary: '',
      agentUrl: this.agentUrl(agentId),
    };

    try {
      const agent = await this.getAgentStatus(agentId);
      result.summary = agent.summary || '';
      result.branchName = agent.target?.branchName;
      result.prUrl = agent.target?.prUrl;
    } catch (err) {
      core.debug(`Failed to fetch final agent status: ${err}`);
    }

    if (finalStatus === 'FINISHED' || finalStatus === 'ERROR') {
      try {
        const conversation = await this.getConversation(agentId);
        result.conversation = conversation.messages;
        result.testPassed = this.inferTestResult(conversation.messages);
      } catch (err) {
        core.debug(`Failed to fetch agent conversation: ${err}`);
      }

      try {
        const artifacts = await this.getArtifacts(agentId);
        result.artifacts = artifacts.artifacts;
      } catch (err) {
        core.debug(`Failed to fetch agent artifacts: ${err}`);
      }
    }

    if (!result.summary) {
      result.summary = this.generateFallbackSummary(result);
    }

    return result;
  }

  /**
   * Parse the agent conversation to determine if the test passed.
   * Looks for explicit pass/fail signals in the last assistant message.
   */
  private inferTestResult(messages: CursorAgentMessage[]): boolean | null {
    const assistantMessages = messages.filter(
      (m) => m.type === 'assistant_message'
    );
    if (assistantMessages.length === 0) return null;

    const lastMessage = assistantMessages[assistantMessages.length - 1].text.toLowerCase();

    const passSignals = [
      'test passed',
      'tests passed',
      'all passing',
      'all tests pass',
      'validation passed',
      'successfully passed',
      'test run passed',
      'specs passed',
      'suite passed',
    ];
    const failSignals = [
      'test failed',
      'tests failed',
      'validation failed',
      'test run failed',
      'specs failed',
      'suite failed',
      'failure detected',
      'assertion error',
      'did not pass',
    ];

    const hasPass = passSignals.some((s) => lastMessage.includes(s));
    const hasFail = failSignals.some((s) => lastMessage.includes(s));

    if (hasPass && !hasFail) return true;
    if (hasFail && !hasPass) return false;

    return null;
  }

  private generateFallbackSummary(result: CursorValidationResult): string {
    switch (result.status) {
      case 'FINISHED':
        if (result.testPassed === true) return 'Cursor cloud agent: tests passed';
        if (result.testPassed === false) return 'Cursor cloud agent: tests failed';
        return 'Cursor cloud agent finished but test result could not be determined';
      case 'ERROR':
        return 'Cursor cloud agent encountered an error during validation';
      case 'TIMEOUT':
        return 'Cursor cloud agent validation timed out';
      default:
        return `Cursor cloud agent status: ${result.status}`;
    }
  }

  async getAgentStatus(agentId: string): Promise<CursorAgentResponse> {
    return this.request<CursorAgentResponse>('GET', `/v0/agents/${agentId}`);
  }

  async getConversation(agentId: string): Promise<CursorConversationResponse> {
    return this.request<CursorConversationResponse>(
      'GET',
      `/v0/agents/${agentId}/conversation`
    );
  }

  async getArtifacts(agentId: string): Promise<CursorArtifactsResponse> {
    return this.request<CursorArtifactsResponse>(
      'GET',
      `/v0/agents/${agentId}/artifacts`
    );
  }

  private agentUrl(agentId: string): string {
    return `https://cursor.com/agents?id=${agentId}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const authHeader = `Basic ${Buffer.from(`${this.apiKey}:`).toString('base64')}`;

    const options: RequestInit = {
      method,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Cursor API ${method} ${path} failed: ${response.status} ${response.statusText}${text ? ` — ${text}` : ''}`
      );
    }

    return response.json() as Promise<T>;
  }
}
