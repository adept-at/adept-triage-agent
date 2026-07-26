"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REVIEW_SCHEMA = exports.FIX_GENERATION_SCHEMA = exports.INVESTIGATION_SCHEMA = exports.ANALYSIS_SCHEMA = exports.CLASSIFICATION_SCHEMA = void 0;
const stringArray = {
    type: 'array',
    items: { type: 'string' },
};
function objectSchema(properties, required) {
    return {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
    };
}
const locationSchema = objectSchema({
    file: { type: 'string' },
    line: { type: ['number', 'null'] },
    code: { type: ['string', 'null'] },
}, ['file', 'line', 'code']);
const findingSchema = objectSchema({
    type: {
        type: 'string',
        enum: [
            'SELECTOR_CHANGE',
            'MISSING_ELEMENT',
            'TIMING_GAP',
            'STATE_ISSUE',
            'CODE_CHANGE',
            'OTHER',
        ],
    },
    severity: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
    description: { type: 'string' },
    evidence: stringArray,
    location: { anyOf: [locationSchema, { type: 'null' }] },
    relationToError: { type: 'string' },
}, [
    'type',
    'severity',
    'description',
    'evidence',
    'location',
    'relationToError',
]);
const verdictOverrideSchema = objectSchema({
    suggestedLocation: {
        type: 'string',
        enum: ['TEST_CODE', 'APP_CODE', 'BOTH'],
    },
    confidence: { type: 'number' },
    evidence: stringArray,
}, ['suggestedLocation', 'confidence', 'evidence']);
const changeSchema = objectSchema({
    file: { type: 'string' },
    line: { type: 'number' },
    oldCode: { type: 'string' },
    newCode: { type: 'string' },
    justification: { type: 'string' },
    changeType: {
        type: 'string',
        enum: [
            'SELECTOR_UPDATE',
            'WAIT_ADDITION',
            'LOGIC_CHANGE',
            'ASSERTION_UPDATE',
            'OTHER',
        ],
    },
}, ['file', 'line', 'oldCode', 'newCode', 'justification', 'changeType']);
const failureModeTraceSchema = objectSchema({
    originalState: { type: 'string' },
    rootMechanism: { type: 'string' },
    newStateAfterFix: { type: 'string' },
    whyAssertionPassesNow: { type: 'string' },
}, [
    'originalState',
    'rootMechanism',
    'newStateAfterFix',
    'whyAssertionPassesNow',
]);
const reviewIssueSchema = objectSchema({
    severity: {
        type: 'string',
        enum: ['CRITICAL', 'WARNING', 'SUGGESTION'],
    },
    changeIndex: { type: 'number' },
    description: { type: 'string' },
    suggestion: { type: ['string', 'null'] },
}, ['severity', 'changeIndex', 'description', 'suggestion']);
const sourceLocationSchema = objectSchema({
    file: { type: 'string' },
    lines: { type: 'string' },
    reason: { type: 'string' },
}, ['file', 'lines', 'reason']);
exports.CLASSIFICATION_SCHEMA = {
    type: 'json_schema',
    name: 'classification_result',
    strict: true,
    schema: objectSchema({
        verdict: {
            type: 'string',
            enum: ['TEST_ISSUE', 'PRODUCT_ISSUE', 'INCONCLUSIVE'],
        },
        confidence: { type: 'number' },
        reasoning: { type: 'string' },
        summary: { type: 'string' },
        indicators: stringArray,
        suggestedSourceLocations: {
            type: 'array',
            items: sourceLocationSchema,
        },
    }, [
        'verdict',
        'confidence',
        'reasoning',
        'summary',
        'indicators',
        'suggestedSourceLocations',
    ]),
};
exports.ANALYSIS_SCHEMA = {
    type: 'json_schema',
    name: 'analysis_result',
    strict: true,
    schema: objectSchema({
        rootCauseCategory: {
            type: 'string',
            enum: [
                'SELECTOR_MISMATCH',
                'TIMING_ISSUE',
                'STATE_DEPENDENCY',
                'NETWORK_ISSUE',
                'ELEMENT_VISIBILITY',
                'ASSERTION_MISMATCH',
                'DATA_DEPENDENCY',
                'ENVIRONMENT_ISSUE',
                'UNKNOWN',
            ],
        },
        contributingFactors: {
            type: 'array',
            items: {
                type: 'string',
                enum: [
                    'SELECTOR_MISMATCH',
                    'TIMING_ISSUE',
                    'STATE_DEPENDENCY',
                    'NETWORK_ISSUE',
                    'ELEMENT_VISIBILITY',
                    'ASSERTION_MISMATCH',
                    'DATA_DEPENDENCY',
                    'ENVIRONMENT_ISSUE',
                    'UNKNOWN',
                ],
            },
        },
        confidence: { type: 'number' },
        explanation: { type: 'string' },
        selectors: stringArray,
        elements: stringArray,
        issueLocation: {
            type: 'string',
            enum: ['TEST_CODE', 'APP_CODE', 'BOTH', 'UNKNOWN'],
        },
        patterns: objectSchema({
            hasTimeout: { type: 'boolean' },
            hasVisibilityIssue: { type: 'boolean' },
            hasNetworkCall: { type: 'boolean' },
            hasStateAssertion: { type: 'boolean' },
            hasDynamicContent: { type: 'boolean' },
            hasResponsiveIssue: { type: 'boolean' },
        }, [
            'hasTimeout',
            'hasVisibilityIssue',
            'hasNetworkCall',
            'hasStateAssertion',
            'hasDynamicContent',
            'hasResponsiveIssue',
        ]),
        suggestedApproach: { type: 'string' },
    }, [
        'rootCauseCategory',
        'contributingFactors',
        'confidence',
        'explanation',
        'selectors',
        'elements',
        'issueLocation',
        'patterns',
        'suggestedApproach',
    ]),
};
exports.INVESTIGATION_SCHEMA = {
    type: 'json_schema',
    name: 'investigation_result',
    strict: true,
    schema: objectSchema({
        findings: { type: 'array', items: findingSchema },
        primaryFinding: { anyOf: [findingSchema, { type: 'null' }] },
        isTestCodeFixable: { type: 'boolean' },
        recommendedApproach: { type: 'string' },
        selectorsToUpdate: {
            type: 'array',
            items: objectSchema({
                current: { type: 'string' },
                reason: { type: 'string' },
                suggestedReplacement: { type: ['string', 'null'] },
            }, ['current', 'reason', 'suggestedReplacement']),
        },
        confidence: { type: 'number' },
        verdictOverride: { anyOf: [verdictOverrideSchema, { type: 'null' }] },
    }, [
        'findings',
        'primaryFinding',
        'isTestCodeFixable',
        'recommendedApproach',
        'selectorsToUpdate',
        'confidence',
        'verdictOverride',
    ]),
};
exports.FIX_GENERATION_SCHEMA = {
    type: 'json_schema',
    name: 'fix_generation_result',
    strict: true,
    schema: objectSchema({
        changes: { type: 'array', items: changeSchema },
        confidence: { type: 'number' },
        summary: { type: 'string' },
        reasoning: { type: 'string' },
        evidence: stringArray,
        risks: stringArray,
        alternatives: { type: 'array', items: { type: 'string' } },
        failureModeTrace: {
            anyOf: [failureModeTraceSchema, { type: 'null' }],
        },
    }, [
        'changes',
        'confidence',
        'summary',
        'reasoning',
        'evidence',
        'risks',
        'alternatives',
        'failureModeTrace',
    ]),
};
exports.REVIEW_SCHEMA = {
    type: 'json_schema',
    name: 'review_result',
    strict: true,
    schema: objectSchema({
        approved: { type: 'boolean' },
        issues: { type: 'array', items: reviewIssueSchema },
        assessment: { type: 'string' },
        fixConfidence: { type: 'number' },
        improvements: stringArray,
    }, ['approved', 'issues', 'assessment', 'fixConfidence', 'improvements']),
};
//# sourceMappingURL=json-schemas.js.map