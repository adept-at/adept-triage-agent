/**
 * Base Agent Implementation
 * Provides the foundation for all repair agents
 */

import * as core from '@actions/core';
import OpenAI from 'openai';
import { OpenAIClient } from '../openai-client';
import { ReasoningEffort } from '../config/constants';

type ChatContentPart =
  | OpenAI.Chat.Completions.ChatCompletionContentPartText
  | OpenAI.Chat.Completions.ChatCompletionContentPartImage;

/**
 * Maps the internal framework identifier to a human-readable label for prompts.
 * Single source of truth -- all agents should use this instead of inline ternaries.
 */
export function getFrameworkLabel(framework?: string): string {
  switch (framework) {
    case 'webdriverio':
      return 'WebDriverIO';
    case 'cypress':
      return 'Cypress';
    default:
      return 'unknown';
  }
}

/**
 * Result of an agent execution
 */
export interface AgentResult<T = unknown> {
  /** Whether the agent completed successfully */
  success: boolean;
  /** The output data from the agent */
  data?: T;
  /** Error message if the agent failed */
  error?: string;
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Number of API calls made */
  apiCalls: number;
  /** Tokens used (input + output) */
  tokensUsed?: number;
  /** OpenAI Responses API response ID for chaining */
  responseId?: string;
}

/**
 * Context passed to all agents
 */
export interface AgentContext {
  /** Error message from the test failure */
  errorMessage: string;
  /** Test file path */
  testFile: string;
  /** Test name */
  testName: string;
  /** Error type (ELEMENT_NOT_FOUND, TIMEOUT, etc.) */
  errorType?: string;
  /** Selector that failed (if applicable) */
  errorSelector?: string;
  /** Stack trace */
  stackTrace?: string;
  /** Screenshots (base64) */
  screenshots?: Array<{
    name: string;
    base64Data?: string;
  }>;
  /** Additional logs */
  logs?: string[];
  /** PR/commit diff from the test repo */
  prDiff?: {
    files: Array<{
      filename: string;
      patch?: string;
      status: string;
    }>;
  };
  /** Recent diff from the product repo (e.g. learn-webapp) — always fetched */
  productDiff?: {
    files: Array<{
      filename: string;
      patch?: string;
      status: string;
    }>;
  };
  /** Test framework: 'cypress' or 'webdriverio' (for sub-agent prompts) */
  framework?: string;
  /** Source file content (if fetched) */
  sourceFileContent?: string;
  /** Related files content */
  relatedFiles?: Map<string, string>;
  /** Pre-formatted skills text for prompt injection (set by orchestrator) */
  skillsPrompt?: string;
  /** Context-aware briefing from the orchestrator for the current agent stage */
  delegationContext?: string;
  /** Whether to include screenshot images in the API call (default true). */
  includeScreenshots?: boolean;
  /** Summary of investigation findings, available for downstream skill saving */
  investigationSummary?: string;
  /** Prior investigation findings from skill store, for the investigation agent */
  priorInvestigationContext?: string;
  /**
   * Repo-level conventions block fetched from `.adept-triage/context.md`
   * in the consumer repo. Pre-formatted with a markdown header and
   * sanitized; safe to prepend verbatim to any agent's system prompt.
   * Empty when the repo hasn't opted in (the common case today). See
   * `RepoContextFetcher` for fetch/cache/escape semantics.
   */
  repoContext?: string;
}

/**
 * Configuration for agent execution
 */
export interface AgentConfig {
  /** Maximum time to wait for agent completion */
  timeoutMs: number;
  /** Temperature for AI model */
  temperature: number;
  /** Maximum tokens for response */
  maxTokens: number;
  /** Whether to include detailed logs */
  verbose: boolean;
  /** Override model for this agent (defaults to OPENAI.LEGACY_MODEL via openai-client) */
  model?: string;
  /** Reasoning effort for this agent ('none' = no reasoning field sent) */
  reasoningEffort?: ReasoningEffort;
}

/**
 * Default agent configuration
 */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  timeoutMs: 60000,
  temperature: 0.3,
  maxTokens: 4000,
  verbose: false,
};

/**
 * Base class for all repair agents
 */
export abstract class BaseAgent<TInput, TOutput> {
  protected openaiClient: OpenAIClient;
  protected config: AgentConfig;
  protected agentName: string;

  constructor(
    openaiClient: OpenAIClient,
    agentName: string,
    config: Partial<AgentConfig> = {}
  ) {
    this.openaiClient = openaiClient;
    this.agentName = agentName;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
  }

  /**
   * Execute the agent's main task
   */
  abstract execute(
    input: TInput,
    context: AgentContext,
    previousResponseId?: string
  ): Promise<AgentResult<TOutput>>;

  /**
   * Get the system prompt for this agent.
   * Framework is passed so agents can specialize their prompts.
   */
  protected abstract getSystemPrompt(framework?: string): string;

  /**
   * Build the user prompt from input and context
   */
  protected abstract buildUserPrompt(
    input: TInput,
    context: AgentContext
  ): string;

