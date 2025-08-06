# Adept Repair Agent - Design & Implementation Plan

## Executive Summary

This document outlines the design and implementation plan for adding autonomous repair capabilities to the Adept Triage Agent. The repair agent will automatically fix failing tests identified as TEST_ISSUE by the triage agent, using AI-driven analysis and evidence-based repairs.

## Core Architecture Principle: Separation of Concerns

### Information Flow Design

```
┌──────────────────┐       Minimal Context        ┌──────────────────┐
│   Triage Agent   │ ───────────────────────────> │   Repair Agent   │
├──────────────────┤                               ├──────────────────┤
│                  │   • verdict: TEST_ISSUE       │                  │
│ Analyzes failure │   • testFile: path            │ Fetches what it  │
│ Determines type  │   • errorLine: number         │ needs from:      │
│                  │   • errorType: string         │ • Test repo      │
│                  │   • workflowRunId: id         │ • App repo       │
│                  │   • confidence: 85            │ • PR diffs       │
└──────────────────┘                               └──────────────────┘
```

## Phase 1: Enhance Triage Agent Output (Week 1)

### 1.1 Extend Type Definitions

Add to `src/types.ts`:

```typescript
export interface RepairContext {
  // Location information
  testFile: string; // e.g., "cypress/e2e/auth/login.cy.ts"
  errorLine?: number; // e.g., 47
  testName: string; // e.g., "should login successfully"

  // Failure identification
  errorType: string; // e.g., "ELEMENT_NOT_FOUND", "TIMEOUT", "ASSERTION_FAILED"
  errorSelector?: string; // e.g., ".submit-btn" (if applicable)
  errorMessage: string; // Full error message

  // Repository context
  workflowRunId: string;
  jobName: string;
  commitSha: string;
  branch: string;
  repository: string;

  // Optional PR context
  prNumber?: string; // PR in test repo
  targetAppPrNumber?: string; // PR in app being tested (if known)
}

export interface AnalysisResult {
  // ... existing fields ...
  repairContext?: RepairContext; // Only populated for TEST_ISSUE
}
```

### 1.2 Update Error Extraction Logic

Enhance `src/analyzer.ts`:

```typescript
// Add function to classify error types
function classifyErrorType(error: string): string {
  if (
    error.includes('Expected to find element') ||
    error.includes('element not found')
  ) {
    return 'ELEMENT_NOT_FOUND';
  }
  if (error.includes('Timed out') || error.includes('TimeoutError')) {
    return 'TIMEOUT';
  }
  if (error.includes('AssertionError') || error.includes('expected')) {
    return 'ASSERTION_FAILED';
  }
  if (error.includes('Network') || error.includes('fetch')) {
    return 'NETWORK_ERROR';
  }
  return 'UNKNOWN';
}

// Extract selector from error message
function extractSelector(error: string): string | undefined {
  const patterns = [
    /\[data-testid=['"]([^'"]+)['"]\]/,
    /\[data-test=['"]([^'"]+)['"]\]/,
    /\.([a-zA-Z0-9-_]+)/,
    /#([a-zA-Z0-9-_]+)/,
    /\[alt=['"]([^'"]+)['"]\]/,
  ];

  for (const pattern of patterns) {
    const match = error.match(pattern);
    if (match) return match[0];
  }
  return undefined;
}
```

### 1.3 Add Repair Context to Action Outputs

Update `action.yml`:

```yaml
outputs:
  # ... existing outputs ...
  repair_context:
    description: 'Minimal context for repair agent (only for TEST_ISSUE)'
  output_repair_context:
    description: 'Boolean indicating if repair context should be output'
```

## Phase 2: Create Repair Agent Core (Week 2)

### 2.1 Project Structure

```
src/repair/
├── index.ts              # Main repair agent entry
├── types.ts              # Repair-specific types
├── context-fetcher.ts    # Autonomous context fetching
├── search-strategy.ts    # AI-driven search logic
├── repair-engine.ts      # Core repair logic
├── validator.ts          # Fix validation
└── github-integration.ts # PR creation via GitHub API
```

