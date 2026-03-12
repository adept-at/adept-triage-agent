/**
 * Integration test: verify the repair agent generates a COMPLETE fix
 * that covers all downstream lines affected by a null/undefined guard.
 *
 * Scenario: sauceGqlHelper returns null, causing JSON.parse(result) and
 * expect(upsertResult).toBeTruthy() to both fail. The model must guard
 * ALL of these lines, not just the first console.log.
 *
 * Run: OPENAI_API_KEY=sk-... npx jest --testPathPattern=repair-complete-scope --testPathIgnorePatterns='[]'
 */

import { SimplifiedRepairAgent } from '../../src/repair/simplified-repair-agent';
import { OpenAIClient } from '../../src/openai-client';
import { RepairContext, ErrorData } from '../../src/types';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn((...args: unknown[]) => console.log('WARN:', ...args)),
  debug: jest.fn(),
  error: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn(),
  getInput: jest.fn(),
}));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SKILL_LOCK_SOURCE = `import LoginPage from '../../pageobjects/login.page';
import { browser as mBrowser } from '@wdio/globals';
import { expect } from '@wdio/globals';

async function verifyPreview(mBrowser, text) {
  const preview = await mBrowser.$('[data-testid="skill-preview"]');
  await preview.waitForDisplayed({ timeout: 10000 });
  const content = await preview.getText();
  expect(content).toContain(text);
}

async function editSkillText(mBrowser, rando) {
  const editorEl = await mBrowser.$('[data-testid="lexical-editor"] [contenteditable]');
  await editorEl.waitForDisplayed({ timeout: 10000 });
  await editorEl.click();
  await mBrowser.execute(function (text) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand('insertText', false, text);
  }, rando);
  await mBrowser.$('[data-testid="auto-save-indicator"]').waitForDisplayed();
  await browser.pause(500);
  await mBrowser.waitUntil(async () => {
    const isDisabled = await mBrowser.$('[aria-label="Toggle edit mode"]').getAttribute('disabled');
    return isDisabled === null;
  }, { timeout: 30000, timeoutMsg: 'Auto-save did not complete within 30 seconds' });
  if (process.env.SAUCEY) {
    const result = await LoginPage.sauceGqlHelper(
      mBrowser,
      'content.api.adept.at',
      'upsertSkillBody'
    );
    console.log('upsertSkillBody', JSON.parse(result));
    const parsed = JSON.parse(result);
    const upsertResult = parsed?.data?.upsertSkillBody?.result;
    await expect(upsertResult).toBeTruthy();
  }
  await verifyPreview(mBrowser, rando);
}

describe('multi.skill.lock.editor', () => {
  it('should edit skill text and verify save', async () => {
    await LoginPage.openLoginPageLearn();
    await LoginPage.login('phil+test7@adept.at', 'Adept123!', false);
    await editSkillText(mBrowser, 'test-' + Date.now());
  });
});
`;

const ERROR_LINE = 40; // Line of `console.log('upsertSkillBody', JSON.parse(result));`
const JSON_PARSE_LINE = 41; // `const parsed = JSON.parse(result);`
const EXPECT_LINE = 43; // `await expect(upsertResult).toBeTruthy();`

