"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServices = createServices;
exports.createServicesWithOverrides = createServicesWithOverrides;
const rest_1 = require("@octokit/rest");
const openai_client_1 = require("../openai-client");
const artifact_fetcher_1 = require("../artifact-fetcher");
const simplified_repair_agent_1 = require("../repair/simplified-repair-agent");
function createServices(inputs) {
    const github = new rest_1.Octokit({ auth: inputs.githubToken });
    const ai = new openai_client_1.OpenAIClient(inputs.openaiApiKey);
    const artifacts = new artifact_fetcher_1.ArtifactFetcher(github);
    const repairAgent = new simplified_repair_agent_1.SimplifiedRepairAgent(ai);
    return {
        github,
        ai,
        artifacts,
        repairAgent
    };
}
function createServicesWithOverrides(inputs, overrides) {
    const defaults = createServices(inputs);
    return {
        ...defaults,
        ...overrides
    };
}
//# sourceMappingURL=index.js.map