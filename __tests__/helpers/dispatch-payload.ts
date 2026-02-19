/**
 * Contract for repository_dispatch event_type: triage-failed-test.
 * Senders must pass client_payload with required fields; receiver workflow
 * validates before calling adept-triage-agent. This module encodes the same
 * contract for integration tests.
 */

export interface TriageDispatchPayload {
  workflow_run_id: string;
  job_name: string;
  spec?: string;
  branch?: string;
  commit_sha?: string;
  preview_url?: string;
}

const WORKFLOW_RUN_ID_REGEX = /^[0-9]+$/;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates client_payload for triage-failed-test dispatch.
 * Required: workflow_run_id (numeric string), job_name (non-empty).
 * Optional: spec, branch, commit_sha, preview_url.
 */
export function validateTriageDispatchPayload(
  payload: unknown
): ValidationResult {
  if (payload === null || typeof payload !== 'object') {
    return { valid: false, error: 'Payload must be an object' };
  }
  const p = payload as Record<string, unknown>;

  const workflowRunId = p.workflow_run_id;
  if (workflowRunId === undefined || workflowRunId === null) {
    return { valid: false, error: 'Missing required field: workflow_run_id' };
  }
  if (typeof workflowRunId !== 'string') {
    return {
      valid: false,
      error: `workflow_run_id must be a string (numeric), got ${typeof workflowRunId}`,
    };
  }
  if (!WORKFLOW_RUN_ID_REGEX.test(workflowRunId)) {
    return {
      valid: false,
      error: `workflow_run_id must be numeric, got: ${workflowRunId}`,
    };
  }

  const jobName = p.job_name;
  if (jobName === undefined || jobName === null) {
    return { valid: false, error: 'Missing required field: job_name' };
  }
  if (typeof jobName !== 'string') {
    return {
      valid: false,
      error: `job_name must be a string, got ${typeof jobName}`,
    };
  }
  if (jobName.trim() === '') {
    return { valid: false, error: 'job_name must be non-empty' };
  }

  if (p.spec !== undefined && typeof p.spec !== 'string') {
    return { valid: false, error: 'spec must be a string when present' };
  }
  if (p.branch !== undefined && typeof p.branch !== 'string') {
    return { valid: false, error: 'branch must be a string when present' };
  }
  if (p.commit_sha !== undefined && typeof p.commit_sha !== 'string') {
    return { valid: false, error: 'commit_sha must be a string when present' };
  }
  if (p.preview_url !== undefined && typeof p.preview_url !== 'string') {
    return { valid: false, error: 'preview_url must be a string when present' };
  }

  return { valid: true };
}
