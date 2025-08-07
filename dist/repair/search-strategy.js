"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchStrategyGenerator = void 0;
const core = __importStar(require("@actions/core"));
class SearchStrategyGenerator {
    openaiClient;
    appRepoClient;
    appRepo;
    constructor(openaiClient, appRepoClient, appRepo) {
        this.openaiClient = openaiClient;
        this.appRepoClient = appRepoClient;
        this.appRepo = appRepo;
    }
    async generateSearchQueries(context) {
        const prompt = this.buildSearchPrompt(context);
        try {
            const errorData = {
                message: prompt,
                framework: 'cypress'
            };
            const response = await this.openaiClient.analyze(errorData, []);
            return this.parseSearchStrategyFromOpenAI(response);
        }
        catch (error) {
            core.warning(`Failed to generate AI search strategy: ${error}`);
            return this.getFallbackStrategy(context);
        }
    }
    async executeSearchStrategy(strategy, _context) {
        const results = {
            found: [],
            alternatives: [],
            confidence: {},
        };
        const [owner, repo] = this.appRepo.split('/');
        for (const searchItem of strategy.searchQueries.sort((a, b) => b.priority - a.priority)) {
            try {
                core.debug(`Executing search: "${searchItem.query}" (priority: ${searchItem.priority})`);
                const { data: searchResults } = await this.appRepoClient.search.code({
                    q: `${searchItem.query} repo:${owner}/${repo}`,
                    per_page: 5,
                });
                if (searchResults.items.length > 0) {
                    core.info(`Found ${searchResults.items.length} results for: ${searchItem.query}`);
                    for (const item of searchResults.items) {
                        const fileContent = await this.fetchFileContent(item.path);
                        if (fileContent) {
                            const selectors = await this.extractSelectorsWithAI(fileContent, strategy.targetElement, item.path);
                            results.found.push(...selectors.primary);
                            results.alternatives.push(...selectors.alternatives);
                            results.confidence[item.path] = selectors.confidence;
                        }
                    }
                }
            }
            catch (error) {
                core.debug(`Search failed for: ${searchItem.query} - ${error}`);
            }
        }
        if (results.found.length === 0 && strategy.componentHints.length > 0) {
            core.info('No selectors found with primary search, trying component hints...');
            for (const hint of strategy.componentHints) {
                const componentSelectors = await this.searchComponentForSelectors(hint);
                results.found.push(...componentSelectors);
            }
        }
        return results;
    }
    buildSearchPrompt(context) {
        return `
Analyze this Cypress test failure and determine what to search for in the application source code.

## Test Failure Context
File: ${context.testFile}
Error: ${context.errorMessage}
Failed selector/element: ${context.errorSelector || 'unknown'}
Error type: ${context.errorType}
Test name: ${context.testName}

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

## Response Format
Provide a JSON response with:
{
  "targetElement": {
    "type": "button|input|div|etc",
    "purpose": "what this element does",
    "context": "where in the UI this appears"
  },
  "searchQueries": [
    {
      "query": "exact search string for GitHub code search",
      "rationale": "why this search makes sense",
      "priority": 1-10
    }
  ],
  "componentHints": ["LoginForm", "SubmitButton", "etc"]
}

Focus on finding the ACTUAL implementation, not test code. Prioritize:
1. Exact selector values (data-testid="submit")
2. Component names that might contain the element
3. Text content or labels
4. Related functionality keywords`;
    }
    parseSearchStrategyFromOpenAI(response) {
        try {
            const reasoning = response.reasoning || '';
            const jsonMatch = reasoning.match(/\{[\s\S]*"targetElement"[\s\S]*\}/m);
            if (jsonMatch) {
                const strategyData = JSON.parse(jsonMatch[0]);
                return this.parseSearchResponse(strategyData);
            }
        }
        catch (error) {
            core.debug(`Failed to parse search strategy from OpenAI: ${error}`);
        }
        return this.getFallbackStrategy({});
    }
    parseSearchResponse(response) {
        try {
            if (response.targetElement && response.searchQueries) {
                return {
                    targetElement: response.targetElement,
                    searchQueries: response.searchQueries.map((q) => ({
                        query: q.query || '',
                        rationale: q.rationale || '',
                        priority: q.priority || 5
                    })),
                    componentHints: response.componentHints || []
                };
            }
        }
        catch (error) {
            core.debug(`Failed to parse search response: ${error}`);
        }
        return {
            targetElement: {
                type: 'unknown',
                purpose: 'unknown',
                context: 'unknown'
            },
            searchQueries: [],
            componentHints: []
        };
    }
    getFallbackStrategy(context) {
        const queries = [];
        if (context.errorSelector) {
            const selectorValue = context.errorSelector.match(/["']([^"']+)["']/)?.[1];
            if (selectorValue) {
                queries.push({
                    query: `"${selectorValue}"`,
                    rationale: 'Direct selector value search',
                    priority: 10
                });
                if (context.errorSelector.includes('data-testid')) {
                    queries.push({
                        query: `data-testid="${selectorValue}"`,
                        rationale: 'Full data-testid attribute search',
                        priority: 9
                    });
                }
            }
            queries.push({
                query: context.errorSelector,
                rationale: 'Full selector search',
                priority: 7
            });
        }
        const testFileName = context.testFile.split('/').pop() || '';
        const componentName = testFileName.replace(/\.(cy|spec|test)\.(ts|js|tsx|jsx)$/, '');
        queries.push({
            query: componentName,
            rationale: 'Component name from test file',
            priority: 5
        });
        return {
            targetElement: {
                type: 'unknown',
                purpose: 'extracted from error',
                context: context.testName
            },
            searchQueries: queries,
            componentHints: [componentName]
        };
    }
    async fetchFileContent(path) {
        try {
            const [owner, repo] = this.appRepo.split('/');
            const { data } = await this.appRepoClient.repos.getContent({
                owner,
                repo,
                path
            });
            if ('content' in data) {
                return Buffer.from(data.content, 'base64').toString();
            }
        }
        catch (error) {
            core.debug(`Failed to fetch file ${path}: ${error}`);
        }
        return null;
    }
    async extractSelectorsWithAI(fileContent, targetElement, filePath) {
        const prompt = `
Analyze this source code and find selectors for the target element.

## Target Element
Type: ${targetElement.type}
Purpose: ${targetElement.purpose}
Context: ${targetElement.context}

## Source Code (${filePath})
\`\`\`
${fileContent.substring(0, 3000)} // Truncated for context
\`\`\`

## Instructions
Find ALL selectors that could identify this element:
1. data-testid attributes
2. data-test attributes
3. aria-label attributes
4. id attributes
5. Stable class names (not dynamic/generated)

Return ONLY selectors that actually exist in the code above.

## Response Format
{
  "primary": [
    {
      "selector": "[data-testid='value']",
      "type": "data-testid",
      "lineNumber": 42,
      "confidence": 95
    }
  ],
  "alternatives": [
    {
      "selector": ".className",
      "type": "class",
      "lineNumber": 43,
      "confidence": 60
    }
  ],
  "overallConfidence": 85
}`;
        try {
            const errorData = {
                message: prompt,
                framework: 'cypress'
            };
            const response = await this.openaiClient.analyze(errorData, []);
            return this.parseSelectorsFromAI(response, filePath);
        }
        catch (error) {
            core.debug(`AI selector extraction failed: ${error}`);
            return this.extractSelectorsWithPatterns(fileContent, filePath);
        }
    }
    parseSelectorsFromAI(response, filePath) {
        const result = {
            primary: [],
            alternatives: [],
            confidence: 0
        };
        try {
            if (response.primary && Array.isArray(response.primary)) {
                result.primary = response.primary.map((s) => ({
                    selector: s.selector,
                    type: s.type || 'other',
                    stability: this.determineStability(s.type),
                    source: filePath,
                    lineNumber: s.lineNumber
                }));
            }
            if (response.alternatives && Array.isArray(response.alternatives)) {
                result.alternatives = response.alternatives.map((s) => ({
                    selector: s.selector,
                    type: s.type || 'other',
                    stability: this.determineStability(s.type),
                    source: filePath,
                    lineNumber: s.lineNumber
                }));
            }
            result.confidence = response.overallConfidence || 50;
        }
        catch (error) {
            core.debug(`Failed to parse AI selector response: ${error}`);
        }
        return result;
    }
    extractSelectorsWithPatterns(content, filePath) {
        const primary = [];
        const alternatives = [];
        const lines = content.split('\n');
        const patterns = [
            { regex: /data-testid=["']([^"']+)["']/g, type: 'data-testid', isPrimary: true },
            { regex: /data-test=["']([^"']+)["']/g, type: 'data-test', isPrimary: true },
            { regex: /aria-label=["']([^"']+)["']/g, type: 'aria-label', isPrimary: true },
            { regex: /id=["']([^"']+)["']/g, type: 'id', isPrimary: false },
            { regex: /className=["']([^"']+)["']/g, type: 'class', isPrimary: false },
        ];
        lines.forEach((line, index) => {
            for (const pattern of patterns) {
                let match;
                while ((match = pattern.regex.exec(line)) !== null) {
                    const selector = this.formatSelector(pattern.type, match[1]);
                    const selectorInfo = {
                        selector,
                        type: pattern.type,
                        stability: this.determineStability(pattern.type),
                        source: filePath,
                        lineNumber: index + 1
                    };
                    if (pattern.isPrimary) {
                        primary.push(selectorInfo);
                    }
                    else {
                        alternatives.push(selectorInfo);
                    }
                }
            }
        });
        return {
            primary,
            alternatives,
            confidence: primary.length > 0 ? 70 : 30
        };
    }
    async searchComponentForSelectors(componentName) {
        const selectors = [];
        const [owner, repo] = this.appRepo.split('/');
        try {
            const { data: searchResults } = await this.appRepoClient.search.code({
                q: `filename:${componentName} repo:${owner}/${repo}`,
                per_page: 3
            });
            for (const item of searchResults.items) {
                const content = await this.fetchFileContent(item.path);
                if (content) {
                    const extracted = this.extractSelectorsWithPatterns(content, item.path);
                    selectors.push(...extracted.primary, ...extracted.alternatives);
                }
            }
        }
        catch (error) {
            core.debug(`Component search failed for ${componentName}: ${error}`);
        }
        return selectors;
    }
    formatSelector(type, value) {
        switch (type) {
            case 'data-testid':
            case 'data-test':
            case 'aria-label':
                return `[${type}="${value}"]`;
            case 'id':
                return `#${value}`;
            case 'class':
                return `.${value.split(' ')[0]}`;
            default:
                return value;
        }
    }
    determineStability(type) {
        switch (type) {
            case 'data-testid':
            case 'data-test':
                return 'high';
            case 'id':
            case 'aria-label':
                return 'medium';
            case 'class':
            default:
                return 'low';
        }
    }
}
exports.SearchStrategyGenerator = SearchStrategyGenerator;
//# sourceMappingURL=search-strategy.js.map