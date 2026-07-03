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
exports.recordFailureEvent = recordFailureEvent;
const core = __importStar(require("@actions/core"));
const crypto = __importStar(require("crypto"));
async function recordFailureEvent(region, tableName, event) {
    try {
        const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
        const { DynamoDBDocumentClient, PutCommand } = await import('@aws-sdk/lib-dynamodb');
        const raw = new DynamoDBClient({ region });
        const client = DynamoDBDocumentClient.from(raw, {
            marshallOptions: { removeUndefinedValues: true },
        });
        const runId = process.env.GITHUB_RUN_ID || crypto.randomUUID().slice(0, 8);
        await client.send(new PutCommand({
            TableName: tableName,
            Item: {
                pk: `REPO#${event.repo}`,
                sk: `FAILURE#${event.failedAt}#${runId}`,
                ...event,
            },
        }));
        core.info(`📝 failure-event recorded for ${event.repo} ${event.spec}`);
    }
    catch (err) {
        core.warning(`Failed to record failure event for ${event.repo}: ${err}`);
    }
}
//# sourceMappingURL=failure-event-store.js.map