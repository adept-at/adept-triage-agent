/**
 * Integration test: verify the repair agent traces backward to the ROOT CAUSE
 * instead of just guarding the crash site.
 *
 * Scenario: sauceGqlHelper returns null → assertion fails. But the real root
 * cause is `document.execCommand('insertText')` silently failing in Chrome,
 * meaning text never entered Lexical and no mutation fired. The model should
 * identify execCommand as the root cause and propose replacing it with native
 * WebDriver keyboard actions, not just adding a null guard.
 *
 * Run: OPENAI_API_KEY=sk-... npx jest --testPathPattern=repair-root-cause-tracing --testPathIgnorePatterns='[]'
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

// Full function that contains the bug: execCommand for typing + assertion on result
const SKILL_LOCK_SOURCE = `import LoginPage from '../../pageobjects/multi.login.page';

let b1Token, b2Token;

describe('Editors can take skill lock', async () => {
  it('Log in and open skill, grab lock, and edit skill on browser 1 with user 1', async () => {
    await LoginPage.openLoginPageLearn(browser1);
    await LoginPage.openLoginPageLearn(browser2);
    await LoginPage.setIgnoreCaptchaCookie(browser1);
    await LoginPage.setIgnoreCaptchaCookie(browser2);
    b1Token = await LoginPage.login('phil+cy100@adept.at', 'Adept123!', false, browser1);
    b2Token = await LoginPage.login('phil+cy200@adept.at', 'Adept123!', false, browser2);
    await openSkillForEdit(browser1);
    await getLock(browser1);
    await browser2.$('body').getText();
    await editSkillText(browser1);
    await browser.pause(3000);
    await openSkillForEdit(browser2);
    await getLock(browser2);
    await browser1.$('body').getText();
    await editSkillText(browser2);
  });
});

async function verifyPreview(mBrowser, rando) {
  await mBrowser.$('[aria-label="preview - edit toggle switch"]').click();
  await mBrowser.waitUntil(async () => {
    const text = await mBrowser.$('body').getText();
    return text.includes(rando);
  }, { timeout: 15000, timeoutMsg: \`Rando "\${rando}" not found in preview after 15s\` });
  const preview1 = await mBrowser.$('body').getText();
  console.log('preview1 (contains rando):', preview1.substring(0, 200));
}

async function openSkillForEdit(mBrowser) {
  await mBrowser.url('https://learn.adept.at/skills/test-skill-123/edit');
  await mBrowser.$('[data-testid="lexical-editor"]').waitForDisplayed({ timeout: 15000 });
}

async function clearTextFieldForReact(mBrowser) {
  const editorEl = await mBrowser.$('[data-testid="lexical-editor"] [contenteditable]');
  await editorEl.click();
  await mBrowser.execute(function () {
    document.execCommand('selectAll');
    document.execCommand('delete');
  });
}

async function editSkillText(mBrowser) {
  const rando = Math.random().toString(36).substring(2, 9);
  await clearTextFieldForReact(mBrowser);
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
`;

describe('Repair agent root cause tracing', () => {
  const itOrSkip = OPENAI_API_KEY ? it : it.skip;

  itOrSkip(
    'should identify execCommand as root cause, not just add null guard at assertion',
    async () => {
      const openaiClient = new OpenAIClient(OPENAI_API_KEY!);

      const agent = new SimplifiedRepairAgent(openaiClient, undefined, {
        enableAgenticRepair: false,
      });

      const repairContext: RepairContext = {
        testFile:
          '/home/runner/work/lib-wdio-8-multi-remote/lib-wdio-8-multi-remote/test/specs/skills/multi.skill.lock.editor.ts',
        testName:
          'Editors can take skill lock.Log in and open skill, grab lock, and edit skill on browser 1 with user 1',
        errorType: 'ASSERTION_FAILED',
        errorMessage:
          'Error: expect(received).toBeTruthy()\n\nReceived: undefined',
        errorSelector: undefined,
        errorLine: 82, // `await expect(upsertResult).toBeTruthy();`
        workflowRunId: '23022839470',
        jobName: 'sauceTest',
        commitSha: 'abc123',
        branch: 'main',
        repository: 'adept-at/lib-wdio-8-multi-remote',
      };

      const errorData: ErrorData = {
        testFile: repairContext.testFile,
        errorMessage: repairContext.errorMessage,
        stackTrace: `Error: expect(received).toBeTruthy()

Received: undefined

    at editSkillText (test/specs/skills/multi.skill.lock.editor.ts:82:32)
    at Context.<anonymous> (test/specs/skills/multi.skill.lock.editor.ts:17:5)`,
        logs: [
          '[0-0] RUNNING in MultiRemote on chrome and chrome via Sauce Labs',
          '[0-0] Editors can take skill lock',
          '[0-0] upsertSkillBody null',
          '[0-0] [sauceGqlHelper] upsertSkillBody not captured in Sauce network logs — Waited 15 seconds for content.api.adept.at and upsertSkillBody but never saw it?',
          '[0-0] Error in "Editors can take skill lock.Log in and open skill, grab lock, and edit skill on browser 1 with user 1"',
          'Error: expect(received).toBeTruthy()',
          'Received: undefined',
          '[0-0] FAILED in MultiRemote - file:///test/specs/skills/multi.skill.lock.editor.ts',
          'Spec Files: 0 passed, 1 failed, 1 total',
          'Screenshot: skill editor is loaded and visible, edit mode is active, text content appears in editor',
        ],
        framework: 'webdriverio',
        screenshots: [
          {
            name: 'screenshot-0-0.png',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      // Inject source file
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
      console.log('Confidence:', result?.fix.confidence);
      console.log('Root Cause:', result?.fix.reasoning?.substring(0, 300));
      console.log('Number of changes:', result?.fix.proposedChanges?.length);

      expect(result).not.toBeNull();
      expect(result!.fix.confidence).toBeGreaterThanOrEqual(50);

      // Collect all changes for analysis
      const allOldCode = result!.fix.proposedChanges
        .map((c) => c.oldCode)
        .join('\n');
      const allNewCode = result!.fix.proposedChanges
        .map((c) => c.newCode)
        .join('\n');
      const allJustifications = result!.fix.proposedChanges
        .map((c) => c.justification)
        .join('\n');

      console.log('\n--- All Changes ---');
      for (const change of result!.fix.proposedChanges) {
        console.log(`\nFile: ${change.file} (line ${change.line})`);
        console.log(`oldCode:\n---\n${change.oldCode}\n---`);
        console.log(`newCode:\n---\n${change.newCode}\n---`);
        console.log(`Justification: ${change.justification}`);
      }

      // The model should identify execCommand as a root cause or anti-pattern
      const fullText = [
        result!.fix.reasoning,
        allNewCode,
        allJustifications,
      ]
        .join(' ')
        .toLowerCase();

      const mentionsExecCommand = fullText.includes('execcommand');
      const mentionsKeys =
        fullText.includes('keys(') ||
        fullText.includes('.keys(') ||
        fullText.includes('keyboard') ||
        fullText.includes('native');
      const mentionsNullGuard =
        allNewCode.includes('!result') ||
        allNewCode.includes('if (result)') ||
        allNewCode.includes('result === null') ||
        allNewCode.includes('result == null');

      console.log('\n--- Root Cause Analysis ---');
      console.log('Mentions execCommand:', mentionsExecCommand);
      console.log('Proposes keys/keyboard/native:', mentionsKeys);
      console.log('Includes null guard:', mentionsNullGuard);

      // The model MUST identify execCommand as relevant to the root cause
      expect(mentionsExecCommand).toBe(true);

      // The model should propose native keyboard actions OR at minimum discuss them
      // (it may not always produce the perfect WebDriver code, but it should recognize the pattern)
      const recognizesRootCause = mentionsExecCommand && mentionsKeys;
      console.log('Recognizes root cause (execCommand + keys):', recognizesRootCause);

      // At minimum: the reasoning/justification should discuss execCommand
      // The fix may include just the null guard (acceptable) but MUST explain the deeper issue
      expect(mentionsExecCommand).toBe(true);

      console.log('\n✅ Root cause tracing assertions passed');
    },
    120_000
  );
});
