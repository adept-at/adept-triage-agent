/**
 * Code Reading Agent
 * Fetches and analyzes relevant code files to build context for fix generation
 */

import {
  BaseAgent,
  AgentContext,
  AgentResult,
  AgentConfig,
} from './base-agent';
import { OpenAIClient } from '../openai-client';
import { Octokit } from '@octokit/rest';

/**
 * Context for fetching source files
 */
export interface SourceFetchContext {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
}

/**
 * Output from the Code Reading Agent
 */
export interface CodeReadingOutput {
  /** Content of the test file */
  testFileContent: string;
  /** Related files that were fetched */
  relatedFiles: Array<{
    path: string;
    content: string;
    relevance: string;
  }>;
  /** Custom commands or helpers found */
  customCommands: Array<{
    name: string;
    file: string;
    definition?: string;
  }>;
  /** Page objects or fixtures found */
  pageObjects: Array<{
    name: string;
    file: string;
    selectors?: string[];
  }>;
  /** Summary of what was found */
  summary: string;
}

/**
 * Input for the Code Reading Agent
 */
export interface CodeReadingInput {
  /** Test file to read */
  testFile: string;
  /** Selectors to look for in related files */
  errorSelectors?: string[];
  /** Additional files to fetch */
  additionalFiles?: string[];
}

/**
 * Code Reading Agent Implementation
 */
export class CodeReadingAgent extends BaseAgent<
  CodeReadingInput,
  CodeReadingOutput
