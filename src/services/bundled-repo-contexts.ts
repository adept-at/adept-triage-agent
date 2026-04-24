/**
 * Repo-context overrides that ship INSIDE the adept-triage-agent bundle
 * rather than living in each consumer repo's `.adept-triage/context.md`.
 *
 * Why this exists
 * ---------------
 * The default flow (see `RepoContextFetcher`) is: each consumer repo
 * commits `.adept-triage/context.md` and the agent reads it at the
 * start of every run. That works well for small test-only repos
 * because the file is authoritative and reviewable next to the tests
 * it documents.
 *
 * For high-traffic product repos like `learn-webapp`, the cost/benefit
 * flips: adding an agent-only file to the repo means it rides along
 * with every merge, PR review, and CODEOWNERS routing forever. The
 * content is maintained by triage maintainers, not product engineers,
 * so "who owns this" is fuzzy. Bundling the context here solves both:
 *   - Edits happen in this repo (natural home for triage tooling).
 *   - The consumer repo stays clean — no tooling-file churn in PRs
 *     that have nothing to do with triage.
 *
 * Contract
 * --------
 *   - Key is the GitHub slug: `<owner>/<repo>`.
 *   - Value is the raw markdown body of what would otherwise be
 *     `.adept-triage/context.md` in the consumer repo. The fetcher
 *     wraps it with the standard "## Repository Conventions" header
 *     and sanitizes it the same way it would remote content.
 *   - Bundled entries take PRECEDENCE over any in-repo file. If a repo
 *     appears in this map, the fetcher will NOT call the GitHub API
 *     for it — this is the explicit "keep it here" signal.
 *   - Keep each body under `REPO_CONTEXT_MAX_CHARS` (6500 today).
 *     Longer content truncates with a `[truncated]` marker; trim
 *     before exceeding rather than after.
 *
 * When to add a repo here
 * -----------------------
 *   - Repo is high-traffic / product-critical and should not carry
 *     triage-tooling files in its PR history.
 *   - The repo's CODEOWNERS / review load makes an in-repo context
 *     file a maintenance burden without a clear owner.
 *   - You want to iterate on the context quickly from the triage
 *     agent's own PR flow without round-tripping through the
 *     consumer repo.
 *
 * When NOT to add a repo here
 * ---------------------------
 *   - Small test-only repos where an in-repo `.adept-triage/context.md`
 *     is a natural fit (see PRs #81, #486, #301, #129 from 2026-04-24).
 *   - You want test authors to edit conventions without needing
 *     triage-agent write access.
 *
 * Release coupling (intentional)
 * ------------------------------
 * Changes to bundled contexts ship only when adept-triage-agent itself
 * is released (rebuild `dist/` via `npm run all`, merge here, tag/roll
 * the `v1` reference on the consumer workflows). That is slower than
 * a consumer-repo PR for in-repo context files — and that is the point.
 * This path is for repos where triage-agent maintainers, not product
 * engineers, should own the conventions. If you need same-day iteration
 * on the context without an agent release, use the in-repo path instead.
 *
 * Map key invariant
 * -----------------
 * Keys MUST be lowercase `<owner>/<repo>`. GitHub repo slugs are
 * case-insensitive for URL resolution, and `getBundledRepoContext`
 * lowercases its lookup input, so a key like `"Adept-At/learn-webapp"`
 * would silently never match. The test suite asserts all keys are
 * already lowercase so this invariant is load-bearing, not aspirational.
 */
