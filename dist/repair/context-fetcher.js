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
exports.ContextFetcher = void 0;
const core = __importStar(require("@actions/core"));
class ContextFetcher {
    testRepoClient;
    appRepoClient;
    testRepo;
    appRepo;
    openaiClient;
    constructor(testRepoClient, appRepoClient, openaiClient, testRepo, appRepo) {
        this.testRepoClient = testRepoClient;
        this.appRepoClient = appRepoClient;
        this.testRepo = testRepo;
        this.appRepo = appRepo;
        this.openaiClient = openaiClient;
    }
    async determineRequiredData(context) {
        const requirements = {
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
            case 'ELEMENT_DETACHED':
            case 'ELEMENT_COVERED':
                requirements.appSelectors = true;
                requirements.appComponents = await this.identifyComponents(context);
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
                if (context.targetAppPrNumber) {
                    requirements.appPrDiff = true;
                }
                break;
            case 'INVALID_ELEMENT_TYPE':
                requirements.appSelectors = true;
                requirements.appComponents = await this.identifyComponents(context);
                break;
            default:
                requirements.testHistory = true;
                requirements.similarTests = true;
                if (context.targetAppPrNumber) {
                    requirements.appPrDiff = true;
                }
        }
        core.info(`Determined data requirements for ${context.errorType}: ${JSON.stringify(requirements)}`);
        return requirements;
    }
    async fetchRequiredContext(requirements, context) {
        const startTime = Date.now();
        const fetchers = [];
        const sources = [];
        if (requirements.testFile) {
            fetchers.push(this.fetchTestFile(context));
            sources.push('testFile');
        }
        if (requirements.testHistory) {
            fetchers.push(this.fetchTestHistory(context));
            sources.push('testHistory');
        }
        if (requirements.appPrDiff && context.targetAppPrNumber) {
            fetchers.push(this.fetchAppPrDiff(context.targetAppPrNumber));
            sources.push('appPrDiff');
        }
        if (requirements.appComponents.length > 0) {
            fetchers.push(this.fetchAppComponents(requirements.appComponents));
            sources.push('appComponents');
        }
        if (requirements.appSelectors) {
            fetchers.push(this.fetchSelectorsFromApp(context));
            sources.push('appSelectors');
        }
        if (requirements.networkPatterns) {
            fetchers.push(this.fetchNetworkPatterns(context));
            sources.push('networkPatterns');
        }
        if (requirements.similarTests) {
            fetchers.push(this.fetchSimilarTests(context));
            sources.push('similarTests');
        }
        const results = await Promise.all(fetchers);
        const fetchDuration = Date.now() - startTime;
        return this.assembleContext(results, requirements, context, sources, fetchDuration);
    }
    async identifyComponents(context) {
        const components = [];
        if (context.errorSelector) {
            const selectorParts = context.errorSelector.replace(/[#.\[\]"'=]/g, ' ').split(' ');
            for (const part of selectorParts) {
                if (part.length > 3) {
                    components.push(part);
                }
            }
        }
        const testPathParts = context.testFile.split('/');
        const testFileName = testPathParts[testPathParts.length - 1];
        const componentName = testFileName.replace('.cy.ts', '').replace('.spec.ts', '');
        components.push(componentName);
        const aiSuggestions = await this.getAIComponentSuggestions(context);
        components.push(...aiSuggestions);
        return [...new Set(components)];
    }
    async fetchTestFile(context) {
        try {
            const [owner, repo] = this.testRepo.split('/');
            const { data } = await this.testRepoClient.repos.getContent({
                owner,
                repo,
                path: context.testFile,
                ref: context.commitSha,
            });
            if ('content' in data) {
                const content = Buffer.from(data.content, 'base64').toString();
                const lines = content.split('\n');
                let errorLineContext = '';
                if (context.errorLine) {
                    const start = Math.max(0, context.errorLine - 5);
                    const end = Math.min(lines.length, context.errorLine + 5);
                    errorLineContext = lines.slice(start, end).join('\n');
                }
                return { testFileContent: content, errorLineContext };
            }
        }
        catch (error) {
            core.warning(`Failed to fetch test file: ${error}`);
        }
        return { testFileContent: '', errorLineContext: '' };
    }
    async fetchTestHistory(context) {
        try {
            const [owner, repo] = this.testRepo.split('/');
            const { data: commits } = await this.testRepoClient.repos.listCommits({
                owner,
                repo,
                path: context.testFile,
                per_page: 10,
            });
            const history = [];
            for (const commit of commits) {
                history.push({
                    commitSha: commit.sha,
                    date: commit.commit.author?.date || '',
                    status: 'passed',
                    changes: commit.commit.message,
                });
            }
            return history;
        }
        catch (error) {
            core.warning(`Failed to fetch test history: ${error}`);
            return [];
        }
    }
    async fetchAppPrDiff(prNumber) {
        try {
            const [owner, repo] = this.appRepo.split('/');
            const { data } = await this.appRepoClient.pulls.get({
                owner,
                repo,
                pull_number: parseInt(prNumber),
                mediaType: {
                    format: 'diff',
                },
            });
            return data;
        }
        catch (error) {
            core.warning(`Failed to fetch app PR diff: ${error}`);
            return '';
        }
    }
    async fetchAppComponents(componentNames) {
        const components = [];
        const [owner, repo] = this.appRepo.split('/');
        for (const componentName of componentNames) {
            try {
                const { data: searchResults } = await this.appRepoClient.search.code({
                    q: `filename:${componentName} repo:${owner}/${repo}`,
                    per_page: 5,
                });
                for (const item of searchResults.items) {
                    const { data: fileData } = await this.appRepoClient.repos.getContent({
                        owner,
                        repo,
                        path: item.path,
                    });
                    if ('content' in fileData) {
                        components.push({
                            path: item.path,
                            content: Buffer.from(fileData.content, 'base64').toString(),
                            language: this.detectLanguage(item.path),
                            relevance: item.score || 0,
                        });
                    }
                }
            }
            catch (error) {
                core.warning(`Failed to fetch component ${componentName}: ${error}`);
            }
        }
        return components;
    }
    async fetchSelectorsFromApp(context) {
        const selectorMap = {
            found: [],
            alternatives: [],
            confidence: {},
        };
        try {
            const searchStrategy = await this.generateSearchStrategy(context);
            for (const query of searchStrategy.searchQueries) {
                const selectors = await this.searchForSelectors(query.query);
                selectorMap.found.push(...selectors);
            }
            if (context.errorSelector) {
                const alternatives = await this.findAlternativeSelectors(context.errorSelector);
                selectorMap.alternatives.push(...alternatives);
            }
        }
        catch (error) {
            core.warning(`Failed to fetch selectors: ${error}`);
        }
        return selectorMap;
    }
    async searchForSelectors(query) {
        const selectors = [];
        const [owner, repo] = this.appRepo.split('/');
        try {
            const { data: searchResults } = await this.appRepoClient.search.code({
                q: `${query} repo:${owner}/${repo}`,
                per_page: 10,
            });
            for (const item of searchResults.items) {
                const extractedSelectors = await this.extractSelectorsFromFile(item.path);
                selectors.push(...extractedSelectors);
            }
        }
        catch (error) {
            core.debug(`Selector search failed for query "${query}": ${error}`);
        }
        return selectors;
    }
    async extractSelectorsFromFile(filePath) {
        const selectors = [];
        const [owner, repo] = this.appRepo.split('/');
        try {
            const { data } = await this.appRepoClient.repos.getContent({
                owner,
                repo,
                path: filePath,
            });
            if ('content' in data) {
                const content = Buffer.from(data.content, 'base64').toString();
                const lines = content.split('\n');
                const patterns = [
                    { regex: /data-testid=["']([^"']+)["']/g, type: 'data-testid', stability: 'high' },
                    { regex: /data-test=["']([^"']+)["']/g, type: 'data-test', stability: 'high' },
                    { regex: /id=["']([^"']+)["']/g, type: 'id', stability: 'medium' },
                    { regex: /className=["']([^"']+)["']/g, type: 'class', stability: 'low' },
                    { regex: /aria-label=["']([^"']+)["']/g, type: 'aria-label', stability: 'medium' },
                ];
                lines.forEach((line, index) => {
                    for (const pattern of patterns) {
                        let match;
                        while ((match = pattern.regex.exec(line)) !== null) {
                            selectors.push({
                                selector: pattern.type === 'id' ? `#${match[1]}` :
                                    pattern.type === 'class' ? `.${match[1].split(' ')[0]}` :
                                        `[${pattern.type}="${match[1]}"]`,
                                type: pattern.type,
                                stability: pattern.stability,
                                source: filePath,
                                lineNumber: index + 1,
                            });
                        }
                    }
                });
            }
        }
        catch (error) {
            core.debug(`Failed to extract selectors from ${filePath}: ${error}`);
        }
        return selectors;
    }
    async findAlternativeSelectors(_originalSelector) {
        return [];
    }
    async fetchNetworkPatterns(_context) {
        return [];
    }
    async fetchSimilarTests(_context) {
        return [];
    }
    async getAIComponentSuggestions(_context) {
        if (this.openaiClient) {
        }
        return [];
    }
    async generateSearchStrategy(context) {
        const queries = [];
        if (context.errorSelector) {
            const selectorValue = context.errorSelector.match(/["']([^"']+)["']/)?.[1];
            if (selectorValue) {
                queries.push({ query: selectorValue });
            }
        }
        return { searchQueries: queries };
    }
    detectLanguage(filePath) {
        const ext = filePath.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'ts':
            case 'tsx':
                return 'typescript';
            case 'js':
            case 'jsx':
                return 'javascript';
            case 'vue':
                return 'vue';
            default:
                return 'unknown';
        }
    }
    assembleContext(results, requirements, context, sources, fetchDuration) {
        const fullContext = {
            minimal: context,
            fetched: {},
            metadata: {
                fetchedAt: new Date().toISOString(),
                sources,
                fetchDuration,
            },
        };
        let index = 0;
        if (requirements.testFile && results[index]) {
            fullContext.fetched.testFileContent = results[index].testFileContent;
            fullContext.fetched.errorLineContext = results[index].errorLineContext;
            index++;
        }
        if (requirements.testHistory && results[index]) {
            fullContext.fetched.testHistory = results[index];
            index++;
        }
        if (requirements.appPrDiff && context.targetAppPrNumber && results[index]) {
            fullContext.fetched.appPrDiff = results[index];
            index++;
        }
        if (requirements.appComponents.length > 0 && results[index]) {
            fullContext.fetched.appComponents = results[index];
            index++;
        }
        if (requirements.appSelectors && results[index]) {
            fullContext.fetched.availableSelectors = results[index];
            index++;
        }
        if (requirements.networkPatterns && results[index]) {
            fullContext.fetched.networkPatterns = results[index];
            index++;
        }
        if (requirements.similarTests && results[index]) {
            fullContext.fetched.similarTests = results[index];
            index++;
        }
        core.info(`Assembled full context with ${sources.length} sources in ${fetchDuration}ms`);
        return fullContext;
    }
}
exports.ContextFetcher = ContextFetcher;
//# sourceMappingURL=context-fetcher.js.map