### 2.2 Context Fetcher Implementation

`src/repair/context-fetcher.ts`:

```typescript
export class ContextFetcher {
  constructor(
    private testRepoClient: Octokit,
    private appRepoClient: Octokit,
    private openaiClient: OpenAIClient
  ) {}

  async determineRequiredData(context: RepairContext): DataRequirements {
    const requirements: DataRequirements = {
      testFile: true,
      testHistory: false,
      appPrDiff: false,
      appComponents: [],
      appSelectors: false,
      networkPatterns: false,
      similarTests: false,
    };

    switch (context.errorType) {
      case 'ELEMENT_NOT_FOUND':
      case 'ELEMENT_NOT_VISIBLE':
        requirements.appSelectors = true;
        requirements.appComponents = this.identifyComponents(context);
        if (context.targetAppPrNumber) {
          requirements.appPrDiff = true;
        }
        break;

      case 'TIMEOUT':
      case 'NETWORK_ERROR':
        requirements.networkPatterns = true;
        requirements.similarTests = true;
        if (context.targetAppPrNumber) {
          requirements.appPrDiff = true;
        }
        break;

      case 'ASSERTION_FAILED':
        requirements.testHistory = true;
        requirements.appPrDiff = true;
        break;
    }

    return requirements;
  }

  async fetchRequiredContext(
    requirements: DataRequirements,
    context: RepairContext
  ): Promise<FullContext> {
    const fetchers = [];

    if (requirements.testFile) {
      fetchers.push(this.fetchTestFile(context.testFile, context.commitSha));
    }

    if (requirements.testHistory) {
      fetchers.push(this.fetchTestHistory(context.testFile, context.branch));
    }

    if (requirements.appPrDiff && context.targetAppPrNumber) {
      fetchers.push(this.fetchAppPrDiff(context.targetAppPrNumber));
    }

    if (requirements.appComponents.length > 0) {
      fetchers.push(this.fetchAppComponents(requirements.appComponents));
    }

    if (requirements.appSelectors) {
      fetchers.push(this.fetchSelectorsFromApp(context));
    }

    const results = await Promise.all(fetchers);
    return this.assembleContext(results, requirements);
  }
}
```

### 2.3 AI-Driven Search Strategy

`src/repair/search-strategy.ts`:

```typescript
export class SearchStrategy {
  constructor(private openaiClient: OpenAIClient) {}

  async generateSearchQueries(context: RepairContext): Promise<SearchPlan> {
    const prompt = `
Analyze this Cypress test failure and determine what to search for in the application source code.

## Test Failure Context
File: ${context.testFile}
Error: ${context.errorMessage}
Failed selector/element: ${context.errorSelector || 'unknown'}
Error type: ${context.errorType}

## Instructions
Based on this failure, determine:
1. What UI element or component the test is trying to interact with
2. What we should search for in the application source code
3. Alternative search terms if the primary search fails

DO NOT make assumptions. Look at the actual test code and error to determine:
- Is it looking for a button, input, div, etc?
- What text content might be associated with it?
- What user action is being attempted?
- What component might contain this element?

Response format:
{
  "targetElement": {
    "type": "button|input|div|etc",
    "purpose": "what this element does",
    "context": "where in the UI this appears"
  },
  "searchQueries": [
    {
      "query": "exact search string for GitHub code search",
      "rationale": "why this search makes sense"
    }
  ],
  "componentHints": ["LoginForm", "SubmitButton"]
}
`;

    return await this.openaiClient.analyzeForSearch(prompt);
  }

  async executeSearchStrategy(
    strategy: SearchStrategy,
    context: RepairContext
  ): Promise<SelectorMap> {
    const results: SelectorMap = {
      found: [],
      alternatives: [],
      confidence: {},
    };

    // Try each search query in order
    for (const searchItem of strategy.searchQueries) {
      try {
        const searchResults = await this.appRepoClient.search.code({
          q: `${searchItem.query} repo:${context.appRepo}`,
          per_page: 5,
        });

        if (searchResults.data.items.length > 0) {
          for (const item of searchResults.data.items) {
            const fileContent = await this.fetchAppFile(item.path);
            const selectors = await this.extractSelectorsWithAI(
              fileContent,
              strategy.targetElement,
              item.path
            );

            results.found.push(...selectors.primary);
            results.alternatives.push(...selectors.alternatives);
            results.confidence[item.path] = selectors.confidence;
          }
        }
      } catch (error) {
        console.log(`Search failed for: ${searchItem.query}`);
      }
    }

    return results;
  }
}
```