  /**
   * Parse the AI response into the expected output format
   */
  protected abstract parseResponse(response: string): TOutput | null;

  /**
   * Execute the agent with timeout and error handling
   */
  protected async executeWithTimeout(
    input: TInput,
    context: AgentContext,
    previousResponseId?: string
  ): Promise<AgentResult<TOutput>> {
    const startTime = Date.now();
    let apiCalls = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      core.info(`[${this.agentName}] Starting execution...`);

      // Create a timeout promise that can be cleaned up
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Agent timed out after ${this.config.timeoutMs}ms`));
        }, this.config.timeoutMs);
      });

      // Execute the agent task
      const taskPromise = this.runAgentTask(input, context, previousResponseId);
      apiCalls++;

      // Race between task and timeout
      const { data: result, responseId } = await Promise.race([taskPromise, timeoutPromise]);
      clearTimeout(timeoutId);

      const executionTimeMs = Date.now() - startTime;
      core.info(`[${this.agentName}] Completed in ${executionTimeMs}ms`);

      return {
        success: true,
        data: result,
        executionTimeMs,
        apiCalls,
        responseId,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const executionTimeMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      core.warning(`[${this.agentName}] Failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        executionTimeMs,
        apiCalls,
      };
    }
  }

  /**
   * Run the actual agent task
   */
  private async runAgentTask(
    input: TInput,
    context: AgentContext,
    previousResponseId?: string
  ): Promise<{ data: TOutput; responseId: string }> {
    // Compose the system prompt: agent-specific instructions first,
    // then repo conventions appended below. Order matters — the
    // agent's role/contract should set the frame, repo conventions
    // refine "how this repo does things." Putting repo first would
    // risk the model treating conventions as the primary task.
    //
    // Empty `repoContext` (the common case until repos opt in)
    // collapses to a no-op concatenation so prompt size for
    // non-onboarded repos is unchanged.
    const baseSystemPrompt = this.getSystemPrompt(context.framework);
    const systemPrompt = context.repoContext
      ? `${baseSystemPrompt}\n\n${context.repoContext}`
      : baseSystemPrompt;
    const userPrompt = this.buildUserPrompt(input, context);

    if (this.config.verbose) {
      core.debug(
        `[${this.agentName}] System prompt: ${systemPrompt.slice(0, 200)}...`
      );
      core.debug(
        `[${this.agentName}] User prompt: ${userPrompt.slice(0, 200)}...`
      );
    }

    // Build content array for multimodal support
    const content: ChatContentPart[] = [{ type: 'text', text: userPrompt }];

    if (context.includeScreenshots !== false && context.screenshots && context.screenshots.length > 0) {
      for (const screenshot of context.screenshots) {
        if (screenshot.base64Data) {
          content.push({
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${screenshot.base64Data}`,
            },
          });
        }
      }
    }

    const { text, responseId } = await this.openaiClient.generateWithCustomPrompt({
      systemPrompt,
      userContent: content,
      temperature: this.config.temperature,
      responseAsJson: true,
      previousResponseId,
      model: this.config.model,
      reasoningEffort: this.config.reasoningEffort,
    });

    const parsed = this.parseResponse(text);
    if (!parsed) {
      throw new Error('Failed to parse agent response');
    }

    return { data: parsed, responseId };
  }

  /**
   * Log agent activity for debugging
   */
  protected log(
    message: string,
    level: 'info' | 'debug' | 'warning' = 'info'
  ): void {
    const formattedMessage = `[${this.agentName}] ${message}`;
    switch (level) {
      case 'debug':
        if (this.config.verbose) {
          core.debug(formattedMessage);
        }
        break;
      case 'warning':
        core.warning(formattedMessage);
        break;
      default:
        core.info(formattedMessage);
    }
  }
}

/**
 * Helper to create agent context from error data
 */
export function createAgentContext(params: {
  errorMessage: string;
  testFile: string;
  testName: string;
  errorType?: string;
  errorSelector?: string;
  stackTrace?: string;
  screenshots?: Array<{ name: string; base64Data?: string }>;
  logs?: string[];
  prDiff?: {
    files: Array<{ filename: string; patch?: string; status: string }>;
  };
  productDiff?: {
    files: Array<{ filename: string; patch?: string; status: string }>;
  };
  /** Test framework: 'cypress' or 'webdriverio' */
  framework?: string;
  /** Repo-level conventions (pre-rendered) — see AgentContext.repoContext */
  repoContext?: string;
}): AgentContext {
  return {
    errorMessage: params.errorMessage,
    testFile: params.testFile,
    testName: params.testName,
    errorType: params.errorType,
    errorSelector: params.errorSelector,
    stackTrace: params.stackTrace,
    screenshots: params.screenshots,
    logs: params.logs,
    prDiff: params.prDiff,
    productDiff: params.productDiff,
    framework: params.framework,
    repoContext: params.repoContext,
  };
}
