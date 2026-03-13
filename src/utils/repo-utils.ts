/**
 * Shared repository string utilities
 */

import * as core from '@actions/core';
import * as github from '@actions/github';

/**
 * Parse an "owner/repo" string into parts, falling back to the current GitHub context.
 */
export function parseRepoString(
  value: string | undefined,
  label: string
): { owner: string; repo: string } {
  if (value) {
    const cleaned = value.replace(/\.git$/i, '').trim();
    const parts = cleaned.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { owner: parts[0], repo: parts[1] };
    }
    core.warning(
      `Invalid ${label} '${value}'. Falling back to current repository context.`
    );
  }
  return github.context.repo;
}
