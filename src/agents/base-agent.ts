/**
 * Base Agent Implementation
 * Provides the foundation for all repair agents
 */

import * as core from '@actions/core';
import OpenAI from 'openai';
import { OpenAIClient } from '../openai-client';

type ChatContentPart =
  | OpenAI.Chat.Completions.ChatCompletionContentPartText
  | OpenAI.Chat.Completions.ChatCompletionContentPartImage;

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
  /** PR diff information */
  prDiff?: {
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
    context: AgentContext
  ): Promise<AgentResult<TOutput>>;

  /**
   * Get the system prompt for this agent
   */
  protected abstract getSystemPrompt(): string;

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
    context: AgentContext
  ): Promise<AgentResult<TOutput>> {
    const startTime = Date.now();
    let apiCalls = 0;

    try {
      core.info(`[${this.agentName}] Starting execution...`);

      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Agent timed out after ${this.config.timeoutMs}ms`));
        }, this.config.timeoutMs);
      });

      // Execute the agent task
      const taskPromise = this.runAgentTask(input, context);
      apiCalls++;

      // Race between task and timeout
      const result = await Promise.race([taskPromise, timeoutPromise]);

      const executionTimeMs = Date.now() - startTime;
      core.info(`[${this.agentName}] Completed in ${executionTimeMs}ms`);

      return {
        success: true,
        data: result,
        executionTimeMs,
        apiCalls,
      };
    } catch (error) {
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
    context: AgentContext
  ): Promise<TOutput> {
    const systemPrompt = this.getSystemPrompt();
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

    // Add screenshots if available
    if (context.screenshots && context.screenshots.length > 0) {
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

    const response = await this.openaiClient.generateWithCustomPrompt({
      systemPrompt,
      userContent: content,
      temperature: this.config.temperature,
      responseAsJson: true,
    });

    const parsed = this.parseResponse(response);
    if (!parsed) {
      throw new Error('Failed to parse agent response');
    }

    return parsed;
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
  /** Test framework: 'cypress' or 'webdriverio' */
  framework?: string;
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
    framework: params.framework,
  };
}
