import * as core from '@actions/core';
import * as github from '@actions/github';
import { ActionInputs, FixRecommendation } from '../types';
import { ApplyResult } from '../repair/fix-applier';
import { parseRepoString } from '../utils/repo-utils';

export function resolveAutoFixTargetRepo(inputs: ActionInputs): {
  owner: string;
  repo: string;
} {
  return parseRepoString(inputs.autoFixTargetRepo, 'AUTO_FIX_TARGET_REPO');
}

export function setInconclusiveOutput(
  result: { confidence: number; reasoning: string; indicators?: string[] },
  inputs: ActionInputs,
  errorData: { screenshots?: Array<{ name: string }>; logs?: string[] }
): void {
  const inconclusiveTriageJson = {
    verdict: 'INCONCLUSIVE',
    confidence: result.confidence,
    reasoning: `Low confidence: ${result.reasoning}`,
    summary: 'Analysis inconclusive due to low confidence',
    indicators: result.indicators || [],
    metadata: {
      analyzedAt: new Date().toISOString(),
      confidenceThreshold: inputs.confidenceThreshold,
      hasScreenshots:
        (errorData.screenshots && errorData.screenshots.length > 0) || false,
      logSize: errorData.logs?.reduce((sum, l) => sum + l.length, 0) ?? 0,
    },
  };
  core.setOutput('verdict', 'INCONCLUSIVE');
  core.setOutput('confidence', result.confidence.toString());
  core.setOutput('reasoning', `Low confidence: ${result.reasoning}`);
  core.setOutput('summary', 'Analysis inconclusive due to low confidence');
  core.setOutput('triage_json', JSON.stringify(inconclusiveTriageJson));
}

export function setErrorOutput(reason: string): void {
  core.setOutput('verdict', 'ERROR');
  core.setOutput('confidence', '0');
  core.setOutput('reasoning', reason);
  core.setOutput('summary', `Triage failed: ${reason}`);
  core.setOutput(
    'triage_json',
    JSON.stringify({
      verdict: 'ERROR',
      confidence: 0,
      reasoning: reason,
      summary: `Triage failed: ${reason}`,
      indicators: [],
      metadata: { analyzedAt: new Date().toISOString(), error: true },
    })
  );
  core.setFailed(reason);
}

