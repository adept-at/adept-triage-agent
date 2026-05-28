/**
 * Shared retry utility for transient GitHub / network failures.
 *
 * Retries only on transient signals (rate limiting, 5xx, and a small set of
 * Node network error codes) so deterministic client errors (400/401/403/404)
 * fail fast instead of wasting attempts. Backoff is exponential with jitter to
 * avoid synchronized retries across concurrent callers.
 *
 * Dependency-free besides `@actions/core` so it can be used from any layer.
 */

import * as core from '@actions/core';

/** Node network error codes worth retrying — transient connectivity blips. */
const RETRYABLE_NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']);

export interface RetryOptions {
  /** Human-readable description of the operation, used in retry warnings. */
  context: string;
  /** Maximum number of attempts (including the first). */
  maxRetries?: number;
  /** HTTP status codes that should trigger a retry. */
  retryableStatuses?: number[];
  /** Base backoff delay in milliseconds. */
  baseDelayMs?: number;
  /** Upper bound on a single backoff delay in milliseconds. */
  maxDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract the `status`/`code` fields off an unknown error, if present. */
function extractErrorFields(error: unknown): {
  status?: number;
  code?: string;
} {
  if (!error || typeof error !== 'object') return {};
  const status = (error as { status?: unknown }).status;
  const code = (error as { code?: unknown }).code;
  return {
    status: typeof status === 'number' ? status : undefined,
    code: typeof code === 'string' ? code : undefined,
  };
}

/**
 * Execute `fn` with retry on transient failures.
 *
 * Retries when the caught error has a `status` in `retryableStatuses` or a
 * `code` in the retryable network set. Any other error is rethrown
 * immediately. After the final attempt fails, the last error is thrown.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions
): Promise<T> {
  const {
    context,
    maxRetries = 3,
    retryableStatuses = [429, 502, 503, 504],
    baseDelayMs = 1000,
    maxDelayMs = 10000,
  } = opts;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const { status, code } = extractErrorFields(error);
      const retryable =
        (status !== undefined && retryableStatuses.includes(status)) ||
        (code !== undefined && RETRYABLE_NETWORK_CODES.has(code));

      if (!retryable || attempt >= maxRetries - 1) {
        throw error;
      }

      const delay =
        Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) *
        (0.5 + Math.random() * 0.5);
      core.warning(
        `Retrying ${context} after ${status || code} (attempt ${
          attempt + 1
        }/${maxRetries})`
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
