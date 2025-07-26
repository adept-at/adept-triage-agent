# Cross-Repository PR Access in GitHub Actions

## Problem

When the Adept Triage Agent runs in a GitHub Actions workflow and tries to fetch PR information from a different repository (e.g., `adept-at/learn-webapp`), it fails with:

```
HttpError: Not Found - https://docs.github.com/rest/pulls/pulls#get-a-pull-request
```

This happens because the default `GITHUB_TOKEN` in GitHub Actions only has access to the repository where the action is running.

## Solutions

### Option 1: Use a Personal Access Token (Recommended)

1. **Create a Personal Access Token (PAT)**:

   - Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Give it a descriptive name like "adept-triage-cross-repo"
   - Select scopes:
     - `repo` (full control of private repositories)
     - Or at minimum: `public_repo` (if only accessing public repos)
   - Generate and copy the token

2. **Add the PAT as a repository secret**:

   - Go to your repository settings
   - Navigate to Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `CROSS_REPO_TOKEN` (or similar)
   - Value: paste your PAT

3. **Update your workflow to use the PAT**:
   ```yaml
   - name: Run Adept Triage Agent
     uses: adept-at/adept-triage-agent@v1.3.0
     with:
       GITHUB_TOKEN: ${{ secrets.CROSS_REPO_TOKEN }} # Use PAT instead of default token
       OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
       # ... other inputs
   ```

### Option 2: Use GitHub App Token

For organizations, you can create a GitHub App with appropriate permissions and use its token:

```yaml
- name: Generate GitHub App Token
  id: generate_token
  uses: tibdex/github-app-token@v2
  with:
    app_id: ${{ secrets.APP_ID }}
    private_key: ${{ secrets.APP_PRIVATE_KEY }}
    repositories: 'adept-triage-agent,learn-webapp'

- name: Run Adept Triage Agent
  uses: adept-at/adept-triage-agent@v1.3.0
  with:
    GITHUB_TOKEN: ${{ steps.generate_token.outputs.token }}
    # ... other inputs
```

### Option 3: Disable PR Fetching (Workaround)

If PR information isn't critical for your use case, you can run the action without providing a PR number:

```yaml
- name: Run Adept Triage Agent
  uses: adept-at/adept-triage-agent@v1.3.0
  with:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    # Don't provide PR_NUMBER if it's from another repo
    # ... other inputs
```

## Testing Locally

To test if your token has the necessary permissions:

```bash
# Set your token
export GITHUB_TOKEN="your-token-here"

# Run the test script
node test-pr-fetch.js
```

## Security Considerations

- **PAT Rotation**: Regularly rotate your PATs (e.g., every 90 days)
- **Minimal Permissions**: Only grant the minimum required permissions
- **Secret Management**: Never commit tokens to your repository
- **Audit Access**: Regularly review which workflows use cross-repo tokens
