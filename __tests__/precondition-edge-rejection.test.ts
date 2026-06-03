/**
 * Tests for `detectPreconditionEdgeRejection` (src/simplified-analyzer.ts) and its
 * wiring into `analyzeFailure`.
 *
 * Context: a transient edge/WAF/IP-allowlist/rate-limit rejection of a shared
 * login/token/auth precondition (e.g. `loginWithEmail failed with 403:
 * {"message":"Forbidden"}` — the AWS API Gateway default body, emitted before the
 * Lambda runs) must classify INCONCLUSIVE (recommend re-run), NOT PRODUCT_ISSUE.
 *
 * Precision contract: the deterministic short-circuit fires ONLY when an
 * auth-precondition 4xx (401/403/429) co-occurs with a recognized edge/gateway
 * body. A genuine product authz 4xx (which carries an app-specific `code`) must
 * fall through to the LLM, so it is NOT swallowed here.
 */
import {
  detectPreconditionEdgeRejection,
  analyzeFailure,
} from '../src/simplified-analyzer';
import type { ErrorData } from '../src/types';
import type { OpenAIClient } from '../src/openai-client';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}));

const baseErrorData = (overrides: Partial<ErrorData> = {}): ErrorData => ({
  message: '',
  stackTrace: '',
  testName: 'Test that user can log in and load all learn links on the dashboard page',
  fileName: 'webpack://learn-webapp/./cypress/support/commands.js',
  framework: 'cypress',
  ...overrides,
});

// The exact failure that motivated this heuristic (run 26899177199).
const INCIDENT_MESSAGE =
  'Error: loginWithEmail failed with 403: {"message":"Forbidden"}\n' +
  '  at Context.eval (webpack://learn-webapp/./cypress/support/commands.js:231:18)';

describe('detectPreconditionEdgeRejection', () => {
  describe('matches transient edge/gateway auth-precondition rejections (INCONCLUSIVE)', () => {
    it('classifies the loginWithEmail 403 {"message":"Forbidden"} incident as INCONCLUSIVE', () => {
      const result = detectPreconditionEdgeRejection(
        baseErrorData({ message: INCIDENT_MESSAGE })
      );

      expect(result).not.toBeNull();
      expect(result!.verdict).toBe('INCONCLUSIVE');
      expect(
        result!.indicators.some((i) => /auth precondition/i.test(i))
      ).toBe(true);
    });

    it('classifies a 429 "Limit Exceeded" rate-limit on the token endpoint as INCONCLUSIVE', () => {
      const result = detectPreconditionEdgeRejection(
        baseErrorData({
          message: 'Error: token failed with 429: {"message":"Limit Exceeded"}',
        })
      );

      expect(result).not.toBeNull();
      expect(result!.verdict).toBe('INCONCLUSIVE');
    });

    it('matches the secondary signal (auth endpoint + 4xx + gateway body) without a "failed with" throw', () => {
      const result = detectPreconditionEdgeRejection(
        baseErrorData({
          message: 'CypressError: cy.wait() timed out waiting for @loginWithEmail',
          logs: [
            'cy:xhr POST https://accounts.api.adept.at/web/loginWithEmail',
            'Status: 403',
            'Response body: {"message":"Missing Authentication Token"}',
          ],
        })
      );

      expect(result).not.toBeNull();
      expect(result!.verdict).toBe('INCONCLUSIVE');
    });
  });

  describe('returns null (defers to the LLM / product) for non-edge failures', () => {
    it('does NOT match a product authz 403 whose body carries an app `code`', () => {
      // App handlers return `{code, message}`; the brace-anchored body regex must
      // not treat this as a bare gateway body, so it falls through to the LLM.
      const result = detectPreconditionEdgeRejection(
        baseErrorData({
          message:
            'Error: loginWithEmail failed with 403: {"code":403,"message":"Forbidden"}',
        })
      );

      expect(result).toBeNull();
    });

    it('returns null when a strong product signal (5xx) is present alongside the gateway body', () => {
      const result = detectPreconditionEdgeRejection(
        baseErrorData({
          message:
            'Error: loginWithEmail failed with 403: {"message":"Forbidden"} ' +
            '— Internal Server Error',
        })
      );

      expect(result).toBeNull();
    });

    it('returns null for a login-page RENDER failure (no HTTP 4xx)', () => {
      const result = detectPreconditionEdgeRejection(
        baseErrorData({
          message:
            'Timed out retrying after 15000ms: Expected to find element: #password, but never found it.',
        })
      );

      expect(result).toBeNull();
    });

    it('returns null for an excluded status (400) even with a gateway-style body', () => {
      const result = detectPreconditionEdgeRejection(
        baseErrorData({
          message: 'Error: loginWithEmail failed with 400: {"message":"Forbidden"}',
        })
      );

      expect(result).toBeNull();
    });

    it('returns null for a non-auth 403 that happens to carry a gateway body', () => {
      const result = detectPreconditionEdgeRejection(
        baseErrorData({
          message: 'Error: loadCatalog failed with 403: {"message":"Forbidden"}',
          logs: ['cy:xhr GET https://content.api.adept.at/web/catalog', 'Status: 403'],
        })
      );

      expect(result).toBeNull();
    });

    it('returns null when there is no test-execution context', () => {
      // No framework and no cypress/webdriver/sauce keywords anywhere in the
      // combined context — the gate must reject it even though the auth-4xx +
      // gateway-body signals are present.
      const result = detectPreconditionEdgeRejection({
        message: 'Error: loginWithEmail failed with 403: {"message":"Forbidden"}',
        stackTrace: '',
        testName: 'n/a',
        fileName: 'n/a',
        framework: 'unknown',
      });

      expect(result).toBeNull();
    });

    it('returns null for empty error data', () => {
      expect(
        detectPreconditionEdgeRejection(baseErrorData({ message: '' }))
      ).toBeNull();
    });
  });
});

describe('analyzeFailure wiring for edge-precondition rejections', () => {
  it('short-circuits to INCONCLUSIVE @95 without calling the LLM', async () => {
    const client = {
      analyze: jest.fn(),
    } as unknown as OpenAIClient;

    const result = await analyzeFailure(
      client,
      baseErrorData({ message: INCIDENT_MESSAGE })
    );

    expect(result.verdict).toBe('INCONCLUSIVE');
    expect(result.confidence).toBe(95);
    expect((client.analyze as jest.Mock)).not.toHaveBeenCalled();
  });
});
