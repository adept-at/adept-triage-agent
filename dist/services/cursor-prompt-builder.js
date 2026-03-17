"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildValidationPrompt = buildValidationPrompt;
function buildValidationPrompt(params) {
    const framework = params.framework || detectFramework(params.spec);
    const testCommand = params.testCommand || defaultTestCommand(framework, params);
    return `You are validating a test fix created by the adept-triage-agent.

## Your Task

Run the failing test spec against the fix branch and report whether it passes or fails.

## Context

- **Repository:** ${params.repositoryUrl}
- **Branch:** ${params.branch}
- **Spec file:** ${params.spec}
- **Target URL:** ${params.previewUrl}
- **Framework:** ${framework}
${params.triageRunId ? `- **Triage Run ID:** ${params.triageRunId}` : ''}

## Steps

1. The repository has already been checked out at the correct branch. Verify you are on branch \`${params.branch}\`.

2. Install dependencies:
   \`\`\`bash
   npm ci
   \`\`\`

3. Run the test:
   \`\`\`bash
   ${testCommand}
   \`\`\`

4. After the test completes, analyze the output carefully.

## Reporting

Conclude your response with one of these exact phrases:

- **"VALIDATION RESULT: TEST PASSED"** — if the spec passes
- **"VALIDATION RESULT: TEST FAILED"** — if the spec fails
- **"VALIDATION RESULT: INCONCLUSIVE"** — if you cannot determine the result

Then provide:
- The full test output (stdout/stderr)
- If the test failed, explain *why* it failed and whether the fix was on the right track
- Any screenshots or artifacts that help explain the result

## Important Notes

${frameworkNotes(framework)}
- Do NOT modify any test files. You are only validating, not fixing.
- If dependencies fail to install, report that as INCONCLUSIVE with the error details.
- If the test command itself is malformed, report INCONCLUSIVE.
`;
}
function detectFramework(spec) {
    if (spec.includes('.cy.') || spec.includes('cypress/'))
        return 'cypress';
    if (spec.includes('wdio') || spec.includes('test/specs/'))
        return 'webdriverio';
    return 'unknown';
}
function defaultTestCommand(framework, params) {
    switch (framework) {
        case 'webdriverio':
            return `npx wdio wdio.conf.ts --spec ${params.spec} -u ${params.previewUrl} -t local`;
        case 'cypress':
            return `CYPRESS_BASE_URL=${params.previewUrl} npx cypress run --spec ${params.spec} --browser chrome`;
        default:
            return params.testCommand || `npm test -- --spec ${params.spec}`;
    }
}
function frameworkNotes(framework) {
    switch (framework) {
        case 'webdriverio':
            return `- This is a WebdriverIO project. Tests may use multi-remote mode (multiple browser instances).
- Run with \`-t local\` to use local Chrome. Do NOT use Sauce Labs (\`-t sauce\`) for validation.
- Some specs use Chromedriver on port 9515 — only run one spec at a time.
- If you see Chromedriver port conflicts, kill existing chromedriver processes first.`;
        case 'cypress':
            return `- This is a Cypress project. Set CYPRESS_BASE_URL to the target URL.
- Use \`--browser chrome\` for consistency.
- Check for any required environment variables in cypress.config.ts.`;
        default:
            return `- Test framework not auto-detected. Follow the project's README or AGENTS.md for run instructions.`;
    }
}
//# sourceMappingURL=cursor-prompt-builder.js.map