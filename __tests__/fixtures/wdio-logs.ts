/**
 * WDIO/SauceLabs job log fixture for full-pipeline integration tests.
 * Format: Real SauceLabs multiline style (representative of run 21914697303, lib-wdio-8-multi-remote).
 * When extractErrorFromLogs() processes this, it should yield framework=webdriverio and the expected fields below.
 */

export const WDIO_RAW_LOG = `
2026-02-11T17:03:48.0818283Z [0-0] getting testing cookie
2026-02-11T17:03:48.1698972Z [0-0] Found the testing flag:  1
2026-02-11T17:03:56.8504978Z [0-0] Error in "Editors can take skill lock.Log in and open skill, grab lock, and edit skill on browser 1 with user 1"
2026-02-11T17:03:56.8506185Z Error: expect(received).toContain(expected) // indexOf
2026-02-11T17:03:56.8506564Z
2026-02-11T17:03:56.8506749Z Expected substring: "1 min"
2026-02-11T17:03:56.8507217Z [0-0] found 200 for token {
2026-02-11T17:03:44.2607217Z FAILED in MultiRemote - file:///test/specs/skills/multi.skill.lock.editor.ts
`;

/** Expected ErrorData fields after extractErrorFromLogs(WDIO_RAW_LOG) */
export const WDIO_EXPECTED = {
  framework: 'webdriverio',
  failureType: 'Error',
  testName: 'Editors can take skill lock.Log in and open skill, grab lock, and edit skill on browser 1 with user 1',
  /** Extractor captures path from "file:///..." (no leading slash in capture group) */
  fileName: 'test/specs/skills/multi.skill.lock.editor.ts',
  messageSubstring: 'expect(received).toContain(expected)',
};