> {
  private sourceFetchContext?: SourceFetchContext;

  constructor(
    openaiClient: OpenAIClient,
    sourceFetchContext?: SourceFetchContext,
    config?: Partial<AgentConfig>
  ) {
    super(openaiClient, 'CodeReadingAgent', config);
    this.sourceFetchContext = sourceFetchContext;
  }

  /**
   * Execute the code reading
   */
  async execute(
    input: CodeReadingInput,
    context: AgentContext
  ): Promise<AgentResult<CodeReadingOutput>> {
    const startTime = Date.now();
    let apiCalls = 0;

    try {
      this.log('Starting code reading...');

      // Fetch the test file
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

      // Find related files
      const relatedFiles: CodeReadingOutput['relatedFiles'] = [];
      const customCommands: CodeReadingOutput['customCommands'] = [];
      const pageObjects: CodeReadingOutput['pageObjects'] = [];

      // Parse the test file to find imports and helpers
      const imports = this.extractImports(testFileContent);
      const helperCalls = this.extractHelperCalls(testFileContent);
      const pageObjectRefs = this.extractPageObjectReferences(testFileContent);

      // Fetch helper/support files
      const supportFiles = await this.findAndFetchSupportFiles(
        input.testFile,
        imports,
        helperCalls
      );
      for (const [path, content] of supportFiles) {
        relatedFiles.push({
          path,
          content,
          relevance: 'Helper/support file',
        });
        apiCalls++;

        // Extract custom commands from support files
        const commands = this.extractCustomCommands(content, path);
        customCommands.push(...commands);
      }

      // Look for page objects
      for (const pageObjRef of pageObjectRefs) {
        const pageObjFile = await this.findPageObjectFile(
          pageObjRef,
          input.testFile
        );
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

      // Look for files related to error selectors in PR diff
      if (input.errorSelectors && context.prDiff) {
        for (const file of context.prDiff.files) {
          // Check if the file might contain relevant selectors
          if (this.isRelevantFile(file.filename, input.errorSelectors)) {
            const content = await this.fetchFile(file.filename);
            apiCalls++;
            if (content) {
              relatedFiles.push({
                path: file.filename,
                content: content.slice(0, 5000), // Limit size
                relevance:
                  'File from PR diff that may contain relevant selectors',
              });
            }
          }
        }
      }

      // Build summary
      const summary = this.buildSummary(
        testFileContent,
        relatedFiles,
        customCommands,
        pageObjects
      );

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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log(`Failed: ${errorMessage}`, 'warning');

      return {
        success: false,
        error: errorMessage,
        executionTimeMs: Date.now() - startTime,
        apiCalls,
      };
    }
  }

  /**
   * Get the system prompt (not used directly - this agent does file fetching)
   */
  protected getSystemPrompt(): string {
    return '';
  }

  /**
   * Build user prompt (not used directly)
   */
  protected buildUserPrompt(
    _input: CodeReadingInput,
    _context: AgentContext
  ): string {
    return '';
  }

  /**
   * Parse response (not used directly)
   */
  protected parseResponse(_response: string): CodeReadingOutput | null {
    return null;
  }

  /**
   * Fetch a file from the repository
   */
  private async fetchFile(path: string): Promise<string> {
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
    } catch (error) {
      this.log(`Could not fetch ${path}: ${error}`, 'debug');
    }

    return '';
  }

  /**
   * Extract import statements from code
   */
  private extractImports(code: string): string[] {
    const imports: string[] = [];

    // ES6 imports
    const es6Regex =
      /import\s+(?:(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = es6Regex.exec(code)) !== null) {
      imports.push(match[1]);
    }

    // CommonJS requires
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(code)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  /**
   * Extract helper function calls
   */
  private extractHelperCalls(code: string): string[] {
    const helpers: string[] = [];

    // Look for cy.customCommand() patterns
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

  /**
   * Extract page object references
   */
  private extractPageObjectReferences(code: string): string[] {
    const pageObjects: string[] = [];

    // Look for PageObject patterns
    const patterns = [/(\w+Page)\./g, /(\w+PageObject)\./g, /(\w+PO)\./g];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        pageObjects.push(match[1]);
      }
    }

    return [...new Set(pageObjects)];
  }

  /**
   * Find and fetch support files
   */
  private async findAndFetchSupportFiles(
    testFile: string,
    imports: string[],
    _helperCalls: string[]
  ): Promise<Map<string, string>> {
    const files = new Map<string, string>();
    const testDir = testFile.split('/').slice(0, -1).join('/');

    // Standard Cypress support file locations
    const supportPaths = [
      'cypress/support/commands.js',
      'cypress/support/commands.ts',
      'cypress/support/e2e.js',
      'cypress/support/e2e.ts',
      'cypress/support/index.js',
      'cypress/support/index.ts',
    ];

    for (const path of supportPaths) {
      const content = await this.fetchFile(path);
      if (content) {
        files.set(path, content);
      }
    }

    // Try to resolve relative imports
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

  /**
   * Find page object file
   */
  private async findPageObjectFile(
    pageObjectName: string,
    testFile: string
  ): Promise<string | null> {
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
    ];

    for (const path of possiblePaths) {
      const content = await this.fetchFile(path);
      if (content) {
        return path;
      }
    }

    return null;
  }

  /**
   * Extract custom commands from support files
   */
  private extractCustomCommands(
    code: string,
    file: string
  ): CodeReadingOutput['customCommands'] {
    const commands: CodeReadingOutput['customCommands'] = [];

    // Look for Cypress.Commands.add patterns
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

  /**
   * Extract selectors from code
   */
  private extractSelectorsFromCode(code: string): string[] {
    const selectors: string[] = [];

    // CSS selectors in cy.get()
    const getRegex = /cy\.get\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = getRegex.exec(code)) !== null) {
      selectors.push(match[1]);
    }

    // Data-testid selectors
    const testidRegex = /\[data-testid=["']([^"']+)["']\]/g;
    while ((match = testidRegex.exec(code)) !== null) {
      selectors.push(`[data-testid="${match[1]}"]`);
    }

    return [...new Set(selectors)];
  }

  /**
   * Check if a file is relevant based on selectors
   */
  private isRelevantFile(filename: string, _selectors: string[]): boolean {
    // React/Vue/Angular component files
    if (/\.(tsx?|jsx?|vue|svelte)$/.test(filename)) {
      return true;
    }

    // CSS files
    if (/\.(css|scss|less)$/.test(filename)) {
      return true;
    }

    return false;
  }

  /**
   * Resolve relative path
   */
  private resolveRelativePath(basePath: string, relativePath: string): string {
    const parts = basePath.split('/');
    const relParts = relativePath.split('/');

    for (const part of relParts) {
      if (part === '..') {
        parts.pop();
      } else if (part !== '.') {
        parts.push(part);
      }
    }

    return parts.join('/');
  }

  /**
   * Extract function definition around an index
   */
  private extractFunctionDefinition(code: string, startIndex: number): string {
    // Find the function body (simplified - looks for matching braces)
    let braceCount = 0;
    let started = false;
    let start = startIndex;
    let end = startIndex;

    for (let i = startIndex; i < code.length && i < startIndex + 2000; i++) {
      if (code[i] === '{') {
        if (!started) start = startIndex;
        started = true;
        braceCount++;
      } else if (code[i] === '}') {
        braceCount--;
        if (started && braceCount === 0) {
          end = i + 1;
          break;
        }
      }
    }

    return code.slice(start, Math.min(end, start + 500));
  }

  /**
   * Build a summary of what was found
   */
  private buildSummary(
    testFileContent: string,
    relatedFiles: CodeReadingOutput['relatedFiles'],
    customCommands: CodeReadingOutput['customCommands'],
    pageObjects: CodeReadingOutput['pageObjects']
  ): string {
    const parts: string[] = [];

    parts.push(`Test file: ${testFileContent.split('\n').length} lines`);
    parts.push(`Related files found: ${relatedFiles.length}`);

    if (customCommands.length > 0) {
      parts.push(
        `Custom commands: ${customCommands.map((c) => c.name).join(', ')}`
      );
    }

    if (pageObjects.length > 0) {
      parts.push(`Page objects: ${pageObjects.map((p) => p.name).join(', ')}`);
    }

    return parts.join('. ');
  }
}
