# Repo-Context Rollout — Deployment Record

This file tracks how each repo's triage context was deployed so there's
one source of truth for the rollout here in the triage agent rather
than hunting across consumer repos.

Update this file when a PR lands, closes, or when a context is revised.

## Two deployment paths

| Path | When to use | Source of truth |
|------|-------------|-----------------|
| **In-repo file** | Small test-only repos where the context naturally belongs next to the tests it documents. | `<repo>/.adept-triage/context.md` committed in the consumer repo. |
| **Bundled in-agent** | High-traffic product repos where adding tooling files to every PR is more cost than benefit. | `src/services/bundled-repo-contexts.ts` in this repo. `RepoContextFetcher` consults this map first and skips the remote GitHub call when hit. |

Bundled entries take **precedence** over any in-repo file for the same
repo — the whole point is to avoid committing anything there.

## Current deployment state (2026-04-24)

| Repo | Path | PR | Status |
|------|------|----|--------|
| `adept-at/wdio-9-bidi-mux3` | in-repo | [#81](https://github.com/adept-at/wdio-9-bidi-mux3/pull/81) | **merged** 2026-04-24 14:57 UTC |
| `adept-at/lib-cypress-canary` | in-repo | [#486](https://github.com/adept-at/lib-cypress-canary/pull/486) | **merged** 2026-04-24 14:58 UTC |
| `adept-at/lib-wdio-8-e2e-ts` | in-repo | [#301](https://github.com/adept-at/lib-wdio-8-e2e-ts/pull/301) | **merged** 2026-04-24 14:58 UTC |
| `adept-at/lib-wdio-8-multi-remote` | in-repo | [#129](https://github.com/adept-at/lib-wdio-8-multi-remote/pull/129) | **merged** 2026-04-24 14:58 UTC |
| `adept-at/learn-webapp` | **bundled** | [#3652](https://github.com/adept-at/learn-webapp/pull/3652) (closed, not merged) | **bundled in `src/services/bundled-repo-contexts.ts`** |

## Why learn-webapp is bundled, not committed

`learn-webapp` is the main product repo — React app AND Cypress E2E suite
colocated. Adding `.adept-triage/context.md` there means tooling-only
content rides along with every PR review, CODEOWNERS routing, and merge
forever. The content is maintained by triage maintainers, not product
engineers, so ownership is fuzzy.

Bundling it here keeps the product repo clean and puts the edit/review
workflow where it naturally belongs (next to the agent that consumes
the file). To update the learn-webapp context:

1. Edit the template literal under `'adept-at/learn-webapp'` in
   `src/services/bundled-repo-contexts.ts`.
2. `npm run all` to rebuild `dist/index.js`.
3. Open a PR here. No consumer-repo PR needed.

### Release-coupling trade-off (intentional)

Bundled contexts change only when **adept-triage-agent itself is released**
and the consumer workflows pick up the new `v1` tag. That's slower than
the in-repo path — an in-repo `context.md` edit ships the moment the
consumer PR merges, no agent release required. This is intentional:

- **In-repo path** is optimized for iteration speed by test authors.
- **Bundled path** is optimized for keeping product-repo PR history
  free of triage-tooling noise, at the cost of coupling each context
  update to the agent's release cadence.

If learn-webapp ever needs faster iteration on its context than the
agent's release cadence allows, the right move is to flip it back to
the in-repo path (remove from `BUNDLED_REPO_CONTEXTS`, commit
`.adept-triage/context.md` to learn-webapp). Don't build a half-bundled
hybrid — the `getBundledRepoContext` precedence is intentional so
drift can't happen silently.

### Verified by tests

The bundled-path contract is locked in by
`__tests__/services/repo-context-fetcher.test.ts` — 17 tests asserting:

- The bundle map key invariant (all keys lowercase, learn-webapp present).
- Bundled repos short-circuit: zero `octokit.repos.getContent` calls.
- Case-insensitive lookup (`Adept-At/Learn-WebApp` still hits the bundle).
- Bundled content goes through the same sanitization + length cap as
  remote content.
- The 4 in-repo-path repos are explicitly NOT bundled (regression guard).
- Remote 404 / error / directory-response all return `''` without throwing.
- Cache keys on `(owner, repo, ref)` — different refs don't share entries.

## DynamoDB seeds deployed alongside (2026-04-24)

15 hand-curated seed skills, 3 per repo, inserted into
`triage-skills-v1-live` via `scripts/seed-skill.ts seeds/`:

| Repo | Seed IDs (first 8) |
|------|---|
| `adept-at/learn-webapp` | `18168dc5`, `9953792c`, `1f162c03` |
| `adept-at/lib-cypress-canary` | `5b12791c`, `2e9715e2`, `4189e9b6` |
| `adept-at/lib-wdio-8-e2e-ts` | `218b14b5`, `2a588301`, `15248843` |
| `adept-at/lib-wdio-8-multi-remote` | `d2ee1a8f`, `91e68f76`, `25c6958d` |
| `adept-at/wdio-9-bidi-mux3` | `de4613ea`, `ccb25c19`, `3ccfbac5` |

All seeds have `isSeed: true` so they're protected from pruning and
skipped by the audit's per-skill maintenance flags. List them any time
with `npx tsx scripts/seed-skill.ts --list`.

## Rollback

- **In-repo context** (4 repos): revert the merged PR on the consumer repo.
- **Bundled context** (learn-webapp): remove the key from
  `BUNDLED_REPO_CONTEXTS` in `src/services/bundled-repo-contexts.ts`,
  rebuild, merge. The fetcher silently returns empty and the agent
  behaves as it did pre-rollout.
- **Per seed**: `npx tsx scripts/seed-skill.ts --remove <id-prefix>`.
- **All seeds for a repo**: list with `--list`, remove one at a time.
