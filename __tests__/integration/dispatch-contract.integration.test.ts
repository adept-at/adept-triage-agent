/**
 * Dispatch contract integration test.
 * Validates client_payload schema for triage-failed-test repository_dispatch.
 * Does not test polling or workflow completion (GitHub API behavior).
 *
 * Run: npm run test:integration -- --testPathPattern=dispatch-contract
 */

import {
  validateTriageDispatchPayload,
  type TriageDispatchPayload,
} from '../helpers/dispatch-payload';

describe('Dispatch contract (triage-failed-test client_payload)', () => {
  const validPayload: TriageDispatchPayload = {
    workflow_run_id: '12345678',
    job_name: 'sauceTest',
    spec: 'test/specs/orginvites/invite.org.learner.enroll.ts',
    branch: 'main',
    commit_sha: 'abc123def456',
    preview_url: 'https://learn.adept.at',
  };

  it('accepts valid payload with all fields', () => {
    const result = validateTriageDispatchPayload(validPayload);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts valid payload with only required fields', () => {
    const result = validateTriageDispatchPayload({
      workflow_run_id: '999',
      job_name: 'localTest',
    });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects missing workflow_run_id', () => {
    const { workflow_run_id: _, ...withoutRunId } = validPayload;
    const result = validateTriageDispatchPayload(withoutRunId);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/workflow_run_id/);
  });

  it('rejects missing job_name', () => {
    const { job_name: __, ...withoutJob } = validPayload;
    const result = validateTriageDispatchPayload(withoutJob);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/job_name/);
  });

  it('rejects non-numeric workflow_run_id', () => {
    const result = validateTriageDispatchPayload({
      ...validPayload,
      workflow_run_id: 'not-a-number',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/numeric/);
  });

  it('rejects workflow_run_id that is not a string', () => {
    const result = validateTriageDispatchPayload({
      ...validPayload,
      workflow_run_id: 12345 as unknown as string,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/string/);
  });

  it('rejects empty job_name', () => {
    const result = validateTriageDispatchPayload({
      ...validPayload,
      job_name: '   ',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/non-empty/);
  });

  it('rejects null payload', () => {
    const result = validateTriageDispatchPayload(null);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/object/);
  });

  it('rejects non-object payload', () => {
    expect(validateTriageDispatchPayload('string').valid).toBe(false);
    expect(validateTriageDispatchPayload(42).valid).toBe(false);
    expect(validateTriageDispatchPayload([]).valid).toBe(false);
  });

  it('rejects optional field with wrong type (spec)', () => {
    const result = validateTriageDispatchPayload({
      ...validPayload,
      spec: 123 as unknown as string,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/spec/);
  });

  it('rejects optional field with wrong type (preview_url)', () => {
    const result = validateTriageDispatchPayload({
      ...validPayload,
      preview_url: {} as unknown as string,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/preview_url/);
  });
});