## Phase 3: Implement Repair Logic (Week 3)

### 3.1 Repair Engine

`src/repair/repair-engine.ts`:

```typescript
export class RepairEngine {
  async attemptRepair(
    fullContext: FullContext,
    minConfidence: number = 70
  ): Promise<RepairResult> {
    const repairPrompt = this.buildRepairPrompt(fullContext);
    const suggestedFix = await this.openaiClient.generateRepair(repairPrompt);

    if (suggestedFix.confidence < minConfidence) {
      return {
        canRepair: false,
        reason: 'Insufficient confidence',
        missingInformation: suggestedFix.missingInfo,
      };
    }

    // Validate the fix has evidence
    if (!this.hasValidEvidence(suggestedFix, fullContext)) {
      return {
        canRepair: false,
        reason: 'No concrete evidence found',
        missingInformation: ['Source code evidence'],
      };
    }

    return {
      canRepair: true,
      confidence: suggestedFix.confidence,
      proposedFix: suggestedFix.changes,
      evidence: suggestedFix.evidence,
    };
  }

  private buildRepairPrompt(context: FullContext): string {
    return `
You are a Cypress test repair expert. Analyze this TEST_ISSUE and provide a fix based ONLY on the evidence provided.

## MINIMAL CONTEXT FROM TRIAGE
- Test File: ${context.minimal.testFile}
- Error Line: ${context.minimal.errorLine}
- Error Type: ${context.minimal.errorType}
- Failed Selector/Assertion: ${context.minimal.errorSelector}

## FETCHED CONTEXT

### Test File Content
\`\`\`typescript
${context.fetched.testFileContent}
\`\`\`

### Error Location (Line ${context.minimal.errorLine})
\`\`\`typescript
${context.fetched.errorLineContext}
\`\`\`

${
  context.fetched.appPrDiff
    ? `
### Application PR Diff (Potential Cause)
\`\`\`diff
${context.fetched.appPrDiff}
\`\`\`
`
    : ''
}

${
  context.fetched.availableSelectors
    ? `
### Available Selectors in Application
- Data Test IDs: ${context.fetched.availableSelectors.dataTestIds.join(', ')}
- Aria Labels: ${context.fetched.availableSelectors.ariaLabels.join(', ')}
- Stable Classes: ${context.fetched.availableSelectors.stableClasses.join(', ')}
`
    : ''
}

## REPAIR INSTRUCTIONS

1. Identify the ROOT CAUSE based on the evidence above
2. If the cause is found in the PR diff, reference the specific line
3. If the fix requires a selector change, ONLY use selectors from "Available Selectors"
4. If you cannot find concrete evidence, respond with "CANNOT_REPAIR"

## RESPONSE FORMAT

{
  "canRepair": boolean,
  "confidence": number (0-100),
  "rootCause": {
    "description": "specific description",
    "evidence": {
      "source": "PR_DIFF" | "APP_COMPONENT" | "TEST_PATTERN",
      "reference": "specific line or file"
    }
  },
  "proposedFix": {
    "changes": [{
      "file": "${context.minimal.testFile}",
      "line": number,
      "oldCode": "exact current code",
      "newCode": "exact replacement code",
      "justification": "why this fixes the issue"
    }]
  }
}
`;
  }
}
```

## Phase 4: GitHub API Integration

### 4.1 Direct PR Creation

`src/repair/github-integration.ts`:

