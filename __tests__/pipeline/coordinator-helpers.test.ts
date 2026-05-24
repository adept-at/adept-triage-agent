/**
 * Tests for module-level helpers in `src/pipeline/coordinator.ts`:
 *   - `detectInfrastructureFailure` (v1.52.14: short-circuits Sauce session-
 *     creation timeouts to INCONCLUSIVE before LLM classification).
 *   - `shouldWriteSkillOutcome` (v1.52.5 contract; covered indirectly
 *     elsewhere — locked here for completeness).
 */
import {
  detectInfrastructureFailure,
  shouldWriteSkillOutcome,
} from '../../src/pipeline/coordinator';
import type { ErrorData } from '../../src/types';

const baseErrorData = (overrides: Partial<ErrorData> = {}): ErrorData => ({
  message: '',
  stackTrace: '',
  testName: 'unused',
  fileName: 'test/specs/foo.ts',
  framework: 'webdriverio',
  ...overrides,
});

describe('detectInfrastructureFailure (v1.52.14)', () => {
  it('returns null for empty error data', () => {
    expect(detectInfrastructureFailure(baseErrorData({ message: '', stackTrace: '' }))).toBeNull();
  });

  it('returns null for ordinary test assertion failures', () => {
    expect(
      detectInfrastructureFailure(
        baseErrorData({
          message: 'AssertionError: expected 4 to equal 5',
          stackTrace: 'at Context.<anonymous> (test.ts:14:5)',
        })
      )
    ).toBeNull();
  });

  it('matches the literal "Failed to create a session" framework error', () => {
    const result = detectInfrastructureFailure(
      baseErrorData({
        message: 'WebDriverError: Failed to create a session',
      })
    );
    expect(result).not.toBeNull();
    expect(result!.summary).toMatch(/[Ii]nconclusive/);
    expect(result!.indicators.some((i) => i.includes('session creation'))).toBe(true);
  });

  it('matches a Sauce Labs POST /session timeout signature', () => {
    const result = detectInfrastructureFailure(
      baseErrorData({
        message:
          'WebDriverError: The operation was aborted due to timeout when running ' +
          '"https://ondemand.us-west-1.saucelabs.com/wd/hub/session" with method "POST"',
      })
    );
    expect(result).not.toBeNull();
    expect(
      result!.indicators.some((i) => i.includes('Sauce Labs WebDriver endpoint'))
    ).toBe(true);
  });

  it('matches the WDIO startWebDriverSession stack frame plus a timeout phrase', () => {
    const result = detectInfrastructureFailure(
      baseErrorData({
        message: 'Error: aborted',
        stackTrace:
          'at startWebDriverSession (webdriver/lib/utils.js:42:5)\n' +
          'at Runner._initSession (wdio-runner/lib/index.js:142:9)',
      })
    );
    expect(result).not.toBeNull();
    expect(
      result!.indicators.some((i) =>
        i.includes('WebDriver/WebdriverIO startup')
      )
    ).toBe(true);
  });

  it('does NOT match Sauce-shaped URLs that lack a timeout/abort phrase', () => {
    // The Sauce URL appears in a normal log frame; without a timeout
    // phrase, the heuristic should not trigger.
    const result = detectInfrastructureFailure(
      baseErrorData({
        message:
          'POST https://ondemand.us-west-1.saucelabs.com/wd/hub/session 200 OK',
      })
    );
    expect(result).toBeNull();
  });
});

describe('shouldWriteSkillOutcome (v1.52.5 contract)', () => {
  it('returns false for null applyResult', () => {
    expect(shouldWriteSkillOutcome(null)).toBe(false);
  });

  it('returns false when validation status is pending', () => {
    expect(
      shouldWriteSkillOutcome({
        success: true,
        modifiedFiles: [],
        validationStatus: 'pending',
      })
    ).toBe(false);
  });

  it('returns true on terminal passed', () => {
    expect(
      shouldWriteSkillOutcome({
        success: true,
        modifiedFiles: [],
        validationStatus: 'passed',
      })
    ).toBe(true);
  });

  it('returns true on terminal failed', () => {
    expect(
      shouldWriteSkillOutcome({
        success: false,
        modifiedFiles: [],
        validationStatus: 'failed',
      })
    ).toBe(true);
  });

  it('returns true on terminal inconclusive', () => {
    expect(
      shouldWriteSkillOutcome({
        success: false,
        modifiedFiles: [],
        validationStatus: 'inconclusive',
      })
    ).toBe(true);
  });

  it('prefers validationResult.status over the legacy validationStatus', () => {
    expect(
      shouldWriteSkillOutcome({
        success: false,
        modifiedFiles: [],
        validationStatus: 'pending',
        validationResult: { status: 'failed', mode: 'remote', conclusion: 'failure' },
      })
    ).toBe(true);
  });
});