export const BUNDLED_REPO_CONTEXTS: Record<string, string> = {
  // ---------------------------------------------------------------
  // adept-at/learn-webapp
  //
  // Bundled because learn-webapp is the main product repo (React app
  // AND Cypress E2E suite colocated) — see "Product-test colocation"
  // section below for why that matters for triage reasoning. Every
  // PR against learn-webapp is high-visibility, so we keep triage
  // tooling out of its history entirely.
  //
  // Content mirrors what was proposed in the (now-closed)
  // adept-at/learn-webapp#3652; source lives in this file from here
  // forward. To update: edit this string, `npm run all` to rebuild
  // dist/, merge here. No consumer-repo PR needed.
  // ---------------------------------------------------------------
  'adept-at/learn-webapp': `## Framework & runtime
- Cypress **^15.8.2**, suite is \`.js\` (NOT \`.ts\`) — \`cypress/support/commands.js\`, \`cypress/support/e2e.js\`.
- \`cypress.config.ts\`: \`baseUrl\` \`https://learn.adept.at\`, \`specPattern: 'cypress/e2e/**/*.{js,jsx,ts,tsx}'\`, viewport 1920x1080, \`defaultCommandTimeout\` / \`pageLoadTimeout\` 15s, \`retries.runMode: 1\`, \`userAgent: 'Adept'\`, \`chromeWebSecurity: true\`, \`experimentalModifyObstructiveThirdPartyCode: true\`.
- Plugins (\`cypress/plugins/index.js\`): \`cypress-fail-fast\`, \`cypress-terminal-report\` (logs to \`cypress/logs/\` on fail), \`@adept-at/gql-test\` \`runEndpoint\` task, \`cy-verify-downloads\`. Chromium args set autoplay + SameSite workarounds.
- **Where tests run**: \`npm run cy:run:e2e\` uses Electron headless. CI uses Chrome (Sauce via \`cypress.config.sauce.ts\`, or \`cypress-e2e-learn-no-dash\` workflow with \`-c baseUrl=<dispatch URL>\` for preview/PR). When \`baseUrl\` is a preview URL, treat failures as environment-sensitive (Vercel allowlist, preview API drift).
- App stack: React 18.2.x, MUI ~6.1.x, \`@mux/mux-player-react\` ^3.11.x.

## Test organization
- Default \`specPattern\`: \`cypress/e2e/**\` — small curated set (~10 specs, mobile + desktop variants). Parallel weights in \`cypress/parallel-weights.json\`.
- **Out of default specPattern**: \`cypress/ag-grid/\` (own \`run_ag_grid_tests.sh\`), \`cypress/dev/\`, \`cypress/refactor/\`, \`cypress/samples/\`. Always confirm WHICH workflow ran the failing spec — \`cypress/e2e/<spec>\` vs ag-grid is a different surface.
- \`e2e.js\` imports cypress-fail-fast, cypress-axe, drag-drop, terminal-report; filters known \`uncaught:exception\` noise (LaunchDarkly, ResizeObserver loop).

## Selectors
- Prefer \`data-testid\` (modals, storyboard, buttons), \`aria-label\` (nav, org switcher, "Give feedback"), role-based (\`[role="tab"]\`, menus) when stable.
- Legacy class prefixes still appear: \`[class^="public-DraftStyleDefault"]\`, \`[class^="WideSidebar"]\`, \`.MuiCircularProgress-indeterminate\` for "loading done".
- **MUI / Emotion**: NEVER hardcode autogenerated Emotion class suffix hashes — prefer \`data-testid\` / ARIA.
- **Video (Mux)**: treat \`div[id^="component-"]\` Lexical wrappers as the stable handle; \`mux-player\` mounts UNDER the wrapper after scroll. Do not use a global \`cy.get('mux-player')\` as the readiness check for the Nth video.
- **Custom scroll**: \`scrollIntoScrollContainer\` (in \`commands.js\`) — skill page main scroll is an INNER overflow container, not the window. \`scrollIntoView\` alone is insufficient (Cypress #29921 referenced in code).

## Waits / timing
- Allowed: \`cy.wait('@alias')\` for intercepted routes; \`cy.waitUntil\` (cypress-wait-until) with \`timeout\` / \`timeoutMsg\` / \`interval\`; \`.should('not.exist')\` on spinners / snackbars; small-interval polling pattern in \`verifyVideoProgress\`.
- GQL conventions: \`interceptGQL\` / \`interceptGQLQuery\` set \`req.alias\` from \`operationName\` or string match on \`query\`. Login uses \`**/web/loginWithEmail\` and \`**/web/token\` aliases.
- **Reality check**: \`commands.js\` contains many fixed \`cy.wait(1000-3000)\` delays (storyboard, Beamer, dragColumn) — a real flake source. Treat new failures near those paths as candidates for replacing fixed waits with \`waitUntil\` / \`@alias\`.
- Retries default to \`runMode: 1\`; specs can override (some opt to \`retries: 0\` to surface real flakes).
- Global \`uncaught:exception\` filters in \`e2e.js\` swallow LaunchDarkly errors, \`ResizeObserver loop\`, and some network noise — DON'T blame app code when logs only show those.

## Auth & test setup
- \`cy.login(route, user, pass?)\`: sets cookie \`adept_testing_flag=1\`, intercepts \`**/web/token\` and \`**/web/loginWithEmail\`, visits \`/login\`, fills \`#email\` / \`#password\`, clicks \`#login-button\`, asserts no error snackbar, waits for token (stores \`Cypress.env('actualToken', ...)\`), waits out \`.MuiCircularProgress-indeterminate\`, then \`dismissBeamerIfExists()\`.
- Server-side GQL via \`cy.runEndpoint\` (Node task \`runEndpoint\`).
- Preview runs depend on Vercel allowlist + \`VERCEL_WHITELIST_TTL_MS\`. Sign-up spec intercepts \`aliasCheck\` against \`accounts.api.adept.at\`.

## Custom commands (high level)
- A11y: \`checkA11yViolations\` (cypress-axe wrapper, can write \`cypress/logs/a11y_violations_*.json\` and fail).
- GQL / network: \`getGQLBody\`, \`interceptGQL*\`, \`setNetworkThrottling\` (Chromium CDP only).
- Product flows: \`verifyMyStats*\`, \`startVideo\` / \`startVideoMobile\` (legacy Video.js), **\`startVideoNewPlayer*\`**, \`pauseVideoNewPlayer\`, **\`verifyVideoProgress\`** (wrapper-scoped mux + polling), \`checkLinks\`, \`storyboard\` / \`skipStoryboard\`, \`openAddComponent\`, \`deleteSKill*\`.
- AG Grid (when those specs run): \`testAgGridResizeStability\`, \`dragColumn\`, \`getHeaderColIds\`, localStorage keys \`adept_grid_state_*\`.

## Product-test colocation
- This repo is BOTH the React app and the Cypress suite. A red E2E can be (1) a test bug, (2) a data/env issue (preview not allowed, test user state, Vercel TTL), or (3) a real product regression in \`src/\`.
- The triage agent should NOT assume the fix file is only under \`cypress/\`. Check the recent PR scope and whether the failure reproduces on production \`baseUrl\` vs preview before locking in a "test-only" fix.

## Common pitfalls
- **Lazy / viewport-mounted video**: not all \`mux-player\` nodes exist. Scroll the correct \`div[id^="component-"]\` into the inner scroll container (use \`scrollIntoScrollContainer\`), then assert wrapper-scoped mux. Recurring git-fix theme.
- **A11y + MUI Tooltip**: when running a second axe pass with the Outline drawer open, MUI Tooltip Fade can cause false \`color-contrast\` hits. Wait for \`.MuiTooltip-tooltip\` \`opacity: '1'\` and exclude \`.MuiTooltip-popper\` on the follow-up scan.
- **Brittle visibility on Mux**: \`verifyVideoProgress\` was deliberately changed to AVOID \`be.visible\` on \`mux-player\` — prefer existence + \`currentTime\` advancement inside the wrapper.
- After login, assert \`cy.get('#notistack-snackbar').should('not.exist')\` to clear the post-login toast that can intercept clicks.
`,
};

/**
 * Return the bundled context body for a repo, or `undefined` if not
 * bundled. Keep the lookup tiny and synchronous — this is called on
 * every `RepoContextFetcher.fetch` before any async work.
 *
 * Lowercases the `<owner>/<repo>` key before lookup so casing variants
 * from different call sites (e.g. `errorData.repository` parsed from a
 * GH URL vs `github.context.repo`) all resolve identically. GitHub
 * itself treats slugs case-insensitively for URL resolution; we match
 * that semantic here so a misread casing can't silently bypass the
 * bundled override and fall through to a remote-fetch attempt.
 */
export function getBundledRepoContext(owner: string, repo: string): string | undefined {
  return BUNDLED_REPO_CONTEXTS[`${owner}/${repo}`.toLowerCase()];
}
