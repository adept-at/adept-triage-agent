import { BaseAgent, AgentContext, AgentResult, AgentConfig } from './base-agent';
import { OpenAIClient } from '../openai-client';
import { Octokit } from '@octokit/rest';
export interface SourceFetchContext {
    octokit: Octokit;
    owner: string;
    repo: string;
    branch: string;
}
export interface CodeReadingOutput {
    testFileContent: string;
    relatedFiles: Array<{
        path: string;
        content: string;
        relevance: string;
    }>;
    customCommands: Array<{
        name: string;
        file: string;
        definition?: string;
    }>;
    pageObjects: Array<{
        name: string;
        file: string;
        selectors?: string[];
    }>;
    summary: string;
}
export interface CodeReadingInput {
    testFile: string;
    errorSelectors?: string[];
    additionalFiles?: string[];
}
export declare class CodeReadingAgent extends BaseAgent<CodeReadingInput, CodeReadingOutput> {
    private sourceFetchContext?;
    constructor(openaiClient: OpenAIClient, sourceFetchContext?: SourceFetchContext, config?: Partial<AgentConfig>);
    execute(input: CodeReadingInput, context: AgentContext): Promise<AgentResult<CodeReadingOutput>>;
    protected getSystemPrompt(): string;
    protected buildUserPrompt(_input: CodeReadingInput, _context: AgentContext): string;
    protected parseResponse(_response: string): CodeReadingOutput | null;
    private fetchFile;
    private extractImports;
    private extractHelperCalls;
    private extractPageObjectReferences;
    private findAndFetchSupportFiles;
    private findPageObjectFile;
    private extractCustomCommands;
    private extractSelectorsFromCode;
    private isRelevantFile;
    private resolveRelativePath;
    private extractFunctionDefinition;
    private buildSummary;
}
//# sourceMappingURL=code-reading-agent.d.ts.map