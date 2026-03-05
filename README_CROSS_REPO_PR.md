# Cross-Repository Access in GitHub Actions

## When You Need a PAT or App Token

The Adept Triage Agent uses three repository contexts:

- `github.context.repo`: where the triage workflow is running. Workflow runs, job logs, screenshots, and uploaded test artifacts are fetched from here.
- `REPOSITORY`: the app/source repository used for PR, branch, or commit diff lookup.
- `AUTO_FIX_TARGET_REPO`: the repository where source files are fetched for repair and where fix branches are created.

You only need a Personal Access Token (PAT) or GitHub App token when the action needs GitHub API access outside `github.context.repo`, typically because:

- `REPOSITORY` points to a different repository for diff lookup
- `AUTO_FIX_TARGET_REPO` points to a different repository for repair or auto-fix writes

## Important Limitation

The current architecture does **not** support a centralized workflow repository fetching workflow runs and artifacts from some other repository just by supplying a PAT.

This action always reads workflow runs and uploaded artifacts from the repository where the triage workflow is executing.

## Examples

- ❌ **Not supported by this action alone**: a centralized repo like `org/triage-workflows` trying to inspect workflow logs and artifacts from `org/main-app`
- ✅ **Supported with default `GITHUB_TOKEN`**: triage workflow runs in `org/main-app` and also reads diffs from `org/main-app`
- ✅ **Supported with PAT/App token**: triage workflow runs in `org/main-app`, but `REPOSITORY` points to `org/shared-frontend` for PR diff lookup
- ✅ **Supported with PAT/App token**: triage workflow runs in `org/main-app`, but `AUTO_FIX_TARGET_REPO` points to `org/e2e-tests` for fix generation and branch creation

## Why the Default `GITHUB_TOKEN` Fails

When the action tries to fetch PR information, source files, or write branches in a different repository, the default `GITHUB_TOKEN` often fails with errors like:

```text
HttpError: Not Found - https://docs.github.com/rest/pulls/pulls#get-a-pull-request
```

That happens because the default token usually only has access to the repository where the workflow is running.

## Option 1: Use a Personal Access Token

1. Create a PAT:
   - GitHub Settings -> Developer settings -> Personal access tokens
   - Grant the minimum scopes needed for the target repositories
   - For private repositories, this usually means `repo`

2. Add it as a repository secret:
   - Name it `CROSS_REPO_PAT` or another clear name

3. Pass it to the action:

```yaml
- name: Run Adept Triage Agent
  uses: adept-at/adept-triage-agent@v1
  with:
    GITHUB_TOKEN: ${{ secrets.CROSS_REPO_PAT }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    REPOSITORY: org/app-repo
    AUTO_FIX_TARGET_REPO: org/test-repo
```

## Option 2: Use a GitHub App Token

For organizations, a GitHub App is usually the better long-term option:

```yaml
- name: Generate GitHub App Token
  id: generate_token
  uses: tibdex/github-app-token@v2
  with:
    app_id: ${{ secrets.APP_ID }}
    private_key: ${{ secrets.APP_PRIVATE_KEY }}
    repositories: 'app-repo,test-repo'

- name: Run Adept Triage Agent
  uses: adept-at/adept-triage-agent@v1
  with:
    GITHUB_TOKEN: ${{ steps.generate_token.outputs.token }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Option 3: Stay Single-Repo

If cross-repo diff or repair access is not required, omit `REPOSITORY` and `AUTO_FIX_TARGET_REPO` so the action can use the default `GITHUB_TOKEN`.

## Testing Locally

To verify that your token can fetch PR diffs:

```bash
export GITHUB_TOKEN="your-token-here"
npm run test:integration -- --testPathPattern=pr-diff-fetcher
```

To target a specific repository or PR:

```bash
export GITHUB_TOKEN="your-token-here"
export TEST_REPO="owner/repo"
export TEST_PR_NUMBER="123"
npm run test:integration -- --testPathPattern=pr-diff-fetcher
```

## Security Considerations

- Rotate PATs regularly
- Grant the minimum permissions required
- Never commit tokens to the repository
- Audit which workflows use cross-repo credentials
