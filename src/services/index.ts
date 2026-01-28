/**
 * Service Container and Dependency Injection
 * Centralizes service instantiation for easier testing and future extensibility
 */

import { Octokit } from '@octokit/rest';
import { OpenAIClient } from '../openai-client';
import { ArtifactFetcher } from '../artifact-fetcher';
import { SimplifiedRepairAgent } from '../repair/simplified-repair-agent';
import { ActionInputs } from '../types';

/**
 * Container for all services used by the triage agent
 */
export interface Services {
  /** GitHub API client */
  github: Octokit;
  /** OpenAI API client */
  ai: OpenAIClient;
  /** Artifact fetching service */
  artifacts: ArtifactFetcher;
  /** Test repair agent */
  repairAgent: SimplifiedRepairAgent;
}

/**
 * Creates and configures all services needed for the triage agent
 * @param inputs Action inputs containing API keys and configuration
 * @returns Configured service container
 */
export function createServices(inputs: ActionInputs): Services {
  const github = new Octokit({ auth: inputs.githubToken });
  const ai = new OpenAIClient(inputs.openaiApiKey);
  const artifacts = new ArtifactFetcher(github);
  const repairAgent = new SimplifiedRepairAgent(ai);

  return {
    github,
    ai,
    artifacts,
    repairAgent
  };
}

/**
 * Creates services with custom instances (useful for testing)
 */
export function createServicesWithOverrides(
  inputs: ActionInputs,
  overrides: Partial<Services>
): Services {
  const defaults = createServices(inputs);
  return {
    ...defaults,
    ...overrides
  };
}
