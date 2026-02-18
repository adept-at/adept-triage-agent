"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeReadingAgent = void 0;
const base_agent_1 = require("./base-agent");
class CodeReadingAgent extends base_agent_1.BaseAgent {
    sourceFetchContext;
    constructor(openaiClient, sourceFetchContext, config) {
        super(openaiClient, 'CodeReadingAgent', config);
        this.sourceFetchContext = sourceFetchContext;
    }
    async execute(input, context) {
        const startTime = Date.now();
        let apiCalls = 0;
        try {
            this.log('Starting code reading...');
            let testFileContent = context.sourceFileContent || '';
            if (!testFileContent && this.sourceFetchContext) {
                testFileContent = await this.fetchFile(input.testFile);
                apiCalls++;
            }
            if (!testFileContent) {
                return {
                    success: false,
                    error: 'Could not fetch test file content',
                    executionTimeMs: Date.now() - startTime,
                    apiCalls,
                };
            }
            const relatedFiles = [];
            const customCommands = [];
            const pageObjects = [];
            const imports = this.extractImports(testFileContent);
            const helperCalls = this.extractHelperCalls(testFileContent);
            const pageObjectRefs = this.extractPageObjectReferences(testFileContent);
            const supportFiles = await this.findAndFetchSupportFiles(input.testFile, imports, helperCalls);
            for (const [path, content] of supportFiles) {
                relatedFiles.push({
                    path,
                    content,
                    relevance: 'Helper/support file',
                });
                apiCalls++;
                const commands = this.extractCustomCommands(content, path);
                customCommands.push(...commands);
            }
            for (const pageObjRef of pageObjectRefs) {
                const pageObjFile = await this.findPageObjectFile(pageObjRef, input.testFile);
                if (pageObjFile) {
                    const content = await this.fetchFile(pageObjFile);
                    apiCalls++;
                    if (content) {
                        relatedFiles.push({
                            path: pageObjFile,
                            content,
                            relevance: 'Page object file',
                        });
                        pageObjects.push({
                            name: pageObjRef,
                            file: pageObjFile,
                            selectors: this.extractSelectorsFromCode(content),
                        });
                    }
                }
            }
            if (input.errorSelectors && context.prDiff) {
                for (const file of context.prDiff.files) {
                    if (this.isRelevantFile(file.filename, input.errorSelectors)) {
                        const content = await this.fetchFile(file.filename);
                        apiCalls++;
                        if (content) {
                            relatedFiles.push({
                                path: file.filename,
                                content: content.slice(0, 5000),
                                relevance: 'File from PR diff that may contain relevant selectors',
                            });
                        }
                    }
                }
            }
            const summary = this.buildSummary(testFileContent, relatedFiles, customCommands, pageObjects);
            return {
                success: true,
                data: {
                    testFileContent,
                    relatedFiles,
                    customCommands,
                    pageObjects,
                    summary,
                },
                executionTimeMs: Date.now() - startTime,
                apiCalls,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log(`Failed: ${errorMessage}`, 'warning');
            return {
                success: false,
                error: errorMessage,
                executionTimeMs: Date.now() - startTime,
                apiCalls,
            };
        }
    }
    getSystemPrompt() {
        return '';
    }
    buildUserPrompt(_input, _context) {
        return '';
    }
    parseResponse(_response) {
        return null;
    }
    async fetchFile(path) {
        if (!this.sourceFetchContext) {
            return '';
        }
        const { octokit, owner, repo, branch } = this.sourceFetchContext;
        try {
            const response = await octokit.repos.getContent({
                owner,
                repo,
                path,
                ref: branch,
            });
            if ('content' in response.data) {
                return Buffer.from(response.data.content, 'base64').toString('utf-8');
            }
        }
        catch (error) {
            this.log(`Could not fetch ${path}: ${error}`, 'debug');
        }
        return '';
    }
    extractImports(code) {
        const imports = [];
        const es6Regex = /import\s+(?:(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
        let match;
        while ((match = es6Regex.exec(code)) !== null) {
            imports.push(match[1]);
        }
        const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        while ((match = requireRegex.exec(code)) !== null) {
            imports.push(match[1]);
        }
        return imports;
    }
    extractHelperCalls(code) {
        const helpers = [];
        const customCmdRegex = /cy\.(\w+)\s*\(/g;
        const standardCommands = new Set([
            'get',
            'find',
            'contains',
            'click',
            'type',
            'should',
            'wait',
            'visit',
            'request',
            'intercept',
            'wrap',
            'then',
            'its',
            'invoke',
            'log',
            'pause',
            'debug',
            'scrollTo',
            'scrollIntoView',
            'focus',
            'blur',
            'clear',
            'submit',
            'select',
            'check',
            'uncheck',
            'trigger',
            'readFile',
            'writeFile',
            'fixture',
            'task',
            'exec',
            'screenshot',
            'viewport',
            'clearCookies',
            'clearLocalStorage',
            'getCookies',
            'setCookie',
            'getCookie',
            'hash',
            'location',
            'url',
            'title',
            'document',
            'window',
            'root',
            'within',
            'as',
            'clock',
            'tick',
            'stub',
            'spy',
            'reload',
            'go',
            'session',
            'origin',
        ]);
        let match;
        while ((match = customCmdRegex.exec(code)) !== null) {
            if (!standardCommands.has(match[1])) {
                helpers.push(match[1]);
            }
        }
        return [...new Set(helpers)];
    }
    extractPageObjectReferences(code) {
        const pageObjects = [];
        const patterns = [/(\w+Page)\./g, /(\w+PageObject)\./g, /(\w+PO)\./g];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(code)) !== null) {
                pageObjects.push(match[1]);
            }
        }
        return [...new Set(pageObjects)];
    }
    async findAndFetchSupportFiles(testFile, imports, _helperCalls) {
        const files = new Map();
        const testDir = testFile.split('/').slice(0, -1).join('/');
        const supportPaths = [
            'cypress/support/commands.js',
            'cypress/support/commands.ts',
            'cypress/support/e2e.js',
            'cypress/support/e2e.ts',
            'cypress/support/index.js',
            'cypress/support/index.ts',
            'test/helpers/index.ts',
            'test/helpers/index.js',
            'test/support/index.ts',
            'test/support/index.js',
            'wdio.conf.ts',
            'wdio.conf.js',
        ];
        for (const path of supportPaths) {
            const content = await this.fetchFile(path);
            if (content) {
                files.set(path, content);
            }
        }
        for (const imp of imports) {
            if (imp.startsWith('.')) {
                const resolvedPath = this.resolveRelativePath(testDir, imp);
                const extensions = [
                    '',
                    '.js',
                    '.ts',
                    '.jsx',
                    '.tsx',
                    '/index.js',
                    '/index.ts',
                ];
                for (const ext of extensions) {
                    const fullPath = resolvedPath + ext;
                    const content = await this.fetchFile(fullPath);
                    if (content) {
                        files.set(fullPath, content);
                        break;
                    }
                }
            }
        }
        return files;
    }
    async findPageObjectFile(pageObjectName, testFile) {
        const testDir = testFile.split('/').slice(0, -1).join('/');
        const kebabCase = pageObjectName
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .toLowerCase();
        const possiblePaths = [
            `${testDir}/page-objects/${kebabCase}.ts`,
            `${testDir}/page-objects/${kebabCase}.js`,
            `${testDir}/pages/${kebabCase}.ts`,
            `${testDir}/pages/${kebabCase}.js`,
            `cypress/page-objects/${kebabCase}.ts`,
            `cypress/page-objects/${kebabCase}.js`,
            `cypress/pages/${kebabCase}.ts`,
            `cypress/pages/${kebabCase}.js`,
            `test/pageobjects/${kebabCase}.ts`,
            `test/pageobjects/${kebabCase}.js`,
            `test/page-objects/${kebabCase}.ts`,
            `test/page-objects/${kebabCase}.js`,
        ];
        for (const path of possiblePaths) {
            const content = await this.fetchFile(path);
            if (content) {
                return path;
            }
        }
        return null;
    }
    extractCustomCommands(code, file) {
        const commands = [];
        const addCmdRegex = /Cypress\.Commands\.add\s*\(\s*['"](\w+)['"]/g;
        let match;
        while ((match = addCmdRegex.exec(code)) !== null) {
            commands.push({
                name: match[1],
                file,
                definition: this.extractFunctionDefinition(code, match.index),
            });
        }
        return commands;
    }
    extractSelectorsFromCode(code) {
        const selectors = [];
        const getRegex = /cy\.get\s*\(\s*['"`]([^'"`]+)['"`]/g;
        let match;
        while ((match = getRegex.exec(code)) !== null) {
            selectors.push(match[1]);
        }
        const testidRegex = /\[data-testid=["']([^"']+)["']\]/g;
        while ((match = testidRegex.exec(code)) !== null) {
            selectors.push(`[data-testid="${match[1]}"]`);
        }
        return [...new Set(selectors)];
    }
    isRelevantFile(filename, _selectors) {
        if (/\.(tsx?|jsx?|vue|svelte)$/.test(filename)) {
            return true;
        }
        if (/\.(css|scss|less)$/.test(filename)) {
            return true;
        }
        return false;
    }
    resolveRelativePath(basePath, relativePath) {
        const parts = basePath.split('/');
        const relParts = relativePath.split('/');
        for (const part of relParts) {
            if (part === '..') {
                parts.pop();
            }
            else if (part !== '.') {
                parts.push(part);
            }
        }
        return parts.join('/');
    }
    extractFunctionDefinition(code, startIndex) {
        let braceCount = 0;
        let started = false;
        let start = startIndex;
        let end = startIndex;
        for (let i = startIndex; i < code.length && i < startIndex + 2000; i++) {
            if (code[i] === '{') {
                if (!started)
                    start = startIndex;
                started = true;
                braceCount++;
            }
            else if (code[i] === '}') {
                braceCount--;
                if (started && braceCount === 0) {
                    end = i + 1;
                    break;
                }
            }
        }
        return code.slice(start, Math.min(end, start + 500));
    }
    buildSummary(testFileContent, relatedFiles, customCommands, pageObjects) {
        const parts = [];
        parts.push(`Test file: ${testFileContent.split('\n').length} lines`);
        parts.push(`Related files found: ${relatedFiles.length}`);
        if (customCommands.length > 0) {
            parts.push(`Custom commands: ${customCommands.map((c) => c.name).join(', ')}`);
        }
        if (pageObjects.length > 0) {
            parts.push(`Page objects: ${pageObjects.map((p) => p.name).join(', ')}`);
        }
        return parts.join('. ');
    }
}
exports.CodeReadingAgent = CodeReadingAgent;
//# sourceMappingURL=code-reading-agent.js.map