export function setSuccessOutput(
  result: {
    verdict: string;
    confidence: number;
    reasoning: string;
    summary?: string;
    indicators?: string[];
    suggestedSourceLocations?: {
      file: string;
      lines: string;
      reason: string;
    }[];
    fixRecommendation?: FixRecommendation;
  },
  errorData: { screenshots?: Array<{ name: string }>; logs?: string[] },
  autoFixResult?: ApplyResult | null,
  flakiness?: { isFlaky: boolean; fixCount: number; windowDays: number; message: string }
): void {
  const triageJson = {
    verdict: result.verdict,
    confidence: result.confidence,
    reasoning: result.reasoning,
    summary: result.summary,
    indicators: result.indicators || [],
    ...(result.verdict === 'PRODUCT_ISSUE' && result.suggestedSourceLocations
      ? { suggestedSourceLocations: result.suggestedSourceLocations }
      : {}),
    ...(result.verdict === 'TEST_ISSUE' && result.fixRecommendation
      ? { fixRecommendation: result.fixRecommendation }
      : {}),
    ...(autoFixResult?.success
      ? {
          autoFix: {
            applied: true,
            branch: autoFixResult.branchName,
            commit: autoFixResult.commitSha,
            files: autoFixResult.modifiedFiles,
            validation: {
              status: autoFixResult.validationStatus || 'skipped',
              runId: autoFixResult.validationRunId,
              url: autoFixResult.validationUrl,
            },
          },
        }
      : {}),
    ...(flakiness?.isFlaky
      ? {
          flakiness: {
            isFlaky: true,
            fixCount: flakiness.fixCount,
            windowDays: flakiness.windowDays,
            message: flakiness.message,
          },
        }
      : {}),
    metadata: {
      analyzedAt: new Date().toISOString(),
      hasScreenshots:
        (errorData.screenshots && errorData.screenshots.length > 0) || false,
      logSize: errorData.logs?.reduce((sum, l) => sum + l.length, 0) ?? 0,
      hasFixRecommendation: !!result.fixRecommendation,
      autoFixApplied: autoFixResult?.success || false,
    },
  };

  core.setOutput('verdict', result.verdict);
  core.setOutput('confidence', result.confidence.toString());
  core.setOutput('reasoning', result.reasoning);
  core.setOutput('summary', result.summary);
  core.setOutput('triage_json', JSON.stringify(triageJson));

  if (result.fixRecommendation) {
    core.setOutput('has_fix_recommendation', 'true');
    core.setOutput(
      'fix_recommendation',
      JSON.stringify(result.fixRecommendation)
    );
    core.setOutput('fix_summary', result.fixRecommendation.summary);
    core.setOutput(
      'fix_confidence',
      result.fixRecommendation.confidence.toString()
    );
  } else {
    core.setOutput('has_fix_recommendation', 'false');
  }

  if (autoFixResult?.success) {
    core.setOutput('auto_fix_applied', 'true');
    core.setOutput('auto_fix_branch', autoFixResult.branchName || '');
    core.setOutput('auto_fix_commit', autoFixResult.commitSha || '');
    core.setOutput(
      'auto_fix_files',
      JSON.stringify(autoFixResult.modifiedFiles)
    );

    if (autoFixResult.validationRunId) {
      core.setOutput(
        'validation_run_id',
        autoFixResult.validationRunId.toString()
      );
      core.setOutput(
        'validation_status',
        autoFixResult.validationStatus || 'pending'
      );
      core.setOutput(
        'validation_url',
        autoFixResult.validationUrl ||
          `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${autoFixResult.validationRunId}`
      );
    } else if (autoFixResult.validationStatus === 'pending') {
      core.setOutput('validation_status', 'pending');
      if (autoFixResult.validationUrl) {
        core.setOutput('validation_url', autoFixResult.validationUrl);
      }
    } else {
      core.setOutput(
        'validation_status',
        autoFixResult.validationStatus || 'skipped'
      );
    }
  } else {
    core.setOutput('auto_fix_applied', 'false');
    core.setOutput(
      'validation_status',
      autoFixResult?.validationStatus || 'skipped'
    );
  }

  core.info(`Verdict: ${result.verdict}`);
  core.info(`Confidence: ${result.confidence}%`);
  core.info(`Summary: ${result.summary}`);

  if (
    result.verdict === 'PRODUCT_ISSUE' &&
    result.suggestedSourceLocations &&
    result.suggestedSourceLocations.length > 0
  ) {
    core.info('\n🎯 Suggested Source Locations to Investigate:');
    result.suggestedSourceLocations.forEach((location, index) => {
      core.info(`  ${index + 1}. ${location.file} (lines ${location.lines})`);
      core.info(`     Reason: ${location.reason}`);
    });
  }

  if (result.verdict === 'TEST_ISSUE' && result.fixRecommendation) {
    core.info('\n🔧 Fix Recommendation Generated:');
    core.info(`  Confidence: ${result.fixRecommendation.confidence}%`);
    core.info(
      `  Changes: ${result.fixRecommendation.proposedChanges.length} file(s)`
    );
    core.info(
      `  Evidence: ${result.fixRecommendation.evidence.length} item(s)`
    );
    core.info('\n📝 Fix Summary:');
    core.info(result.fixRecommendation.summary);

    if (autoFixResult?.success) {
      core.info('\n✅ Auto-Fix Applied:');
      core.info(`  Branch: ${autoFixResult.branchName}`);
      core.info(`  Commit: ${autoFixResult.commitSha}`);
      core.info(`  Files: ${autoFixResult.modifiedFiles.join(', ')}`);

      if (autoFixResult.validationStatus === 'passed') {
        core.info('\n🧪 Validation: passed (locally validated before push)');
      } else if (autoFixResult.validationRunId) {
        core.info(`\n🧪 Validation: ${autoFixResult.validationStatus}`);
        core.info(`  Run ID: ${autoFixResult.validationRunId}`);
      } else {
        core.info(`\n🧪 Validation: ${autoFixResult.validationStatus || 'skipped'}`);
      }
    }
  }
}