```typescript
import { Octokit } from '@octokit/rest';
import * as core from '@actions/core';

export class GitHubIntegration {
  constructor(private octokit: Octokit) {}

  async createRepairPR(
    owner: string,
    repo: string,
    repairDiff: string,
    repairContext: RepairContext,
    repairConfidence: number,
    fetchedContext: string[]
  ): Promise<string> {
    try {
      // Get the default branch
      const { data: repoData } = await this.octokit.repos.get({
        owner,
        repo,
      });
      const baseBranch = repoData.default_branch;

      // Create a new branch for the repair
      const repairBranch = `auto-repair/${
        repairContext.workflowRunId
      }-${Date.now()}`;

      // Get the latest commit SHA from the base branch
      const { data: refData } = await this.octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranch}`,
      });
      const baseSha = refData.object.sha;

      // Create new branch
      await this.octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${repairBranch}`,
        sha: baseSha,
      });

      // Apply the repair diff
      const changes = this.parseDiff(repairDiff);

      for (const change of changes) {
        // Get the current file content
        let currentContent = '';
        try {
          const { data: fileData } = await this.octokit.repos.getContent({
            owner,
            repo,
            path: change.filePath,
            ref: repairBranch,
          });

          if ('content' in fileData) {
            currentContent = Buffer.from(fileData.content, 'base64').toString();
          }
        } catch (error) {
          core.debug(`File ${change.filePath} not found, will create new`);
        }

        // Apply the changes
        const newContent = this.applyChangesToFile(currentContent, change);

        // Create or update the file
        await this.octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: change.filePath,
          message: `fix: Auto-repair ${repairContext.errorType} in ${change.filePath}`,
          content: Buffer.from(newContent).toString('base64'),
          branch: repairBranch,
          sha: currentContent
            ? (
                await this.octokit.repos.getContent({
                  owner,
                  repo,
                  path: change.filePath,
                  ref: repairBranch,
                })
              ).data.sha
            : undefined,
        });
      }

      // Create the pull request
      const { data: pr } = await this.octokit.pulls.create({
        owner,
        repo,
        title: `[Auto-Repair] Fix ${repairContext.errorType} in ${repairContext.testName}`,
        head: repairBranch,
        base: baseBranch,
        body: this.generatePRBody(
          repairContext,
          repairConfidence,
          fetchedContext,
          repairDiff
        ),
        draft: false,
      });

      // Add labels to the PR
      await this.octokit.issues.addLabels({
        owner,
        repo,
        issue_number: pr.number,
        labels: ['auto-repair', 'test-fix'],
      });

      core.info(`Created PR #${pr.number}: ${pr.html_url}`);
      return pr.html_url;
    } catch (error) {
      core.error(`Failed to create PR: ${error}`);
      throw error;
    }
  }

  private generatePRBody(
    context: RepairContext,
    confidence: number,
    fetchedContext: string[],
    diff: string
  ): string {
    return `## 🤖 Automated Test Repair

This PR was automatically generated to fix a failing test.

### 📊 Analysis Details
- **Verdict:** TEST_ISSUE
- **Confidence:** ${confidence}%
- **Error Type:** ${context.errorType}
- **Test File:** ${context.testFile}
- **Test Name:** ${context.testName}

### 🔍 Context Fetched
The repair agent analyzed the following sources:
${fetchedContext.map((ctx) => `- ${ctx}`).join('\n')}

### 🛠️ Proposed Fix
\`\`\`diff
${diff}
\`\`\`

### 📝 Original Error
\`\`\`
${context.errorMessage}
\`\`\`

### 🔗 Related Information
- **Workflow Run:** [${context.workflowRunId}](https://github.com/${
      context.repository
    }/actions/runs/${context.workflowRunId})
- **Job:** ${context.jobName}
- **Commit:** ${context.commitSha}
${context.prNumber ? `- **Original PR:** #${context.prNumber}` : ''}

### ⚠️ Important
This fix was automatically generated based on test failure analysis. Please review carefully before merging:
1. Verify the fix addresses the root cause
2. Check for any unintended side effects
3. Ensure the fix follows project conventions
4. Run the test suite locally to confirm

---
*Generated by [Adept Repair Agent](https://github.com/adept/adept-repair-agent)*`;
  }
}
```

## Phase 5: Workflow Integration

### 5.1 Complete Workflow

`.github/workflows/triage-and-repair.yml`:

```yaml
name: Triage and Repair Failed Tests

