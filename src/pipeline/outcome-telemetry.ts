import * as core from '@actions/core';
import {
  ActionInputs,
  ErrorData,
  FixRecommendation,
  OutcomeEvent,
  RepairStatus,
  RepairTelemetry,
  ValidationStatus,
} from '../types';
import { isCanaryRepo } from '../config/constants';
import { normalizeSpec } from '../services/skill-store';
import { fixFingerprint } from './validator';

export interface OutcomeBuildParams {
  inputs: ActionInputs;
  errorData: ErrorData;
  verdict: string;
  confidence: number;
  fixRecommendation?: FixRecommendation | null;
  autoFixResult?: {
    success?: boolean;
    modifiedFiles?: string[];
    validationResult?: { status?: ValidationStatus };
    validationStatus?: ValidationStatus;
    prUrl?: string;
  } | null;
  repairTelemetry?: RepairTelemetry;
  autoFixSkipped?: boolean;
  autoFixSkippedReason?: string;
  skillId?: string;
  repo: string;
}

function normalizeFailureKey(spec: string, testName: string): string {
  return `${normalizeSpec(spec) || 'unknown'}|${testName || 'unknown'}`;
}

const REVIEW_APPROVED_STATUSES: RepairStatus[] = [
  'approved',
  'applied',
  'validated',
  'validated_publish_failed',
  'validated_not_published',
];

export function buildOutcomeEvent(params: OutcomeBuildParams): OutcomeEvent {
  const {
    inputs,
    errorData,
    verdict,
    confidence,
    fixRecommendation,
    autoFixResult,
    repairTelemetry,
    autoFixSkipped,
    autoFixSkippedReason,
    skillId,
    repo,
  } = params;

  const spec = normalizeSpec(errorData.fileName) || 'unknown';
  const testName = errorData.testName || 'unknown';
  const validationStatus: ValidationStatus | '' =
    autoFixResult?.validationResult?.status ||
    autoFixResult?.validationStatus ||
    '';
  const validationPassed = validationStatus === 'passed';
  const fixFullyAccepted = !!autoFixResult?.success && validationPassed;
  const repairStatus = repairTelemetry?.status || 'not_started';

  const s1 = verdict === 'TEST_ISSUE';
  const s2 = !!fixRecommendation;
  const s3 =
    s2 &&
    REVIEW_APPROVED_STATUSES.includes(repairStatus as RepairStatus);
  const s5 =
    !!autoFixResult &&
    ((autoFixResult.modifiedFiles?.length ?? 0) > 0 ||
      ['applied', 'validated', 'validated_publish_failed', 'validated_not_published'].includes(
        repairStatus
      ));
  const s4 =
    s1 &&
    !autoFixSkipped &&
    repairStatus !== 'skipped' &&
    repairStatus !== 'not_started';
  const s6 = validationPassed;
  const s7 = fixFullyAccepted;

  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  const triageRunId = GITHUB_RUN_ID || '';
  const triageRunUrl =
    GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
      ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
      : '';

  return {
    repo,
    spec,
    testName,
    failureKey: normalizeFailureKey(spec, testName),
    framework: errorData.framework || 'unknown',
    verdict,
    confidence,
    deploymentTier: isCanaryRepo(repo) ? 'canary' : 'production',
    s1_testIssue: s1,
    s2_fixGenerated: s2,
    s3_reviewApproved: s3,
    s4_baselineReproduced: s4,
    s5_patchApplied: s5,
    s6_validationPassed: s6,
    s7_published: s7,
    repairStatus,
    validationStatus: validationStatus || '',
    autoFixSkipped: !!autoFixSkipped,
    autoFixSkippedReason,
    fixFingerprint: fixRecommendation ? fixFingerprint(fixRecommendation) : undefined,
    skillId,
    prUrl: autoFixResult?.prUrl,
    repairElapsedMs: repairTelemetry?.elapsedMs,
    completedAt: new Date().toISOString(),
    triageRunId,
    sourceRunId: inputs.workflowRunId || '',
    triageRunUrl,
  };
}

export function logOutcomeSummary(event: OutcomeEvent): void {
  try {
    core.info(
      `📊 outcome-telemetry-summary ` +
        `tier=${event.deploymentTier} ` +
        `repo=${event.repo} ` +
        `triageRunId=${event.triageRunId} ` +
        `verdict=${event.verdict} ` +
        `s1=${event.s1_testIssue ? 1 : 0} ` +
        `s2=${event.s2_fixGenerated ? 1 : 0} ` +
        `s3=${event.s3_reviewApproved ? 1 : 0} ` +
        `s4=${event.s4_baselineReproduced ? 1 : 0} ` +
        `s5=${event.s5_patchApplied ? 1 : 0} ` +
        `s6=${event.s6_validationPassed ? 1 : 0} ` +
        `s7=${event.s7_published ? 1 : 0} ` +
        `repair=${event.repairStatus} ` +
        `validation=${event.validationStatus || 'none'}` +
        (event.skillId ? ` skillId=${event.skillId}` : '')
    );
  } catch {
    // Never-throw contract
  }
}
