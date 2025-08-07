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
exports.SourceValidator = void 0;
const core = __importStar(require("@actions/core"));
class SourceValidator {
    appRepoClient;
    appRepo;
    constructor(appRepoClient, appRepo) {
        this.appRepoClient = appRepoClient;
        this.appRepo = appRepo;
    }
    async validateSelectorExists(selector) {
        core.info(`Validating selector existence: ${selector}`);
        const selectorValue = this.extractSelectorValue(selector);
        if (!selectorValue) {
            return {
                exists: false,
                locations: [],
                similarSelectors: [],
                confidence: 0
            };
        }
        const locations = await this.searchForSelector(selectorValue);
        let similarSelectors = [];
        if (locations.length === 0) {
            similarSelectors = await this.findSimilarSelectors(selectorValue);
        }
        const confidence = this.calculateConfidence(locations, similarSelectors);
        return {
            exists: locations.length > 0,
            locations,
            similarSelectors,
            confidence
        };
    }
    extractSelectorValue(selector) {
        const dataTestIdMatch = selector.match(/\[data-testid=["']([^"']+)["']\]/);
        if (dataTestIdMatch)
            return dataTestIdMatch[1];
        const dataTestMatch = selector.match(/\[data-test=["']([^"']+)["']\]/);
        if (dataTestMatch)
            return dataTestMatch[1];
        const idMatch = selector.match(/^#(.+)$/);
        if (idMatch)
            return idMatch[1];
        const classMatch = selector.match(/^\.(.+)$/);
        if (classMatch)
            return classMatch[1];
        return selector;
    }
    async searchForSelector(selectorValue) {
        const locations = [];
        const [owner, repo] = this.appRepo.split('/');
        const queries = [
            `data-testid="${selectorValue}"`,
            `data-testid='${selectorValue}'`,
            `data-test="${selectorValue}"`,
            `data-test='${selectorValue}'`,
            selectorValue
        ];
        for (const query of queries) {
            try {
                const { data: searchResults } = await this.appRepoClient.search.code({
                    q: `${query} repo:${owner}/${repo}`,
                    per_page: 5
                });
                if (searchResults.items.length > 0) {
                    for (const item of searchResults.items) {
                        if (!locations.includes(item.path)) {
                            locations.push(item.path);
                            core.debug(`Found selector in: ${item.path}`);
                        }
                    }
                }
            }
            catch (error) {
                core.debug(`Search failed for query "${query}": ${error}`);
            }
        }
        return locations;
    }
    async findSimilarSelectors(selectorValue) {
        const similar = [];
        const [owner, repo] = this.appRepo.split('/');
        const words = selectorValue.split(/[-_]/);
        const baseWord = words[0];
        if (baseWord && baseWord.length > 2) {
            try {
                const { data: searchResults } = await this.appRepoClient.search.code({
                    q: `data-testid ${baseWord} repo:${owner}/${repo}`,
                    per_page: 10
                });
                const selectorPattern = /data-testid=["']([^"']+)["']/g;
                const foundSelectors = new Set();
                for (const item of searchResults.items) {
                    try {
                        const { data: fileData } = await this.appRepoClient.repos.getContent({
                            owner,
                            repo,
                            path: item.path
                        });
                        if ('content' in fileData) {
                            const content = Buffer.from(fileData.content, 'base64').toString();
                            let match;
                            while ((match = selectorPattern.exec(content)) !== null) {
                                if (match[1] !== selectorValue && match[1].includes(baseWord)) {
                                    foundSelectors.add(match[1]);
                                }
                            }
                        }
                    }
                    catch (error) {
                        core.debug(`Failed to fetch content for ${item.path}`);
                    }
                }
                similar.push(...Array.from(foundSelectors).slice(0, 5));
            }
            catch (error) {
                core.debug(`Similar selector search failed: ${error}`);
            }
        }
        return similar;
    }
    calculateConfidence(locations, similarSelectors) {
        if (locations.length > 0) {
            return Math.min(95, 80 + (locations.length * 5));
        }
        else if (similarSelectors.length > 0) {
            return Math.min(85, 60 + (similarSelectors.length * 5));
        }
        else {
            return 90;
        }
    }
    generateRecommendation(validation, selector) {
        if (!validation.exists) {
            if (validation.similarSelectors.length > 0) {
                return {
                    recommendation: 'UPDATE_SELECTOR',
                    confidence: validation.confidence,
                    reasoning: `The selector ${selector} does not exist, but similar selectors were found. The element may have been renamed.`,
                    suggestedFix: `Update to use one of these selectors: ${validation.similarSelectors.map(s => `[data-testid="${s}"]`).join(', ')}`
                };
            }
            else {
                return {
                    recommendation: 'REMOVE_TEST',
                    confidence: validation.confidence,
                    reasoning: `The selector ${selector} does not exist in the source code and no similar selectors were found. The feature appears to have been removed.`,
                    suggestedFix: `Remove or skip this test as the feature no longer exists in the application.`
                };
            }
        }
        else {
            return {
                recommendation: 'FIX_TIMING',
                confidence: validation.confidence,
                reasoning: `The selector ${selector} exists in ${validation.locations.length} location(s). The test failure is likely due to timing or visibility issues.`,
                suggestedFix: `Add proper wait conditions or increase timeout for the element to appear.`
            };
        }
    }
}
exports.SourceValidator = SourceValidator;
//# sourceMappingURL=source-validator.js.map