on:
  repository_dispatch:
    types: [triage-failed-test]

jobs:
  triage:
    runs-on: ubuntu-latest
    outputs:
      verdict: ${{ steps.triage.outputs.verdict }}
      confidence: ${{ steps.triage.outputs.confidence }}
      repair_context: ${{ steps.triage.outputs.repair_context }}
    steps:
      - name: Run triage analysis
        id: triage
        uses: adept/adept-triage-agent@v2
        with:
          GITHUB_TOKEN: ${{ secrets.CROSS_REPO_PAT }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          WORKFLOW_RUN_ID: '${{ github.event.client_payload.workflow_run_id }}'
          JOB_NAME: '${{ github.event.client_payload.job_name }}'
          OUTPUT_REPAIR_CONTEXT: true

  repair:
    needs: triage
    if: needs.triage.outputs.verdict == 'TEST_ISSUE'
    runs-on: ubuntu-latest
    steps:
      - name: Run repair agent
        id: repair
        uses: adept/adept-repair-agent@v1
        with:
          TEST_REPO_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          APP_REPO_TOKEN: ${{ secrets.CROSS_REPO_PAT }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          REPAIR_CONTEXT: ${{ needs.triage.outputs.repair_context }}
          TEST_REPO: 'Adept/lib-cypress-canary'
          APP_REPO: 'Adept/learn-webapp'
          MIN_CONFIDENCE: 70
          REQUIRE_EVIDENCE: true
          CREATE_PR: true # Integrated PR creation
```

## Phase 6: Testing Strategy

### 6.1 Unit Tests

```typescript
// __tests__/repair/context-fetcher.test.ts
describe('ContextFetcher', () => {
  it('should fetch only required data for selector issues', async () => {
    const context = {
      errorType: 'ELEMENT_NOT_FOUND',
      errorSelector: '.submit-btn',
      testFile: 'cypress/e2e/auth/login.cy.ts',
    };

    const fetcher = new ContextFetcher(mockClients);
    const requirements = fetcher.determineRequiredData(context);

    expect(requirements.testFile).toBe(true);
    expect(requirements.appSelectors).toBe(true);
    expect(requirements.networkPatterns).toBe(false);
  });

  it('should handle missing components gracefully', async () => {
    const fetcher = new ContextFetcher(mockClients);
    const components = await fetcher.fetchAppComponents([
      'non/existent/path.tsx',
    ]);

    expect(components).toEqual([]);
    expect(fetcher.attempts).toContain('non/existent/path.tsx');
    expect(fetcher.alternatives).toContain('src/components/path.tsx');
  });
});
```

### 6.2 Integration Tests

```typescript
describe('Repair Agent E2E', () => {
  it('should fetch minimal context and repair selector issue', async () => {
    // Minimal context from triage
    const minimalContext = {
      testFile: 'cypress/e2e/auth/login.cy.ts',
      errorLine: 42,
      errorType: 'ELEMENT_NOT_FOUND',
      errorSelector: '.old-submit-btn',
      targetAppPrNumber: '123',
    };

    // Setup mocks for expected fetches
    mockTestRepoFetch('cypress/e2e/auth/login.cy.ts');
    mockAppPrDiff('123', 'className="old-submit-btn" -> data-testid="submit"');

    const agent = new RepairAgent(config);
    const result = await agent.attemptRepair(minimalContext);

    expect(result.attempted).toBe(true);
    expect(result.fix).toContain('data-testid="submit"');
    expect(result.fetchedData).toEqual([
      'testFile',
      'appPrDiff',
      'appSelectors',
    ]);
  });
});
```

## Key Design Principles

### 1. AI-Driven Analysis, Not Assumptions

- No hardcoded selector patterns - Let AI analyze the actual test and error
- Context-aware searching - AI determines what to search for based on the test's intent
- Smart query generation - AI creates multiple search strategies based on the failure

### 2. Two-Phase AI Process

**Phase 1: Analysis** - Understand what we're looking for

- Analyze the test failure context
- Determine the target element type and purpose
- Generate intelligent search queries

**Phase 2: Extraction** - Find actual selectors in source

- Analyze retrieved source code
- Extract only real selectors that exist
- Provide confidence scores based on stability

### 3. Evidence Chain

Every repair must have a traceable evidence chain:

```
Test Failure → AI Analysis → Search Strategy → Source Code → Extracted Selectors → Validated Fix
```

## Security Considerations

### Token Management

- Test repo token: Read/write for creating PRs
- App repo token: Read-only for fetching source
- Tokens never passed between agents, only results

### Data Isolation

- Triage agent: No access to app source
- Repair agent: Limited, targeted access
- No bulk data extraction

## Success Metrics

- [ ] Repair agent successfully fixes 70%+ of TEST_ISSUE verdicts
- [ ] No false positives (incorrect fixes) in production
- [ ] Average repair time < 2 minutes
- [ ] Evidence-based repairs with traceable logic
- [ ] Zero security incidents from cross-repo access

## Monitoring and Observability

### Fetch Analytics

```typescript
interface FetchMetrics {
  repairAttemptId: string;
  minimalContextSize: number;
  fetchedDataSize: number;
  fetchDuration: number;
  totalDataFetched: number;
}
```

### Repair Decision Tracking

```typescript
interface RepairDecision {
  attemptId: string;
  minimalContext: object;
  fetchedContext: string[];
  openAITokensUsed: number;
  confidence: number;
  decision: 'REPAIR' | 'CANNOT_REPAIR';
  reasoning: string;
  evidenceUsed: string[];
}
```

## Quick Start Commands

```bash
# Phase 1: Update triage agent
npm run build
npm test

# Phase 2-3: Build repair agent
cd src/repair
npm install
npm run build

# Phase 4: Package as action
npm run package

# Phase 5: Deploy workflow
gh workflow run triage-and-repair.yml

# Phase 6: Run tests
npm run test:repair
```

## Comparison with Existing Solutions

### What Makes This Approach Unique

1. **Two-Agent Architecture**: Separation between triage and repair with minimal context passing
2. **AI-Driven Search Strategy**: Dynamic determination of what to search for
3. **Evidence-Based Repairs**: Mandatory source code validation
4. **Cross-Repository Intelligence**: Works across separate test and app repositories
5. **Autonomous Context Fetching**: Repair agent determines and fetches only what it needs

### Advantages Over Existing Tools

| Feature               | Our Approach | Existing Tools       |
| --------------------- | ------------ | -------------------- |
| Context Passing       | Minimal      | Full context or none |
| Search Strategy       | AI-driven    | Hardcoded patterns   |
| Evidence Requirements | Mandatory    | Optional or none     |
| Cross-repo Support    | Native       | Limited              |
| PR Creation           | Direct API   | Third-party actions  |

## Future Enhancements

1. **Self-learning**: Store successful repairs for pattern matching
2. **Multi-framework support**: Extend beyond Cypress
3. **Complex repairs**: Handle multi-file changes
4. **Collaboration features**: Slack/Teams notifications
5. **Analytics dashboard**: Track repair success rates
6. **Repair templates**: Common fix patterns for faster repairs

## Conclusion

This architecture ensures:

1. **Minimal data passing** between triage and repair agents
2. **Autonomous context fetching** by the repair agent
3. **Evidence-based repairs** grounded in actual source code
4. **Efficient operation** by fetching only what's needed
5. **Clear separation of concerns** between analysis and repair

The repair agent becomes a smart, autonomous system that can investigate and fix issues based on minimal initial context, making the system more maintainable and scalable.