describe('Repair agent complete fix scope', () => {
  const itOrSkip = OPENAI_API_KEY ? it : it.skip;

  itOrSkip(
    'fix must cover all downstream lines (JSON.parse + expect), not just console.log',
    async () => {
      const openaiClient = new OpenAIClient(OPENAI_API_KEY!);

      const agent = new SimplifiedRepairAgent(openaiClient, undefined, {
        enableAgenticRepair: false,
      });

      const repairContext: RepairContext = {
        testFile:
          '/home/runner/work/lib-wdio-8-multi-remote/lib-wdio-8-multi-remote/test/specs/skills/multi.skill.lock.editor.ts',
        testName: 'multi.skill.lock.editor.should edit skill text and verify save',
        errorType: 'ASSERTION_FAILED',
        errorMessage:
          'Error: expect(received).toBeTruthy()\n\nReceived: undefined',
        errorSelector: undefined,
        errorLine: EXPECT_LINE,
        workflowRunId: '23021821007',
        jobName: 'sauceLabsTest',
        commitSha: 'abc123',
        branch: 'main',
        repository: 'adept-at/lib-wdio-8-multi-remote',
      };

      const errorData: ErrorData = {
        testFile: repairContext.testFile,
        errorMessage: repairContext.errorMessage,
        stackTrace: `Error: expect(received).toBeTruthy()

Received: undefined

    at editSkillText (test/specs/skills/multi.skill.lock.editor.ts:${EXPECT_LINE}:32)
    at Context.<anonymous> (test/specs/skills/multi.skill.lock.editor.ts:52:5)`,
        logs: [
          '[0-0] RUNNING in chrome on Sauce Labs',
          '[0-0] multi.skill.lock.editor',
          '[0-0]   ✓ should login and navigate to skill',
          '[0-0]   ✗ should edit skill text and verify save',
          `[0-0] Error at line ${EXPECT_LINE}: expect(received).toBeTruthy() Received: undefined`,
          '[0-0] Note: sauceGqlHelper returned null — network log did not capture upsertSkillBody mutation',
          `[0-0] The console.log on line ${ERROR_LINE} shows JSON.parse(null) would throw`,
          `[0-0] The assertion on line ${EXPECT_LINE} received undefined because result was null`,
        ],
        framework: 'webdriverio',
        screenshots: [],
      };

      const agentAny = agent as any;
      const originalBuildPrompt = agentAny.buildPrompt.bind(agentAny);
      agentAny.buildPrompt = function (
        context: RepairContext,
        errData?: ErrorData,
        _sourceContent?: string | null,
        _cleanPath?: string | null
      ) {
        return originalBuildPrompt(
          context,
          errData,
          SKILL_LOCK_SOURCE,
          'test/specs/skills/multi.skill.lock.editor.ts'
        );
      };

      const result = await agent.generateFixRecommendation(
        repairContext,
        errorData
      );

      console.log('\n--- Fix Recommendation ---');
      console.log('Confidence:', result?.confidence);
      console.log('Reasoning:', result?.reasoning);

      expect(result).not.toBeNull();
      expect(result!.confidence).toBeGreaterThanOrEqual(50);
      expect(result!.proposedChanges.length).toBeGreaterThan(0);

      // The model may propose multiple changes (root cause + defensive guard).
      // Find the change that addresses the sauceGqlHelper null result.
      for (const c of result!.proposedChanges) {
        console.log(`\nFile: ${c.file} (line ${c.line})`);
        console.log(`oldCode:\n---\n${c.oldCode}\n---`);
        console.log(`newCode:\n---\n${c.newCode}\n---`);
        console.log(`Justification: ${c.justification}`);
        if (c.oldCode) {
          expect(SKILL_LOCK_SOURCE).toContain(c.oldCode);
        }
      }

      const guardChange = result!.proposedChanges.find(
        (c) =>
          c.oldCode?.includes('JSON.parse(result)') &&
          c.oldCode?.includes('expect(upsertResult).toBeTruthy()')
      );

      expect(guardChange).toBeDefined();
      const change = guardChange!;

      // newCode must handle the null case (guard or skip)
      const newCodeLower = change.newCode.toLowerCase();
      const hasNullGuard =
        newCodeLower.includes('!result') ||
        newCodeLower.includes('result === null') ||
        newCodeLower.includes('result == null') ||
        newCodeLower.includes('typeof result') ||
        newCodeLower.includes('if (result)');
      expect(hasNullGuard).toBe(true);

      // newCode must still contain the expect when result IS present
      expect(change.newCode).toContain('expect');

      console.log('\n✅ All assertions passed — fix covers complete scope');
    },
    90_000
  );
});
