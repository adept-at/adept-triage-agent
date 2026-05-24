/**
 * Tests for the env-filter (`shouldDropEnvVar`) used by
 * `LocalFixValidator.runTest()` to scrub credentials from the test
 * subprocess environment.
 *
 * Pre-v1.52.17 the filter was a fixed deny-list of 18 names. The
 * v1.52.17 redesign keeps the explicit-deny list for known triage-agent
 * credentials, ADDS a categorical credential pattern that catches
 * future credentials by name shape (TOKEN, SECRET, KEY-bounded, PAT-
 * bounded, etc.), and adds a small allow-override for test-suite
 * credentials that match the pattern but are legitimately needed by
 * the test process (Sauce, Mailosaur, etc.).
 *
 * Tests below cover all three layers and a representative set of
 * shouldn't-drop cases (PATH, NODE_OPTIONS, CYPRESS_BASE_URL, ...) so
 * a future regression that broadens the deny pattern is caught.
 */
import { shouldDropEnvVar } from '../../src/services/local-fix-validator';

describe('shouldDropEnvVar — explicit deny-list (triage-agent credentials)', () => {
  test.each([
    'GITHUB_TOKEN',
    'OPENAI_API_KEY',
    'CURSOR_API_KEY',
    'NPM_TOKEN',
    'CROSS_REPO_PAT',
    'INPUT_GITHUB_TOKEN',
    'INPUT_OPENAI_API_KEY',
    'INPUT_CURSOR_API_KEY',
    'INPUT_NPM_TOKEN',
    'INPUT_CROSS_REPO_PAT',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_DEFAULT_REGION',
    'AWS_REGION',
    'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
    'ACTIONS_ID_TOKEN_REQUEST_URL',
    'SLACK_WEBHOOK_URL',
    'INPUT_SLACK_WEBHOOK_URL',
  ])('drops %s', (key) => {
    expect(shouldDropEnvVar(key)).toBe(true);
  });
});

describe('shouldDropEnvVar — categorical credential pattern (defense in depth)', () => {
  test.each([
    'SOME_NEW_TOKEN',
    'CUSTOM_API_KEY',
    'PROVIDER_SECRET',
    'DATABASE_PASSWORD',
    'MY_PASSPHRASE',
    'SERVICE_CREDENTIALS',
    'AWS_ACCESS_KEY', // bounded `KEY` token
    'GOOGLE_PRIVATE_KEY',
    'ANOTHER_PAT',
  ])('drops %s by pattern', (key) => {
    expect(shouldDropEnvVar(key)).toBe(true);
  });

  test.each([
    'PATH',
    'PATTERN',
    'KEYBOARD',
    'KEYWORD',
    'PATIENCE',
    'NODE_OPTIONS',
    'NODE_ENV',
    'NODE_PATH',
    'CYPRESS_BASE_URL',
    'WDIO_LOG_LEVEL',
    'BROWSER_NAME',
    'CI',
    'GITHUB_REF',
    'GITHUB_SHA',
    'GITHUB_RUN_ID',
    'RUNNER_TEMP',
    'RUNNER_TOOL_CACHE',
    'HOME',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'NPM_CONFIG_REGISTRY',
    'npm_package_name',
    'npm_lifecycle_event',
  ])('keeps %s (false-positive guard)', (key) => {
    expect(shouldDropEnvVar(key)).toBe(false);
  });
});

describe('shouldDropEnvVar — allow-overrides for test-suite credentials', () => {
  test.each([
    'SAUCE_USERNAME',
    'SAUCE_ACCESS_KEY',
    'MAILOSAUR_API_KEY',
    'CYPRESS_RECORD_KEY',
    'BROWSERSTACK_USERNAME',
    'BROWSERSTACK_ACCESS_KEY',
  ])('allows %s through despite credential pattern', (key) => {
    expect(shouldDropEnvVar(key)).toBe(false);
  });
});
