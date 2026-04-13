exports.id = 305;
exports.ids = [305];
exports.modules = {

/***/ 43434:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.resolveHttpAuthSchemeConfig = exports.defaultDynamoDBHttpAuthSchemeProvider = exports.defaultDynamoDBHttpAuthSchemeParametersProvider = void 0;
const httpAuthSchemes_1 = __webpack_require__(97523);
const util_middleware_1 = __webpack_require__(76324);
const defaultDynamoDBHttpAuthSchemeParametersProvider = async (config, context, input) => {
    return {
        operation: (0, util_middleware_1.getSmithyContext)(context).operation,
        region: await (0, util_middleware_1.normalizeProvider)(config.region)() || (() => {
            throw new Error("expected `region` to be configured for `aws.auth#sigv4`");
        })(),
    };
};
exports.defaultDynamoDBHttpAuthSchemeParametersProvider = defaultDynamoDBHttpAuthSchemeParametersProvider;
function createAwsAuthSigv4HttpAuthOption(authParameters) {
    return {
        schemeId: "aws.auth#sigv4",
        signingProperties: {
            name: "dynamodb",
            region: authParameters.region,
        },
        propertiesExtractor: (config, context) => ({
            signingProperties: {
                config,
                context,
            },
        }),
    };
}
const defaultDynamoDBHttpAuthSchemeProvider = (authParameters) => {
    const options = [];
    switch (authParameters.operation) {
        default: {
            options.push(createAwsAuthSigv4HttpAuthOption(authParameters));
        }
    }
    return options;
};
exports.defaultDynamoDBHttpAuthSchemeProvider = defaultDynamoDBHttpAuthSchemeProvider;
const resolveHttpAuthSchemeConfig = (config) => {
    const config_0 = (0, httpAuthSchemes_1.resolveAwsSdkSigV4Config)(config);
    return Object.assign(config_0, {
        authSchemePreference: (0, util_middleware_1.normalizeProvider)(config.authSchemePreference ?? []),
    });
};
exports.resolveHttpAuthSchemeConfig = resolveHttpAuthSchemeConfig;


/***/ }),

/***/ 1588:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.defaultEndpointResolver = void 0;
const util_endpoints_1 = __webpack_require__(83068);
const util_endpoints_2 = __webpack_require__(79674);
const ruleset_1 = __webpack_require__(89225);
const cache = new util_endpoints_2.EndpointCache({
    size: 50,
    params: [
        "AccountId",
        "AccountIdEndpointMode",
        "Endpoint",
        "Region",
        "ResourceArn",
        "ResourceArnList",
        "UseDualStack",
        "UseFIPS",
    ],
});
const defaultEndpointResolver = (endpointParams, context = {}) => {
    return cache.get(endpointParams, () => (0, util_endpoints_2.resolveEndpoint)(ruleset_1.ruleSet, {
        endpointParams: endpointParams,
        logger: context.logger,
    }));
};
exports.defaultEndpointResolver = defaultEndpointResolver;
util_endpoints_2.customEndpointFunctions.aws = util_endpoints_1.awsEndpointFunctions;


/***/ }),

/***/ 89225:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ruleSet = void 0;
const K = "required", L = "type", M = "rules", N = "conditions", O = "fn", P = "argv", Q = "ref", R = "assign", S = "url", T = "properties", U = "headers", V = "metricValues";
const a = false, b = "error", c = "stringEquals", d = "https://dynamodb.{Region}.{PartitionResult#dualStackDnsSuffix}", e = "endpoint", f = "tree", g = "dynamodb", h = { [K]: false, [L]: "string" }, i = { [K]: true, "default": false, [L]: "boolean" }, j = { [O]: "isSet", [P]: [{ [Q]: "Endpoint" }] }, k = { [Q]: "Endpoint" }, l = { [O]: "isSet", [P]: [{ [Q]: "Region" }] }, m = { [Q]: "Region" }, n = { [O]: "aws.partition", [P]: [m], [R]: "PartitionResult" }, o = { [N]: [{ [O]: "booleanEquals", [P]: [{ [Q]: "UseFIPS" }, true] }], [b]: "Invalid Configuration: FIPS and custom endpoint are not supported", [L]: b }, p = { [O]: "booleanEquals", [P]: [{ [Q]: "UseFIPS" }, true] }, q = { [N]: [{ [O]: "booleanEquals", [P]: [{ [Q]: "UseDualStack" }, true] }], [b]: "Invalid Configuration: Dualstack and custom endpoint are not supported", [L]: b }, r = { [O]: "booleanEquals", [P]: [{ [Q]: "UseDualStack" }, true] }, s = { [e]: { [S]: "{Endpoint}", [T]: {}, [U]: {} }, [L]: e }, t = {}, u = { [O]: "booleanEquals", [P]: [{ [O]: "getAttr", [P]: [{ [Q]: "PartitionResult" }, "supportsFIPS"] }, true] }, v = { [O]: "booleanEquals", [P]: [{ [O]: "getAttr", [P]: [{ [Q]: "PartitionResult" }, "supportsDualStack"] }, true] }, w = { [N]: [{ [O]: "isSet", [P]: [{ [Q]: "AccountIdEndpointMode" }] }, { [O]: c, [P]: [{ [Q]: "AccountIdEndpointMode" }, "required"] }], [M]: [{ [b]: "Invalid Configuration: AccountIdEndpointMode is required and FIPS is enabled, but FIPS account endpoints are not supported", [L]: b }], [L]: f }, x = { [O]: "getAttr", [P]: [{ [Q]: "PartitionResult" }, "name"] }, y = { [e]: { [S]: "https://dynamodb.{Region}.{PartitionResult#dnsSuffix}", [T]: {}, [U]: {} }, [L]: e }, z = { [S]: "https://{ParsedArn#accountId}.ddb.{Region}.{PartitionResult#dualStackDnsSuffix}", [T]: { [V]: ["O"] }, [U]: {} }, A = { [V]: ["O"] }, B = { [b]: "Credentials-sourced account ID parameter is invalid", [L]: b }, C = { [N]: [{ [O]: "isSet", [P]: [{ [Q]: "AccountIdEndpointMode" }] }, { [O]: c, [P]: [{ [Q]: "AccountIdEndpointMode" }, "required"] }], [M]: [{ [N]: [{ [O]: "not", [P]: [p] }], [M]: [{ [N]: [{ [O]: c, [P]: [x, "aws"] }], [M]: [{ [b]: "AccountIdEndpointMode is required but no AccountID was provided or able to be loaded", [L]: b }], [L]: f }, { [b]: "Invalid Configuration: AccountIdEndpointMode is required but account endpoints are not supported in this partition", [L]: b }], [L]: f }, { [b]: "Invalid Configuration: AccountIdEndpointMode is required and FIPS is enabled, but FIPS account endpoints are not supported", [L]: b }], [L]: f }, D = { [S]: "https://{ParsedArn#accountId}.ddb.{Region}.{PartitionResult#dnsSuffix}", [T]: A, [U]: {} }, E = [p], F = [r], G = [{ [O]: "isSet", [P]: [{ [Q]: "AccountIdEndpointMode" }] }, { [O]: "not", [P]: [{ [O]: c, [P]: [{ [Q]: "AccountIdEndpointMode" }, "disabled"] }] }, { [O]: c, [P]: [x, "aws"] }, { [O]: "not", [P]: [p] }, { [O]: "isSet", [P]: [{ [Q]: "ResourceArn" }] }, { [O]: "aws.parseArn", [P]: [{ [Q]: "ResourceArn" }], [R]: "ParsedArn" }, { [O]: c, [P]: [{ [O]: "getAttr", [P]: [{ [Q]: "ParsedArn" }, "service"] }, g] }, { [O]: "isValidHostLabel", [P]: [{ [O]: "getAttr", [P]: [{ [Q]: "ParsedArn" }, "region"] }, false] }, { [O]: c, [P]: [{ [O]: "getAttr", [P]: [{ [Q]: "ParsedArn" }, "region"] }, "{Region}"] }, { [O]: "isValidHostLabel", [P]: [{ [O]: "getAttr", [P]: [{ [Q]: "ParsedArn" }, "accountId"] }, false] }], H = [{ [O]: "isSet", [P]: [{ [Q]: "AccountIdEndpointMode" }] }, { [O]: "not", [P]: [{ [O]: c, [P]: [{ [Q]: "AccountIdEndpointMode" }, "disabled"] }] }, { [O]: c, [P]: [x, "aws"] }, { [O]: "not", [P]: [p] }, { [O]: "isSet", [P]: [{ [Q]: "ResourceArnList" }] }, { [O]: "getAttr", [P]: [{ [Q]: "ResourceArnList" }, "[0]"], [R]: "FirstArn" }, { [O]: "aws.parseArn", [P]: [{ [Q]: "FirstArn" }], [R]: "ParsedArn" }, { [O]: c, [P]: [{ [O]: "getAttr", [P]: [{ [Q]: "ParsedArn" }, "service"] }, g] }, { [O]: "isValidHostLabel", [P]: [{ [O]: "getAttr", [P]: [{ [Q]: "ParsedArn" }, "region"] }, false] }, { [O]: c, [P]: [{ [O]: "getAttr", [P]: [{ [Q]: "ParsedArn" }, "region"] }, "{Region}"] }, { [O]: "isValidHostLabel", [P]: [{ [O]: "getAttr", [P]: [{ [Q]: "ParsedArn" }, "accountId"] }, false] }], I = [{ [O]: "isSet", [P]: [{ [Q]: "AccountIdEndpointMode" }] }, { [O]: "not", [P]: [{ [O]: c, [P]: [{ [Q]: "AccountIdEndpointMode" }, "disabled"] }] }, { [O]: c, [P]: [x, "aws"] }, { [O]: "not", [P]: [p] }, { [O]: "isSet", [P]: [{ [Q]: "AccountId" }] }], J = [{ [O]: "isValidHostLabel", [P]: [{ [Q]: "AccountId" }, false] }];
const _data = { version: "1.0", parameters: { Region: h, UseDualStack: i, UseFIPS: i, Endpoint: h, AccountId: h, AccountIdEndpointMode: h, ResourceArn: h, ResourceArnList: { [K]: a, [L]: "stringArray" } }, [M]: [{ [N]: [j, l, n], [M]: [o, q, { [N]: [{ [O]: c, [P]: [k, d] }], error: "Endpoint override is not supported for dual-stack endpoints. Please enable dual-stack functionality by enabling the configuration. For more details, see: https://docs.aws.amazon.com/sdkref/latest/guide/feature-endpoints.html", [L]: b }, s], [L]: f }, { [N]: [j], [M]: [o, q, s], [L]: f }, { [N]: [l], [M]: [{ [N]: [n], [M]: [{ [N]: [{ [O]: c, [P]: [m, "local"] }], [M]: [{ [N]: E, error: "Invalid Configuration: FIPS and local endpoint are not supported", [L]: b }, { [N]: F, error: "Invalid Configuration: Dualstack and local endpoint are not supported", [L]: b }, { endpoint: { [S]: "http://localhost:8000", [T]: { authSchemes: [{ name: "sigv4", signingName: g, signingRegion: "us-east-1" }] }, [U]: t }, [L]: e }], [L]: f }, { [N]: [p, r], [M]: [{ [N]: [u, v], [M]: [w, { endpoint: { [S]: "https://dynamodb-fips.{Region}.{PartitionResult#dualStackDnsSuffix}", [T]: t, [U]: t }, [L]: e }], [L]: f }, { error: "FIPS and DualStack are enabled, but this partition does not support one or both", [L]: b }], [L]: f }, { [N]: E, [M]: [{ [N]: [u], [M]: [{ [N]: [{ [O]: c, [P]: [x, "aws-us-gov"] }], [M]: [w, y], [L]: f }, w, { endpoint: { [S]: "https://dynamodb-fips.{Region}.{PartitionResult#dnsSuffix}", [T]: t, [U]: t }, [L]: e }], [L]: f }, { error: "FIPS is enabled but this partition does not support FIPS", [L]: b }], [L]: f }, { [N]: F, [M]: [{ [N]: [v], [M]: [{ [N]: G, endpoint: z, [L]: e }, { [N]: H, endpoint: z, [L]: e }, { [N]: I, [M]: [{ [N]: J, [M]: [{ endpoint: { [S]: "https://{AccountId}.ddb.{Region}.{PartitionResult#dualStackDnsSuffix}", [T]: A, [U]: t }, [L]: e }], [L]: f }, B], [L]: f }, C, { endpoint: { [S]: d, [T]: t, [U]: t }, [L]: e }], [L]: f }, { error: "DualStack is enabled but this partition does not support DualStack", [L]: b }], [L]: f }, { [N]: G, endpoint: D, [L]: e }, { [N]: H, endpoint: D, [L]: e }, { [N]: I, [M]: [{ [N]: J, [M]: [{ endpoint: { [S]: "https://{AccountId}.ddb.{Region}.{PartitionResult#dnsSuffix}", [T]: A, [U]: t }, [L]: e }], [L]: f }, B], [L]: f }, C, y], [L]: f }], [L]: f }, { error: "Invalid Configuration: Missing Region", [L]: b }] };
exports.ruleSet = _data;


/***/ }),

/***/ 64305:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var accountIdEndpoint = __webpack_require__(59950);
var middlewareEndpointDiscovery = __webpack_require__(3688);
var middlewareHostHeader = __webpack_require__(52590);
var middlewareLogger = __webpack_require__(85242);
var middlewareRecursionDetection = __webpack_require__(81568);
var middlewareUserAgent = __webpack_require__(32959);
var configResolver = __webpack_require__(39316);
var core = __webpack_require__(90402);
var schema = __webpack_require__(26890);
var middlewareContentLength = __webpack_require__(47212);
var middlewareEndpoint = __webpack_require__(40099);
var middlewareRetry = __webpack_require__(19618);
var smithyClient = __webpack_require__(61411);
var httpAuthSchemeProvider = __webpack_require__(43434);
var schemas_0 = __webpack_require__(93801);
var runtimeConfig = __webpack_require__(20507);
var regionConfigResolver = __webpack_require__(36463);
var protocolHttp = __webpack_require__(72356);
var utilWaiter = __webpack_require__(95290);
var errors = __webpack_require__(98461);
var DynamoDBServiceException = __webpack_require__(18894);

const resolveClientEndpointParameters = (options) => {
    return Object.assign(options, {
        useDualstackEndpoint: options.useDualstackEndpoint ?? false,
        useFipsEndpoint: options.useFipsEndpoint ?? false,
        defaultSigningName: "dynamodb",
    });
};
const commonParams = {
    UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
    AccountId: { type: "builtInParams", name: "accountId" },
    Endpoint: { type: "builtInParams", name: "endpoint" },
    Region: { type: "builtInParams", name: "region" },
    UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
    AccountIdEndpointMode: { type: "builtInParams", name: "accountIdEndpointMode" },
};

class DescribeEndpointsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DescribeEndpoints", {})
    .n("DynamoDBClient", "DescribeEndpointsCommand")
    .sc(schemas_0.DescribeEndpoints$)
    .build() {
}

const getHttpAuthExtensionConfiguration = (runtimeConfig) => {
    const _httpAuthSchemes = runtimeConfig.httpAuthSchemes;
    let _httpAuthSchemeProvider = runtimeConfig.httpAuthSchemeProvider;
    let _credentials = runtimeConfig.credentials;
    return {
        setHttpAuthScheme(httpAuthScheme) {
            const index = _httpAuthSchemes.findIndex((scheme) => scheme.schemeId === httpAuthScheme.schemeId);
            if (index === -1) {
                _httpAuthSchemes.push(httpAuthScheme);
            }
            else {
                _httpAuthSchemes.splice(index, 1, httpAuthScheme);
            }
        },
        httpAuthSchemes() {
            return _httpAuthSchemes;
        },
        setHttpAuthSchemeProvider(httpAuthSchemeProvider) {
            _httpAuthSchemeProvider = httpAuthSchemeProvider;
        },
        httpAuthSchemeProvider() {
            return _httpAuthSchemeProvider;
        },
        setCredentials(credentials) {
            _credentials = credentials;
        },
        credentials() {
            return _credentials;
        },
    };
};
const resolveHttpAuthRuntimeConfig = (config) => {
    return {
        httpAuthSchemes: config.httpAuthSchemes(),
        httpAuthSchemeProvider: config.httpAuthSchemeProvider(),
        credentials: config.credentials(),
    };
};

const resolveRuntimeExtensions = (runtimeConfig, extensions) => {
    const extensionConfiguration = Object.assign(regionConfigResolver.getAwsRegionExtensionConfiguration(runtimeConfig), smithyClient.getDefaultExtensionConfiguration(runtimeConfig), protocolHttp.getHttpHandlerExtensionConfiguration(runtimeConfig), getHttpAuthExtensionConfiguration(runtimeConfig));
    extensions.forEach((extension) => extension.configure(extensionConfiguration));
    return Object.assign(runtimeConfig, regionConfigResolver.resolveAwsRegionExtensionConfiguration(extensionConfiguration), smithyClient.resolveDefaultRuntimeConfig(extensionConfiguration), protocolHttp.resolveHttpHandlerRuntimeConfig(extensionConfiguration), resolveHttpAuthRuntimeConfig(extensionConfiguration));
};

class DynamoDBClient extends smithyClient.Client {
    config;
    constructor(...[configuration]) {
        const _config_0 = runtimeConfig.getRuntimeConfig(configuration || {});
        super(_config_0);
        this.initConfig = _config_0;
        const _config_1 = resolveClientEndpointParameters(_config_0);
        const _config_2 = accountIdEndpoint.resolveAccountIdEndpointModeConfig(_config_1);
        const _config_3 = middlewareUserAgent.resolveUserAgentConfig(_config_2);
        const _config_4 = middlewareRetry.resolveRetryConfig(_config_3);
        const _config_5 = configResolver.resolveRegionConfig(_config_4);
        const _config_6 = middlewareHostHeader.resolveHostHeaderConfig(_config_5);
        const _config_7 = middlewareEndpoint.resolveEndpointConfig(_config_6);
        const _config_8 = httpAuthSchemeProvider.resolveHttpAuthSchemeConfig(_config_7);
        const _config_9 = middlewareEndpointDiscovery.resolveEndpointDiscoveryConfig(_config_8, { endpointDiscoveryCommandCtor: DescribeEndpointsCommand });
        const _config_10 = resolveRuntimeExtensions(_config_9, configuration?.extensions || []);
        this.config = _config_10;
        this.middlewareStack.use(schema.getSchemaSerdePlugin(this.config));
        this.middlewareStack.use(middlewareUserAgent.getUserAgentPlugin(this.config));
        this.middlewareStack.use(middlewareRetry.getRetryPlugin(this.config));
        this.middlewareStack.use(middlewareContentLength.getContentLengthPlugin(this.config));
        this.middlewareStack.use(middlewareHostHeader.getHostHeaderPlugin(this.config));
        this.middlewareStack.use(middlewareLogger.getLoggerPlugin(this.config));
        this.middlewareStack.use(middlewareRecursionDetection.getRecursionDetectionPlugin(this.config));
        this.middlewareStack.use(core.getHttpAuthSchemeEndpointRuleSetPlugin(this.config, {
            httpAuthSchemeParametersProvider: httpAuthSchemeProvider.defaultDynamoDBHttpAuthSchemeParametersProvider,
            identityProviderConfigProvider: async (config) => new core.DefaultIdentityProviderConfig({
                "aws.auth#sigv4": config.credentials,
            }),
        }));
        this.middlewareStack.use(core.getHttpSigningPlugin(this.config));
    }
    destroy() {
        super.destroy();
    }
}

class BatchExecuteStatementCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "BatchExecuteStatement", {})
    .n("DynamoDBClient", "BatchExecuteStatementCommand")
    .sc(schemas_0.BatchExecuteStatement$)
    .build() {
}

class BatchGetItemCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArnList: { type: "operationContextParams", get: (input) => Object.keys(input?.RequestItems ?? {}) },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "BatchGetItem", {})
    .n("DynamoDBClient", "BatchGetItemCommand")
    .sc(schemas_0.BatchGetItem$)
    .build() {
}

class BatchWriteItemCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArnList: { type: "operationContextParams", get: (input) => Object.keys(input?.RequestItems ?? {}) },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "BatchWriteItem", {})
    .n("DynamoDBClient", "BatchWriteItemCommand")
    .sc(schemas_0.BatchWriteItem$)
    .build() {
}

class CreateBackupCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "CreateBackup", {})
    .n("DynamoDBClient", "CreateBackupCommand")
    .sc(schemas_0.CreateBackup$)
    .build() {
}

class CreateGlobalTableCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "GlobalTableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "CreateGlobalTable", {})
    .n("DynamoDBClient", "CreateGlobalTableCommand")
    .sc(schemas_0.CreateGlobalTable$)
    .build() {
}

class CreateTableCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "CreateTable", {})
    .n("DynamoDBClient", "CreateTableCommand")
    .sc(schemas_0.CreateTable$)
    .build() {
}

class DeleteBackupCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "BackupArn" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DeleteBackup", {})
    .n("DynamoDBClient", "DeleteBackupCommand")
    .sc(schemas_0.DeleteBackup$)
    .build() {
}

class DeleteItemCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DeleteItem", {})
    .n("DynamoDBClient", "DeleteItemCommand")
    .sc(schemas_0.DeleteItem$)
    .build() {
}

class DeleteResourcePolicyCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "ResourceArn" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DeleteResourcePolicy", {})
    .n("DynamoDBClient", "DeleteResourcePolicyCommand")
    .sc(schemas_0.DeleteResourcePolicy$)
    .build() {
}

class DeleteTableCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DeleteTable", {})
    .n("DynamoDBClient", "DeleteTableCommand")
    .sc(schemas_0.DeleteTable$)
    .build() {
}

class DescribeBackupCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "BackupArn" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DescribeBackup", {})
    .n("DynamoDBClient", "DescribeBackupCommand")
    .sc(schemas_0.DescribeBackup$)
    .build() {
}

class DescribeContinuousBackupsCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DescribeContinuousBackups", {})
    .n("DynamoDBClient", "DescribeContinuousBackupsCommand")
    .sc(schemas_0.DescribeContinuousBackups$)
    .build() {
}

class DescribeContributorInsightsCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DescribeContributorInsights", {})
    .n("DynamoDBClient", "DescribeContributorInsightsCommand")
    .sc(schemas_0.DescribeContributorInsights$)
    .build() {
}

class DescribeExportCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "ExportArn" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DescribeExport", {})
    .n("DynamoDBClient", "DescribeExportCommand")
    .sc(schemas_0.DescribeExport$)
    .build() {
}

class DescribeGlobalTableCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "GlobalTableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DescribeGlobalTable", {})
    .n("DynamoDBClient", "DescribeGlobalTableCommand")
    .sc(schemas_0.DescribeGlobalTable$)
    .build() {
}

class DescribeGlobalTableSettingsCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "GlobalTableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DescribeGlobalTableSettings", {})
    .n("DynamoDBClient", "DescribeGlobalTableSettingsCommand")
    .sc(schemas_0.DescribeGlobalTableSettings$)
    .build() {
}

class DescribeImportCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "ImportArn" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DescribeImport", {})
    .n("DynamoDBClient", "DescribeImportCommand")
    .sc(schemas_0.DescribeImport$)
    .build() {
}

class DescribeKinesisStreamingDestinationCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DescribeKinesisStreamingDestination", {})
    .n("DynamoDBClient", "DescribeKinesisStreamingDestinationCommand")
    .sc(schemas_0.DescribeKinesisStreamingDestination$)
    .build() {
}

class DescribeLimitsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DescribeLimits", {})
    .n("DynamoDBClient", "DescribeLimitsCommand")
    .sc(schemas_0.DescribeLimits$)
    .build() {
}

class DescribeTableCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DescribeTable", {})
    .n("DynamoDBClient", "DescribeTableCommand")
    .sc(schemas_0.DescribeTable$)
    .build() {
}

class DescribeTableReplicaAutoScalingCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DescribeTableReplicaAutoScaling", {})
    .n("DynamoDBClient", "DescribeTableReplicaAutoScalingCommand")
    .sc(schemas_0.DescribeTableReplicaAutoScaling$)
    .build() {
}

class DescribeTimeToLiveCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DescribeTimeToLive", {})
    .n("DynamoDBClient", "DescribeTimeToLiveCommand")
    .sc(schemas_0.DescribeTimeToLive$)
    .build() {
}

class DisableKinesisStreamingDestinationCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "DisableKinesisStreamingDestination", {})
    .n("DynamoDBClient", "DisableKinesisStreamingDestinationCommand")
    .sc(schemas_0.DisableKinesisStreamingDestination$)
    .build() {
}

class EnableKinesisStreamingDestinationCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "EnableKinesisStreamingDestination", {})
    .n("DynamoDBClient", "EnableKinesisStreamingDestinationCommand")
    .sc(schemas_0.EnableKinesisStreamingDestination$)
    .build() {
}

class ExecuteStatementCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "ExecuteStatement", {})
    .n("DynamoDBClient", "ExecuteStatementCommand")
    .sc(schemas_0.ExecuteStatement$)
    .build() {
}

class ExecuteTransactionCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "ExecuteTransaction", {})
    .n("DynamoDBClient", "ExecuteTransactionCommand")
    .sc(schemas_0.ExecuteTransaction$)
    .build() {
}

class ExportTableToPointInTimeCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableArn" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "ExportTableToPointInTime", {})
    .n("DynamoDBClient", "ExportTableToPointInTimeCommand")
    .sc(schemas_0.ExportTableToPointInTime$)
    .build() {
}

class GetItemCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "GetItem", {})
    .n("DynamoDBClient", "GetItemCommand")
    .sc(schemas_0.GetItem$)
    .build() {
}

class GetResourcePolicyCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "ResourceArn" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "GetResourcePolicy", {})
    .n("DynamoDBClient", "GetResourcePolicyCommand")
    .sc(schemas_0.GetResourcePolicy$)
    .build() {
}

class ImportTableCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "operationContextParams", get: (input) => input?.TableCreationParameters?.TableName },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "ImportTable", {})
    .n("DynamoDBClient", "ImportTableCommand")
    .sc(schemas_0.ImportTable$)
    .build() {
}

class ListBackupsCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "ListBackups", {})
    .n("DynamoDBClient", "ListBackupsCommand")
    .sc(schemas_0.ListBackups$)
    .build() {
}

class ListContributorInsightsCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "ListContributorInsights", {})
    .n("DynamoDBClient", "ListContributorInsightsCommand")
    .sc(schemas_0.ListContributorInsights$)
    .build() {
}

class ListExportsCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableArn" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "ListExports", {})
    .n("DynamoDBClient", "ListExportsCommand")
    .sc(schemas_0.ListExports$)
    .build() {
}

class ListGlobalTablesCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "ListGlobalTables", {})
    .n("DynamoDBClient", "ListGlobalTablesCommand")
    .sc(schemas_0.ListGlobalTables$)
    .build() {
}

class ListImportsCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableArn" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "ListImports", {})
    .n("DynamoDBClient", "ListImportsCommand")
    .sc(schemas_0.ListImports$)
    .build() {
}

class ListTablesCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "ListTables", {})
    .n("DynamoDBClient", "ListTablesCommand")
    .sc(schemas_0.ListTables$)
    .build() {
}

class ListTagsOfResourceCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "ResourceArn" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "ListTagsOfResource", {})
    .n("DynamoDBClient", "ListTagsOfResourceCommand")
    .sc(schemas_0.ListTagsOfResource$)
    .build() {
}

class PutItemCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "PutItem", {})
    .n("DynamoDBClient", "PutItemCommand")
    .sc(schemas_0.PutItem$)
    .build() {
}

class PutResourcePolicyCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "ResourceArn" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "PutResourcePolicy", {})
    .n("DynamoDBClient", "PutResourcePolicyCommand")
    .sc(schemas_0.PutResourcePolicy$)
    .build() {
}

class QueryCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "Query", {})
    .n("DynamoDBClient", "QueryCommand")
    .sc(schemas_0.Query$)
    .build() {
}

class RestoreTableFromBackupCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TargetTableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "RestoreTableFromBackup", {})
    .n("DynamoDBClient", "RestoreTableFromBackupCommand")
    .sc(schemas_0.RestoreTableFromBackup$)
    .build() {
}

class RestoreTableToPointInTimeCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TargetTableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "RestoreTableToPointInTime", {})
    .n("DynamoDBClient", "RestoreTableToPointInTimeCommand")
    .sc(schemas_0.RestoreTableToPointInTime$)
    .build() {
}

class ScanCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "Scan", {})
    .n("DynamoDBClient", "ScanCommand")
    .sc(schemas_0.Scan$)
    .build() {
}

class TagResourceCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "ResourceArn" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "TagResource", {})
    .n("DynamoDBClient", "TagResourceCommand")
    .sc(schemas_0.TagResource$)
    .build() {
}

class TransactGetItemsCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArnList: { type: "operationContextParams", get: (input) => input?.TransactItems?.map((obj) => obj?.Get?.TableName) },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "TransactGetItems", {})
    .n("DynamoDBClient", "TransactGetItemsCommand")
    .sc(schemas_0.TransactGetItems$)
    .build() {
}

class TransactWriteItemsCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArnList: { type: "operationContextParams", get: (input) => input?.TransactItems?.map((obj) => [obj?.ConditionCheck?.TableName, obj?.Put?.TableName, obj?.Delete?.TableName, obj?.Update?.TableName].filter((i) => i)).flat() },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "TransactWriteItems", {})
    .n("DynamoDBClient", "TransactWriteItemsCommand")
    .sc(schemas_0.TransactWriteItems$)
    .build() {
}

class UntagResourceCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "ResourceArn" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "UntagResource", {})
    .n("DynamoDBClient", "UntagResourceCommand")
    .sc(schemas_0.UntagResource$)
    .build() {
}

class UpdateContinuousBackupsCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "UpdateContinuousBackups", {})
    .n("DynamoDBClient", "UpdateContinuousBackupsCommand")
    .sc(schemas_0.UpdateContinuousBackups$)
    .build() {
}

class UpdateContributorInsightsCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "UpdateContributorInsights", {})
    .n("DynamoDBClient", "UpdateContributorInsightsCommand")
    .sc(schemas_0.UpdateContributorInsights$)
    .build() {
}

class UpdateGlobalTableCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "GlobalTableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "UpdateGlobalTable", {})
    .n("DynamoDBClient", "UpdateGlobalTableCommand")
    .sc(schemas_0.UpdateGlobalTable$)
    .build() {
}

class UpdateGlobalTableSettingsCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "GlobalTableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "UpdateGlobalTableSettings", {})
    .n("DynamoDBClient", "UpdateGlobalTableSettingsCommand")
    .sc(schemas_0.UpdateGlobalTableSettings$)
    .build() {
}

class UpdateItemCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "UpdateItem", {})
    .n("DynamoDBClient", "UpdateItemCommand")
    .sc(schemas_0.UpdateItem$)
    .build() {
}

class UpdateKinesisStreamingDestinationCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "UpdateKinesisStreamingDestination", {})
    .n("DynamoDBClient", "UpdateKinesisStreamingDestinationCommand")
    .sc(schemas_0.UpdateKinesisStreamingDestination$)
    .build() {
}

class UpdateTableCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "UpdateTable", {})
    .n("DynamoDBClient", "UpdateTableCommand")
    .sc(schemas_0.UpdateTable$)
    .build() {
}

class UpdateTableReplicaAutoScalingCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "UpdateTableReplicaAutoScaling", {})
    .n("DynamoDBClient", "UpdateTableReplicaAutoScalingCommand")
    .sc(schemas_0.UpdateTableReplicaAutoScaling$)
    .build() {
}

class UpdateTimeToLiveCommand extends smithyClient.Command
    .classBuilder()
    .ep({
    ...commonParams,
    ResourceArn: { type: "contextParams", name: "TableName" },
})
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("DynamoDB_20120810", "UpdateTimeToLive", {})
    .n("DynamoDBClient", "UpdateTimeToLiveCommand")
    .sc(schemas_0.UpdateTimeToLive$)
    .build() {
}

const paginateListContributorInsights = core.createPaginator(DynamoDBClient, ListContributorInsightsCommand, "NextToken", "NextToken", "MaxResults");

const paginateListExports = core.createPaginator(DynamoDBClient, ListExportsCommand, "NextToken", "NextToken", "MaxResults");

const paginateListImports = core.createPaginator(DynamoDBClient, ListImportsCommand, "NextToken", "NextToken", "PageSize");

const paginateListTables = core.createPaginator(DynamoDBClient, ListTablesCommand, "ExclusiveStartTableName", "LastEvaluatedTableName", "Limit");

const paginateQuery = core.createPaginator(DynamoDBClient, QueryCommand, "ExclusiveStartKey", "LastEvaluatedKey", "Limit");

const paginateScan = core.createPaginator(DynamoDBClient, ScanCommand, "ExclusiveStartKey", "LastEvaluatedKey", "Limit");

const checkState$5 = async (client, input) => {
    let reason;
    try {
        let result = await client.send(new DescribeContributorInsightsCommand(input));
        reason = result;
        try {
            const returnComparator = () => {
                return result.ContributorInsightsStatus;
            };
            if (returnComparator() === "ENABLED") {
                return { state: utilWaiter.WaiterState.SUCCESS, reason };
            }
        }
        catch (e) { }
        try {
            const returnComparator = () => {
                return result.ContributorInsightsStatus;
            };
            if (returnComparator() === "FAILED") {
                return { state: utilWaiter.WaiterState.FAILURE, reason };
            }
        }
        catch (e) { }
    }
    catch (exception) {
        reason = exception;
    }
    return { state: utilWaiter.WaiterState.RETRY, reason };
};
const waitForContributorInsightsEnabled = async (params, input) => {
    const serviceDefaults = { minDelay: 20, maxDelay: 120 };
    return utilWaiter.createWaiter({ ...serviceDefaults, ...params }, input, checkState$5);
};
const waitUntilContributorInsightsEnabled = async (params, input) => {
    const serviceDefaults = { minDelay: 20, maxDelay: 120 };
    const result = await utilWaiter.createWaiter({ ...serviceDefaults, ...params }, input, checkState$5);
    return utilWaiter.checkExceptions(result);
};

const checkState$4 = async (client, input) => {
    let reason;
    try {
        let result = await client.send(new DescribeExportCommand(input));
        reason = result;
        try {
            const returnComparator = () => {
                return result.ExportDescription.ExportStatus;
            };
            if (returnComparator() === "COMPLETED") {
                return { state: utilWaiter.WaiterState.SUCCESS, reason };
            }
        }
        catch (e) { }
        try {
            const returnComparator = () => {
                return result.ExportDescription.ExportStatus;
            };
            if (returnComparator() === "FAILED") {
                return { state: utilWaiter.WaiterState.FAILURE, reason };
            }
        }
        catch (e) { }
    }
    catch (exception) {
        reason = exception;
    }
    return { state: utilWaiter.WaiterState.RETRY, reason };
};
const waitForExportCompleted = async (params, input) => {
    const serviceDefaults = { minDelay: 20, maxDelay: 120 };
    return utilWaiter.createWaiter({ ...serviceDefaults, ...params }, input, checkState$4);
};
const waitUntilExportCompleted = async (params, input) => {
    const serviceDefaults = { minDelay: 20, maxDelay: 120 };
    const result = await utilWaiter.createWaiter({ ...serviceDefaults, ...params }, input, checkState$4);
    return utilWaiter.checkExceptions(result);
};

const checkState$3 = async (client, input) => {
    let reason;
    try {
        let result = await client.send(new DescribeImportCommand(input));
        reason = result;
        try {
            const returnComparator = () => {
                return result.ImportTableDescription.ImportStatus;
            };
            if (returnComparator() === "COMPLETED") {
                return { state: utilWaiter.WaiterState.SUCCESS, reason };
            }
        }
        catch (e) { }
        try {
            const returnComparator = () => {
                return result.ImportTableDescription.ImportStatus;
            };
            if (returnComparator() === "FAILED") {
                return { state: utilWaiter.WaiterState.FAILURE, reason };
            }
        }
        catch (e) { }
        try {
            const returnComparator = () => {
                return result.ImportTableDescription.ImportStatus;
            };
            if (returnComparator() === "CANCELLED") {
                return { state: utilWaiter.WaiterState.FAILURE, reason };
            }
        }
        catch (e) { }
    }
    catch (exception) {
        reason = exception;
    }
    return { state: utilWaiter.WaiterState.RETRY, reason };
};
const waitForImportCompleted = async (params, input) => {
    const serviceDefaults = { minDelay: 20, maxDelay: 120 };
    return utilWaiter.createWaiter({ ...serviceDefaults, ...params }, input, checkState$3);
};
const waitUntilImportCompleted = async (params, input) => {
    const serviceDefaults = { minDelay: 20, maxDelay: 120 };
    const result = await utilWaiter.createWaiter({ ...serviceDefaults, ...params }, input, checkState$3);
    return utilWaiter.checkExceptions(result);
};

const checkState$2 = async (client, input) => {
    let reason;
    try {
        let result = await client.send(new DescribeKinesisStreamingDestinationCommand(input));
        reason = result;
        try {
            const returnComparator = () => {
                let flat_1 = [].concat(...result.KinesisDataStreamDestinations);
                let projection_3 = flat_1.map((element_2) => {
                    return element_2.DestinationStatus;
                });
                return projection_3;
            };
            for (let anyStringEq_4 of returnComparator()) {
                if (anyStringEq_4 == "ACTIVE") {
                    return { state: utilWaiter.WaiterState.SUCCESS, reason };
                }
            }
        }
        catch (e) { }
        try {
            const returnComparator = () => {
                let filterRes_2 = result.KinesisDataStreamDestinations.filter((element_1) => {
                    return (((element_1.DestinationStatus == "DISABLED") || (element_1.DestinationStatus == "ENABLE_FAILED")) && ((element_1.DestinationStatus == "ENABLE_FAILED") || (element_1.DestinationStatus == "DISABLED")));
                });
                return ((result.KinesisDataStreamDestinations.length > 0) && (filterRes_2.length == result.KinesisDataStreamDestinations.length));
            };
            if (returnComparator() == true) {
                return { state: utilWaiter.WaiterState.FAILURE, reason };
            }
        }
        catch (e) { }
    }
    catch (exception) {
        reason = exception;
    }
    return { state: utilWaiter.WaiterState.RETRY, reason };
};
const waitForKinesisStreamingDestinationActive = async (params, input) => {
    const serviceDefaults = { minDelay: 20, maxDelay: 120 };
    return utilWaiter.createWaiter({ ...serviceDefaults, ...params }, input, checkState$2);
};
const waitUntilKinesisStreamingDestinationActive = async (params, input) => {
    const serviceDefaults = { minDelay: 20, maxDelay: 120 };
    const result = await utilWaiter.createWaiter({ ...serviceDefaults, ...params }, input, checkState$2);
    return utilWaiter.checkExceptions(result);
};

const checkState$1 = async (client, input) => {
    let reason;
    try {
        let result = await client.send(new DescribeTableCommand(input));
        reason = result;
        try {
            const returnComparator = () => {
                return result.Table.TableStatus;
            };
            if (returnComparator() === "ACTIVE") {
                return { state: utilWaiter.WaiterState.SUCCESS, reason };
            }
        }
        catch (e) { }
    }
    catch (exception) {
        reason = exception;
        if (exception.name && exception.name == "ResourceNotFoundException") {
            return { state: utilWaiter.WaiterState.RETRY, reason };
        }
    }
    return { state: utilWaiter.WaiterState.RETRY, reason };
};
const waitForTableExists = async (params, input) => {
    const serviceDefaults = { minDelay: 20, maxDelay: 120 };
    return utilWaiter.createWaiter({ ...serviceDefaults, ...params }, input, checkState$1);
};
const waitUntilTableExists = async (params, input) => {
    const serviceDefaults = { minDelay: 20, maxDelay: 120 };
    const result = await utilWaiter.createWaiter({ ...serviceDefaults, ...params }, input, checkState$1);
    return utilWaiter.checkExceptions(result);
};

const checkState = async (client, input) => {
    let reason;
    try {
        let result = await client.send(new DescribeTableCommand(input));
        reason = result;
    }
    catch (exception) {
        reason = exception;
        if (exception.name && exception.name == "ResourceNotFoundException") {
            return { state: utilWaiter.WaiterState.SUCCESS, reason };
        }
    }
    return { state: utilWaiter.WaiterState.RETRY, reason };
};
const waitForTableNotExists = async (params, input) => {
    const serviceDefaults = { minDelay: 20, maxDelay: 120 };
    return utilWaiter.createWaiter({ ...serviceDefaults, ...params }, input, checkState);
};
const waitUntilTableNotExists = async (params, input) => {
    const serviceDefaults = { minDelay: 20, maxDelay: 120 };
    const result = await utilWaiter.createWaiter({ ...serviceDefaults, ...params }, input, checkState);
    return utilWaiter.checkExceptions(result);
};

const commands = {
    BatchExecuteStatementCommand,
    BatchGetItemCommand,
    BatchWriteItemCommand,
    CreateBackupCommand,
    CreateGlobalTableCommand,
    CreateTableCommand,
    DeleteBackupCommand,
    DeleteItemCommand,
    DeleteResourcePolicyCommand,
    DeleteTableCommand,
    DescribeBackupCommand,
    DescribeContinuousBackupsCommand,
    DescribeContributorInsightsCommand,
    DescribeEndpointsCommand,
    DescribeExportCommand,
    DescribeGlobalTableCommand,
    DescribeGlobalTableSettingsCommand,
    DescribeImportCommand,
    DescribeKinesisStreamingDestinationCommand,
    DescribeLimitsCommand,
    DescribeTableCommand,
    DescribeTableReplicaAutoScalingCommand,
    DescribeTimeToLiveCommand,
    DisableKinesisStreamingDestinationCommand,
    EnableKinesisStreamingDestinationCommand,
    ExecuteStatementCommand,
    ExecuteTransactionCommand,
    ExportTableToPointInTimeCommand,
    GetItemCommand,
    GetResourcePolicyCommand,
    ImportTableCommand,
    ListBackupsCommand,
    ListContributorInsightsCommand,
    ListExportsCommand,
    ListGlobalTablesCommand,
    ListImportsCommand,
    ListTablesCommand,
    ListTagsOfResourceCommand,
    PutItemCommand,
    PutResourcePolicyCommand,
    QueryCommand,
    RestoreTableFromBackupCommand,
    RestoreTableToPointInTimeCommand,
    ScanCommand,
    TagResourceCommand,
    TransactGetItemsCommand,
    TransactWriteItemsCommand,
    UntagResourceCommand,
    UpdateContinuousBackupsCommand,
    UpdateContributorInsightsCommand,
    UpdateGlobalTableCommand,
    UpdateGlobalTableSettingsCommand,
    UpdateItemCommand,
    UpdateKinesisStreamingDestinationCommand,
    UpdateTableCommand,
    UpdateTableReplicaAutoScalingCommand,
    UpdateTimeToLiveCommand,
};
const paginators = {
    paginateListContributorInsights,
    paginateListExports,
    paginateListImports,
    paginateListTables,
    paginateQuery,
    paginateScan,
};
const waiters = {
    waitUntilContributorInsightsEnabled,
    waitUntilExportCompleted,
    waitUntilImportCompleted,
    waitUntilKinesisStreamingDestinationActive,
    waitUntilTableExists,
    waitUntilTableNotExists,
};
class DynamoDB extends DynamoDBClient {
}
smithyClient.createAggregatedClient(commands, DynamoDB, { paginators, waiters });

const ApproximateCreationDateTimePrecision = {
    MICROSECOND: "MICROSECOND",
    MILLISECOND: "MILLISECOND",
};
const AttributeAction = {
    ADD: "ADD",
    DELETE: "DELETE",
    PUT: "PUT",
};
const ScalarAttributeType = {
    B: "B",
    N: "N",
    S: "S",
};
const BackupStatus = {
    AVAILABLE: "AVAILABLE",
    CREATING: "CREATING",
    DELETED: "DELETED",
};
const BackupType = {
    AWS_BACKUP: "AWS_BACKUP",
    SYSTEM: "SYSTEM",
    USER: "USER",
};
const BillingMode = {
    PAY_PER_REQUEST: "PAY_PER_REQUEST",
    PROVISIONED: "PROVISIONED",
};
const KeyType = {
    HASH: "HASH",
    RANGE: "RANGE",
};
const ProjectionType = {
    ALL: "ALL",
    INCLUDE: "INCLUDE",
    KEYS_ONLY: "KEYS_ONLY",
};
const SSEType = {
    AES256: "AES256",
    KMS: "KMS",
};
const SSEStatus = {
    DISABLED: "DISABLED",
    DISABLING: "DISABLING",
    ENABLED: "ENABLED",
    ENABLING: "ENABLING",
    UPDATING: "UPDATING",
};
const StreamViewType = {
    KEYS_ONLY: "KEYS_ONLY",
    NEW_AND_OLD_IMAGES: "NEW_AND_OLD_IMAGES",
    NEW_IMAGE: "NEW_IMAGE",
    OLD_IMAGE: "OLD_IMAGE",
};
const TimeToLiveStatus = {
    DISABLED: "DISABLED",
    DISABLING: "DISABLING",
    ENABLED: "ENABLED",
    ENABLING: "ENABLING",
};
const BackupTypeFilter = {
    ALL: "ALL",
    AWS_BACKUP: "AWS_BACKUP",
    SYSTEM: "SYSTEM",
    USER: "USER",
};
const ReturnConsumedCapacity = {
    INDEXES: "INDEXES",
    NONE: "NONE",
    TOTAL: "TOTAL",
};
const ReturnValuesOnConditionCheckFailure = {
    ALL_OLD: "ALL_OLD",
    NONE: "NONE",
};
const BatchStatementErrorCodeEnum = {
    AccessDenied: "AccessDenied",
    ConditionalCheckFailed: "ConditionalCheckFailed",
    DuplicateItem: "DuplicateItem",
    InternalServerError: "InternalServerError",
    ItemCollectionSizeLimitExceeded: "ItemCollectionSizeLimitExceeded",
    ProvisionedThroughputExceeded: "ProvisionedThroughputExceeded",
    RequestLimitExceeded: "RequestLimitExceeded",
    ResourceNotFound: "ResourceNotFound",
    ThrottlingError: "ThrottlingError",
    TransactionConflict: "TransactionConflict",
    ValidationError: "ValidationError",
};
const ReturnItemCollectionMetrics = {
    NONE: "NONE",
    SIZE: "SIZE",
};
const ComparisonOperator = {
    BEGINS_WITH: "BEGINS_WITH",
    BETWEEN: "BETWEEN",
    CONTAINS: "CONTAINS",
    EQ: "EQ",
    GE: "GE",
    GT: "GT",
    IN: "IN",
    LE: "LE",
    LT: "LT",
    NE: "NE",
    NOT_CONTAINS: "NOT_CONTAINS",
    NOT_NULL: "NOT_NULL",
    NULL: "NULL",
};
const ConditionalOperator = {
    AND: "AND",
    OR: "OR",
};
const ContinuousBackupsStatus = {
    DISABLED: "DISABLED",
    ENABLED: "ENABLED",
};
const PointInTimeRecoveryStatus = {
    DISABLED: "DISABLED",
    ENABLED: "ENABLED",
};
const ContributorInsightsAction = {
    DISABLE: "DISABLE",
    ENABLE: "ENABLE",
};
const ContributorInsightsMode = {
    ACCESSED_AND_THROTTLED_KEYS: "ACCESSED_AND_THROTTLED_KEYS",
    THROTTLED_KEYS: "THROTTLED_KEYS",
};
const ContributorInsightsStatus = {
    DISABLED: "DISABLED",
    DISABLING: "DISABLING",
    ENABLED: "ENABLED",
    ENABLING: "ENABLING",
    FAILED: "FAILED",
};
const GlobalTableStatus = {
    ACTIVE: "ACTIVE",
    CREATING: "CREATING",
    DELETING: "DELETING",
    UPDATING: "UPDATING",
};
const IndexStatus = {
    ACTIVE: "ACTIVE",
    CREATING: "CREATING",
    DELETING: "DELETING",
    UPDATING: "UPDATING",
};
const GlobalTableSettingsReplicationMode = {
    DISABLED: "DISABLED",
    ENABLED: "ENABLED",
    ENABLED_WITH_OVERRIDES: "ENABLED_WITH_OVERRIDES",
};
const ReplicaStatus = {
    ACTIVE: "ACTIVE",
    ARCHIVED: "ARCHIVED",
    ARCHIVING: "ARCHIVING",
    CREATING: "CREATING",
    CREATION_FAILED: "CREATION_FAILED",
    DELETING: "DELETING",
    INACCESSIBLE_ENCRYPTION_CREDENTIALS: "INACCESSIBLE_ENCRYPTION_CREDENTIALS",
    REGION_DISABLED: "REGION_DISABLED",
    REPLICATION_NOT_AUTHORIZED: "REPLICATION_NOT_AUTHORIZED",
    UPDATING: "UPDATING",
};
const TableClass = {
    STANDARD: "STANDARD",
    STANDARD_INFREQUENT_ACCESS: "STANDARD_INFREQUENT_ACCESS",
};
const TableStatus = {
    ACTIVE: "ACTIVE",
    ARCHIVED: "ARCHIVED",
    ARCHIVING: "ARCHIVING",
    CREATING: "CREATING",
    DELETING: "DELETING",
    INACCESSIBLE_ENCRYPTION_CREDENTIALS: "INACCESSIBLE_ENCRYPTION_CREDENTIALS",
    REPLICATION_NOT_AUTHORIZED: "REPLICATION_NOT_AUTHORIZED",
    UPDATING: "UPDATING",
};
const WitnessStatus = {
    ACTIVE: "ACTIVE",
    CREATING: "CREATING",
    DELETING: "DELETING",
};
const MultiRegionConsistency = {
    EVENTUAL: "EVENTUAL",
    STRONG: "STRONG",
};
const ReturnValue = {
    ALL_NEW: "ALL_NEW",
    ALL_OLD: "ALL_OLD",
    NONE: "NONE",
    UPDATED_NEW: "UPDATED_NEW",
    UPDATED_OLD: "UPDATED_OLD",
};
const ExportFormat = {
    DYNAMODB_JSON: "DYNAMODB_JSON",
    ION: "ION",
};
const ExportStatus = {
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    IN_PROGRESS: "IN_PROGRESS",
};
const ExportType = {
    FULL_EXPORT: "FULL_EXPORT",
    INCREMENTAL_EXPORT: "INCREMENTAL_EXPORT",
};
const ExportViewType = {
    NEW_AND_OLD_IMAGES: "NEW_AND_OLD_IMAGES",
    NEW_IMAGE: "NEW_IMAGE",
};
const S3SseAlgorithm = {
    AES256: "AES256",
    KMS: "KMS",
};
const ImportStatus = {
    CANCELLED: "CANCELLED",
    CANCELLING: "CANCELLING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    IN_PROGRESS: "IN_PROGRESS",
};
const InputCompressionType = {
    GZIP: "GZIP",
    NONE: "NONE",
    ZSTD: "ZSTD",
};
const InputFormat = {
    CSV: "CSV",
    DYNAMODB_JSON: "DYNAMODB_JSON",
    ION: "ION",
};
const DestinationStatus = {
    ACTIVE: "ACTIVE",
    DISABLED: "DISABLED",
    DISABLING: "DISABLING",
    ENABLE_FAILED: "ENABLE_FAILED",
    ENABLING: "ENABLING",
    UPDATING: "UPDATING",
};
const Select = {
    ALL_ATTRIBUTES: "ALL_ATTRIBUTES",
    ALL_PROJECTED_ATTRIBUTES: "ALL_PROJECTED_ATTRIBUTES",
    COUNT: "COUNT",
    SPECIFIC_ATTRIBUTES: "SPECIFIC_ATTRIBUTES",
};

exports.$Command = smithyClient.Command;
exports.__Client = smithyClient.Client;
exports.DynamoDBServiceException = DynamoDBServiceException.DynamoDBServiceException;
exports.ApproximateCreationDateTimePrecision = ApproximateCreationDateTimePrecision;
exports.AttributeAction = AttributeAction;
exports.BackupStatus = BackupStatus;
exports.BackupType = BackupType;
exports.BackupTypeFilter = BackupTypeFilter;
exports.BatchExecuteStatementCommand = BatchExecuteStatementCommand;
exports.BatchGetItemCommand = BatchGetItemCommand;
exports.BatchStatementErrorCodeEnum = BatchStatementErrorCodeEnum;
exports.BatchWriteItemCommand = BatchWriteItemCommand;
exports.BillingMode = BillingMode;
exports.ComparisonOperator = ComparisonOperator;
exports.ConditionalOperator = ConditionalOperator;
exports.ContinuousBackupsStatus = ContinuousBackupsStatus;
exports.ContributorInsightsAction = ContributorInsightsAction;
exports.ContributorInsightsMode = ContributorInsightsMode;
exports.ContributorInsightsStatus = ContributorInsightsStatus;
exports.CreateBackupCommand = CreateBackupCommand;
exports.CreateGlobalTableCommand = CreateGlobalTableCommand;
exports.CreateTableCommand = CreateTableCommand;
exports.DeleteBackupCommand = DeleteBackupCommand;
exports.DeleteItemCommand = DeleteItemCommand;
exports.DeleteResourcePolicyCommand = DeleteResourcePolicyCommand;
exports.DeleteTableCommand = DeleteTableCommand;
exports.DescribeBackupCommand = DescribeBackupCommand;
exports.DescribeContinuousBackupsCommand = DescribeContinuousBackupsCommand;
exports.DescribeContributorInsightsCommand = DescribeContributorInsightsCommand;
exports.DescribeEndpointsCommand = DescribeEndpointsCommand;
exports.DescribeExportCommand = DescribeExportCommand;
exports.DescribeGlobalTableCommand = DescribeGlobalTableCommand;
exports.DescribeGlobalTableSettingsCommand = DescribeGlobalTableSettingsCommand;
exports.DescribeImportCommand = DescribeImportCommand;
exports.DescribeKinesisStreamingDestinationCommand = DescribeKinesisStreamingDestinationCommand;
exports.DescribeLimitsCommand = DescribeLimitsCommand;
exports.DescribeTableCommand = DescribeTableCommand;
exports.DescribeTableReplicaAutoScalingCommand = DescribeTableReplicaAutoScalingCommand;
exports.DescribeTimeToLiveCommand = DescribeTimeToLiveCommand;
exports.DestinationStatus = DestinationStatus;
exports.DisableKinesisStreamingDestinationCommand = DisableKinesisStreamingDestinationCommand;
exports.DynamoDB = DynamoDB;
exports.DynamoDBClient = DynamoDBClient;
exports.EnableKinesisStreamingDestinationCommand = EnableKinesisStreamingDestinationCommand;
exports.ExecuteStatementCommand = ExecuteStatementCommand;
exports.ExecuteTransactionCommand = ExecuteTransactionCommand;
exports.ExportFormat = ExportFormat;
exports.ExportStatus = ExportStatus;
exports.ExportTableToPointInTimeCommand = ExportTableToPointInTimeCommand;
exports.ExportType = ExportType;
exports.ExportViewType = ExportViewType;
exports.GetItemCommand = GetItemCommand;
exports.GetResourcePolicyCommand = GetResourcePolicyCommand;
exports.GlobalTableSettingsReplicationMode = GlobalTableSettingsReplicationMode;
exports.GlobalTableStatus = GlobalTableStatus;
exports.ImportStatus = ImportStatus;
exports.ImportTableCommand = ImportTableCommand;
exports.IndexStatus = IndexStatus;
exports.InputCompressionType = InputCompressionType;
exports.InputFormat = InputFormat;
exports.KeyType = KeyType;
exports.ListBackupsCommand = ListBackupsCommand;
exports.ListContributorInsightsCommand = ListContributorInsightsCommand;
exports.ListExportsCommand = ListExportsCommand;
exports.ListGlobalTablesCommand = ListGlobalTablesCommand;
exports.ListImportsCommand = ListImportsCommand;
exports.ListTablesCommand = ListTablesCommand;
exports.ListTagsOfResourceCommand = ListTagsOfResourceCommand;
exports.MultiRegionConsistency = MultiRegionConsistency;
exports.PointInTimeRecoveryStatus = PointInTimeRecoveryStatus;
exports.ProjectionType = ProjectionType;
exports.PutItemCommand = PutItemCommand;
exports.PutResourcePolicyCommand = PutResourcePolicyCommand;
exports.QueryCommand = QueryCommand;
exports.ReplicaStatus = ReplicaStatus;
exports.RestoreTableFromBackupCommand = RestoreTableFromBackupCommand;
exports.RestoreTableToPointInTimeCommand = RestoreTableToPointInTimeCommand;
exports.ReturnConsumedCapacity = ReturnConsumedCapacity;
exports.ReturnItemCollectionMetrics = ReturnItemCollectionMetrics;
exports.ReturnValue = ReturnValue;
exports.ReturnValuesOnConditionCheckFailure = ReturnValuesOnConditionCheckFailure;
exports.S3SseAlgorithm = S3SseAlgorithm;
exports.SSEStatus = SSEStatus;
exports.SSEType = SSEType;
exports.ScalarAttributeType = ScalarAttributeType;
exports.ScanCommand = ScanCommand;
exports.Select = Select;
exports.StreamViewType = StreamViewType;
exports.TableClass = TableClass;
exports.TableStatus = TableStatus;
exports.TagResourceCommand = TagResourceCommand;
exports.TimeToLiveStatus = TimeToLiveStatus;
exports.TransactGetItemsCommand = TransactGetItemsCommand;
exports.TransactWriteItemsCommand = TransactWriteItemsCommand;
exports.UntagResourceCommand = UntagResourceCommand;
exports.UpdateContinuousBackupsCommand = UpdateContinuousBackupsCommand;
exports.UpdateContributorInsightsCommand = UpdateContributorInsightsCommand;
exports.UpdateGlobalTableCommand = UpdateGlobalTableCommand;
exports.UpdateGlobalTableSettingsCommand = UpdateGlobalTableSettingsCommand;
exports.UpdateItemCommand = UpdateItemCommand;
exports.UpdateKinesisStreamingDestinationCommand = UpdateKinesisStreamingDestinationCommand;
exports.UpdateTableCommand = UpdateTableCommand;
exports.UpdateTableReplicaAutoScalingCommand = UpdateTableReplicaAutoScalingCommand;
exports.UpdateTimeToLiveCommand = UpdateTimeToLiveCommand;
exports.WitnessStatus = WitnessStatus;
exports.paginateListContributorInsights = paginateListContributorInsights;
exports.paginateListExports = paginateListExports;
exports.paginateListImports = paginateListImports;
exports.paginateListTables = paginateListTables;
exports.paginateQuery = paginateQuery;
exports.paginateScan = paginateScan;
exports.waitForContributorInsightsEnabled = waitForContributorInsightsEnabled;
exports.waitForExportCompleted = waitForExportCompleted;
exports.waitForImportCompleted = waitForImportCompleted;
exports.waitForKinesisStreamingDestinationActive = waitForKinesisStreamingDestinationActive;
exports.waitForTableExists = waitForTableExists;
exports.waitForTableNotExists = waitForTableNotExists;
exports.waitUntilContributorInsightsEnabled = waitUntilContributorInsightsEnabled;
exports.waitUntilExportCompleted = waitUntilExportCompleted;
exports.waitUntilImportCompleted = waitUntilImportCompleted;
exports.waitUntilKinesisStreamingDestinationActive = waitUntilKinesisStreamingDestinationActive;
exports.waitUntilTableExists = waitUntilTableExists;
exports.waitUntilTableNotExists = waitUntilTableNotExists;
Object.prototype.hasOwnProperty.call(schemas_0, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: schemas_0['__proto__']
    });

Object.keys(schemas_0).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = schemas_0[k];
});
Object.prototype.hasOwnProperty.call(errors, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: errors['__proto__']
    });

Object.keys(errors).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = errors[k];
});


/***/ }),

/***/ 18894:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DynamoDBServiceException = exports.__ServiceException = void 0;
const smithy_client_1 = __webpack_require__(61411);
Object.defineProperty(exports, "__ServiceException", ({ enumerable: true, get: function () { return smithy_client_1.ServiceException; } }));
class DynamoDBServiceException extends smithy_client_1.ServiceException {
    constructor(options) {
        super(options);
        Object.setPrototypeOf(this, DynamoDBServiceException.prototype);
    }
}
exports.DynamoDBServiceException = DynamoDBServiceException;


/***/ }),

/***/ 98461:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.TransactionCanceledException = exports.ConditionalCheckFailedException = exports.IndexNotFoundException = exports.ReplicaNotFoundException = exports.ReplicaAlreadyExistsException = exports.InvalidRestoreTimeException = exports.TableAlreadyExistsException = exports.ImportConflictException = exports.PointInTimeRecoveryUnavailableException = exports.InvalidExportTimeException = exports.ExportConflictException = exports.TransactionInProgressException = exports.IdempotentParameterMismatchException = exports.DuplicateItemException = exports.ImportNotFoundException = exports.GlobalTableNotFoundException = exports.ExportNotFoundException = exports.PolicyNotFoundException = exports.TransactionConflictException = exports.ResourceInUseException = exports.GlobalTableAlreadyExistsException = exports.TableNotFoundException = exports.TableInUseException = exports.LimitExceededException = exports.ContinuousBackupsUnavailableException = exports.ReplicatedWriteConflictException = exports.ItemCollectionSizeLimitExceededException = exports.ResourceNotFoundException = exports.ProvisionedThroughputExceededException = exports.InvalidEndpointException = exports.ThrottlingException = exports.RequestLimitExceeded = exports.InternalServerError = exports.BackupNotFoundException = exports.BackupInUseException = void 0;
const DynamoDBServiceException_1 = __webpack_require__(18894);
class BackupInUseException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "BackupInUseException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "BackupInUseException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, BackupInUseException.prototype);
    }
}
exports.BackupInUseException = BackupInUseException;
class BackupNotFoundException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "BackupNotFoundException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "BackupNotFoundException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, BackupNotFoundException.prototype);
    }
}
exports.BackupNotFoundException = BackupNotFoundException;
class InternalServerError extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "InternalServerError";
    $fault = "server";
    constructor(opts) {
        super({
            name: "InternalServerError",
            $fault: "server",
            ...opts,
        });
        Object.setPrototypeOf(this, InternalServerError.prototype);
    }
}
exports.InternalServerError = InternalServerError;
class RequestLimitExceeded extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "RequestLimitExceeded";
    $fault = "client";
    ThrottlingReasons;
    constructor(opts) {
        super({
            name: "RequestLimitExceeded",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, RequestLimitExceeded.prototype);
        this.ThrottlingReasons = opts.ThrottlingReasons;
    }
}
exports.RequestLimitExceeded = RequestLimitExceeded;
class ThrottlingException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "ThrottlingException";
    $fault = "client";
    throttlingReasons;
    constructor(opts) {
        super({
            name: "ThrottlingException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ThrottlingException.prototype);
        this.throttlingReasons = opts.throttlingReasons;
    }
}
exports.ThrottlingException = ThrottlingException;
class InvalidEndpointException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "InvalidEndpointException";
    $fault = "client";
    Message;
    constructor(opts) {
        super({
            name: "InvalidEndpointException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, InvalidEndpointException.prototype);
        this.Message = opts.Message;
    }
}
exports.InvalidEndpointException = InvalidEndpointException;
class ProvisionedThroughputExceededException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "ProvisionedThroughputExceededException";
    $fault = "client";
    ThrottlingReasons;
    constructor(opts) {
        super({
            name: "ProvisionedThroughputExceededException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ProvisionedThroughputExceededException.prototype);
        this.ThrottlingReasons = opts.ThrottlingReasons;
    }
}
exports.ProvisionedThroughputExceededException = ProvisionedThroughputExceededException;
class ResourceNotFoundException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "ResourceNotFoundException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "ResourceNotFoundException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ResourceNotFoundException.prototype);
    }
}
exports.ResourceNotFoundException = ResourceNotFoundException;
class ItemCollectionSizeLimitExceededException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "ItemCollectionSizeLimitExceededException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "ItemCollectionSizeLimitExceededException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ItemCollectionSizeLimitExceededException.prototype);
    }
}
exports.ItemCollectionSizeLimitExceededException = ItemCollectionSizeLimitExceededException;
class ReplicatedWriteConflictException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "ReplicatedWriteConflictException";
    $fault = "client";
    $retryable = {};
    constructor(opts) {
        super({
            name: "ReplicatedWriteConflictException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ReplicatedWriteConflictException.prototype);
    }
}
exports.ReplicatedWriteConflictException = ReplicatedWriteConflictException;
class ContinuousBackupsUnavailableException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "ContinuousBackupsUnavailableException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "ContinuousBackupsUnavailableException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ContinuousBackupsUnavailableException.prototype);
    }
}
exports.ContinuousBackupsUnavailableException = ContinuousBackupsUnavailableException;
class LimitExceededException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "LimitExceededException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "LimitExceededException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, LimitExceededException.prototype);
    }
}
exports.LimitExceededException = LimitExceededException;
class TableInUseException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "TableInUseException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "TableInUseException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, TableInUseException.prototype);
    }
}
exports.TableInUseException = TableInUseException;
class TableNotFoundException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "TableNotFoundException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "TableNotFoundException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, TableNotFoundException.prototype);
    }
}
exports.TableNotFoundException = TableNotFoundException;
class GlobalTableAlreadyExistsException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "GlobalTableAlreadyExistsException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "GlobalTableAlreadyExistsException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, GlobalTableAlreadyExistsException.prototype);
    }
}
exports.GlobalTableAlreadyExistsException = GlobalTableAlreadyExistsException;
class ResourceInUseException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "ResourceInUseException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "ResourceInUseException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ResourceInUseException.prototype);
    }
}
exports.ResourceInUseException = ResourceInUseException;
class TransactionConflictException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "TransactionConflictException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "TransactionConflictException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, TransactionConflictException.prototype);
    }
}
exports.TransactionConflictException = TransactionConflictException;
class PolicyNotFoundException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "PolicyNotFoundException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "PolicyNotFoundException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, PolicyNotFoundException.prototype);
    }
}
exports.PolicyNotFoundException = PolicyNotFoundException;
class ExportNotFoundException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "ExportNotFoundException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "ExportNotFoundException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ExportNotFoundException.prototype);
    }
}
exports.ExportNotFoundException = ExportNotFoundException;
class GlobalTableNotFoundException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "GlobalTableNotFoundException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "GlobalTableNotFoundException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, GlobalTableNotFoundException.prototype);
    }
}
exports.GlobalTableNotFoundException = GlobalTableNotFoundException;
class ImportNotFoundException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "ImportNotFoundException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "ImportNotFoundException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ImportNotFoundException.prototype);
    }
}
exports.ImportNotFoundException = ImportNotFoundException;
class DuplicateItemException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "DuplicateItemException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "DuplicateItemException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, DuplicateItemException.prototype);
    }
}
exports.DuplicateItemException = DuplicateItemException;
class IdempotentParameterMismatchException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "IdempotentParameterMismatchException";
    $fault = "client";
    Message;
    constructor(opts) {
        super({
            name: "IdempotentParameterMismatchException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, IdempotentParameterMismatchException.prototype);
        this.Message = opts.Message;
    }
}
exports.IdempotentParameterMismatchException = IdempotentParameterMismatchException;
class TransactionInProgressException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "TransactionInProgressException";
    $fault = "client";
    Message;
    constructor(opts) {
        super({
            name: "TransactionInProgressException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, TransactionInProgressException.prototype);
        this.Message = opts.Message;
    }
}
exports.TransactionInProgressException = TransactionInProgressException;
class ExportConflictException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "ExportConflictException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "ExportConflictException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ExportConflictException.prototype);
    }
}
exports.ExportConflictException = ExportConflictException;
class InvalidExportTimeException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "InvalidExportTimeException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "InvalidExportTimeException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, InvalidExportTimeException.prototype);
    }
}
exports.InvalidExportTimeException = InvalidExportTimeException;
class PointInTimeRecoveryUnavailableException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "PointInTimeRecoveryUnavailableException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "PointInTimeRecoveryUnavailableException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, PointInTimeRecoveryUnavailableException.prototype);
    }
}
exports.PointInTimeRecoveryUnavailableException = PointInTimeRecoveryUnavailableException;
class ImportConflictException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "ImportConflictException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "ImportConflictException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ImportConflictException.prototype);
    }
}
exports.ImportConflictException = ImportConflictException;
class TableAlreadyExistsException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "TableAlreadyExistsException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "TableAlreadyExistsException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, TableAlreadyExistsException.prototype);
    }
}
exports.TableAlreadyExistsException = TableAlreadyExistsException;
class InvalidRestoreTimeException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "InvalidRestoreTimeException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "InvalidRestoreTimeException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, InvalidRestoreTimeException.prototype);
    }
}
exports.InvalidRestoreTimeException = InvalidRestoreTimeException;
class ReplicaAlreadyExistsException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "ReplicaAlreadyExistsException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "ReplicaAlreadyExistsException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ReplicaAlreadyExistsException.prototype);
    }
}
exports.ReplicaAlreadyExistsException = ReplicaAlreadyExistsException;
class ReplicaNotFoundException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "ReplicaNotFoundException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "ReplicaNotFoundException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ReplicaNotFoundException.prototype);
    }
}
exports.ReplicaNotFoundException = ReplicaNotFoundException;
class IndexNotFoundException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "IndexNotFoundException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "IndexNotFoundException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, IndexNotFoundException.prototype);
    }
}
exports.IndexNotFoundException = IndexNotFoundException;
class ConditionalCheckFailedException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "ConditionalCheckFailedException";
    $fault = "client";
    Item;
    constructor(opts) {
        super({
            name: "ConditionalCheckFailedException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ConditionalCheckFailedException.prototype);
        this.Item = opts.Item;
    }
}
exports.ConditionalCheckFailedException = ConditionalCheckFailedException;
class TransactionCanceledException extends DynamoDBServiceException_1.DynamoDBServiceException {
    name = "TransactionCanceledException";
    $fault = "client";
    Message;
    CancellationReasons;
    constructor(opts) {
        super({
            name: "TransactionCanceledException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, TransactionCanceledException.prototype);
        this.Message = opts.Message;
        this.CancellationReasons = opts.CancellationReasons;
    }
}
exports.TransactionCanceledException = TransactionCanceledException;


/***/ }),

/***/ 20507:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getRuntimeConfig = void 0;
const tslib_1 = __webpack_require__(61860);
const package_json_1 = tslib_1.__importDefault(__webpack_require__(87859));
const account_id_endpoint_1 = __webpack_require__(59950);
const client_1 = __webpack_require__(5152);
const httpAuthSchemes_1 = __webpack_require__(97523);
const credential_provider_node_1 = __webpack_require__(5861);
const middleware_endpoint_discovery_1 = __webpack_require__(3688);
const util_user_agent_node_1 = __webpack_require__(51656);
const config_resolver_1 = __webpack_require__(39316);
const hash_node_1 = __webpack_require__(5092);
const middleware_retry_1 = __webpack_require__(19618);
const node_config_provider_1 = __webpack_require__(55704);
const node_http_handler_1 = __webpack_require__(61279);
const smithy_client_1 = __webpack_require__(61411);
const util_body_length_node_1 = __webpack_require__(13638);
const util_defaults_mode_node_1 = __webpack_require__(15435);
const util_retry_1 = __webpack_require__(15518);
const runtimeConfig_shared_1 = __webpack_require__(840);
const getRuntimeConfig = (config) => {
    (0, smithy_client_1.emitWarningIfUnsupportedVersion)(process.version);
    const defaultsMode = (0, util_defaults_mode_node_1.resolveDefaultsModeConfig)(config);
    const defaultConfigProvider = () => defaultsMode().then(smithy_client_1.loadConfigsForDefaultMode);
    const clientSharedValues = (0, runtimeConfig_shared_1.getRuntimeConfig)(config);
    (0, client_1.emitWarningIfUnsupportedVersion)(process.version);
    const loaderConfig = {
        profile: config?.profile,
        logger: clientSharedValues.logger,
    };
    return {
        ...clientSharedValues,
        ...config,
        runtime: "node",
        defaultsMode,
        accountIdEndpointMode: config?.accountIdEndpointMode ?? (0, node_config_provider_1.loadConfig)(account_id_endpoint_1.NODE_ACCOUNT_ID_ENDPOINT_MODE_CONFIG_OPTIONS, loaderConfig),
        authSchemePreference: config?.authSchemePreference ?? (0, node_config_provider_1.loadConfig)(httpAuthSchemes_1.NODE_AUTH_SCHEME_PREFERENCE_OPTIONS, loaderConfig),
        bodyLengthChecker: config?.bodyLengthChecker ?? util_body_length_node_1.calculateBodyLength,
        credentialDefaultProvider: config?.credentialDefaultProvider ?? credential_provider_node_1.defaultProvider,
        defaultUserAgentProvider: config?.defaultUserAgentProvider ?? (0, util_user_agent_node_1.createDefaultUserAgentProvider)({ serviceId: clientSharedValues.serviceId, clientVersion: package_json_1.default.version }),
        endpointDiscoveryEnabledProvider: config?.endpointDiscoveryEnabledProvider ?? (0, node_config_provider_1.loadConfig)(middleware_endpoint_discovery_1.NODE_ENDPOINT_DISCOVERY_CONFIG_OPTIONS, loaderConfig),
        maxAttempts: config?.maxAttempts ?? (0, node_config_provider_1.loadConfig)(middleware_retry_1.NODE_MAX_ATTEMPT_CONFIG_OPTIONS, config),
        region: config?.region ?? (0, node_config_provider_1.loadConfig)(config_resolver_1.NODE_REGION_CONFIG_OPTIONS, { ...config_resolver_1.NODE_REGION_CONFIG_FILE_OPTIONS, ...loaderConfig }),
        requestHandler: node_http_handler_1.NodeHttpHandler.create(config?.requestHandler ?? defaultConfigProvider),
        retryMode: config?.retryMode ??
            (0, node_config_provider_1.loadConfig)({
                ...middleware_retry_1.NODE_RETRY_MODE_CONFIG_OPTIONS,
                default: async () => (await defaultConfigProvider()).retryMode || util_retry_1.DEFAULT_RETRY_MODE,
            }, config),
        sha256: config?.sha256 ?? hash_node_1.Hash.bind(null, "sha256"),
        streamCollector: config?.streamCollector ?? node_http_handler_1.streamCollector,
        useDualstackEndpoint: config?.useDualstackEndpoint ?? (0, node_config_provider_1.loadConfig)(config_resolver_1.NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS, loaderConfig),
        useFipsEndpoint: config?.useFipsEndpoint ?? (0, node_config_provider_1.loadConfig)(config_resolver_1.NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS, loaderConfig),
        userAgentAppId: config?.userAgentAppId ?? (0, node_config_provider_1.loadConfig)(util_user_agent_node_1.NODE_APP_ID_CONFIG_OPTIONS, loaderConfig),
    };
};
exports.getRuntimeConfig = getRuntimeConfig;


/***/ }),

/***/ 840:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getRuntimeConfig = void 0;
const httpAuthSchemes_1 = __webpack_require__(97523);
const protocols_1 = __webpack_require__(37288);
const dynamodb_codec_1 = __webpack_require__(2808);
const smithy_client_1 = __webpack_require__(61411);
const url_parser_1 = __webpack_require__(14494);
const util_base64_1 = __webpack_require__(68385);
const util_retry_1 = __webpack_require__(15518);
const util_utf8_1 = __webpack_require__(71577);
const httpAuthSchemeProvider_1 = __webpack_require__(43434);
const endpointResolver_1 = __webpack_require__(1588);
const schemas_0_1 = __webpack_require__(93801);
const getRuntimeConfig = (config) => {
    return {
        apiVersion: "2012-08-10",
        base64Decoder: config?.base64Decoder ?? util_base64_1.fromBase64,
        base64Encoder: config?.base64Encoder ?? util_base64_1.toBase64,
        disableHostPrefix: config?.disableHostPrefix ?? false,
        endpointProvider: config?.endpointProvider ?? endpointResolver_1.defaultEndpointResolver,
        extensions: config?.extensions ?? [],
        httpAuthSchemeProvider: config?.httpAuthSchemeProvider ?? httpAuthSchemeProvider_1.defaultDynamoDBHttpAuthSchemeProvider,
        httpAuthSchemes: config?.httpAuthSchemes ?? [
            {
                schemeId: "aws.auth#sigv4",
                identityProvider: (ipc) => ipc.getIdentityProvider("aws.auth#sigv4"),
                signer: new httpAuthSchemes_1.AwsSdkSigV4Signer(),
            },
        ],
        logger: config?.logger ?? new smithy_client_1.NoOpLogger(),
        protocol: config?.protocol ?? protocols_1.AwsJson1_0Protocol,
        protocolSettings: config?.protocolSettings ?? {
            defaultNamespace: "com.amazonaws.dynamodb",
            errorTypeRegistries: schemas_0_1.errorTypeRegistries,
            xmlNamespace: "http://dynamodb.amazonaws.com/doc/2012-08-10/",
            version: "2012-08-10",
            serviceTarget: "DynamoDB_20120810",
            jsonCodec: new dynamodb_codec_1.DynamoDBJsonCodec(),
        },
        retryStrategy: config?.retryStrategy ?? (config?.maxAttempts == null && config?.retryMode == null && util_retry_1.Retry.v2026
            ? new util_retry_1.StandardRetryStrategy({
                maxAttempts: 4,
                baseDelay: 25,
            })
            : undefined),
        serviceId: config?.serviceId ?? "DynamoDB",
        urlParser: config?.urlParser ?? url_parser_1.parseUrl,
        utf8Decoder: config?.utf8Decoder ?? util_utf8_1.fromUtf8,
        utf8Encoder: config?.utf8Encoder ?? util_utf8_1.toUtf8,
    };
};
exports.getRuntimeConfig = getRuntimeConfig;


/***/ }),

/***/ 93801:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BatchExecuteStatementInput$ = exports.BackupSummary$ = exports.BackupDetails$ = exports.BackupDescription$ = exports.AutoScalingTargetTrackingScalingPolicyConfigurationUpdate$ = exports.AutoScalingTargetTrackingScalingPolicyConfigurationDescription$ = exports.AutoScalingSettingsUpdate$ = exports.AutoScalingSettingsDescription$ = exports.AutoScalingPolicyUpdate$ = exports.AutoScalingPolicyDescription$ = exports.AttributeValueUpdate$ = exports.AttributeDefinition$ = exports.ArchivalSummary$ = exports.errorTypeRegistries = exports.TransactionInProgressException$ = exports.TransactionConflictException$ = exports.TransactionCanceledException$ = exports.ThrottlingException$ = exports.TableNotFoundException$ = exports.TableInUseException$ = exports.TableAlreadyExistsException$ = exports.ResourceNotFoundException$ = exports.ResourceInUseException$ = exports.RequestLimitExceeded$ = exports.ReplicatedWriteConflictException$ = exports.ReplicaNotFoundException$ = exports.ReplicaAlreadyExistsException$ = exports.ProvisionedThroughputExceededException$ = exports.PolicyNotFoundException$ = exports.PointInTimeRecoveryUnavailableException$ = exports.LimitExceededException$ = exports.ItemCollectionSizeLimitExceededException$ = exports.InvalidRestoreTimeException$ = exports.InvalidExportTimeException$ = exports.InvalidEndpointException$ = exports.InternalServerError$ = exports.IndexNotFoundException$ = exports.ImportNotFoundException$ = exports.ImportConflictException$ = exports.IdempotentParameterMismatchException$ = exports.GlobalTableNotFoundException$ = exports.GlobalTableAlreadyExistsException$ = exports.ExportNotFoundException$ = exports.ExportConflictException$ = exports.DuplicateItemException$ = exports.ContinuousBackupsUnavailableException$ = exports.ConditionalCheckFailedException$ = exports.BackupNotFoundException$ = exports.BackupInUseException$ = exports.DynamoDBServiceException$ = void 0;
exports.DescribeExportInput$ = exports.DescribeEndpointsResponse$ = exports.DescribeEndpointsRequest$ = exports.DescribeContributorInsightsOutput$ = exports.DescribeContributorInsightsInput$ = exports.DescribeContinuousBackupsOutput$ = exports.DescribeContinuousBackupsInput$ = exports.DescribeBackupOutput$ = exports.DescribeBackupInput$ = exports.DeleteTableOutput$ = exports.DeleteTableInput$ = exports.DeleteResourcePolicyOutput$ = exports.DeleteResourcePolicyInput$ = exports.DeleteRequest$ = exports.DeleteReplicationGroupMemberAction$ = exports.DeleteReplicaAction$ = exports.DeleteItemOutput$ = exports.DeleteItemInput$ = exports.DeleteGlobalTableWitnessGroupMemberAction$ = exports.DeleteGlobalSecondaryIndexAction$ = exports.DeleteBackupOutput$ = exports.DeleteBackupInput$ = exports.Delete$ = exports.CsvOptions$ = exports.CreateTableOutput$ = exports.CreateTableInput$ = exports.CreateReplicationGroupMemberAction$ = exports.CreateReplicaAction$ = exports.CreateGlobalTableWitnessGroupMemberAction$ = exports.CreateGlobalTableOutput$ = exports.CreateGlobalTableInput$ = exports.CreateGlobalSecondaryIndexAction$ = exports.CreateBackupOutput$ = exports.CreateBackupInput$ = exports.ContributorInsightsSummary$ = exports.ContinuousBackupsDescription$ = exports.ConsumedCapacity$ = exports.ConditionCheck$ = exports.Condition$ = exports.Capacity$ = exports.CancellationReason$ = exports.BillingModeSummary$ = exports.BatchWriteItemOutput$ = exports.BatchWriteItemInput$ = exports.BatchStatementResponse$ = exports.BatchStatementRequest$ = exports.BatchStatementError$ = exports.BatchGetItemOutput$ = exports.BatchGetItemInput$ = exports.BatchExecuteStatementOutput$ = void 0;
exports.IncrementalExportSpecification$ = exports.ImportTableOutput$ = exports.ImportTableInput$ = exports.ImportTableDescription$ = exports.ImportSummary$ = exports.GlobalTableWitnessGroupUpdate$ = exports.GlobalTableWitnessDescription$ = exports.GlobalTableGlobalSecondaryIndexSettingsUpdate$ = exports.GlobalTableDescription$ = exports.GlobalTable$ = exports.GlobalSecondaryIndexWarmThroughputDescription$ = exports.GlobalSecondaryIndexUpdate$ = exports.GlobalSecondaryIndexInfo$ = exports.GlobalSecondaryIndexDescription$ = exports.GlobalSecondaryIndexAutoScalingUpdate$ = exports.GlobalSecondaryIndex$ = exports.GetResourcePolicyOutput$ = exports.GetResourcePolicyInput$ = exports.GetItemOutput$ = exports.GetItemInput$ = exports.Get$ = exports.FailureException$ = exports.ExportTableToPointInTimeOutput$ = exports.ExportTableToPointInTimeInput$ = exports.ExportSummary$ = exports.ExportDescription$ = exports.ExpectedAttributeValue$ = exports.ExecuteTransactionOutput$ = exports.ExecuteTransactionInput$ = exports.ExecuteStatementOutput$ = exports.ExecuteStatementInput$ = exports.Endpoint$ = exports.EnableKinesisStreamingConfiguration$ = exports.DescribeTimeToLiveOutput$ = exports.DescribeTimeToLiveInput$ = exports.DescribeTableReplicaAutoScalingOutput$ = exports.DescribeTableReplicaAutoScalingInput$ = exports.DescribeTableOutput$ = exports.DescribeTableInput$ = exports.DescribeLimitsOutput$ = exports.DescribeLimitsInput$ = exports.DescribeKinesisStreamingDestinationOutput$ = exports.DescribeKinesisStreamingDestinationInput$ = exports.DescribeImportOutput$ = exports.DescribeImportInput$ = exports.DescribeGlobalTableSettingsOutput$ = exports.DescribeGlobalTableSettingsInput$ = exports.DescribeGlobalTableOutput$ = exports.DescribeGlobalTableInput$ = exports.DescribeExportOutput$ = void 0;
exports.ReplicaGlobalSecondaryIndexDescription$ = exports.ReplicaGlobalSecondaryIndexAutoScalingUpdate$ = exports.ReplicaGlobalSecondaryIndexAutoScalingDescription$ = exports.ReplicaGlobalSecondaryIndex$ = exports.ReplicaDescription$ = exports.ReplicaAutoScalingUpdate$ = exports.ReplicaAutoScalingDescription$ = exports.Replica$ = exports.QueryOutput$ = exports.QueryInput$ = exports.PutResourcePolicyOutput$ = exports.PutResourcePolicyInput$ = exports.PutRequest$ = exports.PutItemOutput$ = exports.PutItemInput$ = exports.Put$ = exports.ProvisionedThroughputOverride$ = exports.ProvisionedThroughputDescription$ = exports.ProvisionedThroughput$ = exports.Projection$ = exports.PointInTimeRecoverySpecification$ = exports.PointInTimeRecoveryDescription$ = exports.ParameterizedStatement$ = exports.OnDemandThroughputOverride$ = exports.OnDemandThroughput$ = exports.LocalSecondaryIndexInfo$ = exports.LocalSecondaryIndexDescription$ = exports.LocalSecondaryIndex$ = exports.ListTagsOfResourceOutput$ = exports.ListTagsOfResourceInput$ = exports.ListTablesOutput$ = exports.ListTablesInput$ = exports.ListImportsOutput$ = exports.ListImportsInput$ = exports.ListGlobalTablesOutput$ = exports.ListGlobalTablesInput$ = exports.ListExportsOutput$ = exports.ListExportsInput$ = exports.ListContributorInsightsOutput$ = exports.ListContributorInsightsInput$ = exports.ListBackupsOutput$ = exports.ListBackupsInput$ = exports.KinesisStreamingDestinationOutput$ = exports.KinesisStreamingDestinationInput$ = exports.KinesisDataStreamDestination$ = exports.KeySchemaElement$ = exports.KeysAndAttributes$ = exports.ItemResponse$ = exports.ItemCollectionMetrics$ = exports.InputFormatOptions$ = void 0;
exports.UpdateKinesisStreamingDestinationInput$ = exports.UpdateKinesisStreamingConfiguration$ = exports.UpdateItemOutput$ = exports.UpdateItemInput$ = exports.UpdateGlobalTableSettingsOutput$ = exports.UpdateGlobalTableSettingsInput$ = exports.UpdateGlobalTableOutput$ = exports.UpdateGlobalTableInput$ = exports.UpdateGlobalSecondaryIndexAction$ = exports.UpdateContributorInsightsOutput$ = exports.UpdateContributorInsightsInput$ = exports.UpdateContinuousBackupsOutput$ = exports.UpdateContinuousBackupsInput$ = exports.Update$ = exports.UntagResourceInput$ = exports.TransactWriteItemsOutput$ = exports.TransactWriteItemsInput$ = exports.TransactWriteItem$ = exports.TransactGetItemsOutput$ = exports.TransactGetItemsInput$ = exports.TransactGetItem$ = exports.TimeToLiveSpecification$ = exports.TimeToLiveDescription$ = exports.ThrottlingReason$ = exports.TagResourceInput$ = exports.Tag$ = exports.TableWarmThroughputDescription$ = exports.TableDescription$ = exports.TableCreationParameters$ = exports.TableClassSummary$ = exports.TableAutoScalingDescription$ = exports.StreamSpecification$ = exports.SSESpecification$ = exports.SSEDescription$ = exports.SourceTableFeatureDetails$ = exports.SourceTableDetails$ = exports.ScanOutput$ = exports.ScanInput$ = exports.S3BucketSource$ = exports.RestoreTableToPointInTimeOutput$ = exports.RestoreTableToPointInTimeInput$ = exports.RestoreTableFromBackupOutput$ = exports.RestoreTableFromBackupInput$ = exports.RestoreSummary$ = exports.ReplicaUpdate$ = exports.ReplicationGroupUpdate$ = exports.ReplicaSettingsUpdate$ = exports.ReplicaSettingsDescription$ = exports.ReplicaGlobalSecondaryIndexSettingsUpdate$ = exports.ReplicaGlobalSecondaryIndexSettingsDescription$ = void 0;
exports.PutItem$ = exports.ListTagsOfResource$ = exports.ListTables$ = exports.ListImports$ = exports.ListGlobalTables$ = exports.ListExports$ = exports.ListContributorInsights$ = exports.ListBackups$ = exports.ImportTable$ = exports.GetResourcePolicy$ = exports.GetItem$ = exports.ExportTableToPointInTime$ = exports.ExecuteTransaction$ = exports.ExecuteStatement$ = exports.EnableKinesisStreamingDestination$ = exports.DisableKinesisStreamingDestination$ = exports.DescribeTimeToLive$ = exports.DescribeTableReplicaAutoScaling$ = exports.DescribeTable$ = exports.DescribeLimits$ = exports.DescribeKinesisStreamingDestination$ = exports.DescribeImport$ = exports.DescribeGlobalTableSettings$ = exports.DescribeGlobalTable$ = exports.DescribeExport$ = exports.DescribeEndpoints$ = exports.DescribeContributorInsights$ = exports.DescribeContinuousBackups$ = exports.DescribeBackup$ = exports.DeleteTable$ = exports.DeleteResourcePolicy$ = exports.DeleteItem$ = exports.DeleteBackup$ = exports.CreateTable$ = exports.CreateGlobalTable$ = exports.CreateBackup$ = exports.BatchWriteItem$ = exports.BatchGetItem$ = exports.BatchExecuteStatement$ = exports.AttributeValue$ = exports.WriteRequest$ = exports.WarmThroughput$ = exports.UpdateTimeToLiveOutput$ = exports.UpdateTimeToLiveInput$ = exports.UpdateTableReplicaAutoScalingOutput$ = exports.UpdateTableReplicaAutoScalingInput$ = exports.UpdateTableOutput$ = exports.UpdateTableInput$ = exports.UpdateReplicationGroupMemberAction$ = exports.UpdateKinesisStreamingDestinationOutput$ = void 0;
exports.UpdateTimeToLive$ = exports.UpdateTableReplicaAutoScaling$ = exports.UpdateTable$ = exports.UpdateKinesisStreamingDestination$ = exports.UpdateItem$ = exports.UpdateGlobalTableSettings$ = exports.UpdateGlobalTable$ = exports.UpdateContributorInsights$ = exports.UpdateContinuousBackups$ = exports.UntagResource$ = exports.TransactWriteItems$ = exports.TransactGetItems$ = exports.TagResource$ = exports.Scan$ = exports.RestoreTableToPointInTime$ = exports.RestoreTableFromBackup$ = exports.Query$ = exports.PutResourcePolicy$ = void 0;
const _A = "Action";
const _ABA = "ArchivalBackupArn";
const _ACDTP = "ApproximateCreationDateTimePrecision";
const _AD = "AttributeDefinition";
const _ADT = "ArchivalDateTime";
const _ADt = "AttributeDefinitions";
const _AM = "AttributeMap";
const _AMRCU = "AccountMaxReadCapacityUnits";
const _AMWCU = "AccountMaxWriteCapacityUnits";
const _AN = "AttributeName";
const _AR = "ArchivalReason";
const _AS = "ArchivalSummary";
const _ASD = "AutoScalingDisabled";
const _ASPD = "AutoScalingPolicyDescription";
const _ASPDL = "AutoScalingPolicyDescriptionList";
const _ASPU = "AutoScalingPolicyUpdate";
const _ASRA = "AutoScalingRoleArn";
const _ASSD = "AutoScalingSettingsDescription";
const _ASSU = "AutoScalingSettingsUpdate";
const _ASTTSPCD = "AutoScalingTargetTrackingScalingPolicyConfigurationDescription";
const _ASTTSPCU = "AutoScalingTargetTrackingScalingPolicyConfigurationUpdate";
const _AT = "AttributeType";
const _ATG = "AttributesToGet";
const _AU = "AttributeUpdates";
const _AV = "AttributeValue";
const _AVL = "AttributeValueList";
const _AVU = "AttributeValueUpdate";
const _Ad = "Address";
const _At = "Attributes";
const _B = "Backfilling";
const _BA = "BackupArn";
const _BCDT = "BackupCreationDateTime";
const _BD = "BackupDescription";
const _BDa = "BackupDetails";
const _BEDT = "BackupExpiryDateTime";
const _BES = "BatchExecuteStatement";
const _BESI = "BatchExecuteStatementInput";
const _BESO = "BatchExecuteStatementOutput";
const _BGI = "BatchGetItem";
const _BGII = "BatchGetItemInput";
const _BGIO = "BatchGetItemOutput";
const _BGRM = "BatchGetResponseMap";
const _BGRMa = "BatchGetRequestMap";
const _BIUE = "BackupInUseException";
const _BM = "BillingMode";
const _BMO = "BillingModeOverride";
const _BMS = "BillingModeSummary";
const _BN = "BackupName";
const _BNFE = "BackupNotFoundException";
const _BOOL = "BOOL";
const _BS = "BackupStatus";
const _BSB = "BackupSizeBytes";
const _BSBi = "BilledSizeBytes";
const _BSE = "BatchStatementError";
const _BSR = "BatchStatementRequest";
const _BSRa = "BatchStatementResponse";
const _BS_ = "BS";
const _BSa = "BackupSummary";
const _BSac = "BackupSummaries";
const _BT = "BackupType";
const _BWI = "BatchWriteItem";
const _BWII = "BatchWriteItemInput";
const _BWIO = "BatchWriteItemOutput";
const _BWIRM = "BatchWriteItemRequestMap";
const _B_ = "B";
const _C = "Code";
const _CB = "CreateBackup";
const _CBD = "ContinuousBackupsDescription";
const _CBI = "CreateBackupInput";
const _CBO = "CreateBackupOutput";
const _CBS = "ContinuousBackupsStatus";
const _CBUE = "ContinuousBackupsUnavailableException";
const _CC = "ConsumedCapacity";
const _CCFE = "ConditionalCheckFailedException";
const _CCM = "ConsumedCapacityMultiple";
const _CCo = "ConditionCheck";
const _CDT = "CreationDateTime";
const _CE = "ConditionExpression";
const _CGSIA = "CreateGlobalSecondaryIndexAction";
const _CGT = "CreateGlobalTable";
const _CGTI = "CreateGlobalTableInput";
const _CGTO = "CreateGlobalTableOutput";
const _CGTWGMA = "CreateGlobalTableWitnessGroupMemberAction";
const _CIA = "ContributorInsightsAction";
const _CIM = "ContributorInsightsMode";
const _CIRL = "ContributorInsightsRuleList";
const _CIS = "ContributorInsightsSummary";
const _CISo = "ContributorInsightsStatus";
const _CISon = "ContributorInsightsSummaries";
const _CO = "ComparisonOperator";
const _COo = "ConditionalOperator";
const _COs = "CsvOptions";
const _CPIM = "CachePeriodInMinutes";
const _CR = "CancellationReasons";
const _CRA = "CreateReplicaAction";
const _CRGMA = "CreateReplicationGroupMemberAction";
const _CRL = "CancellationReasonList";
const _CRSRA = "ConfirmRemoveSelfResourceAccess";
const _CRT = "ClientRequestToken";
const _CRa = "CancellationReason";
const _CRo = "ConsistentRead";
const _CT = "ClientToken";
const _CTI = "CreateTableInput";
const _CTO = "CreateTableOutput";
const _CTr = "CreateTable";
const _CU = "CapacityUnits";
const _CWLGA = "CloudWatchLogGroupArn";
const _Ca = "Capacity";
const _Co = "Condition";
const _Cou = "Count";
const _Cr = "Create";
const _Cs = "Csv";
const _D = "Delimiter";
const _DB = "DeleteBackup";
const _DBI = "DeleteBackupInput";
const _DBIe = "DescribeBackupInput";
const _DBO = "DeleteBackupOutput";
const _DBOe = "DescribeBackupOutput";
const _DBe = "DescribeBackup";
const _DCB = "DescribeContinuousBackups";
const _DCBI = "DescribeContinuousBackupsInput";
const _DCBO = "DescribeContinuousBackupsOutput";
const _DCI = "DescribeContributorInsights";
const _DCII = "DescribeContributorInsightsInput";
const _DCIO = "DescribeContributorInsightsOutput";
const _DE = "DescribeEndpoints";
const _DEI = "DescribeExportInput";
const _DEO = "DescribeExportOutput";
const _DER = "DescribeEndpointsRequest";
const _DERe = "DescribeEndpointsResponse";
const _DEe = "DescribeExport";
const _DGSIA = "DeleteGlobalSecondaryIndexAction";
const _DGT = "DescribeGlobalTable";
const _DGTI = "DescribeGlobalTableInput";
const _DGTO = "DescribeGlobalTableOutput";
const _DGTS = "DescribeGlobalTableSettings";
const _DGTSI = "DescribeGlobalTableSettingsInput";
const _DGTSO = "DescribeGlobalTableSettingsOutput";
const _DGTWGMA = "DeleteGlobalTableWitnessGroupMemberAction";
const _DI = "DeleteItem";
const _DIE = "DuplicateItemException";
const _DII = "DeleteItemInput";
const _DIIe = "DescribeImportInput";
const _DIO = "DeleteItemOutput";
const _DIOe = "DescribeImportOutput";
const _DIe = "DescribeImport";
const _DKSD = "DescribeKinesisStreamingDestination";
const _DKSDI = "DescribeKinesisStreamingDestinationInput";
const _DKSDO = "DescribeKinesisStreamingDestinationOutput";
const _DKSDi = "DisableKinesisStreamingDestination";
const _DL = "DescribeLimits";
const _DLI = "DescribeLimitsInput";
const _DLO = "DescribeLimitsOutput";
const _DPE = "DeletionProtectionEnabled";
const _DR = "DeleteRequest";
const _DRA = "DeleteReplicaAction";
const _DRGMA = "DeleteReplicationGroupMemberAction";
const _DRP = "DeleteResourcePolicy";
const _DRPI = "DeleteResourcePolicyInput";
const _DRPO = "DeleteResourcePolicyOutput";
const _DS = "DestinationStatus";
const _DSD = "DestinationStatusDescription";
const _DSI = "DisableScaleIn";
const _DT = "DeleteTable";
const _DTI = "DeleteTableInput";
const _DTIe = "DescribeTableInput";
const _DTO = "DeleteTableOutput";
const _DTOe = "DescribeTableOutput";
const _DTRAS = "DescribeTableReplicaAutoScaling";
const _DTRASI = "DescribeTableReplicaAutoScalingInput";
const _DTRASO = "DescribeTableReplicaAutoScalingOutput";
const _DTTL = "DescribeTimeToLive";
const _DTTLI = "DescribeTimeToLiveInput";
const _DTTLO = "DescribeTimeToLiveOutput";
const _DTe = "DescribeTable";
const _De = "Delete";
const _E = "Error";
const _EA = "ExportArn";
const _EAM = "ExpectedAttributeMap";
const _EAN = "ExpressionAttributeNames";
const _EAV = "ExpressionAttributeValues";
const _EAVM = "ExpressionAttributeValueMap";
const _EAVx = "ExpectedAttributeValue";
const _EC = "ErrorCount";
const _ECE = "ExportConflictException";
const _ED = "ExportDescription";
const _EDx = "ExceptionDescription";
const _EF = "ExportFormat";
const _EFT = "ExportFromTime";
const _EKSC = "EnableKinesisStreamingConfiguration";
const _EKSD = "EnableKinesisStreamingDestination";
const _EM = "ExportManifest";
const _EN = "ExceptionName";
const _ENFE = "ExportNotFoundException";
const _ERDT = "EarliestRestorableDateTime";
const _ERI = "ExpectedRevisionId";
const _ES = "ExportStatus";
const _ESBA = "ExclusiveStartBackupArn";
const _ESGTN = "ExclusiveStartGlobalTableName";
const _ESI = "ExecuteStatementInput";
const _ESK = "ExclusiveStartKey";
const _ESO = "ExecuteStatementOutput";
const _ESTN = "ExclusiveStartTableName";
const _ESx = "ExportSummary";
const _ESxe = "ExecuteStatement";
const _ESxp = "ExportSummaries";
const _ET = "EndTime";
const _ETI = "ExecuteTransactionInput";
const _ETO = "ExecuteTransactionOutput";
const _ETT = "ExportToTime";
const _ETTPIT = "ExportTableToPointInTime";
const _ETTPITI = "ExportTableToPointInTimeInput";
const _ETTPITO = "ExportTableToPointInTimeOutput";
const _ETx = "ExportTime";
const _ETxe = "ExecuteTransaction";
const _ETxp = "ExportType";
const _EVT = "ExportViewType";
const _En = "Endpoints";
const _Ena = "Enabled";
const _End = "Endpoint";
const _Ex = "Expected";
const _Exi = "Exists";
const _FC = "FailureCode";
const _FCM = "FilterConditionMap";
const _FE = "FailureException";
const _FEi = "FilterExpression";
const _FM = "FailureMessage";
const _G = "Get";
const _GI = "GetItem";
const _GII = "GetItemInput";
const _GIO = "GetItemOutput";
const _GRP = "GetResourcePolicy";
const _GRPI = "GetResourcePolicyInput";
const _GRPO = "GetResourcePolicyOutput";
const _GSI = "GlobalSecondaryIndexes";
const _GSIASU = "GlobalSecondaryIndexAutoScalingUpdate";
const _GSIASUL = "GlobalSecondaryIndexAutoScalingUpdateList";
const _GSID = "GlobalSecondaryIndexDescription";
const _GSIDL = "GlobalSecondaryIndexDescriptionList";
const _GSII = "GlobalSecondaryIndexInfo";
const _GSIL = "GlobalSecondaryIndexList";
const _GSIO = "GlobalSecondaryIndexOverride";
const _GSIU = "GlobalSecondaryIndexUpdate";
const _GSIUL = "GlobalSecondaryIndexUpdateList";
const _GSIUl = "GlobalSecondaryIndexUpdates";
const _GSIWTD = "GlobalSecondaryIndexWarmThroughputDescription";
const _GSIl = "GlobalSecondaryIndex";
const _GT = "GlobalTable";
const _GTA = "GlobalTableArn";
const _GTAEE = "GlobalTableAlreadyExistsException";
const _GTBM = "GlobalTableBillingMode";
const _GTD = "GlobalTableDescription";
const _GTGSISU = "GlobalTableGlobalSecondaryIndexSettingsUpdate";
const _GTGSISUL = "GlobalTableGlobalSecondaryIndexSettingsUpdateList";
const _GTL = "GlobalTableList";
const _GTN = "GlobalTableName";
const _GTNFE = "GlobalTableNotFoundException";
const _GTPWCASSU = "GlobalTableProvisionedWriteCapacityAutoScalingSettingsUpdate";
const _GTPWCU = "GlobalTableProvisionedWriteCapacityUnits";
const _GTS = "GlobalTableStatus";
const _GTSA = "GlobalTableSourceArn";
const _GTSRM = "GlobalTableSettingsReplicationMode";
const _GTV = "GlobalTableVersion";
const _GTW = "GlobalTableWitnesses";
const _GTWD = "GlobalTableWitnessDescription";
const _GTWDL = "GlobalTableWitnessDescriptionList";
const _GTWGU = "GlobalTableWitnessGroupUpdate";
const _GTWGUL = "GlobalTableWitnessGroupUpdateList";
const _GTWU = "GlobalTableWitnessUpdates";
const _GTl = "GlobalTables";
const _HL = "HeaderList";
const _I = "Item";
const _IA = "ImportArn";
const _IAn = "IndexArn";
const _IC = "ItemCount";
const _ICE = "ImportConflictException";
const _ICK = "ItemCollectionKey";
const _ICKAM = "ItemCollectionKeyAttributeMap";
const _ICM = "ItemCollectionMetrics";
const _ICMM = "ItemCollectionMetricsMultiple";
const _ICMPT = "ItemCollectionMetricsPerTable";
const _ICSLEE = "ItemCollectionSizeLimitExceededException";
const _ICT = "InputCompressionType";
const _IEDT = "InaccessibleEncryptionDateTime";
const _IEE = "InvalidEndpointException";
const _IES = "IncrementalExportSpecification";
const _IETE = "InvalidExportTimeException";
const _IF = "InputFormat";
const _IFO = "InputFormatOptions";
const _IIC = "ImportedItemCount";
const _IL = "ItemList";
const _IN = "IndexName";
const _INFE = "ImportNotFoundException";
const _INFEn = "IndexNotFoundException";
const _IPME = "IdempotentParameterMismatchException";
const _IR = "ItemResponse";
const _IRL = "ItemResponseList";
const _IRTE = "InvalidRestoreTimeException";
const _IS = "IndexStatus";
const _ISB = "IndexSizeBytes";
const _ISE = "InternalServerError";
const _ISL = "ImportSummaryList";
const _ISm = "ImportSummary";
const _ISmp = "ImportStatus";
const _IT = "ImportTable";
const _ITD = "ImportTableDescription";
const _ITI = "ImportTableInput";
const _ITO = "ImportTableOutput";
const _It = "Items";
const _K = "Key";
const _KAA = "KeysAndAttributes";
const _KC = "KeyConditions";
const _KCE = "KeyConditionExpression";
const _KDSD = "KinesisDataStreamDestinations";
const _KDSDi = "KinesisDataStreamDestination";
const _KL = "KeyList";
const _KMSMKA = "KMSMasterKeyArn";
const _KMSMKI = "KMSMasterKeyId";
const _KS = "KeySchema";
const _KSDI = "KinesisStreamingDestinationInput";
const _KSDO = "KinesisStreamingDestinationOutput";
const _KSE = "KeySchemaElement";
const _KT = "KeyType";
const _Ke = "Keys";
const _L = "Limit";
const _LAV = "ListAttributeValue";
const _LB = "ListBackups";
const _LBI = "ListBackupsInput";
const _LBO = "ListBackupsOutput";
const _LCI = "ListContributorInsights";
const _LCII = "ListContributorInsightsInput";
const _LCIO = "ListContributorInsightsOutput";
const _LDDT = "LastDecreaseDateTime";
const _LE = "ListExports";
const _LEBA = "LastEvaluatedBackupArn";
const _LEE = "LimitExceededException";
const _LEGTN = "LastEvaluatedGlobalTableName";
const _LEI = "ListExportsInput";
const _LEK = "LastEvaluatedKey";
const _LEO = "ListExportsOutput";
const _LETN = "LastEvaluatedTableName";
const _LGT = "ListGlobalTables";
const _LGTI = "ListGlobalTablesInput";
const _LGTO = "ListGlobalTablesOutput";
const _LI = "ListImports";
const _LIDT = "LastIncreaseDateTime";
const _LII = "ListImportsInput";
const _LIO = "ListImportsOutput";
const _LRDT = "LatestRestorableDateTime";
const _LSA = "LatestStreamArn";
const _LSI = "LocalSecondaryIndexes";
const _LSID = "LocalSecondaryIndexDescription";
const _LSIDL = "LocalSecondaryIndexDescriptionList";
const _LSII = "LocalSecondaryIndexInfo";
const _LSIL = "LocalSecondaryIndexList";
const _LSIO = "LocalSecondaryIndexOverride";
const _LSIo = "LocalSecondaryIndex";
const _LSL = "LatestStreamLabel";
const _LT = "ListTables";
const _LTI = "ListTablesInput";
const _LTO = "ListTablesOutput";
const _LTOR = "ListTagsOfResource";
const _LTORI = "ListTagsOfResourceInput";
const _LTORO = "ListTagsOfResourceOutput";
const _LUDT = "LastUpdateDateTime";
const _LUTPPRDT = "LastUpdateToPayPerRequestDateTime";
const _L_ = "L";
const _M = "Message";
const _MAV = "MapAttributeValue";
const _MR = "MaxResults";
const _MRC = "MultiRegionConsistency";
const _MRRU = "MaxReadRequestUnits";
const _MU = "MinimumUnits";
const _MUa = "MaximumUnits";
const _MWRU = "MaxWriteRequestUnits";
const _M_ = "M";
const _N = "N";
const _NKA = "NonKeyAttributes";
const _NODT = "NumberOfDecreasesToday";
const _NS = "NS";
const _NT = "NextToken";
const _NULL = "NULL";
const _ODT = "OnDemandThroughput";
const _ODTO = "OnDemandThroughputOverride";
const _P = "Parameters";
const _PE = "ProjectionExpression";
const _PI = "PutItem";
const _PIC = "ProcessedItemCount";
const _PII = "PutItemInput";
const _PIIAM = "PutItemInputAttributeMap";
const _PIO = "PutItemOutput";
const _PITRD = "PointInTimeRecoveryDescription";
const _PITRE = "PointInTimeRecoveryEnabled";
const _PITRS = "PointInTimeRecoveryStatus";
const _PITRSo = "PointInTimeRecoverySpecification";
const _PITRUE = "PointInTimeRecoveryUnavailableException";
const _PN = "PolicyName";
const _PNFE = "PolicyNotFoundException";
const _PQLBR = "PartiQLBatchRequest";
const _PQLBRa = "PartiQLBatchResponse";
const _PR = "PutRequest";
const _PRCASS = "ProvisionedReadCapacityAutoScalingSettings";
const _PRCASSU = "ProvisionedReadCapacityAutoScalingSettingsUpdate";
const _PRCASU = "ProvisionedReadCapacityAutoScalingUpdate";
const _PRCU = "ProvisionedReadCapacityUnits";
const _PRP = "PutResourcePolicy";
const _PRPI = "PutResourcePolicyInput";
const _PRPO = "PutResourcePolicyOutput";
const _PS = "PageSize";
const _PSB = "ProcessedSizeBytes";
const _PSP = "PreparedStatementParameters";
const _PSa = "ParameterizedStatement";
const _PSar = "ParameterizedStatements";
const _PT = "ProvisionedThroughput";
const _PTD = "ProvisionedThroughputDescription";
const _PTEE = "ProvisionedThroughputExceededException";
const _PTO = "ProvisionedThroughputOverride";
const _PTr = "ProjectionType";
const _PWCASS = "ProvisionedWriteCapacityAutoScalingSettings";
const _PWCASSU = "ProvisionedWriteCapacityAutoScalingSettingsUpdate";
const _PWCASU = "ProvisionedWriteCapacityAutoScalingUpdate";
const _PWCU = "ProvisionedWriteCapacityUnits";
const _Po = "Policy";
const _Pr = "Projection";
const _Pu = "Put";
const _Q = "Query";
const _QF = "QueryFilter";
const _QI = "QueryInput";
const _QO = "QueryOutput";
const _R = "Responses";
const _RA = "ResourceArn";
const _RAEE = "ReplicaAlreadyExistsException";
const _RASD = "ReplicaAutoScalingDescription";
const _RASDL = "ReplicaAutoScalingDescriptionList";
const _RASU = "ReplicaAutoScalingUpdate";
const _RASUL = "ReplicaAutoScalingUpdateList";
const _RAe = "ReplicaArn";
const _RBMS = "ReplicaBillingModeSummary";
const _RCC = "ReturnConsumedCapacity";
const _RCU = "ReadCapacityUnits";
const _RD = "ReplicaDescription";
const _RDL = "ReplicaDescriptionList";
const _RDT = "RestoreDateTime";
const _RG = "ReplicationGroup";
const _RGSI = "ReplicaGlobalSecondaryIndex";
const _RGSIASD = "ReplicaGlobalSecondaryIndexAutoScalingDescription";
const _RGSIASDL = "ReplicaGlobalSecondaryIndexAutoScalingDescriptionList";
const _RGSIASU = "ReplicaGlobalSecondaryIndexAutoScalingUpdate";
const _RGSIASUL = "ReplicaGlobalSecondaryIndexAutoScalingUpdateList";
const _RGSID = "ReplicaGlobalSecondaryIndexDescription";
const _RGSIDL = "ReplicaGlobalSecondaryIndexDescriptionList";
const _RGSIL = "ReplicaGlobalSecondaryIndexList";
const _RGSIS = "ReplicaGlobalSecondaryIndexSettings";
const _RGSISD = "ReplicaGlobalSecondaryIndexSettingsDescription";
const _RGSISDL = "ReplicaGlobalSecondaryIndexSettingsDescriptionList";
const _RGSISU = "ReplicaGlobalSecondaryIndexSettingsUpdate";
const _RGSISUL = "ReplicaGlobalSecondaryIndexSettingsUpdateList";
const _RGSIU = "ReplicaGlobalSecondaryIndexUpdates";
const _RGU = "ReplicationGroupUpdate";
const _RGUL = "ReplicationGroupUpdateList";
const _RI = "RequestItems";
const _RICM = "ReturnItemCollectionMetrics";
const _RIDT = "ReplicaInaccessibleDateTime";
const _RIP = "RestoreInProgress";
const _RIUE = "ResourceInUseException";
const _RIe = "RevisionId";
const _RL = "ReplicaList";
const _RLE = "RequestLimitExceeded";
const _RN = "RegionName";
const _RNFE = "ReplicaNotFoundException";
const _RNFEe = "ResourceNotFoundException";
const _RP = "ResourcePolicy";
const _RPID = "RecoveryPeriodInDays";
const _RPRCASS = "ReplicaProvisionedReadCapacityAutoScalingSettings";
const _RPRCASSU = "ReplicaProvisionedReadCapacityAutoScalingSettingsUpdate";
const _RPRCASU = "ReplicaProvisionedReadCapacityAutoScalingUpdate";
const _RPRCU = "ReplicaProvisionedReadCapacityUnits";
const _RPWCASS = "ReplicaProvisionedWriteCapacityAutoScalingSettings";
const _RPWCU = "ReplicaProvisionedWriteCapacityUnits";
const _RS = "ReplicaSettings";
const _RSD = "ReplicaStatusDescription";
const _RSDL = "ReplicaSettingsDescriptionList";
const _RSDe = "ReplicaSettingsDescription";
const _RSPP = "ReplicaStatusPercentProgress";
const _RSU = "ReplicaSettingsUpdate";
const _RSUL = "ReplicaSettingsUpdateList";
const _RSe = "ReplicaStatus";
const _RSes = "RestoreSummary";
const _RTC = "ReplicaTableClass";
const _RTCS = "ReplicaTableClassSummary";
const _RTFB = "RestoreTableFromBackup";
const _RTFBI = "RestoreTableFromBackupInput";
const _RTFBO = "RestoreTableFromBackupOutput";
const _RTTPIT = "RestoreTableToPointInTime";
const _RTTPITI = "RestoreTableToPointInTimeInput";
const _RTTPITO = "RestoreTableToPointInTimeOutput";
const _RU = "ReplicaUpdate";
const _RUL = "ReplicaUpdateList";
const _RUPS = "ReadUnitsPerSecond";
const _RUe = "ReplicaUpdates";
const _RV = "ReturnValues";
const _RVOCCF = "ReturnValuesOnConditionCheckFailure";
const _RWCE = "ReplicatedWriteConflictException";
const _Re = "Replica";
const _Rep = "Replicas";
const _S = "Statements";
const _SA = "StreamArn";
const _SB = "S3Bucket";
const _SBA = "SourceBackupArn";
const _SBO = "S3BucketOwner";
const _SBS = "S3BucketSource";
const _SC = "ScannedCount";
const _SD = "StreamDescription";
const _SE = "StreamEnabled";
const _SERGB = "SizeEstimateRangeGB";
const _SF = "ScanFilter";
const _SI = "ScanInput";
const _SIC = "ScaleInCooldown";
const _SICM = "SecondaryIndexesCapacityMap";
const _SIF = "ScanIndexForward";
const _SKP = "S3KeyPrefix";
const _SO = "ScanOutput";
const _SOC = "ScaleOutCooldown";
const _SP = "ScalingPolicies";
const _SPU = "ScalingPolicyUpdate";
const _SPr = "S3Prefix";
const _SS = "StreamSpecification";
const _SSA = "S3SseAlgorithm";
const _SSED = "SSEDescription";
const _SSES = "SSESpecification";
const _SSESO = "SSESpecificationOverride";
const _SSET = "SSEType";
const _SSKKI = "S3SseKmsKeyId";
const _SS_ = "SS";
const _ST = "StartTime";
const _STA = "SourceTableArn";
const _STD = "SourceTableDetails";
const _STFD = "SourceTableFeatureDetails";
const _STN = "SourceTableName";
const _SVT = "StreamViewType";
const _S_ = "S";
const _Sc = "Scan";
const _Se = "Select";
const _Seg = "Segment";
const _St = "Statement";
const _Sta = "Status";
const _T = "Table";
const _TA = "TableArn";
const _TAEE = "TableAlreadyExistsException";
const _TASD = "TableAutoScalingDescription";
const _TC = "TableClass";
const _TCDT = "TableCreationDateTime";
const _TCE = "TransactionCanceledException";
const _TCEr = "TransactionConflictException";
const _TCO = "TableClassOverride";
const _TCP = "TableCreationParameters";
const _TCS = "TableClassSummary";
const _TD = "TableDescription";
const _TE = "ThrottlingException";
const _TGI = "TransactGetItem";
const _TGII = "TransactGetItemsInput";
const _TGIL = "TransactGetItemList";
const _TGIO = "TransactGetItemsOutput";
const _TGIr = "TransactGetItems";
const _TI = "TableId";
const _TIPE = "TransactionInProgressException";
const _TIUE = "TableInUseException";
const _TIr = "TransactItems";
const _TK = "TagKeys";
const _TL = "TagList";
const _TMRCU = "TableMaxReadCapacityUnits";
const _TMWCU = "TableMaxWriteCapacityUnits";
const _TN = "TableName";
const _TNFE = "TableNotFoundException";
const _TNa = "TableNames";
const _TR = "ThrottlingReasons";
const _TRI = "TagResourceInput";
const _TRL = "ThrottlingReasonList";
const _TRLB = "TimeRangeLowerBound";
const _TRUB = "TimeRangeUpperBound";
const _TRa = "TagResource";
const _TRh = "ThrottlingReason";
const _TS = "TransactStatements";
const _TSB = "TableSizeBytes";
const _TSa = "TableStatus";
const _TSo = "TotalSegments";
const _TTLD = "TimeToLiveDescription";
const _TTLS = "TimeToLiveStatus";
const _TTLSi = "TimeToLiveSpecification";
const _TTN = "TargetTableName";
const _TTSPC = "TargetTrackingScalingPolicyConfiguration";
const _TV = "TargetValue";
const _TWI = "TransactWriteItem";
const _TWII = "TransactWriteItemsInput";
const _TWIL = "TransactWriteItemList";
const _TWIO = "TransactWriteItemsOutput";
const _TWIr = "TransactWriteItems";
const _TWTD = "TableWarmThroughputDescription";
const _Ta = "Tags";
const _Tag = "Tag";
const _U = "Update";
const _UCB = "UpdateContinuousBackups";
const _UCBI = "UpdateContinuousBackupsInput";
const _UCBO = "UpdateContinuousBackupsOutput";
const _UCI = "UpdateContributorInsights";
const _UCII = "UpdateContributorInsightsInput";
const _UCIO = "UpdateContributorInsightsOutput";
const _UE = "UpdateExpression";
const _UGSIA = "UpdateGlobalSecondaryIndexAction";
const _UGT = "UpdateGlobalTable";
const _UGTI = "UpdateGlobalTableInput";
const _UGTO = "UpdateGlobalTableOutput";
const _UGTS = "UpdateGlobalTableSettings";
const _UGTSI = "UpdateGlobalTableSettingsInput";
const _UGTSO = "UpdateGlobalTableSettingsOutput";
const _UI = "UnprocessedItems";
const _UII = "UpdateItemInput";
const _UIO = "UpdateItemOutput";
const _UIp = "UpdateItem";
const _UK = "UnprocessedKeys";
const _UKSC = "UpdateKinesisStreamingConfiguration";
const _UKSD = "UpdateKinesisStreamingDestination";
const _UKSDI = "UpdateKinesisStreamingDestinationInput";
const _UKSDO = "UpdateKinesisStreamingDestinationOutput";
const _ULRT = "UseLatestRestorableTime";
const _UR = "UntagResource";
const _URGMA = "UpdateReplicationGroupMemberAction";
const _URI = "UntagResourceInput";
const _UT = "UpdateTable";
const _UTI = "UpdateTableInput";
const _UTO = "UpdateTableOutput";
const _UTRAS = "UpdateTableReplicaAutoScaling";
const _UTRASI = "UpdateTableReplicaAutoScalingInput";
const _UTRASO = "UpdateTableReplicaAutoScalingOutput";
const _UTTL = "UpdateTimeToLive";
const _UTTLI = "UpdateTimeToLiveInput";
const _UTTLO = "UpdateTimeToLiveOutput";
const _V = "Value";
const _WCU = "WriteCapacityUnits";
const _WR = "WriteRequest";
const _WRr = "WriteRequests";
const _WS = "WitnessStatus";
const _WT = "WarmThroughput";
const _WUPS = "WriteUnitsPerSecond";
const _aQE = "awsQueryError";
const _c = "client";
const _e = "error";
const _hE = "httpError";
const _hH = "httpHeader";
const _m = "message";
const _r = "reason";
const _re = "resource";
const _s = "smithy.ts.sdk.synthetic.com.amazonaws.dynamodb";
const _se = "server";
const _tR = "throttlingReasons";
const _xacrsra = "x-amz-confirm-remove-self-resource-access";
const n0 = "com.amazonaws.dynamodb";
const schema_1 = __webpack_require__(26890);
const DynamoDBServiceException_1 = __webpack_require__(18894);
const errors_1 = __webpack_require__(98461);
const _s_registry = schema_1.TypeRegistry.for(_s);
exports.DynamoDBServiceException$ = [-3, _s, "DynamoDBServiceException", 0, [], []];
_s_registry.registerError(exports.DynamoDBServiceException$, DynamoDBServiceException_1.DynamoDBServiceException);
const n0_registry = schema_1.TypeRegistry.for(n0);
exports.BackupInUseException$ = [-3, n0, _BIUE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.BackupInUseException$, errors_1.BackupInUseException);
exports.BackupNotFoundException$ = [-3, n0, _BNFE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.BackupNotFoundException$, errors_1.BackupNotFoundException);
exports.ConditionalCheckFailedException$ = [-3, n0, _CCFE,
    { [_e]: _c },
    [_m, _I],
    [0, () => AttributeMap]
];
n0_registry.registerError(exports.ConditionalCheckFailedException$, errors_1.ConditionalCheckFailedException);
exports.ContinuousBackupsUnavailableException$ = [-3, n0, _CBUE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.ContinuousBackupsUnavailableException$, errors_1.ContinuousBackupsUnavailableException);
exports.DuplicateItemException$ = [-3, n0, _DIE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.DuplicateItemException$, errors_1.DuplicateItemException);
exports.ExportConflictException$ = [-3, n0, _ECE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.ExportConflictException$, errors_1.ExportConflictException);
exports.ExportNotFoundException$ = [-3, n0, _ENFE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.ExportNotFoundException$, errors_1.ExportNotFoundException);
exports.GlobalTableAlreadyExistsException$ = [-3, n0, _GTAEE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.GlobalTableAlreadyExistsException$, errors_1.GlobalTableAlreadyExistsException);
exports.GlobalTableNotFoundException$ = [-3, n0, _GTNFE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.GlobalTableNotFoundException$, errors_1.GlobalTableNotFoundException);
exports.IdempotentParameterMismatchException$ = [-3, n0, _IPME,
    { [_e]: _c },
    [_M],
    [0]
];
n0_registry.registerError(exports.IdempotentParameterMismatchException$, errors_1.IdempotentParameterMismatchException);
exports.ImportConflictException$ = [-3, n0, _ICE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.ImportConflictException$, errors_1.ImportConflictException);
exports.ImportNotFoundException$ = [-3, n0, _INFE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.ImportNotFoundException$, errors_1.ImportNotFoundException);
exports.IndexNotFoundException$ = [-3, n0, _INFEn,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.IndexNotFoundException$, errors_1.IndexNotFoundException);
exports.InternalServerError$ = [-3, n0, _ISE,
    { [_e]: _se },
    [_m],
    [0]
];
n0_registry.registerError(exports.InternalServerError$, errors_1.InternalServerError);
exports.InvalidEndpointException$ = [-3, n0, _IEE,
    { [_e]: _c, [_hE]: 421 },
    [_M],
    [0]
];
n0_registry.registerError(exports.InvalidEndpointException$, errors_1.InvalidEndpointException);
exports.InvalidExportTimeException$ = [-3, n0, _IETE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.InvalidExportTimeException$, errors_1.InvalidExportTimeException);
exports.InvalidRestoreTimeException$ = [-3, n0, _IRTE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.InvalidRestoreTimeException$, errors_1.InvalidRestoreTimeException);
exports.ItemCollectionSizeLimitExceededException$ = [-3, n0, _ICSLEE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.ItemCollectionSizeLimitExceededException$, errors_1.ItemCollectionSizeLimitExceededException);
exports.LimitExceededException$ = [-3, n0, _LEE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.LimitExceededException$, errors_1.LimitExceededException);
exports.PointInTimeRecoveryUnavailableException$ = [-3, n0, _PITRUE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.PointInTimeRecoveryUnavailableException$, errors_1.PointInTimeRecoveryUnavailableException);
exports.PolicyNotFoundException$ = [-3, n0, _PNFE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.PolicyNotFoundException$, errors_1.PolicyNotFoundException);
exports.ProvisionedThroughputExceededException$ = [-3, n0, _PTEE,
    { [_e]: _c },
    [_m, _TR],
    [0, () => ThrottlingReasonList]
];
n0_registry.registerError(exports.ProvisionedThroughputExceededException$, errors_1.ProvisionedThroughputExceededException);
exports.ReplicaAlreadyExistsException$ = [-3, n0, _RAEE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.ReplicaAlreadyExistsException$, errors_1.ReplicaAlreadyExistsException);
exports.ReplicaNotFoundException$ = [-3, n0, _RNFE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.ReplicaNotFoundException$, errors_1.ReplicaNotFoundException);
exports.ReplicatedWriteConflictException$ = [-3, n0, _RWCE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.ReplicatedWriteConflictException$, errors_1.ReplicatedWriteConflictException);
exports.RequestLimitExceeded$ = [-3, n0, _RLE,
    { [_e]: _c },
    [_m, _TR],
    [0, () => ThrottlingReasonList]
];
n0_registry.registerError(exports.RequestLimitExceeded$, errors_1.RequestLimitExceeded);
exports.ResourceInUseException$ = [-3, n0, _RIUE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.ResourceInUseException$, errors_1.ResourceInUseException);
exports.ResourceNotFoundException$ = [-3, n0, _RNFEe,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.ResourceNotFoundException$, errors_1.ResourceNotFoundException);
exports.TableAlreadyExistsException$ = [-3, n0, _TAEE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.TableAlreadyExistsException$, errors_1.TableAlreadyExistsException);
exports.TableInUseException$ = [-3, n0, _TIUE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.TableInUseException$, errors_1.TableInUseException);
exports.TableNotFoundException$ = [-3, n0, _TNFE,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.TableNotFoundException$, errors_1.TableNotFoundException);
exports.ThrottlingException$ = [-3, n0, _TE,
    { [_aQE]: [`Throttling`, 400], [_e]: _c, [_hE]: 400 },
    [_m, _tR],
    [0, () => ThrottlingReasonList]
];
n0_registry.registerError(exports.ThrottlingException$, errors_1.ThrottlingException);
exports.TransactionCanceledException$ = [-3, n0, _TCE,
    { [_e]: _c },
    [_M, _CR],
    [0, () => CancellationReasonList]
];
n0_registry.registerError(exports.TransactionCanceledException$, errors_1.TransactionCanceledException);
exports.TransactionConflictException$ = [-3, n0, _TCEr,
    { [_e]: _c },
    [_m],
    [0]
];
n0_registry.registerError(exports.TransactionConflictException$, errors_1.TransactionConflictException);
exports.TransactionInProgressException$ = [-3, n0, _TIPE,
    { [_e]: _c },
    [_M],
    [0]
];
n0_registry.registerError(exports.TransactionInProgressException$, errors_1.TransactionInProgressException);
exports.errorTypeRegistries = [
    _s_registry,
    n0_registry,
];
exports.ArchivalSummary$ = [3, n0, _AS,
    0,
    [_ADT, _AR, _ABA],
    [4, 0, 0]
];
exports.AttributeDefinition$ = [3, n0, _AD,
    0,
    [_AN, _AT],
    [0, 0], 2
];
exports.AttributeValueUpdate$ = [3, n0, _AVU,
    0,
    [_V, _A],
    [() => exports.AttributeValue$, 0]
];
exports.AutoScalingPolicyDescription$ = [3, n0, _ASPD,
    0,
    [_PN, _TTSPC],
    [0, () => exports.AutoScalingTargetTrackingScalingPolicyConfigurationDescription$]
];
exports.AutoScalingPolicyUpdate$ = [3, n0, _ASPU,
    0,
    [_TTSPC, _PN],
    [() => exports.AutoScalingTargetTrackingScalingPolicyConfigurationUpdate$, 0], 1
];
exports.AutoScalingSettingsDescription$ = [3, n0, _ASSD,
    0,
    [_MU, _MUa, _ASD, _ASRA, _SP],
    [1, 1, 2, 0, () => AutoScalingPolicyDescriptionList]
];
exports.AutoScalingSettingsUpdate$ = [3, n0, _ASSU,
    0,
    [_MU, _MUa, _ASD, _ASRA, _SPU],
    [1, 1, 2, 0, () => exports.AutoScalingPolicyUpdate$]
];
exports.AutoScalingTargetTrackingScalingPolicyConfigurationDescription$ = [3, n0, _ASTTSPCD,
    0,
    [_TV, _DSI, _SIC, _SOC],
    [1, 2, 1, 1], 1
];
exports.AutoScalingTargetTrackingScalingPolicyConfigurationUpdate$ = [3, n0, _ASTTSPCU,
    0,
    [_TV, _DSI, _SIC, _SOC],
    [1, 2, 1, 1], 1
];
exports.BackupDescription$ = [3, n0, _BD,
    0,
    [_BDa, _STD, _STFD],
    [() => exports.BackupDetails$, () => exports.SourceTableDetails$, () => exports.SourceTableFeatureDetails$]
];
exports.BackupDetails$ = [3, n0, _BDa,
    0,
    [_BA, _BN, _BS, _BT, _BCDT, _BSB, _BEDT],
    [0, 0, 0, 0, 4, 1, 4], 5
];
exports.BackupSummary$ = [3, n0, _BSa,
    0,
    [_TN, _TI, _TA, _BA, _BN, _BCDT, _BEDT, _BS, _BT, _BSB],
    [0, 0, 0, 0, 0, 4, 4, 0, 0, 1]
];
exports.BatchExecuteStatementInput$ = [3, n0, _BESI,
    0,
    [_S, _RCC],
    [() => PartiQLBatchRequest, 0], 1
];
exports.BatchExecuteStatementOutput$ = [3, n0, _BESO,
    0,
    [_R, _CC],
    [() => PartiQLBatchResponse, () => ConsumedCapacityMultiple]
];
exports.BatchGetItemInput$ = [3, n0, _BGII,
    0,
    [_RI, _RCC],
    [() => BatchGetRequestMap, 0], 1
];
exports.BatchGetItemOutput$ = [3, n0, _BGIO,
    0,
    [_R, _UK, _CC],
    [() => BatchGetResponseMap, () => BatchGetRequestMap, () => ConsumedCapacityMultiple]
];
exports.BatchStatementError$ = [3, n0, _BSE,
    0,
    [_C, _M, _I],
    [0, 0, () => AttributeMap]
];
exports.BatchStatementRequest$ = [3, n0, _BSR,
    0,
    [_St, _P, _CRo, _RVOCCF],
    [0, () => PreparedStatementParameters, 2, 0], 1
];
exports.BatchStatementResponse$ = [3, n0, _BSRa,
    0,
    [_E, _TN, _I],
    [() => exports.BatchStatementError$, 0, () => AttributeMap]
];
exports.BatchWriteItemInput$ = [3, n0, _BWII,
    0,
    [_RI, _RCC, _RICM],
    [() => BatchWriteItemRequestMap, 0, 0], 1
];
exports.BatchWriteItemOutput$ = [3, n0, _BWIO,
    0,
    [_UI, _ICM, _CC],
    [() => BatchWriteItemRequestMap, () => ItemCollectionMetricsPerTable, () => ConsumedCapacityMultiple]
];
exports.BillingModeSummary$ = [3, n0, _BMS,
    0,
    [_BM, _LUTPPRDT],
    [0, 4]
];
exports.CancellationReason$ = [3, n0, _CRa,
    0,
    [_I, _C, _M],
    [() => AttributeMap, 0, 0]
];
exports.Capacity$ = [3, n0, _Ca,
    0,
    [_RCU, _WCU, _CU],
    [1, 1, 1]
];
exports.Condition$ = [3, n0, _Co,
    0,
    [_CO, _AVL],
    [0, () => AttributeValueList], 1
];
exports.ConditionCheck$ = [3, n0, _CCo,
    0,
    [_K, _TN, _CE, _EAN, _EAV, _RVOCCF],
    [() => Key, 0, 0, 128 | 0, () => ExpressionAttributeValueMap, 0], 3
];
exports.ConsumedCapacity$ = [3, n0, _CC,
    0,
    [_TN, _CU, _RCU, _WCU, _T, _LSI, _GSI],
    [0, 1, 1, 1, () => exports.Capacity$, () => SecondaryIndexesCapacityMap, () => SecondaryIndexesCapacityMap]
];
exports.ContinuousBackupsDescription$ = [3, n0, _CBD,
    0,
    [_CBS, _PITRD],
    [0, () => exports.PointInTimeRecoveryDescription$], 1
];
exports.ContributorInsightsSummary$ = [3, n0, _CIS,
    0,
    [_TN, _IN, _CISo, _CIM],
    [0, 0, 0, 0]
];
exports.CreateBackupInput$ = [3, n0, _CBI,
    0,
    [_TN, _BN],
    [0, 0], 2
];
exports.CreateBackupOutput$ = [3, n0, _CBO,
    0,
    [_BDa],
    [() => exports.BackupDetails$]
];
exports.CreateGlobalSecondaryIndexAction$ = [3, n0, _CGSIA,
    0,
    [_IN, _KS, _Pr, _PT, _ODT, _WT],
    [0, () => KeySchema, () => exports.Projection$, () => exports.ProvisionedThroughput$, () => exports.OnDemandThroughput$, () => exports.WarmThroughput$], 3
];
exports.CreateGlobalTableInput$ = [3, n0, _CGTI,
    0,
    [_GTN, _RG],
    [0, () => ReplicaList], 2
];
exports.CreateGlobalTableOutput$ = [3, n0, _CGTO,
    0,
    [_GTD],
    [() => exports.GlobalTableDescription$]
];
exports.CreateGlobalTableWitnessGroupMemberAction$ = [3, n0, _CGTWGMA,
    0,
    [_RN],
    [0], 1
];
exports.CreateReplicaAction$ = [3, n0, _CRA,
    0,
    [_RN],
    [0], 1
];
exports.CreateReplicationGroupMemberAction$ = [3, n0, _CRGMA,
    0,
    [_RN, _KMSMKI, _PTO, _ODTO, _GSI, _TCO],
    [0, 0, () => exports.ProvisionedThroughputOverride$, () => exports.OnDemandThroughputOverride$, () => ReplicaGlobalSecondaryIndexList, 0], 1
];
exports.CreateTableInput$ = [3, n0, _CTI,
    0,
    [_TN, _ADt, _KS, _LSI, _GSI, _BM, _PT, _SS, _SSES, _Ta, _TC, _DPE, _WT, _RP, _ODT, _GTSA, _GTSRM],
    [0, () => AttributeDefinitions, () => KeySchema, () => LocalSecondaryIndexList, () => GlobalSecondaryIndexList, 0, () => exports.ProvisionedThroughput$, () => exports.StreamSpecification$, () => exports.SSESpecification$, () => TagList, 0, 2, () => exports.WarmThroughput$, 0, () => exports.OnDemandThroughput$, 0, 0], 1
];
exports.CreateTableOutput$ = [3, n0, _CTO,
    0,
    [_TD],
    [() => exports.TableDescription$]
];
exports.CsvOptions$ = [3, n0, _COs,
    0,
    [_D, _HL],
    [0, 64 | 0]
];
exports.Delete$ = [3, n0, _De,
    0,
    [_K, _TN, _CE, _EAN, _EAV, _RVOCCF],
    [() => Key, 0, 0, 128 | 0, () => ExpressionAttributeValueMap, 0], 2
];
exports.DeleteBackupInput$ = [3, n0, _DBI,
    0,
    [_BA],
    [0], 1
];
exports.DeleteBackupOutput$ = [3, n0, _DBO,
    0,
    [_BD],
    [() => exports.BackupDescription$]
];
exports.DeleteGlobalSecondaryIndexAction$ = [3, n0, _DGSIA,
    0,
    [_IN],
    [0], 1
];
exports.DeleteGlobalTableWitnessGroupMemberAction$ = [3, n0, _DGTWGMA,
    0,
    [_RN],
    [0], 1
];
exports.DeleteItemInput$ = [3, n0, _DII,
    0,
    [_TN, _K, _Ex, _COo, _RV, _RCC, _RICM, _CE, _EAN, _EAV, _RVOCCF],
    [0, () => Key, () => ExpectedAttributeMap, 0, 0, 0, 0, 0, 128 | 0, () => ExpressionAttributeValueMap, 0], 2
];
exports.DeleteItemOutput$ = [3, n0, _DIO,
    0,
    [_At, _CC, _ICM],
    [() => AttributeMap, () => exports.ConsumedCapacity$, () => exports.ItemCollectionMetrics$]
];
exports.DeleteReplicaAction$ = [3, n0, _DRA,
    0,
    [_RN],
    [0], 1
];
exports.DeleteReplicationGroupMemberAction$ = [3, n0, _DRGMA,
    0,
    [_RN],
    [0], 1
];
exports.DeleteRequest$ = [3, n0, _DR,
    0,
    [_K],
    [() => Key], 1
];
exports.DeleteResourcePolicyInput$ = [3, n0, _DRPI,
    0,
    [_RA, _ERI],
    [0, 0], 1
];
exports.DeleteResourcePolicyOutput$ = [3, n0, _DRPO,
    0,
    [_RIe],
    [0]
];
exports.DeleteTableInput$ = [3, n0, _DTI,
    0,
    [_TN],
    [0], 1
];
exports.DeleteTableOutput$ = [3, n0, _DTO,
    0,
    [_TD],
    [() => exports.TableDescription$]
];
exports.DescribeBackupInput$ = [3, n0, _DBIe,
    0,
    [_BA],
    [0], 1
];
exports.DescribeBackupOutput$ = [3, n0, _DBOe,
    0,
    [_BD],
    [() => exports.BackupDescription$]
];
exports.DescribeContinuousBackupsInput$ = [3, n0, _DCBI,
    0,
    [_TN],
    [0], 1
];
exports.DescribeContinuousBackupsOutput$ = [3, n0, _DCBO,
    0,
    [_CBD],
    [() => exports.ContinuousBackupsDescription$]
];
exports.DescribeContributorInsightsInput$ = [3, n0, _DCII,
    0,
    [_TN, _IN],
    [0, 0], 1
];
exports.DescribeContributorInsightsOutput$ = [3, n0, _DCIO,
    0,
    [_TN, _IN, _CIRL, _CISo, _LUDT, _FE, _CIM],
    [0, 0, 64 | 0, 0, 4, () => exports.FailureException$, 0]
];
exports.DescribeEndpointsRequest$ = [3, n0, _DER,
    0,
    [],
    []
];
exports.DescribeEndpointsResponse$ = [3, n0, _DERe,
    0,
    [_En],
    [() => Endpoints], 1
];
exports.DescribeExportInput$ = [3, n0, _DEI,
    0,
    [_EA],
    [0], 1
];
exports.DescribeExportOutput$ = [3, n0, _DEO,
    0,
    [_ED],
    [() => exports.ExportDescription$]
];
exports.DescribeGlobalTableInput$ = [3, n0, _DGTI,
    0,
    [_GTN],
    [0], 1
];
exports.DescribeGlobalTableOutput$ = [3, n0, _DGTO,
    0,
    [_GTD],
    [() => exports.GlobalTableDescription$]
];
exports.DescribeGlobalTableSettingsInput$ = [3, n0, _DGTSI,
    0,
    [_GTN],
    [0], 1
];
exports.DescribeGlobalTableSettingsOutput$ = [3, n0, _DGTSO,
    0,
    [_GTN, _RS],
    [0, () => ReplicaSettingsDescriptionList]
];
exports.DescribeImportInput$ = [3, n0, _DIIe,
    0,
    [_IA],
    [0], 1
];
exports.DescribeImportOutput$ = [3, n0, _DIOe,
    0,
    [_ITD],
    [() => exports.ImportTableDescription$], 1
];
exports.DescribeKinesisStreamingDestinationInput$ = [3, n0, _DKSDI,
    0,
    [_TN],
    [0], 1
];
exports.DescribeKinesisStreamingDestinationOutput$ = [3, n0, _DKSDO,
    0,
    [_TN, _KDSD],
    [0, () => KinesisDataStreamDestinations]
];
exports.DescribeLimitsInput$ = [3, n0, _DLI,
    0,
    [],
    []
];
exports.DescribeLimitsOutput$ = [3, n0, _DLO,
    0,
    [_AMRCU, _AMWCU, _TMRCU, _TMWCU],
    [1, 1, 1, 1]
];
exports.DescribeTableInput$ = [3, n0, _DTIe,
    0,
    [_TN],
    [0], 1
];
exports.DescribeTableOutput$ = [3, n0, _DTOe,
    0,
    [_T],
    [() => exports.TableDescription$]
];
exports.DescribeTableReplicaAutoScalingInput$ = [3, n0, _DTRASI,
    0,
    [_TN],
    [0], 1
];
exports.DescribeTableReplicaAutoScalingOutput$ = [3, n0, _DTRASO,
    0,
    [_TASD],
    [() => exports.TableAutoScalingDescription$]
];
exports.DescribeTimeToLiveInput$ = [3, n0, _DTTLI,
    0,
    [_TN],
    [0], 1
];
exports.DescribeTimeToLiveOutput$ = [3, n0, _DTTLO,
    0,
    [_TTLD],
    [() => exports.TimeToLiveDescription$]
];
exports.EnableKinesisStreamingConfiguration$ = [3, n0, _EKSC,
    0,
    [_ACDTP],
    [0]
];
exports.Endpoint$ = [3, n0, _End,
    0,
    [_Ad, _CPIM],
    [0, 1], 2
];
exports.ExecuteStatementInput$ = [3, n0, _ESI,
    0,
    [_St, _P, _CRo, _NT, _RCC, _L, _RVOCCF],
    [0, () => PreparedStatementParameters, 2, 0, 0, 1, 0], 1
];
exports.ExecuteStatementOutput$ = [3, n0, _ESO,
    0,
    [_It, _NT, _CC, _LEK],
    [() => ItemList, 0, () => exports.ConsumedCapacity$, () => Key]
];
exports.ExecuteTransactionInput$ = [3, n0, _ETI,
    0,
    [_TS, _CRT, _RCC],
    [() => ParameterizedStatements, [0, 4], 0], 1
];
exports.ExecuteTransactionOutput$ = [3, n0, _ETO,
    0,
    [_R, _CC],
    [() => ItemResponseList, () => ConsumedCapacityMultiple]
];
exports.ExpectedAttributeValue$ = [3, n0, _EAVx,
    0,
    [_V, _Exi, _CO, _AVL],
    [() => exports.AttributeValue$, 2, 0, () => AttributeValueList]
];
exports.ExportDescription$ = [3, n0, _ED,
    0,
    [_EA, _ES, _ST, _ET, _EM, _TA, _TI, _ETx, _CT, _SB, _SBO, _SPr, _SSA, _SSKKI, _FC, _FM, _EF, _BSBi, _IC, _ETxp, _IES],
    [0, 0, 4, 4, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, () => exports.IncrementalExportSpecification$]
];
exports.ExportSummary$ = [3, n0, _ESx,
    0,
    [_EA, _ES, _ETxp],
    [0, 0, 0]
];
exports.ExportTableToPointInTimeInput$ = [3, n0, _ETTPITI,
    0,
    [_TA, _SB, _ETx, _CT, _SBO, _SPr, _SSA, _SSKKI, _EF, _ETxp, _IES],
    [0, 0, 4, [0, 4], 0, 0, 0, 0, 0, 0, () => exports.IncrementalExportSpecification$], 2
];
exports.ExportTableToPointInTimeOutput$ = [3, n0, _ETTPITO,
    0,
    [_ED],
    [() => exports.ExportDescription$]
];
exports.FailureException$ = [3, n0, _FE,
    0,
    [_EN, _EDx],
    [0, 0]
];
exports.Get$ = [3, n0, _G,
    0,
    [_K, _TN, _PE, _EAN],
    [() => Key, 0, 0, 128 | 0], 2
];
exports.GetItemInput$ = [3, n0, _GII,
    0,
    [_TN, _K, _ATG, _CRo, _RCC, _PE, _EAN],
    [0, () => Key, 64 | 0, 2, 0, 0, 128 | 0], 2
];
exports.GetItemOutput$ = [3, n0, _GIO,
    0,
    [_I, _CC],
    [() => AttributeMap, () => exports.ConsumedCapacity$]
];
exports.GetResourcePolicyInput$ = [3, n0, _GRPI,
    0,
    [_RA],
    [0], 1
];
exports.GetResourcePolicyOutput$ = [3, n0, _GRPO,
    0,
    [_Po, _RIe],
    [0, 0]
];
exports.GlobalSecondaryIndex$ = [3, n0, _GSIl,
    0,
    [_IN, _KS, _Pr, _PT, _ODT, _WT],
    [0, () => KeySchema, () => exports.Projection$, () => exports.ProvisionedThroughput$, () => exports.OnDemandThroughput$, () => exports.WarmThroughput$], 3
];
exports.GlobalSecondaryIndexAutoScalingUpdate$ = [3, n0, _GSIASU,
    0,
    [_IN, _PWCASU],
    [0, () => exports.AutoScalingSettingsUpdate$]
];
exports.GlobalSecondaryIndexDescription$ = [3, n0, _GSID,
    0,
    [_IN, _KS, _Pr, _IS, _B, _PT, _ISB, _IC, _IAn, _ODT, _WT],
    [0, () => KeySchema, () => exports.Projection$, 0, 2, () => exports.ProvisionedThroughputDescription$, 1, 1, 0, () => exports.OnDemandThroughput$, () => exports.GlobalSecondaryIndexWarmThroughputDescription$]
];
exports.GlobalSecondaryIndexInfo$ = [3, n0, _GSII,
    0,
    [_IN, _KS, _Pr, _PT, _ODT],
    [0, () => KeySchema, () => exports.Projection$, () => exports.ProvisionedThroughput$, () => exports.OnDemandThroughput$]
];
exports.GlobalSecondaryIndexUpdate$ = [3, n0, _GSIU,
    0,
    [_U, _Cr, _De],
    [() => exports.UpdateGlobalSecondaryIndexAction$, () => exports.CreateGlobalSecondaryIndexAction$, () => exports.DeleteGlobalSecondaryIndexAction$]
];
exports.GlobalSecondaryIndexWarmThroughputDescription$ = [3, n0, _GSIWTD,
    0,
    [_RUPS, _WUPS, _Sta],
    [1, 1, 0]
];
exports.GlobalTable$ = [3, n0, _GT,
    0,
    [_GTN, _RG],
    [0, () => ReplicaList]
];
exports.GlobalTableDescription$ = [3, n0, _GTD,
    0,
    [_RG, _GTA, _CDT, _GTS, _GTN],
    [() => ReplicaDescriptionList, 0, 4, 0, 0]
];
exports.GlobalTableGlobalSecondaryIndexSettingsUpdate$ = [3, n0, _GTGSISU,
    0,
    [_IN, _PWCU, _PWCASSU],
    [0, 1, () => exports.AutoScalingSettingsUpdate$], 1
];
exports.GlobalTableWitnessDescription$ = [3, n0, _GTWD,
    0,
    [_RN, _WS],
    [0, 0]
];
exports.GlobalTableWitnessGroupUpdate$ = [3, n0, _GTWGU,
    0,
    [_Cr, _De],
    [() => exports.CreateGlobalTableWitnessGroupMemberAction$, () => exports.DeleteGlobalTableWitnessGroupMemberAction$]
];
exports.ImportSummary$ = [3, n0, _ISm,
    0,
    [_IA, _ISmp, _TA, _SBS, _CWLGA, _IF, _ST, _ET],
    [0, 0, 0, () => exports.S3BucketSource$, 0, 0, 4, 4]
];
exports.ImportTableDescription$ = [3, n0, _ITD,
    0,
    [_IA, _ISmp, _TA, _TI, _CT, _SBS, _EC, _CWLGA, _IF, _IFO, _ICT, _TCP, _ST, _ET, _PSB, _PIC, _IIC, _FC, _FM],
    [0, 0, 0, 0, 0, () => exports.S3BucketSource$, 1, 0, 0, () => exports.InputFormatOptions$, 0, () => exports.TableCreationParameters$, 4, 4, 1, 1, 1, 0, 0]
];
exports.ImportTableInput$ = [3, n0, _ITI,
    0,
    [_SBS, _IF, _TCP, _CT, _IFO, _ICT],
    [() => exports.S3BucketSource$, 0, () => exports.TableCreationParameters$, [0, 4], () => exports.InputFormatOptions$, 0], 3
];
exports.ImportTableOutput$ = [3, n0, _ITO,
    0,
    [_ITD],
    [() => exports.ImportTableDescription$], 1
];
exports.IncrementalExportSpecification$ = [3, n0, _IES,
    0,
    [_EFT, _ETT, _EVT],
    [4, 4, 0]
];
exports.InputFormatOptions$ = [3, n0, _IFO,
    0,
    [_Cs],
    [() => exports.CsvOptions$]
];
exports.ItemCollectionMetrics$ = [3, n0, _ICM,
    0,
    [_ICK, _SERGB],
    [() => ItemCollectionKeyAttributeMap, 64 | 1]
];
exports.ItemResponse$ = [3, n0, _IR,
    0,
    [_I],
    [() => AttributeMap]
];
exports.KeysAndAttributes$ = [3, n0, _KAA,
    0,
    [_Ke, _ATG, _CRo, _PE, _EAN],
    [() => KeyList, 64 | 0, 2, 0, 128 | 0], 1
];
exports.KeySchemaElement$ = [3, n0, _KSE,
    0,
    [_AN, _KT],
    [0, 0], 2
];
exports.KinesisDataStreamDestination$ = [3, n0, _KDSDi,
    0,
    [_SA, _DS, _DSD, _ACDTP],
    [0, 0, 0, 0]
];
exports.KinesisStreamingDestinationInput$ = [3, n0, _KSDI,
    0,
    [_TN, _SA, _EKSC],
    [0, 0, () => exports.EnableKinesisStreamingConfiguration$], 2
];
exports.KinesisStreamingDestinationOutput$ = [3, n0, _KSDO,
    0,
    [_TN, _SA, _DS, _EKSC],
    [0, 0, 0, () => exports.EnableKinesisStreamingConfiguration$]
];
exports.ListBackupsInput$ = [3, n0, _LBI,
    0,
    [_TN, _L, _TRLB, _TRUB, _ESBA, _BT],
    [0, 1, 4, 4, 0, 0]
];
exports.ListBackupsOutput$ = [3, n0, _LBO,
    0,
    [_BSac, _LEBA],
    [() => BackupSummaries, 0]
];
exports.ListContributorInsightsInput$ = [3, n0, _LCII,
    0,
    [_TN, _NT, _MR],
    [0, 0, 1]
];
exports.ListContributorInsightsOutput$ = [3, n0, _LCIO,
    0,
    [_CISon, _NT],
    [() => ContributorInsightsSummaries, 0]
];
exports.ListExportsInput$ = [3, n0, _LEI,
    0,
    [_TA, _MR, _NT],
    [0, 1, 0]
];
exports.ListExportsOutput$ = [3, n0, _LEO,
    0,
    [_ESxp, _NT],
    [() => ExportSummaries, 0]
];
exports.ListGlobalTablesInput$ = [3, n0, _LGTI,
    0,
    [_ESGTN, _L, _RN],
    [0, 1, 0]
];
exports.ListGlobalTablesOutput$ = [3, n0, _LGTO,
    0,
    [_GTl, _LEGTN],
    [() => GlobalTableList, 0]
];
exports.ListImportsInput$ = [3, n0, _LII,
    0,
    [_TA, _PS, _NT],
    [0, 1, 0]
];
exports.ListImportsOutput$ = [3, n0, _LIO,
    0,
    [_ISL, _NT],
    [() => ImportSummaryList, 0]
];
exports.ListTablesInput$ = [3, n0, _LTI,
    0,
    [_ESTN, _L],
    [0, 1]
];
exports.ListTablesOutput$ = [3, n0, _LTO,
    0,
    [_TNa, _LETN],
    [64 | 0, 0]
];
exports.ListTagsOfResourceInput$ = [3, n0, _LTORI,
    0,
    [_RA, _NT],
    [0, 0], 1
];
exports.ListTagsOfResourceOutput$ = [3, n0, _LTORO,
    0,
    [_Ta, _NT],
    [() => TagList, 0]
];
exports.LocalSecondaryIndex$ = [3, n0, _LSIo,
    0,
    [_IN, _KS, _Pr],
    [0, () => KeySchema, () => exports.Projection$], 3
];
exports.LocalSecondaryIndexDescription$ = [3, n0, _LSID,
    0,
    [_IN, _KS, _Pr, _ISB, _IC, _IAn],
    [0, () => KeySchema, () => exports.Projection$, 1, 1, 0]
];
exports.LocalSecondaryIndexInfo$ = [3, n0, _LSII,
    0,
    [_IN, _KS, _Pr],
    [0, () => KeySchema, () => exports.Projection$]
];
exports.OnDemandThroughput$ = [3, n0, _ODT,
    0,
    [_MRRU, _MWRU],
    [1, 1]
];
exports.OnDemandThroughputOverride$ = [3, n0, _ODTO,
    0,
    [_MRRU],
    [1]
];
exports.ParameterizedStatement$ = [3, n0, _PSa,
    0,
    [_St, _P, _RVOCCF],
    [0, () => PreparedStatementParameters, 0], 1
];
exports.PointInTimeRecoveryDescription$ = [3, n0, _PITRD,
    0,
    [_PITRS, _RPID, _ERDT, _LRDT],
    [0, 1, 4, 4]
];
exports.PointInTimeRecoverySpecification$ = [3, n0, _PITRSo,
    0,
    [_PITRE, _RPID],
    [2, 1], 1
];
exports.Projection$ = [3, n0, _Pr,
    0,
    [_PTr, _NKA],
    [0, 64 | 0]
];
exports.ProvisionedThroughput$ = [3, n0, _PT,
    0,
    [_RCU, _WCU],
    [1, 1], 2
];
exports.ProvisionedThroughputDescription$ = [3, n0, _PTD,
    0,
    [_LIDT, _LDDT, _NODT, _RCU, _WCU],
    [4, 4, 1, 1, 1]
];
exports.ProvisionedThroughputOverride$ = [3, n0, _PTO,
    0,
    [_RCU],
    [1]
];
exports.Put$ = [3, n0, _Pu,
    0,
    [_I, _TN, _CE, _EAN, _EAV, _RVOCCF],
    [() => PutItemInputAttributeMap, 0, 0, 128 | 0, () => ExpressionAttributeValueMap, 0], 2
];
exports.PutItemInput$ = [3, n0, _PII,
    0,
    [_TN, _I, _Ex, _RV, _RCC, _RICM, _COo, _CE, _EAN, _EAV, _RVOCCF],
    [0, () => PutItemInputAttributeMap, () => ExpectedAttributeMap, 0, 0, 0, 0, 0, 128 | 0, () => ExpressionAttributeValueMap, 0], 2
];
exports.PutItemOutput$ = [3, n0, _PIO,
    0,
    [_At, _CC, _ICM],
    [() => AttributeMap, () => exports.ConsumedCapacity$, () => exports.ItemCollectionMetrics$]
];
exports.PutRequest$ = [3, n0, _PR,
    0,
    [_I],
    [() => PutItemInputAttributeMap], 1
];
exports.PutResourcePolicyInput$ = [3, n0, _PRPI,
    0,
    [_RA, _Po, _ERI, _CRSRA],
    [0, 0, 0, [2, { [_hH]: _xacrsra }]], 2
];
exports.PutResourcePolicyOutput$ = [3, n0, _PRPO,
    0,
    [_RIe],
    [0]
];
exports.QueryInput$ = [3, n0, _QI,
    0,
    [_TN, _IN, _Se, _ATG, _L, _CRo, _KC, _QF, _COo, _SIF, _ESK, _RCC, _PE, _FEi, _KCE, _EAN, _EAV],
    [0, 0, 0, 64 | 0, 1, 2, () => KeyConditions, () => FilterConditionMap, 0, 2, () => Key, 0, 0, 0, 0, 128 | 0, () => ExpressionAttributeValueMap], 1
];
exports.QueryOutput$ = [3, n0, _QO,
    0,
    [_It, _Cou, _SC, _LEK, _CC],
    [() => ItemList, 1, 1, () => Key, () => exports.ConsumedCapacity$]
];
exports.Replica$ = [3, n0, _Re,
    0,
    [_RN],
    [0]
];
exports.ReplicaAutoScalingDescription$ = [3, n0, _RASD,
    0,
    [_RN, _GSI, _RPRCASS, _RPWCASS, _RSe],
    [0, () => ReplicaGlobalSecondaryIndexAutoScalingDescriptionList, () => exports.AutoScalingSettingsDescription$, () => exports.AutoScalingSettingsDescription$, 0]
];
exports.ReplicaAutoScalingUpdate$ = [3, n0, _RASU,
    0,
    [_RN, _RGSIU, _RPRCASU],
    [0, () => ReplicaGlobalSecondaryIndexAutoScalingUpdateList, () => exports.AutoScalingSettingsUpdate$], 1
];
exports.ReplicaDescription$ = [3, n0, _RD,
    0,
    [_RN, _RSe, _RAe, _RSD, _RSPP, _KMSMKI, _PTO, _ODTO, _WT, _GSI, _RIDT, _RTCS, _GTSRM],
    [0, 0, 0, 0, 0, 0, () => exports.ProvisionedThroughputOverride$, () => exports.OnDemandThroughputOverride$, () => exports.TableWarmThroughputDescription$, () => ReplicaGlobalSecondaryIndexDescriptionList, 4, () => exports.TableClassSummary$, 0]
];
exports.ReplicaGlobalSecondaryIndex$ = [3, n0, _RGSI,
    0,
    [_IN, _PTO, _ODTO],
    [0, () => exports.ProvisionedThroughputOverride$, () => exports.OnDemandThroughputOverride$], 1
];
exports.ReplicaGlobalSecondaryIndexAutoScalingDescription$ = [3, n0, _RGSIASD,
    0,
    [_IN, _IS, _PRCASS, _PWCASS],
    [0, 0, () => exports.AutoScalingSettingsDescription$, () => exports.AutoScalingSettingsDescription$]
];
exports.ReplicaGlobalSecondaryIndexAutoScalingUpdate$ = [3, n0, _RGSIASU,
    0,
    [_IN, _PRCASU],
    [0, () => exports.AutoScalingSettingsUpdate$]
];
exports.ReplicaGlobalSecondaryIndexDescription$ = [3, n0, _RGSID,
    0,
    [_IN, _PTO, _ODTO, _WT],
    [0, () => exports.ProvisionedThroughputOverride$, () => exports.OnDemandThroughputOverride$, () => exports.GlobalSecondaryIndexWarmThroughputDescription$]
];
exports.ReplicaGlobalSecondaryIndexSettingsDescription$ = [3, n0, _RGSISD,
    0,
    [_IN, _IS, _PRCU, _PRCASS, _PWCU, _PWCASS],
    [0, 0, 1, () => exports.AutoScalingSettingsDescription$, 1, () => exports.AutoScalingSettingsDescription$], 1
];
exports.ReplicaGlobalSecondaryIndexSettingsUpdate$ = [3, n0, _RGSISU,
    0,
    [_IN, _PRCU, _PRCASSU],
    [0, 1, () => exports.AutoScalingSettingsUpdate$], 1
];
exports.ReplicaSettingsDescription$ = [3, n0, _RSDe,
    0,
    [_RN, _RSe, _RBMS, _RPRCU, _RPRCASS, _RPWCU, _RPWCASS, _RGSIS, _RTCS],
    [0, 0, () => exports.BillingModeSummary$, 1, () => exports.AutoScalingSettingsDescription$, 1, () => exports.AutoScalingSettingsDescription$, () => ReplicaGlobalSecondaryIndexSettingsDescriptionList, () => exports.TableClassSummary$], 1
];
exports.ReplicaSettingsUpdate$ = [3, n0, _RSU,
    0,
    [_RN, _RPRCU, _RPRCASSU, _RGSISU, _RTC],
    [0, 1, () => exports.AutoScalingSettingsUpdate$, () => ReplicaGlobalSecondaryIndexSettingsUpdateList, 0], 1
];
exports.ReplicationGroupUpdate$ = [3, n0, _RGU,
    0,
    [_Cr, _U, _De],
    [() => exports.CreateReplicationGroupMemberAction$, () => exports.UpdateReplicationGroupMemberAction$, () => exports.DeleteReplicationGroupMemberAction$]
];
exports.ReplicaUpdate$ = [3, n0, _RU,
    0,
    [_Cr, _De],
    [() => exports.CreateReplicaAction$, () => exports.DeleteReplicaAction$]
];
exports.RestoreSummary$ = [3, n0, _RSes,
    0,
    [_RDT, _RIP, _SBA, _STA],
    [4, 2, 0, 0], 2
];
exports.RestoreTableFromBackupInput$ = [3, n0, _RTFBI,
    0,
    [_TTN, _BA, _BMO, _GSIO, _LSIO, _PTO, _ODTO, _SSESO],
    [0, 0, 0, () => GlobalSecondaryIndexList, () => LocalSecondaryIndexList, () => exports.ProvisionedThroughput$, () => exports.OnDemandThroughput$, () => exports.SSESpecification$], 2
];
exports.RestoreTableFromBackupOutput$ = [3, n0, _RTFBO,
    0,
    [_TD],
    [() => exports.TableDescription$]
];
exports.RestoreTableToPointInTimeInput$ = [3, n0, _RTTPITI,
    0,
    [_TTN, _STA, _STN, _ULRT, _RDT, _BMO, _GSIO, _LSIO, _PTO, _ODTO, _SSESO],
    [0, 0, 0, 2, 4, 0, () => GlobalSecondaryIndexList, () => LocalSecondaryIndexList, () => exports.ProvisionedThroughput$, () => exports.OnDemandThroughput$, () => exports.SSESpecification$], 1
];
exports.RestoreTableToPointInTimeOutput$ = [3, n0, _RTTPITO,
    0,
    [_TD],
    [() => exports.TableDescription$]
];
exports.S3BucketSource$ = [3, n0, _SBS,
    0,
    [_SB, _SBO, _SKP],
    [0, 0, 0], 1
];
exports.ScanInput$ = [3, n0, _SI,
    0,
    [_TN, _IN, _ATG, _L, _Se, _SF, _COo, _ESK, _RCC, _TSo, _Seg, _PE, _FEi, _EAN, _EAV, _CRo],
    [0, 0, 64 | 0, 1, 0, () => FilterConditionMap, 0, () => Key, 0, 1, 1, 0, 0, 128 | 0, () => ExpressionAttributeValueMap, 2], 1
];
exports.ScanOutput$ = [3, n0, _SO,
    0,
    [_It, _Cou, _SC, _LEK, _CC],
    [() => ItemList, 1, 1, () => Key, () => exports.ConsumedCapacity$]
];
exports.SourceTableDetails$ = [3, n0, _STD,
    0,
    [_TN, _TI, _KS, _TCDT, _PT, _TA, _TSB, _ODT, _IC, _BM],
    [0, 0, () => KeySchema, 4, () => exports.ProvisionedThroughput$, 0, 1, () => exports.OnDemandThroughput$, 1, 0], 5
];
exports.SourceTableFeatureDetails$ = [3, n0, _STFD,
    0,
    [_LSI, _GSI, _SD, _TTLD, _SSED],
    [() => LocalSecondaryIndexes, () => GlobalSecondaryIndexes, () => exports.StreamSpecification$, () => exports.TimeToLiveDescription$, () => exports.SSEDescription$]
];
exports.SSEDescription$ = [3, n0, _SSED,
    0,
    [_Sta, _SSET, _KMSMKA, _IEDT],
    [0, 0, 0, 4]
];
exports.SSESpecification$ = [3, n0, _SSES,
    0,
    [_Ena, _SSET, _KMSMKI],
    [2, 0, 0]
];
exports.StreamSpecification$ = [3, n0, _SS,
    0,
    [_SE, _SVT],
    [2, 0], 1
];
exports.TableAutoScalingDescription$ = [3, n0, _TASD,
    0,
    [_TN, _TSa, _Rep],
    [0, 0, () => ReplicaAutoScalingDescriptionList]
];
exports.TableClassSummary$ = [3, n0, _TCS,
    0,
    [_TC, _LUDT],
    [0, 4]
];
exports.TableCreationParameters$ = [3, n0, _TCP,
    0,
    [_TN, _ADt, _KS, _BM, _PT, _ODT, _SSES, _GSI],
    [0, () => AttributeDefinitions, () => KeySchema, 0, () => exports.ProvisionedThroughput$, () => exports.OnDemandThroughput$, () => exports.SSESpecification$, () => GlobalSecondaryIndexList], 3
];
exports.TableDescription$ = [3, n0, _TD,
    0,
    [_ADt, _TN, _KS, _TSa, _CDT, _PT, _TSB, _IC, _TA, _TI, _BMS, _LSI, _GSI, _SS, _LSL, _LSA, _GTV, _Rep, _GTW, _GTSRM, _RSes, _SSED, _AS, _TCS, _DPE, _ODT, _WT, _MRC],
    [() => AttributeDefinitions, 0, () => KeySchema, 0, 4, () => exports.ProvisionedThroughputDescription$, 1, 1, 0, 0, () => exports.BillingModeSummary$, () => LocalSecondaryIndexDescriptionList, () => GlobalSecondaryIndexDescriptionList, () => exports.StreamSpecification$, 0, 0, 0, () => ReplicaDescriptionList, () => GlobalTableWitnessDescriptionList, 0, () => exports.RestoreSummary$, () => exports.SSEDescription$, () => exports.ArchivalSummary$, () => exports.TableClassSummary$, 2, () => exports.OnDemandThroughput$, () => exports.TableWarmThroughputDescription$, 0]
];
exports.TableWarmThroughputDescription$ = [3, n0, _TWTD,
    0,
    [_RUPS, _WUPS, _Sta],
    [1, 1, 0]
];
exports.Tag$ = [3, n0, _Tag,
    0,
    [_K, _V],
    [0, 0], 2
];
exports.TagResourceInput$ = [3, n0, _TRI,
    0,
    [_RA, _Ta],
    [0, () => TagList], 2
];
exports.ThrottlingReason$ = [3, n0, _TRh,
    0,
    [_r, _re],
    [0, 0]
];
exports.TimeToLiveDescription$ = [3, n0, _TTLD,
    0,
    [_TTLS, _AN],
    [0, 0]
];
exports.TimeToLiveSpecification$ = [3, n0, _TTLSi,
    0,
    [_Ena, _AN],
    [2, 0], 2
];
exports.TransactGetItem$ = [3, n0, _TGI,
    0,
    [_G],
    [() => exports.Get$], 1
];
exports.TransactGetItemsInput$ = [3, n0, _TGII,
    0,
    [_TIr, _RCC],
    [() => TransactGetItemList, 0], 1
];
exports.TransactGetItemsOutput$ = [3, n0, _TGIO,
    0,
    [_CC, _R],
    [() => ConsumedCapacityMultiple, () => ItemResponseList]
];
exports.TransactWriteItem$ = [3, n0, _TWI,
    0,
    [_CCo, _Pu, _De, _U],
    [() => exports.ConditionCheck$, () => exports.Put$, () => exports.Delete$, () => exports.Update$]
];
exports.TransactWriteItemsInput$ = [3, n0, _TWII,
    0,
    [_TIr, _RCC, _RICM, _CRT],
    [() => TransactWriteItemList, 0, 0, [0, 4]], 1
];
exports.TransactWriteItemsOutput$ = [3, n0, _TWIO,
    0,
    [_CC, _ICM],
    [() => ConsumedCapacityMultiple, () => ItemCollectionMetricsPerTable]
];
exports.UntagResourceInput$ = [3, n0, _URI,
    0,
    [_RA, _TK],
    [0, 64 | 0], 2
];
exports.Update$ = [3, n0, _U,
    0,
    [_K, _UE, _TN, _CE, _EAN, _EAV, _RVOCCF],
    [() => Key, 0, 0, 0, 128 | 0, () => ExpressionAttributeValueMap, 0], 3
];
exports.UpdateContinuousBackupsInput$ = [3, n0, _UCBI,
    0,
    [_TN, _PITRSo],
    [0, () => exports.PointInTimeRecoverySpecification$], 2
];
exports.UpdateContinuousBackupsOutput$ = [3, n0, _UCBO,
    0,
    [_CBD],
    [() => exports.ContinuousBackupsDescription$]
];
exports.UpdateContributorInsightsInput$ = [3, n0, _UCII,
    0,
    [_TN, _CIA, _IN, _CIM],
    [0, 0, 0, 0], 2
];
exports.UpdateContributorInsightsOutput$ = [3, n0, _UCIO,
    0,
    [_TN, _IN, _CISo, _CIM],
    [0, 0, 0, 0]
];
exports.UpdateGlobalSecondaryIndexAction$ = [3, n0, _UGSIA,
    0,
    [_IN, _PT, _ODT, _WT],
    [0, () => exports.ProvisionedThroughput$, () => exports.OnDemandThroughput$, () => exports.WarmThroughput$], 1
];
exports.UpdateGlobalTableInput$ = [3, n0, _UGTI,
    0,
    [_GTN, _RUe],
    [0, () => ReplicaUpdateList], 2
];
exports.UpdateGlobalTableOutput$ = [3, n0, _UGTO,
    0,
    [_GTD],
    [() => exports.GlobalTableDescription$]
];
exports.UpdateGlobalTableSettingsInput$ = [3, n0, _UGTSI,
    0,
    [_GTN, _GTBM, _GTPWCU, _GTPWCASSU, _GTGSISU, _RSU],
    [0, 0, 1, () => exports.AutoScalingSettingsUpdate$, () => GlobalTableGlobalSecondaryIndexSettingsUpdateList, () => ReplicaSettingsUpdateList], 1
];
exports.UpdateGlobalTableSettingsOutput$ = [3, n0, _UGTSO,
    0,
    [_GTN, _RS],
    [0, () => ReplicaSettingsDescriptionList]
];
exports.UpdateItemInput$ = [3, n0, _UII,
    0,
    [_TN, _K, _AU, _Ex, _COo, _RV, _RCC, _RICM, _UE, _CE, _EAN, _EAV, _RVOCCF],
    [0, () => Key, () => AttributeUpdates, () => ExpectedAttributeMap, 0, 0, 0, 0, 0, 0, 128 | 0, () => ExpressionAttributeValueMap, 0], 2
];
exports.UpdateItemOutput$ = [3, n0, _UIO,
    0,
    [_At, _CC, _ICM],
    [() => AttributeMap, () => exports.ConsumedCapacity$, () => exports.ItemCollectionMetrics$]
];
exports.UpdateKinesisStreamingConfiguration$ = [3, n0, _UKSC,
    0,
    [_ACDTP],
    [0]
];
exports.UpdateKinesisStreamingDestinationInput$ = [3, n0, _UKSDI,
    0,
    [_TN, _SA, _UKSC],
    [0, 0, () => exports.UpdateKinesisStreamingConfiguration$], 2
];
exports.UpdateKinesisStreamingDestinationOutput$ = [3, n0, _UKSDO,
    0,
    [_TN, _SA, _DS, _UKSC],
    [0, 0, 0, () => exports.UpdateKinesisStreamingConfiguration$]
];
exports.UpdateReplicationGroupMemberAction$ = [3, n0, _URGMA,
    0,
    [_RN, _KMSMKI, _PTO, _ODTO, _GSI, _TCO],
    [0, 0, () => exports.ProvisionedThroughputOverride$, () => exports.OnDemandThroughputOverride$, () => ReplicaGlobalSecondaryIndexList, 0], 1
];
exports.UpdateTableInput$ = [3, n0, _UTI,
    0,
    [_TN, _ADt, _BM, _PT, _GSIUl, _SS, _SSES, _RUe, _TC, _DPE, _MRC, _GTWU, _ODT, _WT, _GTSRM],
    [0, () => AttributeDefinitions, 0, () => exports.ProvisionedThroughput$, () => GlobalSecondaryIndexUpdateList, () => exports.StreamSpecification$, () => exports.SSESpecification$, () => ReplicationGroupUpdateList, 0, 2, 0, () => GlobalTableWitnessGroupUpdateList, () => exports.OnDemandThroughput$, () => exports.WarmThroughput$, 0], 1
];
exports.UpdateTableOutput$ = [3, n0, _UTO,
    0,
    [_TD],
    [() => exports.TableDescription$]
];
exports.UpdateTableReplicaAutoScalingInput$ = [3, n0, _UTRASI,
    0,
    [_TN, _GSIUl, _PWCASU, _RUe],
    [0, () => GlobalSecondaryIndexAutoScalingUpdateList, () => exports.AutoScalingSettingsUpdate$, () => ReplicaAutoScalingUpdateList], 1
];
exports.UpdateTableReplicaAutoScalingOutput$ = [3, n0, _UTRASO,
    0,
    [_TASD],
    [() => exports.TableAutoScalingDescription$]
];
exports.UpdateTimeToLiveInput$ = [3, n0, _UTTLI,
    0,
    [_TN, _TTLSi],
    [0, () => exports.TimeToLiveSpecification$], 2
];
exports.UpdateTimeToLiveOutput$ = [3, n0, _UTTLO,
    0,
    [_TTLSi],
    [() => exports.TimeToLiveSpecification$]
];
exports.WarmThroughput$ = [3, n0, _WT,
    0,
    [_RUPS, _WUPS],
    [1, 1]
];
exports.WriteRequest$ = [3, n0, _WR,
    0,
    [_PR, _DR],
    [() => exports.PutRequest$, () => exports.DeleteRequest$]
];
var __Unit = "unit";
var AttributeDefinitions = [1, n0, _ADt,
    0, () => exports.AttributeDefinition$
];
var AttributeNameList = (/* unused pure expression or super */ null && (64 | 0));
var AttributeValueList = [1, n0, _AVL,
    0, () => exports.AttributeValue$
];
var AutoScalingPolicyDescriptionList = [1, n0, _ASPDL,
    0, () => exports.AutoScalingPolicyDescription$
];
var BackupSummaries = [1, n0, _BSac,
    0, () => exports.BackupSummary$
];
var BinarySetAttributeValue = (/* unused pure expression or super */ null && (64 | 21));
var CancellationReasonList = [1, n0, _CRL,
    0, () => exports.CancellationReason$
];
var ConsumedCapacityMultiple = [1, n0, _CCM,
    0, () => exports.ConsumedCapacity$
];
var ContributorInsightsRuleList = (/* unused pure expression or super */ null && (64 | 0));
var ContributorInsightsSummaries = [1, n0, _CISon,
    0, () => exports.ContributorInsightsSummary$
];
var CsvHeaderList = (/* unused pure expression or super */ null && (64 | 0));
var Endpoints = [1, n0, _En,
    0, () => exports.Endpoint$
];
var ExportSummaries = [1, n0, _ESxp,
    0, () => exports.ExportSummary$
];
var GlobalSecondaryIndexAutoScalingUpdateList = [1, n0, _GSIASUL,
    0, () => exports.GlobalSecondaryIndexAutoScalingUpdate$
];
var GlobalSecondaryIndexDescriptionList = [1, n0, _GSIDL,
    0, () => exports.GlobalSecondaryIndexDescription$
];
var GlobalSecondaryIndexes = [1, n0, _GSI,
    0, () => exports.GlobalSecondaryIndexInfo$
];
var GlobalSecondaryIndexList = [1, n0, _GSIL,
    0, () => exports.GlobalSecondaryIndex$
];
var GlobalSecondaryIndexUpdateList = [1, n0, _GSIUL,
    0, () => exports.GlobalSecondaryIndexUpdate$
];
var GlobalTableGlobalSecondaryIndexSettingsUpdateList = [1, n0, _GTGSISUL,
    0, () => exports.GlobalTableGlobalSecondaryIndexSettingsUpdate$
];
var GlobalTableList = [1, n0, _GTL,
    0, () => exports.GlobalTable$
];
var GlobalTableWitnessDescriptionList = [1, n0, _GTWDL,
    0, () => exports.GlobalTableWitnessDescription$
];
var GlobalTableWitnessGroupUpdateList = [1, n0, _GTWGUL,
    0, () => exports.GlobalTableWitnessGroupUpdate$
];
var ImportSummaryList = [1, n0, _ISL,
    0, () => exports.ImportSummary$
];
var ItemCollectionMetricsMultiple = [1, n0, _ICMM,
    0, () => exports.ItemCollectionMetrics$
];
var ItemCollectionSizeEstimateRange = (/* unused pure expression or super */ null && (64 | 1));
var ItemList = [1, n0, _IL,
    0, () => AttributeMap
];
var ItemResponseList = [1, n0, _IRL,
    0, () => exports.ItemResponse$
];
var KeyList = [1, n0, _KL,
    0, () => Key
];
var KeySchema = [1, n0, _KS,
    0, () => exports.KeySchemaElement$
];
var KinesisDataStreamDestinations = [1, n0, _KDSD,
    0, () => exports.KinesisDataStreamDestination$
];
var ListAttributeValue = [1, n0, _LAV,
    0, () => exports.AttributeValue$
];
var LocalSecondaryIndexDescriptionList = [1, n0, _LSIDL,
    0, () => exports.LocalSecondaryIndexDescription$
];
var LocalSecondaryIndexes = [1, n0, _LSI,
    0, () => exports.LocalSecondaryIndexInfo$
];
var LocalSecondaryIndexList = [1, n0, _LSIL,
    0, () => exports.LocalSecondaryIndex$
];
var NonKeyAttributeNameList = (/* unused pure expression or super */ null && (64 | 0));
var NumberSetAttributeValue = (/* unused pure expression or super */ null && (64 | 0));
var ParameterizedStatements = [1, n0, _PSar,
    0, () => exports.ParameterizedStatement$
];
var PartiQLBatchRequest = [1, n0, _PQLBR,
    0, () => exports.BatchStatementRequest$
];
var PartiQLBatchResponse = [1, n0, _PQLBRa,
    0, () => exports.BatchStatementResponse$
];
var PreparedStatementParameters = [1, n0, _PSP,
    0, () => exports.AttributeValue$
];
var ReplicaAutoScalingDescriptionList = [1, n0, _RASDL,
    0, () => exports.ReplicaAutoScalingDescription$
];
var ReplicaAutoScalingUpdateList = [1, n0, _RASUL,
    0, () => exports.ReplicaAutoScalingUpdate$
];
var ReplicaDescriptionList = [1, n0, _RDL,
    0, () => exports.ReplicaDescription$
];
var ReplicaGlobalSecondaryIndexAutoScalingDescriptionList = [1, n0, _RGSIASDL,
    0, () => exports.ReplicaGlobalSecondaryIndexAutoScalingDescription$
];
var ReplicaGlobalSecondaryIndexAutoScalingUpdateList = [1, n0, _RGSIASUL,
    0, () => exports.ReplicaGlobalSecondaryIndexAutoScalingUpdate$
];
var ReplicaGlobalSecondaryIndexDescriptionList = [1, n0, _RGSIDL,
    0, () => exports.ReplicaGlobalSecondaryIndexDescription$
];
var ReplicaGlobalSecondaryIndexList = [1, n0, _RGSIL,
    0, () => exports.ReplicaGlobalSecondaryIndex$
];
var ReplicaGlobalSecondaryIndexSettingsDescriptionList = [1, n0, _RGSISDL,
    0, () => exports.ReplicaGlobalSecondaryIndexSettingsDescription$
];
var ReplicaGlobalSecondaryIndexSettingsUpdateList = [1, n0, _RGSISUL,
    0, () => exports.ReplicaGlobalSecondaryIndexSettingsUpdate$
];
var ReplicaList = [1, n0, _RL,
    0, () => exports.Replica$
];
var ReplicaSettingsDescriptionList = [1, n0, _RSDL,
    0, () => exports.ReplicaSettingsDescription$
];
var ReplicaSettingsUpdateList = [1, n0, _RSUL,
    0, () => exports.ReplicaSettingsUpdate$
];
var ReplicationGroupUpdateList = [1, n0, _RGUL,
    0, () => exports.ReplicationGroupUpdate$
];
var ReplicaUpdateList = [1, n0, _RUL,
    0, () => exports.ReplicaUpdate$
];
var StringSetAttributeValue = (/* unused pure expression or super */ null && (64 | 0));
var TableNameList = (/* unused pure expression or super */ null && (64 | 0));
var TagKeyList = (/* unused pure expression or super */ null && (64 | 0));
var TagList = [1, n0, _TL,
    0, () => exports.Tag$
];
var ThrottlingReasonList = [1, n0, _TRL,
    0, () => exports.ThrottlingReason$
];
var TransactGetItemList = [1, n0, _TGIL,
    0, () => exports.TransactGetItem$
];
var TransactWriteItemList = [1, n0, _TWIL,
    0, () => exports.TransactWriteItem$
];
var WriteRequests = [1, n0, _WRr,
    0, () => exports.WriteRequest$
];
var AttributeMap = [2, n0, _AM,
    0, 0, () => exports.AttributeValue$
];
var AttributeUpdates = [2, n0, _AU,
    0, 0, () => exports.AttributeValueUpdate$
];
var BatchGetRequestMap = [2, n0, _BGRMa,
    0, 0, () => exports.KeysAndAttributes$
];
var BatchGetResponseMap = [2, n0, _BGRM,
    0, 0, () => ItemList
];
var BatchWriteItemRequestMap = [2, n0, _BWIRM,
    0, 0, () => WriteRequests
];
var ExpectedAttributeMap = [2, n0, _EAM,
    0, 0, () => exports.ExpectedAttributeValue$
];
var ExpressionAttributeNameMap = (/* unused pure expression or super */ null && (128 | 0));
var ExpressionAttributeValueMap = [2, n0, _EAVM,
    0, 0, () => exports.AttributeValue$
];
var FilterConditionMap = [2, n0, _FCM,
    0, 0, () => exports.Condition$
];
var ItemCollectionKeyAttributeMap = [2, n0, _ICKAM,
    0, 0, () => exports.AttributeValue$
];
var ItemCollectionMetricsPerTable = [2, n0, _ICMPT,
    0, 0, () => ItemCollectionMetricsMultiple
];
var Key = [2, n0, _K,
    0, 0, () => exports.AttributeValue$
];
var KeyConditions = [2, n0, _KC,
    0, 0, () => exports.Condition$
];
var MapAttributeValue = [2, n0, _MAV,
    0, 0, () => exports.AttributeValue$
];
var PutItemInputAttributeMap = [2, n0, _PIIAM,
    0, 0, () => exports.AttributeValue$
];
var SecondaryIndexesCapacityMap = [2, n0, _SICM,
    0, 0, () => exports.Capacity$
];
exports.AttributeValue$ = [4, n0, _AV,
    0,
    [_S_, _N, _B_, _SS_, _NS, _BS_, _M_, _L_, _NULL, _BOOL],
    [0, 0, 21, 64 | 0, 64 | 0, 64 | 21, () => MapAttributeValue, () => ListAttributeValue, 2, 2]
];
exports.BatchExecuteStatement$ = [9, n0, _BES,
    0, () => exports.BatchExecuteStatementInput$, () => exports.BatchExecuteStatementOutput$
];
exports.BatchGetItem$ = [9, n0, _BGI,
    0, () => exports.BatchGetItemInput$, () => exports.BatchGetItemOutput$
];
exports.BatchWriteItem$ = [9, n0, _BWI,
    0, () => exports.BatchWriteItemInput$, () => exports.BatchWriteItemOutput$
];
exports.CreateBackup$ = [9, n0, _CB,
    0, () => exports.CreateBackupInput$, () => exports.CreateBackupOutput$
];
exports.CreateGlobalTable$ = [9, n0, _CGT,
    0, () => exports.CreateGlobalTableInput$, () => exports.CreateGlobalTableOutput$
];
exports.CreateTable$ = [9, n0, _CTr,
    0, () => exports.CreateTableInput$, () => exports.CreateTableOutput$
];
exports.DeleteBackup$ = [9, n0, _DB,
    0, () => exports.DeleteBackupInput$, () => exports.DeleteBackupOutput$
];
exports.DeleteItem$ = [9, n0, _DI,
    0, () => exports.DeleteItemInput$, () => exports.DeleteItemOutput$
];
exports.DeleteResourcePolicy$ = [9, n0, _DRP,
    0, () => exports.DeleteResourcePolicyInput$, () => exports.DeleteResourcePolicyOutput$
];
exports.DeleteTable$ = [9, n0, _DT,
    0, () => exports.DeleteTableInput$, () => exports.DeleteTableOutput$
];
exports.DescribeBackup$ = [9, n0, _DBe,
    0, () => exports.DescribeBackupInput$, () => exports.DescribeBackupOutput$
];
exports.DescribeContinuousBackups$ = [9, n0, _DCB,
    0, () => exports.DescribeContinuousBackupsInput$, () => exports.DescribeContinuousBackupsOutput$
];
exports.DescribeContributorInsights$ = [9, n0, _DCI,
    0, () => exports.DescribeContributorInsightsInput$, () => exports.DescribeContributorInsightsOutput$
];
exports.DescribeEndpoints$ = [9, n0, _DE,
    0, () => exports.DescribeEndpointsRequest$, () => exports.DescribeEndpointsResponse$
];
exports.DescribeExport$ = [9, n0, _DEe,
    0, () => exports.DescribeExportInput$, () => exports.DescribeExportOutput$
];
exports.DescribeGlobalTable$ = [9, n0, _DGT,
    0, () => exports.DescribeGlobalTableInput$, () => exports.DescribeGlobalTableOutput$
];
exports.DescribeGlobalTableSettings$ = [9, n0, _DGTS,
    0, () => exports.DescribeGlobalTableSettingsInput$, () => exports.DescribeGlobalTableSettingsOutput$
];
exports.DescribeImport$ = [9, n0, _DIe,
    0, () => exports.DescribeImportInput$, () => exports.DescribeImportOutput$
];
exports.DescribeKinesisStreamingDestination$ = [9, n0, _DKSD,
    0, () => exports.DescribeKinesisStreamingDestinationInput$, () => exports.DescribeKinesisStreamingDestinationOutput$
];
exports.DescribeLimits$ = [9, n0, _DL,
    0, () => exports.DescribeLimitsInput$, () => exports.DescribeLimitsOutput$
];
exports.DescribeTable$ = [9, n0, _DTe,
    0, () => exports.DescribeTableInput$, () => exports.DescribeTableOutput$
];
exports.DescribeTableReplicaAutoScaling$ = [9, n0, _DTRAS,
    0, () => exports.DescribeTableReplicaAutoScalingInput$, () => exports.DescribeTableReplicaAutoScalingOutput$
];
exports.DescribeTimeToLive$ = [9, n0, _DTTL,
    0, () => exports.DescribeTimeToLiveInput$, () => exports.DescribeTimeToLiveOutput$
];
exports.DisableKinesisStreamingDestination$ = [9, n0, _DKSDi,
    0, () => exports.KinesisStreamingDestinationInput$, () => exports.KinesisStreamingDestinationOutput$
];
exports.EnableKinesisStreamingDestination$ = [9, n0, _EKSD,
    0, () => exports.KinesisStreamingDestinationInput$, () => exports.KinesisStreamingDestinationOutput$
];
exports.ExecuteStatement$ = [9, n0, _ESxe,
    0, () => exports.ExecuteStatementInput$, () => exports.ExecuteStatementOutput$
];
exports.ExecuteTransaction$ = [9, n0, _ETxe,
    0, () => exports.ExecuteTransactionInput$, () => exports.ExecuteTransactionOutput$
];
exports.ExportTableToPointInTime$ = [9, n0, _ETTPIT,
    0, () => exports.ExportTableToPointInTimeInput$, () => exports.ExportTableToPointInTimeOutput$
];
exports.GetItem$ = [9, n0, _GI,
    0, () => exports.GetItemInput$, () => exports.GetItemOutput$
];
exports.GetResourcePolicy$ = [9, n0, _GRP,
    0, () => exports.GetResourcePolicyInput$, () => exports.GetResourcePolicyOutput$
];
exports.ImportTable$ = [9, n0, _IT,
    0, () => exports.ImportTableInput$, () => exports.ImportTableOutput$
];
exports.ListBackups$ = [9, n0, _LB,
    0, () => exports.ListBackupsInput$, () => exports.ListBackupsOutput$
];
exports.ListContributorInsights$ = [9, n0, _LCI,
    0, () => exports.ListContributorInsightsInput$, () => exports.ListContributorInsightsOutput$
];
exports.ListExports$ = [9, n0, _LE,
    0, () => exports.ListExportsInput$, () => exports.ListExportsOutput$
];
exports.ListGlobalTables$ = [9, n0, _LGT,
    0, () => exports.ListGlobalTablesInput$, () => exports.ListGlobalTablesOutput$
];
exports.ListImports$ = [9, n0, _LI,
    0, () => exports.ListImportsInput$, () => exports.ListImportsOutput$
];
exports.ListTables$ = [9, n0, _LT,
    0, () => exports.ListTablesInput$, () => exports.ListTablesOutput$
];
exports.ListTagsOfResource$ = [9, n0, _LTOR,
    0, () => exports.ListTagsOfResourceInput$, () => exports.ListTagsOfResourceOutput$
];
exports.PutItem$ = [9, n0, _PI,
    0, () => exports.PutItemInput$, () => exports.PutItemOutput$
];
exports.PutResourcePolicy$ = [9, n0, _PRP,
    0, () => exports.PutResourcePolicyInput$, () => exports.PutResourcePolicyOutput$
];
exports.Query$ = [9, n0, _Q,
    0, () => exports.QueryInput$, () => exports.QueryOutput$
];
exports.RestoreTableFromBackup$ = [9, n0, _RTFB,
    0, () => exports.RestoreTableFromBackupInput$, () => exports.RestoreTableFromBackupOutput$
];
exports.RestoreTableToPointInTime$ = [9, n0, _RTTPIT,
    0, () => exports.RestoreTableToPointInTimeInput$, () => exports.RestoreTableToPointInTimeOutput$
];
exports.Scan$ = [9, n0, _Sc,
    0, () => exports.ScanInput$, () => exports.ScanOutput$
];
exports.TagResource$ = [9, n0, _TRa,
    0, () => exports.TagResourceInput$, () => __Unit
];
exports.TransactGetItems$ = [9, n0, _TGIr,
    0, () => exports.TransactGetItemsInput$, () => exports.TransactGetItemsOutput$
];
exports.TransactWriteItems$ = [9, n0, _TWIr,
    0, () => exports.TransactWriteItemsInput$, () => exports.TransactWriteItemsOutput$
];
exports.UntagResource$ = [9, n0, _UR,
    0, () => exports.UntagResourceInput$, () => __Unit
];
exports.UpdateContinuousBackups$ = [9, n0, _UCB,
    0, () => exports.UpdateContinuousBackupsInput$, () => exports.UpdateContinuousBackupsOutput$
];
exports.UpdateContributorInsights$ = [9, n0, _UCI,
    0, () => exports.UpdateContributorInsightsInput$, () => exports.UpdateContributorInsightsOutput$
];
exports.UpdateGlobalTable$ = [9, n0, _UGT,
    0, () => exports.UpdateGlobalTableInput$, () => exports.UpdateGlobalTableOutput$
];
exports.UpdateGlobalTableSettings$ = [9, n0, _UGTS,
    0, () => exports.UpdateGlobalTableSettingsInput$, () => exports.UpdateGlobalTableSettingsOutput$
];
exports.UpdateItem$ = [9, n0, _UIp,
    0, () => exports.UpdateItemInput$, () => exports.UpdateItemOutput$
];
exports.UpdateKinesisStreamingDestination$ = [9, n0, _UKSD,
    0, () => exports.UpdateKinesisStreamingDestinationInput$, () => exports.UpdateKinesisStreamingDestinationOutput$
];
exports.UpdateTable$ = [9, n0, _UT,
    0, () => exports.UpdateTableInput$, () => exports.UpdateTableOutput$
];
exports.UpdateTableReplicaAutoScaling$ = [9, n0, _UTRAS,
    0, () => exports.UpdateTableReplicaAutoScalingInput$, () => exports.UpdateTableReplicaAutoScalingOutput$
];
exports.UpdateTimeToLive$ = [9, n0, _UTTL,
    0, () => exports.UpdateTimeToLiveInput$, () => exports.UpdateTimeToLiveOutput$
];


/***/ }),

/***/ 59950:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var utilMiddleware = __webpack_require__(76324);

const DEFAULT_ACCOUNT_ID_ENDPOINT_MODE = "preferred";
const ACCOUNT_ID_ENDPOINT_MODE_VALUES = ["disabled", "preferred", "required"];
function validateAccountIdEndpointMode(value) {
    return ACCOUNT_ID_ENDPOINT_MODE_VALUES.includes(value);
}

const resolveAccountIdEndpointModeConfig = (input) => {
    const { accountIdEndpointMode } = input;
    const accountIdEndpointModeProvider = utilMiddleware.normalizeProvider(accountIdEndpointMode ?? DEFAULT_ACCOUNT_ID_ENDPOINT_MODE);
    return Object.assign(input, {
        accountIdEndpointMode: async () => {
            const accIdMode = await accountIdEndpointModeProvider();
            if (!validateAccountIdEndpointMode(accIdMode)) {
                throw new Error(`Invalid value for accountIdEndpointMode: ${accIdMode}. Valid values are: "required", "preferred", "disabled".`);
            }
            return accIdMode;
        },
    });
};

const err = "Invalid AccountIdEndpointMode value";
const _throw = (message) => {
    throw new Error(message);
};
const ENV_ACCOUNT_ID_ENDPOINT_MODE = "AWS_ACCOUNT_ID_ENDPOINT_MODE";
const CONFIG_ACCOUNT_ID_ENDPOINT_MODE = "account_id_endpoint_mode";
const NODE_ACCOUNT_ID_ENDPOINT_MODE_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => {
        const value = env[ENV_ACCOUNT_ID_ENDPOINT_MODE];
        if (value && !validateAccountIdEndpointMode(value)) {
            _throw(err);
        }
        return value;
    },
    configFileSelector: (profile) => {
        const value = profile[CONFIG_ACCOUNT_ID_ENDPOINT_MODE];
        if (value && !validateAccountIdEndpointMode(value)) {
            _throw(err);
        }
        return value;
    },
    default: DEFAULT_ACCOUNT_ID_ENDPOINT_MODE,
};

exports.ACCOUNT_ID_ENDPOINT_MODE_VALUES = ACCOUNT_ID_ENDPOINT_MODE_VALUES;
exports.CONFIG_ACCOUNT_ID_ENDPOINT_MODE = CONFIG_ACCOUNT_ID_ENDPOINT_MODE;
exports.DEFAULT_ACCOUNT_ID_ENDPOINT_MODE = DEFAULT_ACCOUNT_ID_ENDPOINT_MODE;
exports.ENV_ACCOUNT_ID_ENDPOINT_MODE = ENV_ACCOUNT_ID_ENDPOINT_MODE;
exports.NODE_ACCOUNT_ID_ENDPOINT_MODE_CONFIG_OPTIONS = NODE_ACCOUNT_ID_ENDPOINT_MODE_CONFIG_OPTIONS;
exports.resolveAccountIdEndpointModeConfig = resolveAccountIdEndpointModeConfig;
exports.validateAccountIdEndpointMode = validateAccountIdEndpointMode;


/***/ }),

/***/ 5152:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


const state = {
    warningEmitted: false,
};
const emitWarningIfUnsupportedVersion = (version) => {
    if (version && !state.warningEmitted && parseInt(version.substring(1, version.indexOf("."))) < 20) {
        state.warningEmitted = true;
        process.emitWarning(`NodeDeprecationWarning: The AWS SDK for JavaScript (v3) will
no longer support Node.js ${version} in January 2026.

To continue receiving updates to AWS services, bug fixes, and security
updates please upgrade to a supported Node.js LTS version.

More information can be found at: https://a.co/c895JFp`);
    }
};

const longPollMiddleware = () => (next, context) => async (args) => {
    context.__retryLongPoll = true;
    return next(args);
};
const longPollMiddlewareOptions = {
    name: "longPollMiddleware",
    tags: ["RETRY"],
    step: "initialize",
    override: true,
};
const getLongPollPlugin = (options) => ({
    applyToStack: (clientStack) => {
        clientStack.add(longPollMiddleware(), longPollMiddlewareOptions);
    },
});

function setCredentialFeature(credentials, feature, value) {
    if (!credentials.$source) {
        credentials.$source = {};
    }
    credentials.$source[feature] = value;
    return credentials;
}

function setFeature(context, feature, value) {
    if (!context.__aws_sdk_context) {
        context.__aws_sdk_context = {
            features: {},
        };
    }
    else if (!context.__aws_sdk_context.features) {
        context.__aws_sdk_context.features = {};
    }
    context.__aws_sdk_context.features[feature] = value;
}

function setTokenFeature(token, feature, value) {
    if (!token.$source) {
        token.$source = {};
    }
    token.$source[feature] = value;
    return token;
}

exports.emitWarningIfUnsupportedVersion = emitWarningIfUnsupportedVersion;
exports.getLongPollPlugin = getLongPollPlugin;
exports.setCredentialFeature = setCredentialFeature;
exports.setFeature = setFeature;
exports.setTokenFeature = setTokenFeature;
exports.state = state;


/***/ }),

/***/ 97523:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var protocolHttp = __webpack_require__(72356);
var core = __webpack_require__(90402);
var propertyProvider = __webpack_require__(71238);
var client = __webpack_require__(5152);
var signatureV4 = __webpack_require__(75118);

const getDateHeader = (response) => protocolHttp.HttpResponse.isInstance(response) ? response.headers?.date ?? response.headers?.Date : undefined;

const getSkewCorrectedDate = (systemClockOffset) => new Date(Date.now() + systemClockOffset);

const isClockSkewed = (clockTime, systemClockOffset) => Math.abs(getSkewCorrectedDate(systemClockOffset).getTime() - clockTime) >= 300000;

const getUpdatedSystemClockOffset = (clockTime, currentSystemClockOffset) => {
    const clockTimeInMs = Date.parse(clockTime);
    if (isClockSkewed(clockTimeInMs, currentSystemClockOffset)) {
        return clockTimeInMs - Date.now();
    }
    return currentSystemClockOffset;
};

const throwSigningPropertyError = (name, property) => {
    if (!property) {
        throw new Error(`Property \`${name}\` is not resolved for AWS SDK SigV4Auth`);
    }
    return property;
};
const validateSigningProperties = async (signingProperties) => {
    const context = throwSigningPropertyError("context", signingProperties.context);
    const config = throwSigningPropertyError("config", signingProperties.config);
    const authScheme = context.endpointV2?.properties?.authSchemes?.[0];
    const signerFunction = throwSigningPropertyError("signer", config.signer);
    const signer = await signerFunction(authScheme);
    const signingRegion = signingProperties?.signingRegion;
    const signingRegionSet = signingProperties?.signingRegionSet;
    const signingName = signingProperties?.signingName;
    return {
        config,
        signer,
        signingRegion,
        signingRegionSet,
        signingName,
    };
};
class AwsSdkSigV4Signer {
    async sign(httpRequest, identity, signingProperties) {
        if (!protocolHttp.HttpRequest.isInstance(httpRequest)) {
            throw new Error("The request is not an instance of `HttpRequest` and cannot be signed");
        }
        const validatedProps = await validateSigningProperties(signingProperties);
        const { config, signer } = validatedProps;
        let { signingRegion, signingName } = validatedProps;
        const handlerExecutionContext = signingProperties.context;
        if (handlerExecutionContext?.authSchemes?.length ?? 0 > 1) {
            const [first, second] = handlerExecutionContext.authSchemes;
            if (first?.name === "sigv4a" && second?.name === "sigv4") {
                signingRegion = second?.signingRegion ?? signingRegion;
                signingName = second?.signingName ?? signingName;
            }
        }
        const signedRequest = await signer.sign(httpRequest, {
            signingDate: getSkewCorrectedDate(config.systemClockOffset),
            signingRegion: signingRegion,
            signingService: signingName,
        });
        return signedRequest;
    }
    errorHandler(signingProperties) {
        return (error) => {
            const serverTime = error.ServerTime ?? getDateHeader(error.$response);
            if (serverTime) {
                const config = throwSigningPropertyError("config", signingProperties.config);
                const initialSystemClockOffset = config.systemClockOffset;
                config.systemClockOffset = getUpdatedSystemClockOffset(serverTime, config.systemClockOffset);
                const clockSkewCorrected = config.systemClockOffset !== initialSystemClockOffset;
                if (clockSkewCorrected && error.$metadata) {
                    error.$metadata.clockSkewCorrected = true;
                }
            }
            throw error;
        };
    }
    successHandler(httpResponse, signingProperties) {
        const dateHeader = getDateHeader(httpResponse);
        if (dateHeader) {
            const config = throwSigningPropertyError("config", signingProperties.config);
            config.systemClockOffset = getUpdatedSystemClockOffset(dateHeader, config.systemClockOffset);
        }
    }
}
const AWSSDKSigV4Signer = AwsSdkSigV4Signer;

class AwsSdkSigV4ASigner extends AwsSdkSigV4Signer {
    async sign(httpRequest, identity, signingProperties) {
        if (!protocolHttp.HttpRequest.isInstance(httpRequest)) {
            throw new Error("The request is not an instance of `HttpRequest` and cannot be signed");
        }
        const { config, signer, signingRegion, signingRegionSet, signingName } = await validateSigningProperties(signingProperties);
        const configResolvedSigningRegionSet = await config.sigv4aSigningRegionSet?.();
        const multiRegionOverride = (configResolvedSigningRegionSet ??
            signingRegionSet ?? [signingRegion]).join(",");
        const signedRequest = await signer.sign(httpRequest, {
            signingDate: getSkewCorrectedDate(config.systemClockOffset),
            signingRegion: multiRegionOverride,
            signingService: signingName,
        });
        return signedRequest;
    }
}

const getArrayForCommaSeparatedString = (str) => typeof str === "string" && str.length > 0 ? str.split(",").map((item) => item.trim()) : [];

const getBearerTokenEnvKey = (signingName) => `AWS_BEARER_TOKEN_${signingName.replace(/[\s-]/g, "_").toUpperCase()}`;

const NODE_AUTH_SCHEME_PREFERENCE_ENV_KEY = "AWS_AUTH_SCHEME_PREFERENCE";
const NODE_AUTH_SCHEME_PREFERENCE_CONFIG_KEY = "auth_scheme_preference";
const NODE_AUTH_SCHEME_PREFERENCE_OPTIONS = {
    environmentVariableSelector: (env, options) => {
        if (options?.signingName) {
            const bearerTokenKey = getBearerTokenEnvKey(options.signingName);
            if (bearerTokenKey in env)
                return ["httpBearerAuth"];
        }
        if (!(NODE_AUTH_SCHEME_PREFERENCE_ENV_KEY in env))
            return undefined;
        return getArrayForCommaSeparatedString(env[NODE_AUTH_SCHEME_PREFERENCE_ENV_KEY]);
    },
    configFileSelector: (profile) => {
        if (!(NODE_AUTH_SCHEME_PREFERENCE_CONFIG_KEY in profile))
            return undefined;
        return getArrayForCommaSeparatedString(profile[NODE_AUTH_SCHEME_PREFERENCE_CONFIG_KEY]);
    },
    default: [],
};

const resolveAwsSdkSigV4AConfig = (config) => {
    config.sigv4aSigningRegionSet = core.normalizeProvider(config.sigv4aSigningRegionSet);
    return config;
};
const NODE_SIGV4A_CONFIG_OPTIONS = {
    environmentVariableSelector(env) {
        if (env.AWS_SIGV4A_SIGNING_REGION_SET) {
            return env.AWS_SIGV4A_SIGNING_REGION_SET.split(",").map((_) => _.trim());
        }
        throw new propertyProvider.ProviderError("AWS_SIGV4A_SIGNING_REGION_SET not set in env.", {
            tryNextLink: true,
        });
    },
    configFileSelector(profile) {
        if (profile.sigv4a_signing_region_set) {
            return (profile.sigv4a_signing_region_set ?? "").split(",").map((_) => _.trim());
        }
        throw new propertyProvider.ProviderError("sigv4a_signing_region_set not set in profile.", {
            tryNextLink: true,
        });
    },
    default: undefined,
};

const resolveAwsSdkSigV4Config = (config) => {
    let inputCredentials = config.credentials;
    let isUserSupplied = !!config.credentials;
    let resolvedCredentials = undefined;
    Object.defineProperty(config, "credentials", {
        set(credentials) {
            if (credentials && credentials !== inputCredentials && credentials !== resolvedCredentials) {
                isUserSupplied = true;
            }
            inputCredentials = credentials;
            const memoizedProvider = normalizeCredentialProvider(config, {
                credentials: inputCredentials,
                credentialDefaultProvider: config.credentialDefaultProvider,
            });
            const boundProvider = bindCallerConfig(config, memoizedProvider);
            if (isUserSupplied && !boundProvider.attributed) {
                const isCredentialObject = typeof inputCredentials === "object" && inputCredentials !== null;
                resolvedCredentials = async (options) => {
                    const creds = await boundProvider(options);
                    const attributedCreds = creds;
                    if (isCredentialObject && (!attributedCreds.$source || Object.keys(attributedCreds.$source).length === 0)) {
                        return client.setCredentialFeature(attributedCreds, "CREDENTIALS_CODE", "e");
                    }
                    return attributedCreds;
                };
                resolvedCredentials.memoized = boundProvider.memoized;
                resolvedCredentials.configBound = boundProvider.configBound;
                resolvedCredentials.attributed = true;
            }
            else {
                resolvedCredentials = boundProvider;
            }
        },
        get() {
            return resolvedCredentials;
        },
        enumerable: true,
        configurable: true,
    });
    config.credentials = inputCredentials;
    const { signingEscapePath = true, systemClockOffset = config.systemClockOffset || 0, sha256, } = config;
    let signer;
    if (config.signer) {
        signer = core.normalizeProvider(config.signer);
    }
    else if (config.regionInfoProvider) {
        signer = () => core.normalizeProvider(config.region)()
            .then(async (region) => [
            (await config.regionInfoProvider(region, {
                useFipsEndpoint: await config.useFipsEndpoint(),
                useDualstackEndpoint: await config.useDualstackEndpoint(),
            })) || {},
            region,
        ])
            .then(([regionInfo, region]) => {
            const { signingRegion, signingService } = regionInfo;
            config.signingRegion = config.signingRegion || signingRegion || region;
            config.signingName = config.signingName || signingService || config.serviceId;
            const params = {
                ...config,
                credentials: config.credentials,
                region: config.signingRegion,
                service: config.signingName,
                sha256,
                uriEscapePath: signingEscapePath,
            };
            const SignerCtor = config.signerConstructor || signatureV4.SignatureV4;
            return new SignerCtor(params);
        });
    }
    else {
        signer = async (authScheme) => {
            authScheme = Object.assign({}, {
                name: "sigv4",
                signingName: config.signingName || config.defaultSigningName,
                signingRegion: await core.normalizeProvider(config.region)(),
                properties: {},
            }, authScheme);
            const signingRegion = authScheme.signingRegion;
            const signingService = authScheme.signingName;
            config.signingRegion = config.signingRegion || signingRegion;
            config.signingName = config.signingName || signingService || config.serviceId;
            const params = {
                ...config,
                credentials: config.credentials,
                region: config.signingRegion,
                service: config.signingName,
                sha256,
                uriEscapePath: signingEscapePath,
            };
            const SignerCtor = config.signerConstructor || signatureV4.SignatureV4;
            return new SignerCtor(params);
        };
    }
    const resolvedConfig = Object.assign(config, {
        systemClockOffset,
        signingEscapePath,
        signer,
    });
    return resolvedConfig;
};
const resolveAWSSDKSigV4Config = resolveAwsSdkSigV4Config;
function normalizeCredentialProvider(config, { credentials, credentialDefaultProvider, }) {
    let credentialsProvider;
    if (credentials) {
        if (!credentials?.memoized) {
            credentialsProvider = core.memoizeIdentityProvider(credentials, core.isIdentityExpired, core.doesIdentityRequireRefresh);
        }
        else {
            credentialsProvider = credentials;
        }
    }
    else {
        if (credentialDefaultProvider) {
            credentialsProvider = core.normalizeProvider(credentialDefaultProvider(Object.assign({}, config, {
                parentClientConfig: config,
            })));
        }
        else {
            credentialsProvider = async () => {
                throw new Error("@aws-sdk/core::resolveAwsSdkSigV4Config - `credentials` not provided and no credentialDefaultProvider was configured.");
            };
        }
    }
    credentialsProvider.memoized = true;
    return credentialsProvider;
}
function bindCallerConfig(config, credentialsProvider) {
    if (credentialsProvider.configBound) {
        return credentialsProvider;
    }
    const fn = async (options) => credentialsProvider({ ...options, callerClientConfig: config });
    fn.memoized = credentialsProvider.memoized;
    fn.configBound = true;
    return fn;
}

exports.AWSSDKSigV4Signer = AWSSDKSigV4Signer;
exports.AwsSdkSigV4ASigner = AwsSdkSigV4ASigner;
exports.AwsSdkSigV4Signer = AwsSdkSigV4Signer;
exports.NODE_AUTH_SCHEME_PREFERENCE_OPTIONS = NODE_AUTH_SCHEME_PREFERENCE_OPTIONS;
exports.NODE_SIGV4A_CONFIG_OPTIONS = NODE_SIGV4A_CONFIG_OPTIONS;
exports.getBearerTokenEnvKey = getBearerTokenEnvKey;
exports.resolveAWSSDKSigV4Config = resolveAWSSDKSigV4Config;
exports.resolveAwsSdkSigV4AConfig = resolveAwsSdkSigV4AConfig;
exports.resolveAwsSdkSigV4Config = resolveAwsSdkSigV4Config;
exports.validateSigningProperties = validateSigningProperties;


/***/ }),

/***/ 37288:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var cbor = __webpack_require__(64645);
var schema = __webpack_require__(26890);
var smithyClient = __webpack_require__(61411);
var protocols = __webpack_require__(93422);
var serde = __webpack_require__(92430);
var utilBase64 = __webpack_require__(68385);
var utilUtf8 = __webpack_require__(71577);
var xmlBuilder = __webpack_require__(94274);

class ProtocolLib {
    queryCompat;
    errorRegistry;
    constructor(queryCompat = false) {
        this.queryCompat = queryCompat;
    }
    resolveRestContentType(defaultContentType, inputSchema) {
        const members = inputSchema.getMemberSchemas();
        const httpPayloadMember = Object.values(members).find((m) => {
            return !!m.getMergedTraits().httpPayload;
        });
        if (httpPayloadMember) {
            const mediaType = httpPayloadMember.getMergedTraits().mediaType;
            if (mediaType) {
                return mediaType;
            }
            else if (httpPayloadMember.isStringSchema()) {
                return "text/plain";
            }
            else if (httpPayloadMember.isBlobSchema()) {
                return "application/octet-stream";
            }
            else {
                return defaultContentType;
            }
        }
        else if (!inputSchema.isUnitSchema()) {
            const hasBody = Object.values(members).find((m) => {
                const { httpQuery, httpQueryParams, httpHeader, httpLabel, httpPrefixHeaders } = m.getMergedTraits();
                const noPrefixHeaders = httpPrefixHeaders === void 0;
                return !httpQuery && !httpQueryParams && !httpHeader && !httpLabel && noPrefixHeaders;
            });
            if (hasBody) {
                return defaultContentType;
            }
        }
    }
    async getErrorSchemaOrThrowBaseException(errorIdentifier, defaultNamespace, response, dataObject, metadata, getErrorSchema) {
        let errorName = errorIdentifier;
        if (errorIdentifier.includes("#")) {
            [, errorName] = errorIdentifier.split("#");
        }
        const errorMetadata = {
            $metadata: metadata,
            $fault: response.statusCode < 500 ? "client" : "server",
        };
        if (!this.errorRegistry) {
            throw new Error("@aws-sdk/core/protocols - error handler not initialized.");
        }
        try {
            const errorSchema = getErrorSchema?.(this.errorRegistry, errorName) ??
                this.errorRegistry.getSchema(errorIdentifier);
            return { errorSchema, errorMetadata };
        }
        catch (e) {
            dataObject.message = dataObject.message ?? dataObject.Message ?? "UnknownError";
            const synthetic = this.errorRegistry;
            const baseExceptionSchema = synthetic.getBaseException();
            if (baseExceptionSchema) {
                const ErrorCtor = synthetic.getErrorCtor(baseExceptionSchema) ?? Error;
                throw this.decorateServiceException(Object.assign(new ErrorCtor({ name: errorName }), errorMetadata), dataObject);
            }
            const d = dataObject;
            const message = d?.message ?? d?.Message ?? d?.Error?.Message ?? d?.Error?.message;
            throw this.decorateServiceException(Object.assign(new Error(message), {
                name: errorName,
            }, errorMetadata), dataObject);
        }
    }
    compose(composite, errorIdentifier, defaultNamespace) {
        let namespace = defaultNamespace;
        if (errorIdentifier.includes("#")) {
            [namespace] = errorIdentifier.split("#");
        }
        const staticRegistry = schema.TypeRegistry.for(namespace);
        const defaultSyntheticRegistry = schema.TypeRegistry.for("smithy.ts.sdk.synthetic." + defaultNamespace);
        composite.copyFrom(staticRegistry);
        composite.copyFrom(defaultSyntheticRegistry);
        this.errorRegistry = composite;
    }
    decorateServiceException(exception, additions = {}) {
        if (this.queryCompat) {
            const msg = exception.Message ?? additions.Message;
            const error = smithyClient.decorateServiceException(exception, additions);
            if (msg) {
                error.message = msg;
            }
            error.Error = {
                ...error.Error,
                Type: error.Error?.Type,
                Code: error.Error?.Code,
                Message: error.Error?.message ?? error.Error?.Message ?? msg,
            };
            const reqId = error.$metadata.requestId;
            if (reqId) {
                error.RequestId = reqId;
            }
            return error;
        }
        return smithyClient.decorateServiceException(exception, additions);
    }
    setQueryCompatError(output, response) {
        const queryErrorHeader = response.headers?.["x-amzn-query-error"];
        if (output !== undefined && queryErrorHeader != null) {
            const [Code, Type] = queryErrorHeader.split(";");
            const entries = Object.entries(output);
            const Error = {
                Code,
                Type,
            };
            Object.assign(output, Error);
            for (const [k, v] of entries) {
                Error[k === "message" ? "Message" : k] = v;
            }
            delete Error.__type;
            output.Error = Error;
        }
    }
    queryCompatOutput(queryCompatErrorData, errorData) {
        if (queryCompatErrorData.Error) {
            errorData.Error = queryCompatErrorData.Error;
        }
        if (queryCompatErrorData.Type) {
            errorData.Type = queryCompatErrorData.Type;
        }
        if (queryCompatErrorData.Code) {
            errorData.Code = queryCompatErrorData.Code;
        }
    }
    findQueryCompatibleError(registry, errorName) {
        try {
            return registry.getSchema(errorName);
        }
        catch (e) {
            return registry.find((schema$1) => schema.NormalizedSchema.of(schema$1).getMergedTraits().awsQueryError?.[0] === errorName);
        }
    }
}

class AwsSmithyRpcV2CborProtocol extends cbor.SmithyRpcV2CborProtocol {
    awsQueryCompatible;
    mixin;
    constructor({ defaultNamespace, errorTypeRegistries, awsQueryCompatible, }) {
        super({ defaultNamespace, errorTypeRegistries });
        this.awsQueryCompatible = !!awsQueryCompatible;
        this.mixin = new ProtocolLib(this.awsQueryCompatible);
    }
    async serializeRequest(operationSchema, input, context) {
        const request = await super.serializeRequest(operationSchema, input, context);
        if (this.awsQueryCompatible) {
            request.headers["x-amzn-query-mode"] = "true";
        }
        return request;
    }
    async handleError(operationSchema, context, response, dataObject, metadata) {
        if (this.awsQueryCompatible) {
            this.mixin.setQueryCompatError(dataObject, response);
        }
        const errorName = (() => {
            const compatHeader = response.headers["x-amzn-query-error"];
            if (compatHeader && this.awsQueryCompatible) {
                return compatHeader.split(";")[0];
            }
            return cbor.loadSmithyRpcV2CborErrorCode(response, dataObject) ?? "Unknown";
        })();
        this.mixin.compose(this.compositeErrorRegistry, errorName, this.options.defaultNamespace);
        const { errorSchema, errorMetadata } = await this.mixin.getErrorSchemaOrThrowBaseException(errorName, this.options.defaultNamespace, response, dataObject, metadata, this.awsQueryCompatible ? this.mixin.findQueryCompatibleError : undefined);
        const ns = schema.NormalizedSchema.of(errorSchema);
        const message = dataObject.message ?? dataObject.Message ?? "UnknownError";
        const ErrorCtor = this.compositeErrorRegistry.getErrorCtor(errorSchema) ?? Error;
        const exception = new ErrorCtor(message);
        const output = {};
        for (const [name, member] of ns.structIterator()) {
            if (dataObject[name] != null) {
                output[name] = this.deserializer.readValue(member, dataObject[name]);
            }
        }
        if (this.awsQueryCompatible) {
            this.mixin.queryCompatOutput(dataObject, output);
        }
        throw this.mixin.decorateServiceException(Object.assign(exception, errorMetadata, {
            $fault: ns.getMergedTraits().error,
            message,
        }, output), dataObject);
    }
}

const _toStr = (val) => {
    if (val == null) {
        return val;
    }
    if (typeof val === "number" || typeof val === "bigint") {
        const warning = new Error(`Received number ${val} where a string was expected.`);
        warning.name = "Warning";
        console.warn(warning);
        return String(val);
    }
    if (typeof val === "boolean") {
        const warning = new Error(`Received boolean ${val} where a string was expected.`);
        warning.name = "Warning";
        console.warn(warning);
        return String(val);
    }
    return val;
};
const _toBool = (val) => {
    if (val == null) {
        return val;
    }
    if (typeof val === "string") {
        const lowercase = val.toLowerCase();
        if (val !== "" && lowercase !== "false" && lowercase !== "true") {
            const warning = new Error(`Received string "${val}" where a boolean was expected.`);
            warning.name = "Warning";
            console.warn(warning);
        }
        return val !== "" && lowercase !== "false";
    }
    return val;
};
const _toNum = (val) => {
    if (val == null) {
        return val;
    }
    if (typeof val === "string") {
        const num = Number(val);
        if (num.toString() !== val) {
            const warning = new Error(`Received string "${val}" where a number was expected.`);
            warning.name = "Warning";
            console.warn(warning);
            return val;
        }
        return num;
    }
    return val;
};

class SerdeContextConfig {
    serdeContext;
    setSerdeContext(serdeContext) {
        this.serdeContext = serdeContext;
    }
}

class UnionSerde {
    from;
    to;
    keys;
    constructor(from, to) {
        this.from = from;
        this.to = to;
        this.keys = new Set(Object.keys(this.from).filter((k) => k !== "__type"));
    }
    mark(key) {
        this.keys.delete(key);
    }
    hasUnknown() {
        return this.keys.size === 1 && Object.keys(this.to).length === 0;
    }
    writeUnknown() {
        if (this.hasUnknown()) {
            const k = this.keys.values().next().value;
            const v = this.from[k];
            this.to.$unknown = [k, v];
        }
    }
}

function jsonReviver(key, value, context) {
    if (context?.source) {
        const numericString = context.source;
        if (typeof value === "number") {
            if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER || numericString !== String(value)) {
                const isFractional = numericString.includes(".");
                if (isFractional) {
                    return new serde.NumericValue(numericString, "bigDecimal");
                }
                else {
                    return BigInt(numericString);
                }
            }
        }
    }
    return value;
}

const collectBodyString = (streamBody, context) => smithyClient.collectBody(streamBody, context).then((body) => (context?.utf8Encoder ?? utilUtf8.toUtf8)(body));

const parseJsonBody = (streamBody, context) => collectBodyString(streamBody, context).then((encoded) => {
    if (encoded.length) {
        try {
            return JSON.parse(encoded);
        }
        catch (e) {
            if (e?.name === "SyntaxError") {
                Object.defineProperty(e, "$responseBodyText", {
                    value: encoded,
                });
            }
            throw e;
        }
    }
    return {};
});
const parseJsonErrorBody = async (errorBody, context) => {
    const value = await parseJsonBody(errorBody, context);
    value.message = value.message ?? value.Message;
    return value;
};
const loadRestJsonErrorCode = (output, data) => {
    const findKey = (object, key) => Object.keys(object).find((k) => k.toLowerCase() === key.toLowerCase());
    const sanitizeErrorCode = (rawValue) => {
        let cleanValue = rawValue;
        if (typeof cleanValue === "number") {
            cleanValue = cleanValue.toString();
        }
        if (cleanValue.indexOf(",") >= 0) {
            cleanValue = cleanValue.split(",")[0];
        }
        if (cleanValue.indexOf(":") >= 0) {
            cleanValue = cleanValue.split(":")[0];
        }
        if (cleanValue.indexOf("#") >= 0) {
            cleanValue = cleanValue.split("#")[1];
        }
        return cleanValue;
    };
    const headerKey = findKey(output.headers, "x-amzn-errortype");
    if (headerKey !== undefined) {
        return sanitizeErrorCode(output.headers[headerKey]);
    }
    if (data && typeof data === "object") {
        const codeKey = findKey(data, "code");
        if (codeKey && data[codeKey] !== undefined) {
            return sanitizeErrorCode(data[codeKey]);
        }
        if (data["__type"] !== undefined) {
            return sanitizeErrorCode(data["__type"]);
        }
    }
};

class JsonShapeDeserializer extends SerdeContextConfig {
    settings;
    constructor(settings) {
        super();
        this.settings = settings;
    }
    async read(schema, data) {
        return this._read(schema, typeof data === "string" ? JSON.parse(data, jsonReviver) : await parseJsonBody(data, this.serdeContext));
    }
    readObject(schema, data) {
        return this._read(schema, data);
    }
    _read(schema$1, value) {
        const isObject = value !== null && typeof value === "object";
        const ns = schema.NormalizedSchema.of(schema$1);
        if (isObject) {
            if (ns.isStructSchema()) {
                const record = value;
                const union = ns.isUnionSchema();
                const out = {};
                let nameMap = void 0;
                const { jsonName } = this.settings;
                if (jsonName) {
                    nameMap = {};
                }
                let unionSerde;
                if (union) {
                    unionSerde = new UnionSerde(record, out);
                }
                for (const [memberName, memberSchema] of ns.structIterator()) {
                    let fromKey = memberName;
                    if (jsonName) {
                        fromKey = memberSchema.getMergedTraits().jsonName ?? fromKey;
                        nameMap[fromKey] = memberName;
                    }
                    if (union) {
                        unionSerde.mark(fromKey);
                    }
                    if (record[fromKey] != null) {
                        out[memberName] = this._read(memberSchema, record[fromKey]);
                    }
                }
                if (union) {
                    unionSerde.writeUnknown();
                }
                else if (typeof record.__type === "string") {
                    for (const [k, v] of Object.entries(record)) {
                        const t = jsonName ? nameMap[k] ?? k : k;
                        if (!(t in out)) {
                            out[t] = v;
                        }
                    }
                }
                return out;
            }
            if (Array.isArray(value) && ns.isListSchema()) {
                const listMember = ns.getValueSchema();
                const out = [];
                for (const item of value) {
                    out.push(this._read(listMember, item));
                }
                return out;
            }
            if (ns.isMapSchema()) {
                const mapMember = ns.getValueSchema();
                const out = {};
                for (const [_k, _v] of Object.entries(value)) {
                    out[_k] = this._read(mapMember, _v);
                }
                return out;
            }
        }
        if (ns.isBlobSchema() && typeof value === "string") {
            return utilBase64.fromBase64(value);
        }
        const mediaType = ns.getMergedTraits().mediaType;
        if (ns.isStringSchema() && typeof value === "string" && mediaType) {
            const isJson = mediaType === "application/json" || mediaType.endsWith("+json");
            if (isJson) {
                return serde.LazyJsonString.from(value);
            }
            return value;
        }
        if (ns.isTimestampSchema() && value != null) {
            const format = protocols.determineTimestampFormat(ns, this.settings);
            switch (format) {
                case 5:
                    return serde.parseRfc3339DateTimeWithOffset(value);
                case 6:
                    return serde.parseRfc7231DateTime(value);
                case 7:
                    return serde.parseEpochTimestamp(value);
                default:
                    console.warn("Missing timestamp format, parsing value with Date constructor:", value);
                    return new Date(value);
            }
        }
        if (ns.isBigIntegerSchema() && (typeof value === "number" || typeof value === "string")) {
            return BigInt(value);
        }
        if (ns.isBigDecimalSchema() && value != undefined) {
            if (value instanceof serde.NumericValue) {
                return value;
            }
            const untyped = value;
            if (untyped.type === "bigDecimal" && "string" in untyped) {
                return new serde.NumericValue(untyped.string, untyped.type);
            }
            return new serde.NumericValue(String(value), "bigDecimal");
        }
        if (ns.isNumericSchema() && typeof value === "string") {
            switch (value) {
                case "Infinity":
                    return Infinity;
                case "-Infinity":
                    return -Infinity;
                case "NaN":
                    return NaN;
            }
            return value;
        }
        if (ns.isDocumentSchema()) {
            if (isObject) {
                const out = Array.isArray(value) ? [] : {};
                for (const [k, v] of Object.entries(value)) {
                    if (v instanceof serde.NumericValue) {
                        out[k] = v;
                    }
                    else {
                        out[k] = this._read(ns, v);
                    }
                }
                return out;
            }
            else {
                return structuredClone(value);
            }
        }
        return value;
    }
}

const NUMERIC_CONTROL_CHAR = String.fromCharCode(925);
class JsonReplacer {
    values = new Map();
    counter = 0;
    stage = 0;
    createReplacer() {
        if (this.stage === 1) {
            throw new Error("@aws-sdk/core/protocols - JsonReplacer already created.");
        }
        if (this.stage === 2) {
            throw new Error("@aws-sdk/core/protocols - JsonReplacer exhausted.");
        }
        this.stage = 1;
        return (key, value) => {
            if (value instanceof serde.NumericValue) {
                const v = `${NUMERIC_CONTROL_CHAR + "nv" + this.counter++}_` + value.string;
                this.values.set(`"${v}"`, value.string);
                return v;
            }
            if (typeof value === "bigint") {
                const s = value.toString();
                const v = `${NUMERIC_CONTROL_CHAR + "b" + this.counter++}_` + s;
                this.values.set(`"${v}"`, s);
                return v;
            }
            return value;
        };
    }
    replaceInJson(json) {
        if (this.stage === 0) {
            throw new Error("@aws-sdk/core/protocols - JsonReplacer not created yet.");
        }
        if (this.stage === 2) {
            throw new Error("@aws-sdk/core/protocols - JsonReplacer exhausted.");
        }
        this.stage = 2;
        if (this.counter === 0) {
            return json;
        }
        for (const [key, value] of this.values) {
            json = json.replace(key, value);
        }
        return json;
    }
}

class JsonShapeSerializer extends SerdeContextConfig {
    settings;
    buffer;
    useReplacer = false;
    rootSchema;
    constructor(settings) {
        super();
        this.settings = settings;
    }
    write(schema$1, value) {
        this.rootSchema = schema.NormalizedSchema.of(schema$1);
        this.buffer = this._write(this.rootSchema, value);
    }
    writeDiscriminatedDocument(schema$1, value) {
        this.write(schema$1, value);
        if (typeof this.buffer === "object") {
            this.buffer.__type = schema.NormalizedSchema.of(schema$1).getName(true);
        }
    }
    flush() {
        const { rootSchema, useReplacer } = this;
        this.rootSchema = undefined;
        this.useReplacer = false;
        if (rootSchema?.isStructSchema() || rootSchema?.isDocumentSchema()) {
            if (!useReplacer) {
                return JSON.stringify(this.buffer);
            }
            const replacer = new JsonReplacer();
            return replacer.replaceInJson(JSON.stringify(this.buffer, replacer.createReplacer(), 0));
        }
        return this.buffer;
    }
    _write(schema$1, value, container) {
        const isObject = value !== null && typeof value === "object";
        const ns = schema.NormalizedSchema.of(schema$1);
        if (isObject) {
            if (ns.isStructSchema()) {
                const record = value;
                const out = {};
                const { jsonName } = this.settings;
                let nameMap = void 0;
                if (jsonName) {
                    nameMap = {};
                }
                for (const [memberName, memberSchema] of ns.structIterator()) {
                    const serializableValue = this._write(memberSchema, record[memberName], ns);
                    if (serializableValue !== undefined) {
                        let targetKey = memberName;
                        if (jsonName) {
                            targetKey = memberSchema.getMergedTraits().jsonName ?? memberName;
                            nameMap[memberName] = targetKey;
                        }
                        out[targetKey] = serializableValue;
                    }
                }
                if (ns.isUnionSchema() && Object.keys(out).length === 0) {
                    const { $unknown } = record;
                    if (Array.isArray($unknown)) {
                        const [k, v] = $unknown;
                        out[k] = this._write(15, v);
                    }
                }
                else if (typeof record.__type === "string") {
                    for (const [k, v] of Object.entries(record)) {
                        const targetKey = jsonName ? nameMap[k] ?? k : k;
                        if (!(targetKey in out)) {
                            out[targetKey] = this._write(15, v);
                        }
                    }
                }
                return out;
            }
            if (Array.isArray(value) && ns.isListSchema()) {
                const listMember = ns.getValueSchema();
                const out = [];
                const sparse = !!ns.getMergedTraits().sparse;
                for (const item of value) {
                    if (sparse || item != null) {
                        out.push(this._write(listMember, item));
                    }
                }
                return out;
            }
            if (ns.isMapSchema()) {
                const mapMember = ns.getValueSchema();
                const out = {};
                const sparse = !!ns.getMergedTraits().sparse;
                for (const [_k, _v] of Object.entries(value)) {
                    if (sparse || _v != null) {
                        out[_k] = this._write(mapMember, _v);
                    }
                }
                return out;
            }
            if (value instanceof Uint8Array && (ns.isBlobSchema() || ns.isDocumentSchema())) {
                if (ns === this.rootSchema) {
                    return value;
                }
                return (this.serdeContext?.base64Encoder ?? utilBase64.toBase64)(value);
            }
            if (value instanceof Date && (ns.isTimestampSchema() || ns.isDocumentSchema())) {
                const format = protocols.determineTimestampFormat(ns, this.settings);
                switch (format) {
                    case 5:
                        return value.toISOString().replace(".000Z", "Z");
                    case 6:
                        return serde.dateToUtcString(value);
                    case 7:
                        return value.getTime() / 1000;
                    default:
                        console.warn("Missing timestamp format, using epoch seconds", value);
                        return value.getTime() / 1000;
                }
            }
            if (value instanceof serde.NumericValue) {
                this.useReplacer = true;
            }
        }
        if (value === null && container?.isStructSchema()) {
            return void 0;
        }
        if (ns.isStringSchema()) {
            if (typeof value === "undefined" && ns.isIdempotencyToken()) {
                return serde.generateIdempotencyToken();
            }
            const mediaType = ns.getMergedTraits().mediaType;
            if (value != null && mediaType) {
                const isJson = mediaType === "application/json" || mediaType.endsWith("+json");
                if (isJson) {
                    return serde.LazyJsonString.from(value);
                }
            }
            return value;
        }
        if (typeof value === "number" && ns.isNumericSchema()) {
            if (Math.abs(value) === Infinity || isNaN(value)) {
                return String(value);
            }
            return value;
        }
        if (typeof value === "string" && ns.isBlobSchema()) {
            if (ns === this.rootSchema) {
                return value;
            }
            return (this.serdeContext?.base64Encoder ?? utilBase64.toBase64)(value);
        }
        if (typeof value === "bigint") {
            this.useReplacer = true;
        }
        if (ns.isDocumentSchema()) {
            if (isObject) {
                const out = Array.isArray(value) ? [] : {};
                for (const [k, v] of Object.entries(value)) {
                    if (v instanceof serde.NumericValue) {
                        this.useReplacer = true;
                        out[k] = v;
                    }
                    else {
                        out[k] = this._write(ns, v);
                    }
                }
                return out;
            }
            else {
                return structuredClone(value);
            }
        }
        return value;
    }
}

class JsonCodec extends SerdeContextConfig {
    settings;
    constructor(settings) {
        super();
        this.settings = settings;
    }
    createSerializer() {
        const serializer = new JsonShapeSerializer(this.settings);
        serializer.setSerdeContext(this.serdeContext);
        return serializer;
    }
    createDeserializer() {
        const deserializer = new JsonShapeDeserializer(this.settings);
        deserializer.setSerdeContext(this.serdeContext);
        return deserializer;
    }
}

class AwsJsonRpcProtocol extends protocols.RpcProtocol {
    serializer;
    deserializer;
    serviceTarget;
    codec;
    mixin;
    awsQueryCompatible;
    constructor({ defaultNamespace, errorTypeRegistries, serviceTarget, awsQueryCompatible, jsonCodec, }) {
        super({
            defaultNamespace,
            errorTypeRegistries,
        });
        this.serviceTarget = serviceTarget;
        this.codec =
            jsonCodec ??
                new JsonCodec({
                    timestampFormat: {
                        useTrait: true,
                        default: 7,
                    },
                    jsonName: false,
                });
        this.serializer = this.codec.createSerializer();
        this.deserializer = this.codec.createDeserializer();
        this.awsQueryCompatible = !!awsQueryCompatible;
        this.mixin = new ProtocolLib(this.awsQueryCompatible);
    }
    async serializeRequest(operationSchema, input, context) {
        const request = await super.serializeRequest(operationSchema, input, context);
        if (!request.path.endsWith("/")) {
            request.path += "/";
        }
        Object.assign(request.headers, {
            "content-type": `application/x-amz-json-${this.getJsonRpcVersion()}`,
            "x-amz-target": `${this.serviceTarget}.${operationSchema.name}`,
        });
        if (this.awsQueryCompatible) {
            request.headers["x-amzn-query-mode"] = "true";
        }
        if (schema.deref(operationSchema.input) === "unit" || !request.body) {
            request.body = "{}";
        }
        return request;
    }
    getPayloadCodec() {
        return this.codec;
    }
    async handleError(operationSchema, context, response, dataObject, metadata) {
        if (this.awsQueryCompatible) {
            this.mixin.setQueryCompatError(dataObject, response);
        }
        const errorIdentifier = loadRestJsonErrorCode(response, dataObject) ?? "Unknown";
        this.mixin.compose(this.compositeErrorRegistry, errorIdentifier, this.options.defaultNamespace);
        const { errorSchema, errorMetadata } = await this.mixin.getErrorSchemaOrThrowBaseException(errorIdentifier, this.options.defaultNamespace, response, dataObject, metadata, this.awsQueryCompatible ? this.mixin.findQueryCompatibleError : undefined);
        const ns = schema.NormalizedSchema.of(errorSchema);
        const message = dataObject.message ?? dataObject.Message ?? "UnknownError";
        const ErrorCtor = this.compositeErrorRegistry.getErrorCtor(errorSchema) ?? Error;
        const exception = new ErrorCtor(message);
        const output = {};
        for (const [name, member] of ns.structIterator()) {
            if (dataObject[name] != null) {
                output[name] = this.codec.createDeserializer().readObject(member, dataObject[name]);
            }
        }
        if (this.awsQueryCompatible) {
            this.mixin.queryCompatOutput(dataObject, output);
        }
        throw this.mixin.decorateServiceException(Object.assign(exception, errorMetadata, {
            $fault: ns.getMergedTraits().error,
            message,
        }, output), dataObject);
    }
}

class AwsJson1_0Protocol extends AwsJsonRpcProtocol {
    constructor({ defaultNamespace, errorTypeRegistries, serviceTarget, awsQueryCompatible, jsonCodec, }) {
        super({
            defaultNamespace,
            errorTypeRegistries,
            serviceTarget,
            awsQueryCompatible,
            jsonCodec,
        });
    }
    getShapeId() {
        return "aws.protocols#awsJson1_0";
    }
    getJsonRpcVersion() {
        return "1.0";
    }
    getDefaultContentType() {
        return "application/x-amz-json-1.0";
    }
}

class AwsJson1_1Protocol extends AwsJsonRpcProtocol {
    constructor({ defaultNamespace, errorTypeRegistries, serviceTarget, awsQueryCompatible, jsonCodec, }) {
        super({
            defaultNamespace,
            errorTypeRegistries,
            serviceTarget,
            awsQueryCompatible,
            jsonCodec,
        });
    }
    getShapeId() {
        return "aws.protocols#awsJson1_1";
    }
    getJsonRpcVersion() {
        return "1.1";
    }
    getDefaultContentType() {
        return "application/x-amz-json-1.1";
    }
}

class AwsRestJsonProtocol extends protocols.HttpBindingProtocol {
    serializer;
    deserializer;
    codec;
    mixin = new ProtocolLib();
    constructor({ defaultNamespace, errorTypeRegistries, }) {
        super({
            defaultNamespace,
            errorTypeRegistries,
        });
        const settings = {
            timestampFormat: {
                useTrait: true,
                default: 7,
            },
            httpBindings: true,
            jsonName: true,
        };
        this.codec = new JsonCodec(settings);
        this.serializer = new protocols.HttpInterceptingShapeSerializer(this.codec.createSerializer(), settings);
        this.deserializer = new protocols.HttpInterceptingShapeDeserializer(this.codec.createDeserializer(), settings);
    }
    getShapeId() {
        return "aws.protocols#restJson1";
    }
    getPayloadCodec() {
        return this.codec;
    }
    setSerdeContext(serdeContext) {
        this.codec.setSerdeContext(serdeContext);
        super.setSerdeContext(serdeContext);
    }
    async serializeRequest(operationSchema, input, context) {
        const request = await super.serializeRequest(operationSchema, input, context);
        const inputSchema = schema.NormalizedSchema.of(operationSchema.input);
        if (!request.headers["content-type"]) {
            const contentType = this.mixin.resolveRestContentType(this.getDefaultContentType(), inputSchema);
            if (contentType) {
                request.headers["content-type"] = contentType;
            }
        }
        if (request.body == null && request.headers["content-type"] === this.getDefaultContentType()) {
            request.body = "{}";
        }
        return request;
    }
    async deserializeResponse(operationSchema, context, response) {
        const output = await super.deserializeResponse(operationSchema, context, response);
        const outputSchema = schema.NormalizedSchema.of(operationSchema.output);
        for (const [name, member] of outputSchema.structIterator()) {
            if (member.getMemberTraits().httpPayload && !(name in output)) {
                output[name] = null;
            }
        }
        return output;
    }
    async handleError(operationSchema, context, response, dataObject, metadata) {
        const errorIdentifier = loadRestJsonErrorCode(response, dataObject) ?? "Unknown";
        this.mixin.compose(this.compositeErrorRegistry, errorIdentifier, this.options.defaultNamespace);
        const { errorSchema, errorMetadata } = await this.mixin.getErrorSchemaOrThrowBaseException(errorIdentifier, this.options.defaultNamespace, response, dataObject, metadata);
        const ns = schema.NormalizedSchema.of(errorSchema);
        const message = dataObject.message ?? dataObject.Message ?? "UnknownError";
        const ErrorCtor = this.compositeErrorRegistry.getErrorCtor(errorSchema) ?? Error;
        const exception = new ErrorCtor(message);
        await this.deserializeHttpMessage(errorSchema, context, response, dataObject);
        const output = {};
        for (const [name, member] of ns.structIterator()) {
            const target = member.getMergedTraits().jsonName ?? name;
            output[name] = this.codec.createDeserializer().readObject(member, dataObject[target]);
        }
        throw this.mixin.decorateServiceException(Object.assign(exception, errorMetadata, {
            $fault: ns.getMergedTraits().error,
            message,
        }, output), dataObject);
    }
    getDefaultContentType() {
        return "application/json";
    }
}

const awsExpectUnion = (value) => {
    if (value == null) {
        return undefined;
    }
    if (typeof value === "object" && "__type" in value) {
        delete value.__type;
    }
    return smithyClient.expectUnion(value);
};

class XmlShapeDeserializer extends SerdeContextConfig {
    settings;
    stringDeserializer;
    constructor(settings) {
        super();
        this.settings = settings;
        this.stringDeserializer = new protocols.FromStringShapeDeserializer(settings);
    }
    setSerdeContext(serdeContext) {
        this.serdeContext = serdeContext;
        this.stringDeserializer.setSerdeContext(serdeContext);
    }
    read(schema$1, bytes, key) {
        const ns = schema.NormalizedSchema.of(schema$1);
        const memberSchemas = ns.getMemberSchemas();
        const isEventPayload = ns.isStructSchema() &&
            ns.isMemberSchema() &&
            !!Object.values(memberSchemas).find((memberNs) => {
                return !!memberNs.getMemberTraits().eventPayload;
            });
        if (isEventPayload) {
            const output = {};
            const memberName = Object.keys(memberSchemas)[0];
            const eventMemberSchema = memberSchemas[memberName];
            if (eventMemberSchema.isBlobSchema()) {
                output[memberName] = bytes;
            }
            else {
                output[memberName] = this.read(memberSchemas[memberName], bytes);
            }
            return output;
        }
        const xmlString = (this.serdeContext?.utf8Encoder ?? utilUtf8.toUtf8)(bytes);
        const parsedObject = this.parseXml(xmlString);
        return this.readSchema(schema$1, key ? parsedObject[key] : parsedObject);
    }
    readSchema(_schema, value) {
        const ns = schema.NormalizedSchema.of(_schema);
        if (ns.isUnitSchema()) {
            return;
        }
        const traits = ns.getMergedTraits();
        if (ns.isListSchema() && !Array.isArray(value)) {
            return this.readSchema(ns, [value]);
        }
        if (value == null) {
            return value;
        }
        if (typeof value === "object") {
            const flat = !!traits.xmlFlattened;
            if (ns.isListSchema()) {
                const listValue = ns.getValueSchema();
                const buffer = [];
                const sourceKey = listValue.getMergedTraits().xmlName ?? "member";
                const source = flat ? value : (value[0] ?? value)[sourceKey];
                if (source == null) {
                    return buffer;
                }
                const sourceArray = Array.isArray(source) ? source : [source];
                for (const v of sourceArray) {
                    buffer.push(this.readSchema(listValue, v));
                }
                return buffer;
            }
            const buffer = {};
            if (ns.isMapSchema()) {
                const keyNs = ns.getKeySchema();
                const memberNs = ns.getValueSchema();
                let entries;
                if (flat) {
                    entries = Array.isArray(value) ? value : [value];
                }
                else {
                    entries = Array.isArray(value.entry) ? value.entry : [value.entry];
                }
                const keyProperty = keyNs.getMergedTraits().xmlName ?? "key";
                const valueProperty = memberNs.getMergedTraits().xmlName ?? "value";
                for (const entry of entries) {
                    const key = entry[keyProperty];
                    const value = entry[valueProperty];
                    buffer[key] = this.readSchema(memberNs, value);
                }
                return buffer;
            }
            if (ns.isStructSchema()) {
                const union = ns.isUnionSchema();
                let unionSerde;
                if (union) {
                    unionSerde = new UnionSerde(value, buffer);
                }
                for (const [memberName, memberSchema] of ns.structIterator()) {
                    const memberTraits = memberSchema.getMergedTraits();
                    const xmlObjectKey = !memberTraits.httpPayload
                        ? memberSchema.getMemberTraits().xmlName ?? memberName
                        : memberTraits.xmlName ?? memberSchema.getName();
                    if (union) {
                        unionSerde.mark(xmlObjectKey);
                    }
                    if (value[xmlObjectKey] != null) {
                        buffer[memberName] = this.readSchema(memberSchema, value[xmlObjectKey]);
                    }
                }
                if (union) {
                    unionSerde.writeUnknown();
                }
                return buffer;
            }
            if (ns.isDocumentSchema()) {
                return value;
            }
            throw new Error(`@aws-sdk/core/protocols - xml deserializer unhandled schema type for ${ns.getName(true)}`);
        }
        if (ns.isListSchema()) {
            return [];
        }
        if (ns.isMapSchema() || ns.isStructSchema()) {
            return {};
        }
        return this.stringDeserializer.read(ns, value);
    }
    parseXml(xml) {
        if (xml.length) {
            let parsedObj;
            try {
                parsedObj = xmlBuilder.parseXML(xml);
            }
            catch (e) {
                if (e && typeof e === "object") {
                    Object.defineProperty(e, "$responseBodyText", {
                        value: xml,
                    });
                }
                throw e;
            }
            const textNodeName = "#text";
            const key = Object.keys(parsedObj)[0];
            const parsedObjToReturn = parsedObj[key];
            if (parsedObjToReturn[textNodeName]) {
                parsedObjToReturn[key] = parsedObjToReturn[textNodeName];
                delete parsedObjToReturn[textNodeName];
            }
            return smithyClient.getValueFromTextNode(parsedObjToReturn);
        }
        return {};
    }
}

class QueryShapeSerializer extends SerdeContextConfig {
    settings;
    buffer;
    constructor(settings) {
        super();
        this.settings = settings;
    }
    write(schema$1, value, prefix = "") {
        if (this.buffer === undefined) {
            this.buffer = "";
        }
        const ns = schema.NormalizedSchema.of(schema$1);
        if (prefix && !prefix.endsWith(".")) {
            prefix += ".";
        }
        if (ns.isBlobSchema()) {
            if (typeof value === "string" || value instanceof Uint8Array) {
                this.writeKey(prefix);
                this.writeValue((this.serdeContext?.base64Encoder ?? utilBase64.toBase64)(value));
            }
        }
        else if (ns.isBooleanSchema() || ns.isNumericSchema() || ns.isStringSchema()) {
            if (value != null) {
                this.writeKey(prefix);
                this.writeValue(String(value));
            }
            else if (ns.isIdempotencyToken()) {
                this.writeKey(prefix);
                this.writeValue(serde.generateIdempotencyToken());
            }
        }
        else if (ns.isBigIntegerSchema()) {
            if (value != null) {
                this.writeKey(prefix);
                this.writeValue(String(value));
            }
        }
        else if (ns.isBigDecimalSchema()) {
            if (value != null) {
                this.writeKey(prefix);
                this.writeValue(value instanceof serde.NumericValue ? value.string : String(value));
            }
        }
        else if (ns.isTimestampSchema()) {
            if (value instanceof Date) {
                this.writeKey(prefix);
                const format = protocols.determineTimestampFormat(ns, this.settings);
                switch (format) {
                    case 5:
                        this.writeValue(value.toISOString().replace(".000Z", "Z"));
                        break;
                    case 6:
                        this.writeValue(smithyClient.dateToUtcString(value));
                        break;
                    case 7:
                        this.writeValue(String(value.getTime() / 1000));
                        break;
                }
            }
        }
        else if (ns.isDocumentSchema()) {
            if (Array.isArray(value)) {
                this.write(64 | 15, value, prefix);
            }
            else if (value instanceof Date) {
                this.write(4, value, prefix);
            }
            else if (value instanceof Uint8Array) {
                this.write(21, value, prefix);
            }
            else if (value && typeof value === "object") {
                this.write(128 | 15, value, prefix);
            }
            else {
                this.writeKey(prefix);
                this.writeValue(String(value));
            }
        }
        else if (ns.isListSchema()) {
            if (Array.isArray(value)) {
                if (value.length === 0) {
                    if (this.settings.serializeEmptyLists) {
                        this.writeKey(prefix);
                        this.writeValue("");
                    }
                }
                else {
                    const member = ns.getValueSchema();
                    const flat = this.settings.flattenLists || ns.getMergedTraits().xmlFlattened;
                    let i = 1;
                    for (const item of value) {
                        if (item == null) {
                            continue;
                        }
                        const traits = member.getMergedTraits();
                        const suffix = this.getKey("member", traits.xmlName, traits.ec2QueryName);
                        const key = flat ? `${prefix}${i}` : `${prefix}${suffix}.${i}`;
                        this.write(member, item, key);
                        ++i;
                    }
                }
            }
        }
        else if (ns.isMapSchema()) {
            if (value && typeof value === "object") {
                const keySchema = ns.getKeySchema();
                const memberSchema = ns.getValueSchema();
                const flat = ns.getMergedTraits().xmlFlattened;
                let i = 1;
                for (const [k, v] of Object.entries(value)) {
                    if (v == null) {
                        continue;
                    }
                    const keyTraits = keySchema.getMergedTraits();
                    const keySuffix = this.getKey("key", keyTraits.xmlName, keyTraits.ec2QueryName);
                    const key = flat ? `${prefix}${i}.${keySuffix}` : `${prefix}entry.${i}.${keySuffix}`;
                    const valTraits = memberSchema.getMergedTraits();
                    const valueSuffix = this.getKey("value", valTraits.xmlName, valTraits.ec2QueryName);
                    const valueKey = flat ? `${prefix}${i}.${valueSuffix}` : `${prefix}entry.${i}.${valueSuffix}`;
                    this.write(keySchema, k, key);
                    this.write(memberSchema, v, valueKey);
                    ++i;
                }
            }
        }
        else if (ns.isStructSchema()) {
            if (value && typeof value === "object") {
                let didWriteMember = false;
                for (const [memberName, member] of ns.structIterator()) {
                    if (value[memberName] == null && !member.isIdempotencyToken()) {
                        continue;
                    }
                    const traits = member.getMergedTraits();
                    const suffix = this.getKey(memberName, traits.xmlName, traits.ec2QueryName, "struct");
                    const key = `${prefix}${suffix}`;
                    this.write(member, value[memberName], key);
                    didWriteMember = true;
                }
                if (!didWriteMember && ns.isUnionSchema()) {
                    const { $unknown } = value;
                    if (Array.isArray($unknown)) {
                        const [k, v] = $unknown;
                        const key = `${prefix}${k}`;
                        this.write(15, v, key);
                    }
                }
            }
        }
        else if (ns.isUnitSchema()) ;
        else {
            throw new Error(`@aws-sdk/core/protocols - QuerySerializer unrecognized schema type ${ns.getName(true)}`);
        }
    }
    flush() {
        if (this.buffer === undefined) {
            throw new Error("@aws-sdk/core/protocols - QuerySerializer cannot flush with nothing written to buffer.");
        }
        const str = this.buffer;
        delete this.buffer;
        return str;
    }
    getKey(memberName, xmlName, ec2QueryName, keySource) {
        const { ec2, capitalizeKeys } = this.settings;
        if (ec2 && ec2QueryName) {
            return ec2QueryName;
        }
        const key = xmlName ?? memberName;
        if (capitalizeKeys && keySource === "struct") {
            return key[0].toUpperCase() + key.slice(1);
        }
        return key;
    }
    writeKey(key) {
        if (key.endsWith(".")) {
            key = key.slice(0, key.length - 1);
        }
        this.buffer += `&${protocols.extendedEncodeURIComponent(key)}=`;
    }
    writeValue(value) {
        this.buffer += protocols.extendedEncodeURIComponent(value);
    }
}

class AwsQueryProtocol extends protocols.RpcProtocol {
    options;
    serializer;
    deserializer;
    mixin = new ProtocolLib();
    constructor(options) {
        super({
            defaultNamespace: options.defaultNamespace,
            errorTypeRegistries: options.errorTypeRegistries,
        });
        this.options = options;
        const settings = {
            timestampFormat: {
                useTrait: true,
                default: 5,
            },
            httpBindings: false,
            xmlNamespace: options.xmlNamespace,
            serviceNamespace: options.defaultNamespace,
            serializeEmptyLists: true,
        };
        this.serializer = new QueryShapeSerializer(settings);
        this.deserializer = new XmlShapeDeserializer(settings);
    }
    getShapeId() {
        return "aws.protocols#awsQuery";
    }
    setSerdeContext(serdeContext) {
        this.serializer.setSerdeContext(serdeContext);
        this.deserializer.setSerdeContext(serdeContext);
    }
    getPayloadCodec() {
        throw new Error("AWSQuery protocol has no payload codec.");
    }
    async serializeRequest(operationSchema, input, context) {
        const request = await super.serializeRequest(operationSchema, input, context);
        if (!request.path.endsWith("/")) {
            request.path += "/";
        }
        Object.assign(request.headers, {
            "content-type": `application/x-www-form-urlencoded`,
        });
        if (schema.deref(operationSchema.input) === "unit" || !request.body) {
            request.body = "";
        }
        const action = operationSchema.name.split("#")[1] ?? operationSchema.name;
        request.body = `Action=${action}&Version=${this.options.version}` + request.body;
        if (request.body.endsWith("&")) {
            request.body = request.body.slice(-1);
        }
        return request;
    }
    async deserializeResponse(operationSchema, context, response) {
        const deserializer = this.deserializer;
        const ns = schema.NormalizedSchema.of(operationSchema.output);
        const dataObject = {};
        if (response.statusCode >= 300) {
            const bytes = await protocols.collectBody(response.body, context);
            if (bytes.byteLength > 0) {
                Object.assign(dataObject, await deserializer.read(15, bytes));
            }
            await this.handleError(operationSchema, context, response, dataObject, this.deserializeMetadata(response));
        }
        for (const header in response.headers) {
            const value = response.headers[header];
            delete response.headers[header];
            response.headers[header.toLowerCase()] = value;
        }
        const shortName = operationSchema.name.split("#")[1] ?? operationSchema.name;
        const awsQueryResultKey = ns.isStructSchema() && this.useNestedResult() ? shortName + "Result" : undefined;
        const bytes = await protocols.collectBody(response.body, context);
        if (bytes.byteLength > 0) {
            Object.assign(dataObject, await deserializer.read(ns, bytes, awsQueryResultKey));
        }
        const output = {
            $metadata: this.deserializeMetadata(response),
            ...dataObject,
        };
        return output;
    }
    useNestedResult() {
        return true;
    }
    async handleError(operationSchema, context, response, dataObject, metadata) {
        const errorIdentifier = this.loadQueryErrorCode(response, dataObject) ?? "Unknown";
        this.mixin.compose(this.compositeErrorRegistry, errorIdentifier, this.options.defaultNamespace);
        const errorData = this.loadQueryError(dataObject) ?? {};
        const message = this.loadQueryErrorMessage(dataObject);
        errorData.message = message;
        errorData.Error = {
            Type: errorData.Type,
            Code: errorData.Code,
            Message: message,
        };
        const { errorSchema, errorMetadata } = await this.mixin.getErrorSchemaOrThrowBaseException(errorIdentifier, this.options.defaultNamespace, response, errorData, metadata, this.mixin.findQueryCompatibleError);
        const ns = schema.NormalizedSchema.of(errorSchema);
        const ErrorCtor = this.compositeErrorRegistry.getErrorCtor(errorSchema) ?? Error;
        const exception = new ErrorCtor(message);
        const output = {
            Type: errorData.Error.Type,
            Code: errorData.Error.Code,
            Error: errorData.Error,
        };
        for (const [name, member] of ns.structIterator()) {
            const target = member.getMergedTraits().xmlName ?? name;
            const value = errorData[target] ?? dataObject[target];
            output[name] = this.deserializer.readSchema(member, value);
        }
        throw this.mixin.decorateServiceException(Object.assign(exception, errorMetadata, {
            $fault: ns.getMergedTraits().error,
            message,
        }, output), dataObject);
    }
    loadQueryErrorCode(output, data) {
        const code = (data.Errors?.[0]?.Error ?? data.Errors?.Error ?? data.Error)?.Code;
        if (code !== undefined) {
            return code;
        }
        if (output.statusCode == 404) {
            return "NotFound";
        }
    }
    loadQueryError(data) {
        return data.Errors?.[0]?.Error ?? data.Errors?.Error ?? data.Error;
    }
    loadQueryErrorMessage(data) {
        const errorData = this.loadQueryError(data);
        return errorData?.message ?? errorData?.Message ?? data.message ?? data.Message ?? "Unknown";
    }
    getDefaultContentType() {
        return "application/x-www-form-urlencoded";
    }
}

class AwsEc2QueryProtocol extends AwsQueryProtocol {
    options;
    constructor(options) {
        super(options);
        this.options = options;
        const ec2Settings = {
            capitalizeKeys: true,
            flattenLists: true,
            serializeEmptyLists: false,
            ec2: true,
        };
        Object.assign(this.serializer.settings, ec2Settings);
    }
    getShapeId() {
        return "aws.protocols#ec2Query";
    }
    useNestedResult() {
        return false;
    }
}

const parseXmlBody = (streamBody, context) => collectBodyString(streamBody, context).then((encoded) => {
    if (encoded.length) {
        let parsedObj;
        try {
            parsedObj = xmlBuilder.parseXML(encoded);
        }
        catch (e) {
            if (e && typeof e === "object") {
                Object.defineProperty(e, "$responseBodyText", {
                    value: encoded,
                });
            }
            throw e;
        }
        const textNodeName = "#text";
        const key = Object.keys(parsedObj)[0];
        const parsedObjToReturn = parsedObj[key];
        if (parsedObjToReturn[textNodeName]) {
            parsedObjToReturn[key] = parsedObjToReturn[textNodeName];
            delete parsedObjToReturn[textNodeName];
        }
        return smithyClient.getValueFromTextNode(parsedObjToReturn);
    }
    return {};
});
const parseXmlErrorBody = async (errorBody, context) => {
    const value = await parseXmlBody(errorBody, context);
    if (value.Error) {
        value.Error.message = value.Error.message ?? value.Error.Message;
    }
    return value;
};
const loadRestXmlErrorCode = (output, data) => {
    if (data?.Error?.Code !== undefined) {
        return data.Error.Code;
    }
    if (data?.Code !== undefined) {
        return data.Code;
    }
    if (output.statusCode == 404) {
        return "NotFound";
    }
};

class XmlShapeSerializer extends SerdeContextConfig {
    settings;
    stringBuffer;
    byteBuffer;
    buffer;
    constructor(settings) {
        super();
        this.settings = settings;
    }
    write(schema$1, value) {
        const ns = schema.NormalizedSchema.of(schema$1);
        if (ns.isStringSchema() && typeof value === "string") {
            this.stringBuffer = value;
        }
        else if (ns.isBlobSchema()) {
            this.byteBuffer =
                "byteLength" in value
                    ? value
                    : (this.serdeContext?.base64Decoder ?? utilBase64.fromBase64)(value);
        }
        else {
            this.buffer = this.writeStruct(ns, value, undefined);
            const traits = ns.getMergedTraits();
            if (traits.httpPayload && !traits.xmlName) {
                this.buffer.withName(ns.getName());
            }
        }
    }
    flush() {
        if (this.byteBuffer !== undefined) {
            const bytes = this.byteBuffer;
            delete this.byteBuffer;
            return bytes;
        }
        if (this.stringBuffer !== undefined) {
            const str = this.stringBuffer;
            delete this.stringBuffer;
            return str;
        }
        const buffer = this.buffer;
        if (this.settings.xmlNamespace) {
            if (!buffer?.attributes?.["xmlns"]) {
                buffer.addAttribute("xmlns", this.settings.xmlNamespace);
            }
        }
        delete this.buffer;
        return buffer.toString();
    }
    writeStruct(ns, value, parentXmlns) {
        const traits = ns.getMergedTraits();
        const name = ns.isMemberSchema() && !traits.httpPayload
            ? ns.getMemberTraits().xmlName ?? ns.getMemberName()
            : traits.xmlName ?? ns.getName();
        if (!name || !ns.isStructSchema()) {
            throw new Error(`@aws-sdk/core/protocols - xml serializer, cannot write struct with empty name or non-struct, schema=${ns.getName(true)}.`);
        }
        const structXmlNode = xmlBuilder.XmlNode.of(name);
        const [xmlnsAttr, xmlns] = this.getXmlnsAttribute(ns, parentXmlns);
        for (const [memberName, memberSchema] of ns.structIterator()) {
            const val = value[memberName];
            if (val != null || memberSchema.isIdempotencyToken()) {
                if (memberSchema.getMergedTraits().xmlAttribute) {
                    structXmlNode.addAttribute(memberSchema.getMergedTraits().xmlName ?? memberName, this.writeSimple(memberSchema, val));
                    continue;
                }
                if (memberSchema.isListSchema()) {
                    this.writeList(memberSchema, val, structXmlNode, xmlns);
                }
                else if (memberSchema.isMapSchema()) {
                    this.writeMap(memberSchema, val, structXmlNode, xmlns);
                }
                else if (memberSchema.isStructSchema()) {
                    structXmlNode.addChildNode(this.writeStruct(memberSchema, val, xmlns));
                }
                else {
                    const memberNode = xmlBuilder.XmlNode.of(memberSchema.getMergedTraits().xmlName ?? memberSchema.getMemberName());
                    this.writeSimpleInto(memberSchema, val, memberNode, xmlns);
                    structXmlNode.addChildNode(memberNode);
                }
            }
        }
        const { $unknown } = value;
        if ($unknown && ns.isUnionSchema() && Array.isArray($unknown) && Object.keys(value).length === 1) {
            const [k, v] = $unknown;
            const node = xmlBuilder.XmlNode.of(k);
            if (typeof v !== "string") {
                if (value instanceof xmlBuilder.XmlNode || value instanceof xmlBuilder.XmlText) {
                    structXmlNode.addChildNode(value);
                }
                else {
                    throw new Error(`@aws-sdk - $unknown union member in XML requires ` +
                        `value of type string, @aws-sdk/xml-builder::XmlNode or XmlText.`);
                }
            }
            this.writeSimpleInto(0, v, node, xmlns);
            structXmlNode.addChildNode(node);
        }
        if (xmlns) {
            structXmlNode.addAttribute(xmlnsAttr, xmlns);
        }
        return structXmlNode;
    }
    writeList(listMember, array, container, parentXmlns) {
        if (!listMember.isMemberSchema()) {
            throw new Error(`@aws-sdk/core/protocols - xml serializer, cannot write non-member list: ${listMember.getName(true)}`);
        }
        const listTraits = listMember.getMergedTraits();
        const listValueSchema = listMember.getValueSchema();
        const listValueTraits = listValueSchema.getMergedTraits();
        const sparse = !!listValueTraits.sparse;
        const flat = !!listTraits.xmlFlattened;
        const [xmlnsAttr, xmlns] = this.getXmlnsAttribute(listMember, parentXmlns);
        const writeItem = (container, value) => {
            if (listValueSchema.isListSchema()) {
                this.writeList(listValueSchema, Array.isArray(value) ? value : [value], container, xmlns);
            }
            else if (listValueSchema.isMapSchema()) {
                this.writeMap(listValueSchema, value, container, xmlns);
            }
            else if (listValueSchema.isStructSchema()) {
                const struct = this.writeStruct(listValueSchema, value, xmlns);
                container.addChildNode(struct.withName(flat ? listTraits.xmlName ?? listMember.getMemberName() : listValueTraits.xmlName ?? "member"));
            }
            else {
                const listItemNode = xmlBuilder.XmlNode.of(flat ? listTraits.xmlName ?? listMember.getMemberName() : listValueTraits.xmlName ?? "member");
                this.writeSimpleInto(listValueSchema, value, listItemNode, xmlns);
                container.addChildNode(listItemNode);
            }
        };
        if (flat) {
            for (const value of array) {
                if (sparse || value != null) {
                    writeItem(container, value);
                }
            }
        }
        else {
            const listNode = xmlBuilder.XmlNode.of(listTraits.xmlName ?? listMember.getMemberName());
            if (xmlns) {
                listNode.addAttribute(xmlnsAttr, xmlns);
            }
            for (const value of array) {
                if (sparse || value != null) {
                    writeItem(listNode, value);
                }
            }
            container.addChildNode(listNode);
        }
    }
    writeMap(mapMember, map, container, parentXmlns, containerIsMap = false) {
        if (!mapMember.isMemberSchema()) {
            throw new Error(`@aws-sdk/core/protocols - xml serializer, cannot write non-member map: ${mapMember.getName(true)}`);
        }
        const mapTraits = mapMember.getMergedTraits();
        const mapKeySchema = mapMember.getKeySchema();
        const mapKeyTraits = mapKeySchema.getMergedTraits();
        const keyTag = mapKeyTraits.xmlName ?? "key";
        const mapValueSchema = mapMember.getValueSchema();
        const mapValueTraits = mapValueSchema.getMergedTraits();
        const valueTag = mapValueTraits.xmlName ?? "value";
        const sparse = !!mapValueTraits.sparse;
        const flat = !!mapTraits.xmlFlattened;
        const [xmlnsAttr, xmlns] = this.getXmlnsAttribute(mapMember, parentXmlns);
        const addKeyValue = (entry, key, val) => {
            const keyNode = xmlBuilder.XmlNode.of(keyTag, key);
            const [keyXmlnsAttr, keyXmlns] = this.getXmlnsAttribute(mapKeySchema, xmlns);
            if (keyXmlns) {
                keyNode.addAttribute(keyXmlnsAttr, keyXmlns);
            }
            entry.addChildNode(keyNode);
            let valueNode = xmlBuilder.XmlNode.of(valueTag);
            if (mapValueSchema.isListSchema()) {
                this.writeList(mapValueSchema, val, valueNode, xmlns);
            }
            else if (mapValueSchema.isMapSchema()) {
                this.writeMap(mapValueSchema, val, valueNode, xmlns, true);
            }
            else if (mapValueSchema.isStructSchema()) {
                valueNode = this.writeStruct(mapValueSchema, val, xmlns);
            }
            else {
                this.writeSimpleInto(mapValueSchema, val, valueNode, xmlns);
            }
            entry.addChildNode(valueNode);
        };
        if (flat) {
            for (const [key, val] of Object.entries(map)) {
                if (sparse || val != null) {
                    const entry = xmlBuilder.XmlNode.of(mapTraits.xmlName ?? mapMember.getMemberName());
                    addKeyValue(entry, key, val);
                    container.addChildNode(entry);
                }
            }
        }
        else {
            let mapNode;
            if (!containerIsMap) {
                mapNode = xmlBuilder.XmlNode.of(mapTraits.xmlName ?? mapMember.getMemberName());
                if (xmlns) {
                    mapNode.addAttribute(xmlnsAttr, xmlns);
                }
                container.addChildNode(mapNode);
            }
            for (const [key, val] of Object.entries(map)) {
                if (sparse || val != null) {
                    const entry = xmlBuilder.XmlNode.of("entry");
                    addKeyValue(entry, key, val);
                    (containerIsMap ? container : mapNode).addChildNode(entry);
                }
            }
        }
    }
    writeSimple(_schema, value) {
        if (null === value) {
            throw new Error("@aws-sdk/core/protocols - (XML serializer) cannot write null value.");
        }
        const ns = schema.NormalizedSchema.of(_schema);
        let nodeContents = null;
        if (value && typeof value === "object") {
            if (ns.isBlobSchema()) {
                nodeContents = (this.serdeContext?.base64Encoder ?? utilBase64.toBase64)(value);
            }
            else if (ns.isTimestampSchema() && value instanceof Date) {
                const format = protocols.determineTimestampFormat(ns, this.settings);
                switch (format) {
                    case 5:
                        nodeContents = value.toISOString().replace(".000Z", "Z");
                        break;
                    case 6:
                        nodeContents = smithyClient.dateToUtcString(value);
                        break;
                    case 7:
                        nodeContents = String(value.getTime() / 1000);
                        break;
                    default:
                        console.warn("Missing timestamp format, using http date", value);
                        nodeContents = smithyClient.dateToUtcString(value);
                        break;
                }
            }
            else if (ns.isBigDecimalSchema() && value) {
                if (value instanceof serde.NumericValue) {
                    return value.string;
                }
                return String(value);
            }
            else if (ns.isMapSchema() || ns.isListSchema()) {
                throw new Error("@aws-sdk/core/protocols - xml serializer, cannot call _write() on List/Map schema, call writeList or writeMap() instead.");
            }
            else {
                throw new Error(`@aws-sdk/core/protocols - xml serializer, unhandled schema type for object value and schema: ${ns.getName(true)}`);
            }
        }
        if (ns.isBooleanSchema() || ns.isNumericSchema() || ns.isBigIntegerSchema() || ns.isBigDecimalSchema()) {
            nodeContents = String(value);
        }
        if (ns.isStringSchema()) {
            if (value === undefined && ns.isIdempotencyToken()) {
                nodeContents = serde.generateIdempotencyToken();
            }
            else {
                nodeContents = String(value);
            }
        }
        if (nodeContents === null) {
            throw new Error(`Unhandled schema-value pair ${ns.getName(true)}=${value}`);
        }
        return nodeContents;
    }
    writeSimpleInto(_schema, value, into, parentXmlns) {
        const nodeContents = this.writeSimple(_schema, value);
        const ns = schema.NormalizedSchema.of(_schema);
        const content = new xmlBuilder.XmlText(nodeContents);
        const [xmlnsAttr, xmlns] = this.getXmlnsAttribute(ns, parentXmlns);
        if (xmlns) {
            into.addAttribute(xmlnsAttr, xmlns);
        }
        into.addChildNode(content);
    }
    getXmlnsAttribute(ns, parentXmlns) {
        const traits = ns.getMergedTraits();
        const [prefix, xmlns] = traits.xmlNamespace ?? [];
        if (xmlns && xmlns !== parentXmlns) {
            return [prefix ? `xmlns:${prefix}` : "xmlns", xmlns];
        }
        return [void 0, void 0];
    }
}

class XmlCodec extends SerdeContextConfig {
    settings;
    constructor(settings) {
        super();
        this.settings = settings;
    }
    createSerializer() {
        const serializer = new XmlShapeSerializer(this.settings);
        serializer.setSerdeContext(this.serdeContext);
        return serializer;
    }
    createDeserializer() {
        const deserializer = new XmlShapeDeserializer(this.settings);
        deserializer.setSerdeContext(this.serdeContext);
        return deserializer;
    }
}

class AwsRestXmlProtocol extends protocols.HttpBindingProtocol {
    codec;
    serializer;
    deserializer;
    mixin = new ProtocolLib();
    constructor(options) {
        super(options);
        const settings = {
            timestampFormat: {
                useTrait: true,
                default: 5,
            },
            httpBindings: true,
            xmlNamespace: options.xmlNamespace,
            serviceNamespace: options.defaultNamespace,
        };
        this.codec = new XmlCodec(settings);
        this.serializer = new protocols.HttpInterceptingShapeSerializer(this.codec.createSerializer(), settings);
        this.deserializer = new protocols.HttpInterceptingShapeDeserializer(this.codec.createDeserializer(), settings);
        this.compositeErrorRegistry;
    }
    getPayloadCodec() {
        return this.codec;
    }
    getShapeId() {
        return "aws.protocols#restXml";
    }
    async serializeRequest(operationSchema, input, context) {
        const request = await super.serializeRequest(operationSchema, input, context);
        const inputSchema = schema.NormalizedSchema.of(operationSchema.input);
        if (!request.headers["content-type"]) {
            const contentType = this.mixin.resolveRestContentType(this.getDefaultContentType(), inputSchema);
            if (contentType) {
                request.headers["content-type"] = contentType;
            }
        }
        if (typeof request.body === "string" &&
            request.headers["content-type"] === this.getDefaultContentType() &&
            !request.body.startsWith("<?xml ") &&
            !this.hasUnstructuredPayloadBinding(inputSchema)) {
            request.body = '<?xml version="1.0" encoding="UTF-8"?>' + request.body;
        }
        return request;
    }
    async deserializeResponse(operationSchema, context, response) {
        return super.deserializeResponse(operationSchema, context, response);
    }
    async handleError(operationSchema, context, response, dataObject, metadata) {
        const errorIdentifier = loadRestXmlErrorCode(response, dataObject) ?? "Unknown";
        this.mixin.compose(this.compositeErrorRegistry, errorIdentifier, this.options.defaultNamespace);
        if (dataObject.Error && typeof dataObject.Error === "object") {
            for (const key of Object.keys(dataObject.Error)) {
                dataObject[key] = dataObject.Error[key];
                if (key.toLowerCase() === "message") {
                    dataObject.message = dataObject.Error[key];
                }
            }
        }
        if (dataObject.RequestId && !metadata.requestId) {
            metadata.requestId = dataObject.RequestId;
        }
        const { errorSchema, errorMetadata } = await this.mixin.getErrorSchemaOrThrowBaseException(errorIdentifier, this.options.defaultNamespace, response, dataObject, metadata);
        const ns = schema.NormalizedSchema.of(errorSchema);
        const message = dataObject.Error?.message ??
            dataObject.Error?.Message ??
            dataObject.message ??
            dataObject.Message ??
            "UnknownError";
        const ErrorCtor = this.compositeErrorRegistry.getErrorCtor(errorSchema) ?? Error;
        const exception = new ErrorCtor(message);
        await this.deserializeHttpMessage(errorSchema, context, response, dataObject);
        const output = {};
        for (const [name, member] of ns.structIterator()) {
            const target = member.getMergedTraits().xmlName ?? name;
            const value = dataObject.Error?.[target] ?? dataObject[target];
            output[name] = this.codec.createDeserializer().readSchema(member, value);
        }
        throw this.mixin.decorateServiceException(Object.assign(exception, errorMetadata, {
            $fault: ns.getMergedTraits().error,
            message,
        }, output), dataObject);
    }
    getDefaultContentType() {
        return "application/xml";
    }
    hasUnstructuredPayloadBinding(ns) {
        for (const [, member] of ns.structIterator()) {
            if (member.getMergedTraits().httpPayload) {
                return !(member.isStructSchema() || member.isMapSchema() || member.isListSchema());
            }
        }
        return false;
    }
}

exports.AwsEc2QueryProtocol = AwsEc2QueryProtocol;
exports.AwsJson1_0Protocol = AwsJson1_0Protocol;
exports.AwsJson1_1Protocol = AwsJson1_1Protocol;
exports.AwsJsonRpcProtocol = AwsJsonRpcProtocol;
exports.AwsQueryProtocol = AwsQueryProtocol;
exports.AwsRestJsonProtocol = AwsRestJsonProtocol;
exports.AwsRestXmlProtocol = AwsRestXmlProtocol;
exports.AwsSmithyRpcV2CborProtocol = AwsSmithyRpcV2CborProtocol;
exports.JsonCodec = JsonCodec;
exports.JsonShapeDeserializer = JsonShapeDeserializer;
exports.JsonShapeSerializer = JsonShapeSerializer;
exports.QueryShapeSerializer = QueryShapeSerializer;
exports.XmlCodec = XmlCodec;
exports.XmlShapeDeserializer = XmlShapeDeserializer;
exports.XmlShapeSerializer = XmlShapeSerializer;
exports._toBool = _toBool;
exports._toNum = _toNum;
exports._toStr = _toStr;
exports.awsExpectUnion = awsExpectUnion;
exports.loadRestJsonErrorCode = loadRestJsonErrorCode;
exports.loadRestXmlErrorCode = loadRestXmlErrorCode;
exports.parseJsonBody = parseJsonBody;
exports.parseJsonErrorBody = parseJsonErrorBody;
exports.parseXmlBody = parseXmlBody;
exports.parseXmlErrorBody = parseXmlErrorBody;


/***/ }),

/***/ 55606:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var client = __webpack_require__(5152);
var propertyProvider = __webpack_require__(71238);

const ENV_KEY = "AWS_ACCESS_KEY_ID";
const ENV_SECRET = "AWS_SECRET_ACCESS_KEY";
const ENV_SESSION = "AWS_SESSION_TOKEN";
const ENV_EXPIRATION = "AWS_CREDENTIAL_EXPIRATION";
const ENV_CREDENTIAL_SCOPE = "AWS_CREDENTIAL_SCOPE";
const ENV_ACCOUNT_ID = "AWS_ACCOUNT_ID";
const fromEnv = (init) => async () => {
    init?.logger?.debug("@aws-sdk/credential-provider-env - fromEnv");
    const accessKeyId = process.env[ENV_KEY];
    const secretAccessKey = process.env[ENV_SECRET];
    const sessionToken = process.env[ENV_SESSION];
    const expiry = process.env[ENV_EXPIRATION];
    const credentialScope = process.env[ENV_CREDENTIAL_SCOPE];
    const accountId = process.env[ENV_ACCOUNT_ID];
    if (accessKeyId && secretAccessKey) {
        const credentials = {
            accessKeyId,
            secretAccessKey,
            ...(sessionToken && { sessionToken }),
            ...(expiry && { expiration: new Date(expiry) }),
            ...(credentialScope && { credentialScope }),
            ...(accountId && { accountId }),
        };
        client.setCredentialFeature(credentials, "CREDENTIALS_ENV_VARS", "g");
        return credentials;
    }
    throw new propertyProvider.CredentialsProviderError("Unable to find environment variable credentials.", { logger: init?.logger });
};

exports.ENV_ACCOUNT_ID = ENV_ACCOUNT_ID;
exports.ENV_CREDENTIAL_SCOPE = ENV_CREDENTIAL_SCOPE;
exports.ENV_EXPIRATION = ENV_EXPIRATION;
exports.ENV_KEY = ENV_KEY;
exports.ENV_SECRET = ENV_SECRET;
exports.ENV_SESSION = ENV_SESSION;
exports.fromEnv = fromEnv;


/***/ }),

/***/ 5861:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var credentialProviderEnv = __webpack_require__(55606);
var propertyProvider = __webpack_require__(71238);
var sharedIniFileLoader = __webpack_require__(94964);

const ENV_IMDS_DISABLED = "AWS_EC2_METADATA_DISABLED";
const remoteProvider = async (init) => {
    const { ENV_CMDS_FULL_URI, ENV_CMDS_RELATIVE_URI, fromContainerMetadata, fromInstanceMetadata } = await __webpack_require__.e(/* import() */ 566).then(__webpack_require__.t.bind(__webpack_require__, 40566, 19));
    if (process.env[ENV_CMDS_RELATIVE_URI] || process.env[ENV_CMDS_FULL_URI]) {
        init.logger?.debug("@aws-sdk/credential-provider-node - remoteProvider::fromHttp/fromContainerMetadata");
        const { fromHttp } = await __webpack_require__.e(/* import() */ 605).then(__webpack_require__.bind(__webpack_require__, 98605));
        return propertyProvider.chain(fromHttp(init), fromContainerMetadata(init));
    }
    if (process.env[ENV_IMDS_DISABLED] && process.env[ENV_IMDS_DISABLED] !== "false") {
        return async () => {
            throw new propertyProvider.CredentialsProviderError("EC2 Instance Metadata Service access disabled", { logger: init.logger });
        };
    }
    init.logger?.debug("@aws-sdk/credential-provider-node - remoteProvider::fromInstanceMetadata");
    return fromInstanceMetadata(init);
};

function memoizeChain(providers, treatAsExpired) {
    const chain = internalCreateChain(providers);
    let activeLock;
    let passiveLock;
    let credentials;
    const provider = async (options) => {
        if (options?.forceRefresh) {
            return await chain(options);
        }
        if (credentials?.expiration) {
            if (credentials?.expiration?.getTime() < Date.now()) {
                credentials = undefined;
            }
        }
        if (activeLock) {
            await activeLock;
        }
        else if (!credentials || treatAsExpired?.(credentials)) {
            if (credentials) {
                if (!passiveLock) {
                    passiveLock = chain(options)
                        .then((c) => {
                        credentials = c;
                    })
                        .finally(() => {
                        passiveLock = undefined;
                    });
                }
            }
            else {
                activeLock = chain(options)
                    .then((c) => {
                    credentials = c;
                })
                    .finally(() => {
                    activeLock = undefined;
                });
                return provider(options);
            }
        }
        return credentials;
    };
    return provider;
}
const internalCreateChain = (providers) => async (awsIdentityProperties) => {
    let lastProviderError;
    for (const provider of providers) {
        try {
            return await provider(awsIdentityProperties);
        }
        catch (err) {
            lastProviderError = err;
            if (err?.tryNextLink) {
                continue;
            }
            throw err;
        }
    }
    throw lastProviderError;
};

let multipleCredentialSourceWarningEmitted = false;
const defaultProvider = (init = {}) => memoizeChain([
    async () => {
        const profile = init.profile ?? process.env[sharedIniFileLoader.ENV_PROFILE];
        if (profile) {
            const envStaticCredentialsAreSet = process.env[credentialProviderEnv.ENV_KEY] && process.env[credentialProviderEnv.ENV_SECRET];
            if (envStaticCredentialsAreSet) {
                if (!multipleCredentialSourceWarningEmitted) {
                    const warnFn = init.logger?.warn && init.logger?.constructor?.name !== "NoOpLogger"
                        ? init.logger.warn.bind(init.logger)
                        : console.warn;
                    warnFn(`@aws-sdk/credential-provider-node - defaultProvider::fromEnv WARNING:
    Multiple credential sources detected: 
    Both AWS_PROFILE and the pair AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY static credentials are set.
    This SDK will proceed with the AWS_PROFILE value.
    
    However, a future version may change this behavior to prefer the ENV static credentials.
    Please ensure that your environment only sets either the AWS_PROFILE or the
    AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY pair.
`);
                    multipleCredentialSourceWarningEmitted = true;
                }
            }
            throw new propertyProvider.CredentialsProviderError("AWS_PROFILE is set, skipping fromEnv provider.", {
                logger: init.logger,
                tryNextLink: true,
            });
        }
        init.logger?.debug("@aws-sdk/credential-provider-node - defaultProvider::fromEnv");
        return credentialProviderEnv.fromEnv(init)();
    },
    async (awsIdentityProperties) => {
        init.logger?.debug("@aws-sdk/credential-provider-node - defaultProvider::fromSSO");
        const { ssoStartUrl, ssoAccountId, ssoRegion, ssoRoleName, ssoSession } = init;
        if (!ssoStartUrl && !ssoAccountId && !ssoRegion && !ssoRoleName && !ssoSession) {
            throw new propertyProvider.CredentialsProviderError("Skipping SSO provider in default chain (inputs do not include SSO fields).", { logger: init.logger });
        }
        const { fromSSO } = await __webpack_require__.e(/* import() */ 998).then(__webpack_require__.t.bind(__webpack_require__, 60998, 19));
        return fromSSO(init)(awsIdentityProperties);
    },
    async (awsIdentityProperties) => {
        init.logger?.debug("@aws-sdk/credential-provider-node - defaultProvider::fromIni");
        const { fromIni } = await __webpack_require__.e(/* import() */ 869).then(__webpack_require__.t.bind(__webpack_require__, 75869, 19));
        return fromIni(init)(awsIdentityProperties);
    },
    async (awsIdentityProperties) => {
        init.logger?.debug("@aws-sdk/credential-provider-node - defaultProvider::fromProcess");
        const { fromProcess } = await __webpack_require__.e(/* import() */ 360).then(__webpack_require__.t.bind(__webpack_require__, 75360, 19));
        return fromProcess(init)(awsIdentityProperties);
    },
    async (awsIdentityProperties) => {
        init.logger?.debug("@aws-sdk/credential-provider-node - defaultProvider::fromTokenFile");
        const { fromTokenFile } = await Promise.all(/* import() */[__webpack_require__.e(136), __webpack_require__.e(956)]).then(__webpack_require__.t.bind(__webpack_require__, 29956, 23));
        return fromTokenFile(init)(awsIdentityProperties);
    },
    async () => {
        init.logger?.debug("@aws-sdk/credential-provider-node - defaultProvider::remoteProvider");
        return (await remoteProvider(init))();
    },
    async () => {
        throw new propertyProvider.CredentialsProviderError("Could not load credentials from any providers", {
            tryNextLink: false,
            logger: init.logger,
        });
    },
], credentialsTreatedAsExpired);
const credentialsWillNeedRefresh = (credentials) => credentials?.expiration !== undefined;
const credentialsTreatedAsExpired = (credentials) => credentials?.expiration !== undefined && credentials.expiration.getTime() - Date.now() < 300000;

exports.credentialsTreatedAsExpired = credentialsTreatedAsExpired;
exports.credentialsWillNeedRefresh = credentialsWillNeedRefresh;
exports.defaultProvider = defaultProvider;


/***/ }),

/***/ 2808:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var protocols = __webpack_require__(37288);
var schema = __webpack_require__(26890);
var smithyClient = __webpack_require__(61411);
var utilBase64 = __webpack_require__(68385);

class DynamoDBJsonCodec extends protocols.JsonCodec {
    constructor() {
        super({
            timestampFormat: {
                useTrait: true,
                default: 7,
            },
            jsonName: false,
        });
    }
    createSerializer() {
        const serializer = new DynamoDBJsonShapeSerializer(this.settings);
        serializer.setSerdeContext(this.serdeContext);
        return serializer;
    }
    createDeserializer() {
        const deserializer = new DynamoDBJsonShapeDeserializer(this.settings);
        deserializer.setSerdeContext(this.serdeContext);
        return deserializer;
    }
}
const ATTRIBUTE_VALUE = "com.amazonaws.dynamodb#AttributeValue";
class DynamoDBJsonShapeSerializer extends protocols.JsonShapeSerializer {
    _write(schema$1, value, container) {
        const ns = schema.NormalizedSchema.of(schema$1);
        if (ns.isStructSchema() && ns.getName(true) === ATTRIBUTE_VALUE) {
            if (value && typeof value === "object") {
                const av = value;
                const out = smithyClient._json(av);
                const base64Encode = this.serdeContext?.base64Encoder ?? utilBase64.toBase64;
                if (av.B instanceof Uint8Array) {
                    out.B = base64Encode(av.B);
                }
                if (Array.isArray(av.BS)) {
                    out.BS = av.BS.map(base64Encode);
                }
                if (Array.isArray(av.L)) {
                    out.L = av.L.filter((v) => v != null).map((v) => this._write(ns, v, container));
                }
                if (av.M && typeof av.M === "object") {
                    out.M = {};
                    for (const [k, v] of Object.entries(av.M)) {
                        if (v != null) {
                            out.M[k] = this._write(ns, v, container);
                        }
                    }
                }
                return out;
            }
        }
        return super._write(ns, value, container);
    }
}
class DynamoDBJsonShapeDeserializer extends protocols.JsonShapeDeserializer {
    _read(schema$1, value) {
        const ns = schema.NormalizedSchema.of(schema$1);
        if (ns.isStructSchema() && ns.getName(true) === ATTRIBUTE_VALUE) {
            if (value && typeof value === "object") {
                const av = value;
                const out = smithyClient._json(av);
                const base64Decoder = this.serdeContext?.base64Decoder ?? utilBase64.fromBase64;
                if (typeof av.B === "string") {
                    out.B = base64Decoder(av.B);
                }
                if (Array.isArray(av.BS)) {
                    out.BS = av.BS.map(base64Decoder);
                }
                if (Array.isArray(av.L)) {
                    out.L = av.L.map((v) => this._read(ns, v));
                }
                if (av.M && typeof av.M === "object") {
                    out.M = {};
                    for (const [k, v] of Object.entries(av.M)) {
                        out.M[k] = this._read(ns, v);
                    }
                }
                return out;
            }
        }
        return super._read(ns, value);
    }
}

exports.DynamoDBJsonCodec = DynamoDBJsonCodec;


/***/ }),

/***/ 4431:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var LRUCache = __webpack_require__(29214);

class EndpointCache {
    cache;
    constructor(capacity) {
        this.cache = new LRUCache(capacity);
    }
    getEndpoint(key) {
        const endpointsWithExpiry = this.get(key);
        if (!endpointsWithExpiry || endpointsWithExpiry.length === 0) {
            return undefined;
        }
        const endpoints = endpointsWithExpiry.map((endpoint) => endpoint.Address);
        return endpoints[Math.floor(Math.random() * endpoints.length)];
    }
    get(key) {
        if (!this.has(key)) {
            return;
        }
        const value = this.cache.get(key);
        if (!value) {
            return;
        }
        const now = Date.now();
        const endpointsWithExpiry = value.filter((endpoint) => now < endpoint.Expires);
        if (endpointsWithExpiry.length === 0) {
            this.delete(key);
            return undefined;
        }
        return endpointsWithExpiry;
    }
    set(key, endpoints) {
        const now = Date.now();
        this.cache.set(key, endpoints.map(({ Address, CachePeriodInMinutes }) => ({
            Address,
            Expires: now + CachePeriodInMinutes * 60 * 1000,
        })));
    }
    delete(key) {
        this.cache.set(key, []);
    }
    has(key) {
        if (!this.cache.has(key)) {
            return false;
        }
        const endpoints = this.cache.peek(key);
        if (!endpoints) {
            return false;
        }
        return endpoints.length > 0;
    }
    clear() {
        this.cache.clear();
    }
}

exports.EndpointCache = EndpointCache;


/***/ }),

/***/ 3688:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var protocolHttp = __webpack_require__(72356);
var endpointCache = __webpack_require__(4431);

const ENV_ENDPOINT_DISCOVERY = ["AWS_ENABLE_ENDPOINT_DISCOVERY", "AWS_ENDPOINT_DISCOVERY_ENABLED"];
const CONFIG_ENDPOINT_DISCOVERY = "endpoint_discovery_enabled";
const isFalsy = (value) => ["false", "0"].indexOf(value) >= 0;
const NODE_ENDPOINT_DISCOVERY_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => {
        for (let i = 0; i < ENV_ENDPOINT_DISCOVERY.length; i++) {
            const envKey = ENV_ENDPOINT_DISCOVERY[i];
            if (envKey in env) {
                const value = env[envKey];
                if (value === "") {
                    throw Error(`Environment variable ${envKey} can't be empty of undefined, got "${value}"`);
                }
                return !isFalsy(value);
            }
        }
    },
    configFileSelector: (profile) => {
        if (CONFIG_ENDPOINT_DISCOVERY in profile) {
            const value = profile[CONFIG_ENDPOINT_DISCOVERY];
            if (value === undefined) {
                throw Error(`Shared config entry ${CONFIG_ENDPOINT_DISCOVERY} can't be undefined, got "${value}"`);
            }
            return !isFalsy(value);
        }
    },
    default: undefined,
};

const getCacheKey = async (commandName, config, options) => {
    const { accessKeyId } = await config.credentials();
    const { identifiers } = options;
    return JSON.stringify({
        ...(accessKeyId && { accessKeyId }),
        ...(identifiers && {
            commandName,
            identifiers: Object.entries(identifiers)
                .sort()
                .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}),
        }),
    });
};

const requestQueue = {};
const updateDiscoveredEndpointInCache = async (config, options) => new Promise((resolve, reject) => {
    const { endpointCache } = config;
    const { cacheKey, commandName, identifiers } = options;
    const endpoints = endpointCache.get(cacheKey);
    if (endpoints && endpoints.length === 1 && endpoints[0].Address === "") {
        if (options.isDiscoveredEndpointRequired) {
            if (!requestQueue[cacheKey])
                requestQueue[cacheKey] = [];
            requestQueue[cacheKey].push({ resolve, reject });
        }
        else {
            resolve();
        }
    }
    else if (endpoints && endpoints.length > 0) {
        resolve();
    }
    else {
        const placeholderEndpoints = [{ Address: "", CachePeriodInMinutes: 1 }];
        endpointCache.set(cacheKey, placeholderEndpoints);
        const command = new options.endpointDiscoveryCommandCtor({
            Operation: commandName.slice(0, -7),
            Identifiers: identifiers,
        });
        const handler = command.resolveMiddleware(options.clientStack, config, options.options);
        handler(command)
            .then((result) => {
            endpointCache.set(cacheKey, result.output.Endpoints);
            if (requestQueue[cacheKey]) {
                requestQueue[cacheKey].forEach(({ resolve }) => {
                    resolve();
                });
                delete requestQueue[cacheKey];
            }
            resolve();
        })
            .catch((error) => {
            endpointCache.delete(cacheKey);
            const errorToThrow = Object.assign(new Error(`The operation to discover endpoint failed.` +
                ` Please retry, or provide a custom endpoint and disable endpoint discovery to proceed.`), { reason: error });
            if (requestQueue[cacheKey]) {
                requestQueue[cacheKey].forEach(({ reject }) => {
                    reject(errorToThrow);
                });
                delete requestQueue[cacheKey];
            }
            if (options.isDiscoveredEndpointRequired) {
                reject(errorToThrow);
            }
            else {
                endpointCache.set(cacheKey, placeholderEndpoints);
                resolve();
            }
        });
    }
});

const endpointDiscoveryMiddleware = (config, middlewareConfig) => (next, context) => async (args) => {
    if (config.isCustomEndpoint) {
        if (config.isClientEndpointDiscoveryEnabled) {
            throw new Error(`Custom endpoint is supplied; endpointDiscoveryEnabled must not be true.`);
        }
        return next(args);
    }
    const { endpointDiscoveryCommandCtor } = config;
    const { isDiscoveredEndpointRequired, identifiers } = middlewareConfig;
    const clientName = context.clientName;
    const commandName = context.commandName;
    const isEndpointDiscoveryEnabled = await config.endpointDiscoveryEnabled();
    const cacheKey = await getCacheKey(commandName, config, { identifiers });
    if (isDiscoveredEndpointRequired) {
        if (isEndpointDiscoveryEnabled === false) {
            throw new Error(`Endpoint Discovery is disabled but ${commandName} on ${clientName} requires it.` +
                ` Please check your configurations.`);
        }
        await updateDiscoveredEndpointInCache(config, {
            ...middlewareConfig,
            commandName,
            cacheKey,
            endpointDiscoveryCommandCtor,
        });
    }
    else if (isEndpointDiscoveryEnabled) {
        updateDiscoveredEndpointInCache(config, {
            ...middlewareConfig,
            commandName,
            cacheKey,
            endpointDiscoveryCommandCtor,
        });
    }
    const { request } = args;
    if (cacheKey && protocolHttp.HttpRequest.isInstance(request)) {
        const endpoint = config.endpointCache.getEndpoint(cacheKey);
        if (endpoint) {
            request.hostname = endpoint;
        }
    }
    return next(args);
};

const endpointDiscoveryMiddlewareOptions = {
    name: "endpointDiscoveryMiddleware",
    step: "build",
    tags: ["ENDPOINT_DISCOVERY"],
    override: true,
};
const getEndpointDiscoveryPlugin = (pluginConfig, middlewareConfig) => ({
    applyToStack: (commandStack) => {
        commandStack.add(endpointDiscoveryMiddleware(pluginConfig, middlewareConfig), endpointDiscoveryMiddlewareOptions);
    },
});
const getEndpointDiscoveryRequiredPlugin = (pluginConfig, middlewareConfig) => ({
    applyToStack: (commandStack) => {
        commandStack.add(endpointDiscoveryMiddleware(pluginConfig, { ...middlewareConfig, isDiscoveredEndpointRequired: true }), endpointDiscoveryMiddlewareOptions);
    },
});
const getEndpointDiscoveryOptionalPlugin = (pluginConfig, middlewareConfig) => ({
    applyToStack: (commandStack) => {
        commandStack.add(endpointDiscoveryMiddleware(pluginConfig, { ...middlewareConfig, isDiscoveredEndpointRequired: false }), endpointDiscoveryMiddlewareOptions);
    },
});

const resolveEndpointDiscoveryConfig = (input, { endpointDiscoveryCommandCtor }) => {
    const { endpointCacheSize, endpointDiscoveryEnabled, endpointDiscoveryEnabledProvider } = input;
    return Object.assign(input, {
        endpointDiscoveryCommandCtor,
        endpointCache: new endpointCache.EndpointCache(endpointCacheSize ?? 1000),
        endpointDiscoveryEnabled: endpointDiscoveryEnabled !== undefined
            ? () => Promise.resolve(endpointDiscoveryEnabled)
            : endpointDiscoveryEnabledProvider,
        isClientEndpointDiscoveryEnabled: endpointDiscoveryEnabled !== undefined,
    });
};

exports.NODE_ENDPOINT_DISCOVERY_CONFIG_OPTIONS = NODE_ENDPOINT_DISCOVERY_CONFIG_OPTIONS;
exports.endpointDiscoveryMiddlewareOptions = endpointDiscoveryMiddlewareOptions;
exports.getEndpointDiscoveryOptionalPlugin = getEndpointDiscoveryOptionalPlugin;
exports.getEndpointDiscoveryPlugin = getEndpointDiscoveryPlugin;
exports.getEndpointDiscoveryRequiredPlugin = getEndpointDiscoveryRequiredPlugin;
exports.resolveEndpointDiscoveryConfig = resolveEndpointDiscoveryConfig;


/***/ }),

/***/ 52590:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var protocolHttp = __webpack_require__(72356);

function resolveHostHeaderConfig(input) {
    return input;
}
const hostHeaderMiddleware = (options) => (next) => async (args) => {
    if (!protocolHttp.HttpRequest.isInstance(args.request))
        return next(args);
    const { request } = args;
    const { handlerProtocol = "" } = options.requestHandler.metadata || {};
    if (handlerProtocol.indexOf("h2") >= 0 && !request.headers[":authority"]) {
        delete request.headers["host"];
        request.headers[":authority"] = request.hostname + (request.port ? ":" + request.port : "");
    }
    else if (!request.headers["host"]) {
        let host = request.hostname;
        if (request.port != null)
            host += `:${request.port}`;
        request.headers["host"] = host;
    }
    return next(args);
};
const hostHeaderMiddlewareOptions = {
    name: "hostHeaderMiddleware",
    step: "build",
    priority: "low",
    tags: ["HOST"],
    override: true,
};
const getHostHeaderPlugin = (options) => ({
    applyToStack: (clientStack) => {
        clientStack.add(hostHeaderMiddleware(options), hostHeaderMiddlewareOptions);
    },
});

exports.getHostHeaderPlugin = getHostHeaderPlugin;
exports.hostHeaderMiddleware = hostHeaderMiddleware;
exports.hostHeaderMiddlewareOptions = hostHeaderMiddlewareOptions;
exports.resolveHostHeaderConfig = resolveHostHeaderConfig;


/***/ }),

/***/ 85242:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


const loggerMiddleware = () => (next, context) => async (args) => {
    try {
        const response = await next(args);
        const { clientName, commandName, logger, dynamoDbDocumentClientOptions = {} } = context;
        const { overrideInputFilterSensitiveLog, overrideOutputFilterSensitiveLog } = dynamoDbDocumentClientOptions;
        const inputFilterSensitiveLog = overrideInputFilterSensitiveLog ?? context.inputFilterSensitiveLog;
        const outputFilterSensitiveLog = overrideOutputFilterSensitiveLog ?? context.outputFilterSensitiveLog;
        const { $metadata, ...outputWithoutMetadata } = response.output;
        logger?.info?.({
            clientName,
            commandName,
            input: inputFilterSensitiveLog(args.input),
            output: outputFilterSensitiveLog(outputWithoutMetadata),
            metadata: $metadata,
        });
        return response;
    }
    catch (error) {
        const { clientName, commandName, logger, dynamoDbDocumentClientOptions = {} } = context;
        const { overrideInputFilterSensitiveLog } = dynamoDbDocumentClientOptions;
        const inputFilterSensitiveLog = overrideInputFilterSensitiveLog ?? context.inputFilterSensitiveLog;
        logger?.error?.({
            clientName,
            commandName,
            input: inputFilterSensitiveLog(args.input),
            error,
            metadata: error.$metadata,
        });
        throw error;
    }
};
const loggerMiddlewareOptions = {
    name: "loggerMiddleware",
    tags: ["LOGGER"],
    step: "initialize",
    override: true,
};
const getLoggerPlugin = (options) => ({
    applyToStack: (clientStack) => {
        clientStack.add(loggerMiddleware(), loggerMiddlewareOptions);
    },
});

exports.getLoggerPlugin = getLoggerPlugin;
exports.loggerMiddleware = loggerMiddleware;
exports.loggerMiddlewareOptions = loggerMiddlewareOptions;


/***/ }),

/***/ 81568:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var recursionDetectionMiddleware = __webpack_require__(22521);

const recursionDetectionMiddlewareOptions = {
    step: "build",
    tags: ["RECURSION_DETECTION"],
    name: "recursionDetectionMiddleware",
    override: true,
    priority: "low",
};

const getRecursionDetectionPlugin = (options) => ({
    applyToStack: (clientStack) => {
        clientStack.add(recursionDetectionMiddleware.recursionDetectionMiddleware(), recursionDetectionMiddlewareOptions);
    },
});

exports.getRecursionDetectionPlugin = getRecursionDetectionPlugin;
Object.prototype.hasOwnProperty.call(recursionDetectionMiddleware, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: recursionDetectionMiddleware['__proto__']
    });

Object.keys(recursionDetectionMiddleware).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = recursionDetectionMiddleware[k];
});


/***/ }),

/***/ 22521:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.recursionDetectionMiddleware = void 0;
const lambda_invoke_store_1 = __webpack_require__(29320);
const protocol_http_1 = __webpack_require__(72356);
const TRACE_ID_HEADER_NAME = "X-Amzn-Trace-Id";
const ENV_LAMBDA_FUNCTION_NAME = "AWS_LAMBDA_FUNCTION_NAME";
const ENV_TRACE_ID = "_X_AMZN_TRACE_ID";
const recursionDetectionMiddleware = () => (next) => async (args) => {
    const { request } = args;
    if (!protocol_http_1.HttpRequest.isInstance(request)) {
        return next(args);
    }
    const traceIdHeader = Object.keys(request.headers ?? {}).find((h) => h.toLowerCase() === TRACE_ID_HEADER_NAME.toLowerCase()) ??
        TRACE_ID_HEADER_NAME;
    if (request.headers.hasOwnProperty(traceIdHeader)) {
        return next(args);
    }
    const functionName = process.env[ENV_LAMBDA_FUNCTION_NAME];
    const traceIdFromEnv = process.env[ENV_TRACE_ID];
    const invokeStore = await lambda_invoke_store_1.InvokeStore.getInstanceAsync();
    const traceIdFromInvokeStore = invokeStore?.getXRayTraceId();
    const traceId = traceIdFromInvokeStore ?? traceIdFromEnv;
    const nonEmptyString = (str) => typeof str === "string" && str.length > 0;
    if (nonEmptyString(functionName) && nonEmptyString(traceId)) {
        request.headers[TRACE_ID_HEADER_NAME] = traceId;
    }
    return next({
        ...args,
        request,
    });
};
exports.recursionDetectionMiddleware = recursionDetectionMiddleware;


/***/ }),

/***/ 32959:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var core = __webpack_require__(90402);
var utilEndpoints = __webpack_require__(83068);
var protocolHttp = __webpack_require__(72356);
var client = __webpack_require__(5152);
var utilRetry = __webpack_require__(15518);

const DEFAULT_UA_APP_ID = undefined;
function isValidUserAgentAppId(appId) {
    if (appId === undefined) {
        return true;
    }
    return typeof appId === "string" && appId.length <= 50;
}
function resolveUserAgentConfig(input) {
    const normalizedAppIdProvider = core.normalizeProvider(input.userAgentAppId ?? DEFAULT_UA_APP_ID);
    const { customUserAgent } = input;
    return Object.assign(input, {
        customUserAgent: typeof customUserAgent === "string" ? [[customUserAgent]] : customUserAgent,
        userAgentAppId: async () => {
            const appId = await normalizedAppIdProvider();
            if (!isValidUserAgentAppId(appId)) {
                const logger = input.logger?.constructor?.name === "NoOpLogger" || !input.logger ? console : input.logger;
                if (typeof appId !== "string") {
                    logger?.warn("userAgentAppId must be a string or undefined.");
                }
                else if (appId.length > 50) {
                    logger?.warn("The provided userAgentAppId exceeds the maximum length of 50 characters.");
                }
            }
            return appId;
        },
    });
}

const ACCOUNT_ID_ENDPOINT_REGEX = /\d{12}\.ddb/;
async function checkFeatures(context, config, args) {
    const request = args.request;
    if (request?.headers?.["smithy-protocol"] === "rpc-v2-cbor") {
        client.setFeature(context, "PROTOCOL_RPC_V2_CBOR", "M");
    }
    if (typeof config.retryStrategy === "function") {
        const retryStrategy = await config.retryStrategy();
        if (typeof retryStrategy.mode === "string") {
            switch (retryStrategy.mode) {
                case utilRetry.RETRY_MODES.ADAPTIVE:
                    client.setFeature(context, "RETRY_MODE_ADAPTIVE", "F");
                    break;
                case utilRetry.RETRY_MODES.STANDARD:
                    client.setFeature(context, "RETRY_MODE_STANDARD", "E");
                    break;
            }
        }
    }
    if (typeof config.accountIdEndpointMode === "function") {
        const endpointV2 = context.endpointV2;
        if (String(endpointV2?.url?.hostname).match(ACCOUNT_ID_ENDPOINT_REGEX)) {
            client.setFeature(context, "ACCOUNT_ID_ENDPOINT", "O");
        }
        switch (await config.accountIdEndpointMode?.()) {
            case "disabled":
                client.setFeature(context, "ACCOUNT_ID_MODE_DISABLED", "Q");
                break;
            case "preferred":
                client.setFeature(context, "ACCOUNT_ID_MODE_PREFERRED", "P");
                break;
            case "required":
                client.setFeature(context, "ACCOUNT_ID_MODE_REQUIRED", "R");
                break;
        }
    }
    const identity = context.__smithy_context?.selectedHttpAuthScheme?.identity;
    if (identity?.$source) {
        const credentials = identity;
        if (credentials.accountId) {
            client.setFeature(context, "RESOLVED_ACCOUNT_ID", "T");
        }
        for (const [key, value] of Object.entries(credentials.$source ?? {})) {
            client.setFeature(context, key, value);
        }
    }
}

const USER_AGENT = "user-agent";
const X_AMZ_USER_AGENT = "x-amz-user-agent";
const SPACE = " ";
const UA_NAME_SEPARATOR = "/";
const UA_NAME_ESCAPE_REGEX = /[^!$%&'*+\-.^_`|~\w]/g;
const UA_VALUE_ESCAPE_REGEX = /[^!$%&'*+\-.^_`|~\w#]/g;
const UA_ESCAPE_CHAR = "-";

const BYTE_LIMIT = 1024;
function encodeFeatures(features) {
    let buffer = "";
    for (const key in features) {
        const val = features[key];
        if (buffer.length + val.length + 1 <= BYTE_LIMIT) {
            if (buffer.length) {
                buffer += "," + val;
            }
            else {
                buffer += val;
            }
            continue;
        }
        break;
    }
    return buffer;
}

const userAgentMiddleware = (options) => (next, context) => async (args) => {
    const { request } = args;
    if (!protocolHttp.HttpRequest.isInstance(request)) {
        return next(args);
    }
    const { headers } = request;
    const userAgent = context?.userAgent?.map(escapeUserAgent) || [];
    const defaultUserAgent = (await options.defaultUserAgentProvider()).map(escapeUserAgent);
    await checkFeatures(context, options, args);
    const awsContext = context;
    defaultUserAgent.push(`m/${encodeFeatures(Object.assign({}, context.__smithy_context?.features, awsContext.__aws_sdk_context?.features))}`);
    const customUserAgent = options?.customUserAgent?.map(escapeUserAgent) || [];
    const appId = await options.userAgentAppId();
    if (appId) {
        defaultUserAgent.push(escapeUserAgent([`app`, `${appId}`]));
    }
    const prefix = utilEndpoints.getUserAgentPrefix();
    const sdkUserAgentValue = (prefix ? [prefix] : [])
        .concat([...defaultUserAgent, ...userAgent, ...customUserAgent])
        .join(SPACE);
    const normalUAValue = [
        ...defaultUserAgent.filter((section) => section.startsWith("aws-sdk-")),
        ...customUserAgent,
    ].join(SPACE);
    if (options.runtime !== "browser") {
        if (normalUAValue) {
            headers[X_AMZ_USER_AGENT] = headers[X_AMZ_USER_AGENT]
                ? `${headers[USER_AGENT]} ${normalUAValue}`
                : normalUAValue;
        }
        headers[USER_AGENT] = sdkUserAgentValue;
    }
    else {
        headers[X_AMZ_USER_AGENT] = sdkUserAgentValue;
    }
    return next({
        ...args,
        request,
    });
};
const escapeUserAgent = (userAgentPair) => {
    const name = userAgentPair[0]
        .split(UA_NAME_SEPARATOR)
        .map((part) => part.replace(UA_NAME_ESCAPE_REGEX, UA_ESCAPE_CHAR))
        .join(UA_NAME_SEPARATOR);
    const version = userAgentPair[1]?.replace(UA_VALUE_ESCAPE_REGEX, UA_ESCAPE_CHAR);
    const prefixSeparatorIndex = name.indexOf(UA_NAME_SEPARATOR);
    const prefix = name.substring(0, prefixSeparatorIndex);
    let uaName = name.substring(prefixSeparatorIndex + 1);
    if (prefix === "api") {
        uaName = uaName.toLowerCase();
    }
    return [prefix, uaName, version]
        .filter((item) => item && item.length > 0)
        .reduce((acc, item, index) => {
        switch (index) {
            case 0:
                return item;
            case 1:
                return `${acc}/${item}`;
            default:
                return `${acc}#${item}`;
        }
    }, "");
};
const getUserAgentMiddlewareOptions = {
    name: "getUserAgentMiddleware",
    step: "build",
    priority: "low",
    tags: ["SET_USER_AGENT", "USER_AGENT"],
    override: true,
};
const getUserAgentPlugin = (config) => ({
    applyToStack: (clientStack) => {
        clientStack.add(userAgentMiddleware(config), getUserAgentMiddlewareOptions);
    },
});

exports.DEFAULT_UA_APP_ID = DEFAULT_UA_APP_ID;
exports.getUserAgentMiddlewareOptions = getUserAgentMiddlewareOptions;
exports.getUserAgentPlugin = getUserAgentPlugin;
exports.resolveUserAgentConfig = resolveUserAgentConfig;
exports.userAgentMiddleware = userAgentMiddleware;


/***/ }),

/***/ 36463:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var stsRegionDefaultResolver = __webpack_require__(5779);
var configResolver = __webpack_require__(39316);

const getAwsRegionExtensionConfiguration = (runtimeConfig) => {
    return {
        setRegion(region) {
            runtimeConfig.region = region;
        },
        region() {
            return runtimeConfig.region;
        },
    };
};
const resolveAwsRegionExtensionConfiguration = (awsRegionExtensionConfiguration) => {
    return {
        region: awsRegionExtensionConfiguration.region(),
    };
};

exports.NODE_REGION_CONFIG_FILE_OPTIONS = configResolver.NODE_REGION_CONFIG_FILE_OPTIONS;
exports.NODE_REGION_CONFIG_OPTIONS = configResolver.NODE_REGION_CONFIG_OPTIONS;
exports.REGION_ENV_NAME = configResolver.REGION_ENV_NAME;
exports.REGION_INI_NAME = configResolver.REGION_INI_NAME;
exports.resolveRegionConfig = configResolver.resolveRegionConfig;
exports.getAwsRegionExtensionConfiguration = getAwsRegionExtensionConfiguration;
exports.resolveAwsRegionExtensionConfiguration = resolveAwsRegionExtensionConfiguration;
Object.prototype.hasOwnProperty.call(stsRegionDefaultResolver, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: stsRegionDefaultResolver['__proto__']
    });

Object.keys(stsRegionDefaultResolver).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = stsRegionDefaultResolver[k];
});


/***/ }),

/***/ 5779:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.warning = void 0;
exports.stsRegionDefaultResolver = stsRegionDefaultResolver;
const config_resolver_1 = __webpack_require__(39316);
const node_config_provider_1 = __webpack_require__(55704);
function stsRegionDefaultResolver(loaderConfig = {}) {
    return (0, node_config_provider_1.loadConfig)({
        ...config_resolver_1.NODE_REGION_CONFIG_OPTIONS,
        async default() {
            if (!exports.warning.silence) {
                console.warn("@aws-sdk - WARN - default STS region of us-east-1 used. See @aws-sdk/credential-providers README and set a region explicitly.");
            }
            return "us-east-1";
        },
    }, { ...config_resolver_1.NODE_REGION_CONFIG_FILE_OPTIONS, ...loaderConfig });
}
exports.warning = {
    silence: false,
};


/***/ }),

/***/ 83068:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var utilEndpoints = __webpack_require__(79674);
var urlParser = __webpack_require__(14494);

const isVirtualHostableS3Bucket = (value, allowSubDomains = false) => {
    if (allowSubDomains) {
        for (const label of value.split(".")) {
            if (!isVirtualHostableS3Bucket(label)) {
                return false;
            }
        }
        return true;
    }
    if (!utilEndpoints.isValidHostLabel(value)) {
        return false;
    }
    if (value.length < 3 || value.length > 63) {
        return false;
    }
    if (value !== value.toLowerCase()) {
        return false;
    }
    if (utilEndpoints.isIpAddress(value)) {
        return false;
    }
    return true;
};

const ARN_DELIMITER = ":";
const RESOURCE_DELIMITER = "/";
const parseArn = (value) => {
    const segments = value.split(ARN_DELIMITER);
    if (segments.length < 6)
        return null;
    const [arn, partition, service, region, accountId, ...resourcePath] = segments;
    if (arn !== "arn" || partition === "" || service === "" || resourcePath.join(ARN_DELIMITER) === "")
        return null;
    const resourceId = resourcePath.map((resource) => resource.split(RESOURCE_DELIMITER)).flat();
    return {
        partition,
        service,
        region,
        accountId,
        resourceId,
    };
};

var partitions = [
	{
		id: "aws",
		outputs: {
			dnsSuffix: "amazonaws.com",
			dualStackDnsSuffix: "api.aws",
			implicitGlobalRegion: "us-east-1",
			name: "aws",
			supportsDualStack: true,
			supportsFIPS: true
		},
		regionRegex: "^(us|eu|ap|sa|ca|me|af|il|mx)\\-\\w+\\-\\d+$",
		regions: {
			"af-south-1": {
				description: "Africa (Cape Town)"
			},
			"ap-east-1": {
				description: "Asia Pacific (Hong Kong)"
			},
			"ap-east-2": {
				description: "Asia Pacific (Taipei)"
			},
			"ap-northeast-1": {
				description: "Asia Pacific (Tokyo)"
			},
			"ap-northeast-2": {
				description: "Asia Pacific (Seoul)"
			},
			"ap-northeast-3": {
				description: "Asia Pacific (Osaka)"
			},
			"ap-south-1": {
				description: "Asia Pacific (Mumbai)"
			},
			"ap-south-2": {
				description: "Asia Pacific (Hyderabad)"
			},
			"ap-southeast-1": {
				description: "Asia Pacific (Singapore)"
			},
			"ap-southeast-2": {
				description: "Asia Pacific (Sydney)"
			},
			"ap-southeast-3": {
				description: "Asia Pacific (Jakarta)"
			},
			"ap-southeast-4": {
				description: "Asia Pacific (Melbourne)"
			},
			"ap-southeast-5": {
				description: "Asia Pacific (Malaysia)"
			},
			"ap-southeast-6": {
				description: "Asia Pacific (New Zealand)"
			},
			"ap-southeast-7": {
				description: "Asia Pacific (Thailand)"
			},
			"aws-global": {
				description: "aws global region"
			},
			"ca-central-1": {
				description: "Canada (Central)"
			},
			"ca-west-1": {
				description: "Canada West (Calgary)"
			},
			"eu-central-1": {
				description: "Europe (Frankfurt)"
			},
			"eu-central-2": {
				description: "Europe (Zurich)"
			},
			"eu-north-1": {
				description: "Europe (Stockholm)"
			},
			"eu-south-1": {
				description: "Europe (Milan)"
			},
			"eu-south-2": {
				description: "Europe (Spain)"
			},
			"eu-west-1": {
				description: "Europe (Ireland)"
			},
			"eu-west-2": {
				description: "Europe (London)"
			},
			"eu-west-3": {
				description: "Europe (Paris)"
			},
			"il-central-1": {
				description: "Israel (Tel Aviv)"
			},
			"me-central-1": {
				description: "Middle East (UAE)"
			},
			"me-south-1": {
				description: "Middle East (Bahrain)"
			},
			"mx-central-1": {
				description: "Mexico (Central)"
			},
			"sa-east-1": {
				description: "South America (Sao Paulo)"
			},
			"us-east-1": {
				description: "US East (N. Virginia)"
			},
			"us-east-2": {
				description: "US East (Ohio)"
			},
			"us-west-1": {
				description: "US West (N. California)"
			},
			"us-west-2": {
				description: "US West (Oregon)"
			}
		}
	},
	{
		id: "aws-cn",
		outputs: {
			dnsSuffix: "amazonaws.com.cn",
			dualStackDnsSuffix: "api.amazonwebservices.com.cn",
			implicitGlobalRegion: "cn-northwest-1",
			name: "aws-cn",
			supportsDualStack: true,
			supportsFIPS: true
		},
		regionRegex: "^cn\\-\\w+\\-\\d+$",
		regions: {
			"aws-cn-global": {
				description: "aws-cn global region"
			},
			"cn-north-1": {
				description: "China (Beijing)"
			},
			"cn-northwest-1": {
				description: "China (Ningxia)"
			}
		}
	},
	{
		id: "aws-eusc",
		outputs: {
			dnsSuffix: "amazonaws.eu",
			dualStackDnsSuffix: "api.amazonwebservices.eu",
			implicitGlobalRegion: "eusc-de-east-1",
			name: "aws-eusc",
			supportsDualStack: true,
			supportsFIPS: true
		},
		regionRegex: "^eusc\\-(de)\\-\\w+\\-\\d+$",
		regions: {
			"eusc-de-east-1": {
				description: "AWS European Sovereign Cloud (Germany)"
			}
		}
	},
	{
		id: "aws-iso",
		outputs: {
			dnsSuffix: "c2s.ic.gov",
			dualStackDnsSuffix: "api.aws.ic.gov",
			implicitGlobalRegion: "us-iso-east-1",
			name: "aws-iso",
			supportsDualStack: true,
			supportsFIPS: true
		},
		regionRegex: "^us\\-iso\\-\\w+\\-\\d+$",
		regions: {
			"aws-iso-global": {
				description: "aws-iso global region"
			},
			"us-iso-east-1": {
				description: "US ISO East"
			},
			"us-iso-west-1": {
				description: "US ISO WEST"
			}
		}
	},
	{
		id: "aws-iso-b",
		outputs: {
			dnsSuffix: "sc2s.sgov.gov",
			dualStackDnsSuffix: "api.aws.scloud",
			implicitGlobalRegion: "us-isob-east-1",
			name: "aws-iso-b",
			supportsDualStack: true,
			supportsFIPS: true
		},
		regionRegex: "^us\\-isob\\-\\w+\\-\\d+$",
		regions: {
			"aws-iso-b-global": {
				description: "aws-iso-b global region"
			},
			"us-isob-east-1": {
				description: "US ISOB East (Ohio)"
			},
			"us-isob-west-1": {
				description: "US ISOB West"
			}
		}
	},
	{
		id: "aws-iso-e",
		outputs: {
			dnsSuffix: "cloud.adc-e.uk",
			dualStackDnsSuffix: "api.cloud-aws.adc-e.uk",
			implicitGlobalRegion: "eu-isoe-west-1",
			name: "aws-iso-e",
			supportsDualStack: true,
			supportsFIPS: true
		},
		regionRegex: "^eu\\-isoe\\-\\w+\\-\\d+$",
		regions: {
			"aws-iso-e-global": {
				description: "aws-iso-e global region"
			},
			"eu-isoe-west-1": {
				description: "EU ISOE West"
			}
		}
	},
	{
		id: "aws-iso-f",
		outputs: {
			dnsSuffix: "csp.hci.ic.gov",
			dualStackDnsSuffix: "api.aws.hci.ic.gov",
			implicitGlobalRegion: "us-isof-south-1",
			name: "aws-iso-f",
			supportsDualStack: true,
			supportsFIPS: true
		},
		regionRegex: "^us\\-isof\\-\\w+\\-\\d+$",
		regions: {
			"aws-iso-f-global": {
				description: "aws-iso-f global region"
			},
			"us-isof-east-1": {
				description: "US ISOF EAST"
			},
			"us-isof-south-1": {
				description: "US ISOF SOUTH"
			}
		}
	},
	{
		id: "aws-us-gov",
		outputs: {
			dnsSuffix: "amazonaws.com",
			dualStackDnsSuffix: "api.aws",
			implicitGlobalRegion: "us-gov-west-1",
			name: "aws-us-gov",
			supportsDualStack: true,
			supportsFIPS: true
		},
		regionRegex: "^us\\-gov\\-\\w+\\-\\d+$",
		regions: {
			"aws-us-gov-global": {
				description: "aws-us-gov global region"
			},
			"us-gov-east-1": {
				description: "AWS GovCloud (US-East)"
			},
			"us-gov-west-1": {
				description: "AWS GovCloud (US-West)"
			}
		}
	}
];
var version = "1.1";
var partitionsInfo = {
	partitions: partitions,
	version: version
};

let selectedPartitionsInfo = partitionsInfo;
let selectedUserAgentPrefix = "";
const partition = (value) => {
    const { partitions } = selectedPartitionsInfo;
    for (const partition of partitions) {
        const { regions, outputs } = partition;
        for (const [region, regionData] of Object.entries(regions)) {
            if (region === value) {
                return {
                    ...outputs,
                    ...regionData,
                };
            }
        }
    }
    for (const partition of partitions) {
        const { regionRegex, outputs } = partition;
        if (new RegExp(regionRegex).test(value)) {
            return {
                ...outputs,
            };
        }
    }
    const DEFAULT_PARTITION = partitions.find((partition) => partition.id === "aws");
    if (!DEFAULT_PARTITION) {
        throw new Error("Provided region was not found in the partition array or regex," +
            " and default partition with id 'aws' doesn't exist.");
    }
    return {
        ...DEFAULT_PARTITION.outputs,
    };
};
const setPartitionInfo = (partitionsInfo, userAgentPrefix = "") => {
    selectedPartitionsInfo = partitionsInfo;
    selectedUserAgentPrefix = userAgentPrefix;
};
const useDefaultPartitionInfo = () => {
    setPartitionInfo(partitionsInfo, "");
};
const getUserAgentPrefix = () => selectedUserAgentPrefix;

const awsEndpointFunctions = {
    isVirtualHostableS3Bucket: isVirtualHostableS3Bucket,
    parseArn: parseArn,
    partition: partition,
};
utilEndpoints.customEndpointFunctions.aws = awsEndpointFunctions;

const resolveDefaultAwsRegionalEndpointsConfig = (input) => {
    if (typeof input.endpointProvider !== "function") {
        throw new Error("@aws-sdk/util-endpoint - endpointProvider and endpoint missing in config for this client.");
    }
    const { endpoint } = input;
    if (endpoint === undefined) {
        input.endpoint = async () => {
            return toEndpointV1(input.endpointProvider({
                Region: typeof input.region === "function" ? await input.region() : input.region,
                UseDualStack: typeof input.useDualstackEndpoint === "function"
                    ? await input.useDualstackEndpoint()
                    : input.useDualstackEndpoint,
                UseFIPS: typeof input.useFipsEndpoint === "function" ? await input.useFipsEndpoint() : input.useFipsEndpoint,
                Endpoint: undefined,
            }, { logger: input.logger }));
        };
    }
    return input;
};
const toEndpointV1 = (endpoint) => urlParser.parseUrl(endpoint.url);

exports.EndpointError = utilEndpoints.EndpointError;
exports.isIpAddress = utilEndpoints.isIpAddress;
exports.resolveEndpoint = utilEndpoints.resolveEndpoint;
exports.awsEndpointFunctions = awsEndpointFunctions;
exports.getUserAgentPrefix = getUserAgentPrefix;
exports.partition = partition;
exports.resolveDefaultAwsRegionalEndpointsConfig = resolveDefaultAwsRegionalEndpointsConfig;
exports.setPartitionInfo = setPartitionInfo;
exports.toEndpointV1 = toEndpointV1;
exports.useDefaultPartitionInfo = useDefaultPartitionInfo;


/***/ }),

/***/ 51656:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var node_os = __webpack_require__(48161);
var node_process = __webpack_require__(1708);
var utilConfigProvider = __webpack_require__(56716);
var promises = __webpack_require__(51455);
var node_path = __webpack_require__(76760);
var middlewareUserAgent = __webpack_require__(32959);

const getRuntimeUserAgentPair = () => {
    const runtimesToCheck = ["deno", "bun", "llrt"];
    for (const runtime of runtimesToCheck) {
        if (node_process.versions[runtime]) {
            return [`md/${runtime}`, node_process.versions[runtime]];
        }
    }
    return ["md/nodejs", node_process.versions.node];
};

const getNodeModulesParentDirs = (dirname) => {
    const cwd = process.cwd();
    if (!dirname) {
        return [cwd];
    }
    const normalizedPath = node_path.normalize(dirname);
    const parts = normalizedPath.split(node_path.sep);
    const nodeModulesIndex = parts.indexOf("node_modules");
    const parentDir = nodeModulesIndex !== -1 ? parts.slice(0, nodeModulesIndex).join(node_path.sep) : normalizedPath;
    if (cwd === parentDir) {
        return [cwd];
    }
    return [parentDir, cwd];
};

const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;
const getSanitizedTypeScriptVersion = (version = "") => {
    const match = version.match(SEMVER_REGEX);
    if (!match) {
        return undefined;
    }
    const [major, minor, patch, prerelease] = [match[1], match[2], match[3], match[4]];
    return prerelease ? `${major}.${minor}.${patch}-${prerelease}` : `${major}.${minor}.${patch}`;
};

const ALLOWED_PREFIXES = ["^", "~", ">=", "<=", ">", "<"];
const ALLOWED_DIST_TAGS = ["latest", "beta", "dev", "rc", "insiders", "next"];
const getSanitizedDevTypeScriptVersion = (version = "") => {
    if (ALLOWED_DIST_TAGS.includes(version)) {
        return version;
    }
    const prefix = ALLOWED_PREFIXES.find((p) => version.startsWith(p)) ?? "";
    const sanitizedTypeScriptVersion = getSanitizedTypeScriptVersion(version.slice(prefix.length));
    if (!sanitizedTypeScriptVersion) {
        return undefined;
    }
    return `${prefix}${sanitizedTypeScriptVersion}`;
};

let tscVersion;
const TS_PACKAGE_JSON = node_path.join("node_modules", "typescript", "package.json");
const getTypeScriptUserAgentPair = async () => {
    if (tscVersion === null) {
        return undefined;
    }
    else if (typeof tscVersion === "string") {
        return ["md/tsc", tscVersion];
    }
    let isTypeScriptDetectionDisabled = false;
    try {
        isTypeScriptDetectionDisabled =
            utilConfigProvider.booleanSelector(process.env, "AWS_SDK_JS_TYPESCRIPT_DETECTION_DISABLED", utilConfigProvider.SelectorType.ENV) || false;
    }
    catch { }
    if (isTypeScriptDetectionDisabled) {
        tscVersion = null;
        return undefined;
    }
    const dirname = typeof __dirname !== "undefined" ? __dirname : undefined;
    const nodeModulesParentDirs = getNodeModulesParentDirs(dirname);
    let versionFromApp;
    for (const nodeModulesParentDir of nodeModulesParentDirs) {
        try {
            const appPackageJsonPath = node_path.join(nodeModulesParentDir, "package.json");
            const packageJson = await promises.readFile(appPackageJsonPath, "utf-8");
            const { dependencies, devDependencies } = JSON.parse(packageJson);
            const version = devDependencies?.typescript ?? dependencies?.typescript;
            if (typeof version !== "string") {
                continue;
            }
            versionFromApp = version;
            break;
        }
        catch {
        }
    }
    if (!versionFromApp) {
        tscVersion = null;
        return undefined;
    }
    let versionFromNodeModules;
    for (const nodeModulesParentDir of nodeModulesParentDirs) {
        try {
            const tsPackageJsonPath = node_path.join(nodeModulesParentDir, TS_PACKAGE_JSON);
            const packageJson = await promises.readFile(tsPackageJsonPath, "utf-8");
            const { version } = JSON.parse(packageJson);
            const sanitizedVersion = getSanitizedTypeScriptVersion(version);
            if (typeof sanitizedVersion !== "string") {
                continue;
            }
            versionFromNodeModules = sanitizedVersion;
            break;
        }
        catch {
        }
    }
    if (versionFromNodeModules) {
        tscVersion = versionFromNodeModules;
        return ["md/tsc", tscVersion];
    }
    const sanitizedVersion = getSanitizedDevTypeScriptVersion(versionFromApp);
    if (typeof sanitizedVersion !== "string") {
        tscVersion = null;
        return undefined;
    }
    tscVersion = `dev_${sanitizedVersion}`;
    return ["md/tsc", tscVersion];
};

const crtAvailability = {
    isCrtAvailable: false,
};

const isCrtAvailable = () => {
    if (crtAvailability.isCrtAvailable) {
        return ["md/crt-avail"];
    }
    return null;
};

const createDefaultUserAgentProvider = ({ serviceId, clientVersion }) => {
    const runtimeUserAgentPair = getRuntimeUserAgentPair();
    return async (config) => {
        const sections = [
            ["aws-sdk-js", clientVersion],
            ["ua", "2.1"],
            [`os/${node_os.platform()}`, node_os.release()],
            ["lang/js"],
            runtimeUserAgentPair,
        ];
        const typescriptUserAgentPair = await getTypeScriptUserAgentPair();
        if (typescriptUserAgentPair) {
            sections.push(typescriptUserAgentPair);
        }
        const crtAvailable = isCrtAvailable();
        if (crtAvailable) {
            sections.push(crtAvailable);
        }
        if (serviceId) {
            sections.push([`api/${serviceId}`, clientVersion]);
        }
        if (node_process.env.AWS_EXECUTION_ENV) {
            sections.push([`exec-env/${node_process.env.AWS_EXECUTION_ENV}`]);
        }
        const appId = await config?.userAgentAppId?.();
        const resolvedUserAgent = appId ? [...sections, [`app/${appId}`]] : [...sections];
        return resolvedUserAgent;
    };
};
const defaultUserAgent = createDefaultUserAgentProvider;

const UA_APP_ID_ENV_NAME = "AWS_SDK_UA_APP_ID";
const UA_APP_ID_INI_NAME = "sdk_ua_app_id";
const UA_APP_ID_INI_NAME_DEPRECATED = "sdk-ua-app-id";
const NODE_APP_ID_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => env[UA_APP_ID_ENV_NAME],
    configFileSelector: (profile) => profile[UA_APP_ID_INI_NAME] ?? profile[UA_APP_ID_INI_NAME_DEPRECATED],
    default: middlewareUserAgent.DEFAULT_UA_APP_ID,
};

exports.NODE_APP_ID_CONFIG_OPTIONS = NODE_APP_ID_CONFIG_OPTIONS;
exports.UA_APP_ID_ENV_NAME = UA_APP_ID_ENV_NAME;
exports.UA_APP_ID_INI_NAME = UA_APP_ID_INI_NAME;
exports.createDefaultUserAgentProvider = createDefaultUserAgentProvider;
exports.crtAvailability = crtAvailability;
exports.defaultUserAgent = defaultUserAgent;


/***/ }),

/***/ 94274:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var xmlParser = __webpack_require__(43343);

const ATTR_ESCAPE_RE = /[&<>"]/g;
const ATTR_ESCAPE_MAP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
};
function escapeAttribute(value) {
    return value.replace(ATTR_ESCAPE_RE, (ch) => ATTR_ESCAPE_MAP[ch]);
}

const ELEMENT_ESCAPE_RE = /[&"'<>\r\n\u0085\u2028]/g;
const ELEMENT_ESCAPE_MAP = {
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
    "<": "&lt;",
    ">": "&gt;",
    "\r": "&#x0D;",
    "\n": "&#x0A;",
    "\u0085": "&#x85;",
    "\u2028": "&#x2028;",
};
function escapeElement(value) {
    return value.replace(ELEMENT_ESCAPE_RE, (ch) => ELEMENT_ESCAPE_MAP[ch]);
}

class XmlText {
    value;
    constructor(value) {
        this.value = value;
    }
    toString() {
        return escapeElement("" + this.value);
    }
}

class XmlNode {
    name;
    children;
    attributes = {};
    static of(name, childText, withName) {
        const node = new XmlNode(name);
        if (childText !== undefined) {
            node.addChildNode(new XmlText(childText));
        }
        if (withName !== undefined) {
            node.withName(withName);
        }
        return node;
    }
    constructor(name, children = []) {
        this.name = name;
        this.children = children;
    }
    withName(name) {
        this.name = name;
        return this;
    }
    addAttribute(name, value) {
        this.attributes[name] = value;
        return this;
    }
    addChildNode(child) {
        this.children.push(child);
        return this;
    }
    removeAttribute(name) {
        delete this.attributes[name];
        return this;
    }
    n(name) {
        this.name = name;
        return this;
    }
    c(child) {
        this.children.push(child);
        return this;
    }
    a(name, value) {
        if (value != null) {
            this.attributes[name] = value;
        }
        return this;
    }
    cc(input, field, withName = field) {
        if (input[field] != null) {
            const node = XmlNode.of(field, input[field]).withName(withName);
            this.c(node);
        }
    }
    l(input, listName, memberName, valueProvider) {
        if (input[listName] != null) {
            const nodes = valueProvider();
            nodes.map((node) => {
                node.withName(memberName);
                this.c(node);
            });
        }
    }
    lc(input, listName, memberName, valueProvider) {
        if (input[listName] != null) {
            const nodes = valueProvider();
            const containerNode = new XmlNode(memberName);
            nodes.map((node) => {
                containerNode.c(node);
            });
            this.c(containerNode);
        }
    }
    toString() {
        const hasChildren = Boolean(this.children.length);
        let xmlText = `<${this.name}`;
        const attributes = this.attributes;
        for (const attributeName of Object.keys(attributes)) {
            const attribute = attributes[attributeName];
            if (attribute != null) {
                xmlText += ` ${attributeName}="${escapeAttribute("" + attribute)}"`;
            }
        }
        return (xmlText += !hasChildren ? "/>" : `>${this.children.map((c) => c.toString()).join("")}</${this.name}>`);
    }
}

exports.parseXML = xmlParser.parseXML;
exports.XmlNode = XmlNode;
exports.XmlText = XmlText;


/***/ }),

/***/ 43343:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseXML = parseXML;
const fast_xml_parser_1 = __webpack_require__(3035);
const parser = new fast_xml_parser_1.XMLParser({
    attributeNamePrefix: "",
    processEntities: {
        enabled: true,
        maxTotalExpansions: Infinity,
    },
    htmlEntities: true,
    ignoreAttributes: false,
    ignoreDeclaration: true,
    parseTagValue: false,
    trimValues: false,
    tagValueProcessor: (_, val) => (val.trim() === "" && val.includes("\n") ? "" : undefined),
    maxNestedTags: Infinity,
});
parser.addEntity("#xD", "\r");
parser.addEntity("#10", "\n");
function parseXML(xmlString) {
    return parser.parse(xmlString, true);
}


/***/ }),

/***/ 29320:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


const PROTECTED_KEYS = {
    REQUEST_ID: Symbol.for("_AWS_LAMBDA_REQUEST_ID"),
    X_RAY_TRACE_ID: Symbol.for("_AWS_LAMBDA_X_RAY_TRACE_ID"),
    TENANT_ID: Symbol.for("_AWS_LAMBDA_TENANT_ID"),
};
const NO_GLOBAL_AWS_LAMBDA = ["true", "1"].includes(process.env?.AWS_LAMBDA_NODEJS_NO_GLOBAL_AWSLAMBDA ?? "");
if (!NO_GLOBAL_AWS_LAMBDA) {
    globalThis.awslambda = globalThis.awslambda || {};
}
class InvokeStoreBase {
    static PROTECTED_KEYS = PROTECTED_KEYS;
    isProtectedKey(key) {
        return Object.values(PROTECTED_KEYS).includes(key);
    }
    getRequestId() {
        return this.get(PROTECTED_KEYS.REQUEST_ID) ?? "-";
    }
    getXRayTraceId() {
        return this.get(PROTECTED_KEYS.X_RAY_TRACE_ID);
    }
    getTenantId() {
        return this.get(PROTECTED_KEYS.TENANT_ID);
    }
}
class InvokeStoreSingle extends InvokeStoreBase {
    currentContext;
    getContext() {
        return this.currentContext;
    }
    hasContext() {
        return this.currentContext !== undefined;
    }
    get(key) {
        return this.currentContext?.[key];
    }
    set(key, value) {
        if (this.isProtectedKey(key)) {
            throw new Error(`Cannot modify protected Lambda context field: ${String(key)}`);
        }
        this.currentContext = this.currentContext || {};
        this.currentContext[key] = value;
    }
    run(context, fn) {
        this.currentContext = context;
        return fn();
    }
}
class InvokeStoreMulti extends InvokeStoreBase {
    als;
    static async create() {
        const instance = new InvokeStoreMulti();
        const asyncHooks = await Promise.resolve(/* import() */).then(__webpack_require__.t.bind(__webpack_require__, 16698, 23));
        instance.als = new asyncHooks.AsyncLocalStorage();
        return instance;
    }
    getContext() {
        return this.als.getStore();
    }
    hasContext() {
        return this.als.getStore() !== undefined;
    }
    get(key) {
        return this.als.getStore()?.[key];
    }
    set(key, value) {
        if (this.isProtectedKey(key)) {
            throw new Error(`Cannot modify protected Lambda context field: ${String(key)}`);
        }
        const store = this.als.getStore();
        if (!store) {
            throw new Error("No context available");
        }
        store[key] = value;
    }
    run(context, fn) {
        return this.als.run(context, fn);
    }
}
exports.InvokeStore = void 0;
(function (InvokeStore) {
    let instance = null;
    async function getInstanceAsync(forceInvokeStoreMulti) {
        if (!instance) {
            instance = (async () => {
                const isMulti = forceInvokeStoreMulti === true || "AWS_LAMBDA_MAX_CONCURRENCY" in process.env;
                const newInstance = isMulti
                    ? await InvokeStoreMulti.create()
                    : new InvokeStoreSingle();
                if (!NO_GLOBAL_AWS_LAMBDA && globalThis.awslambda?.InvokeStore) {
                    return globalThis.awslambda.InvokeStore;
                }
                else if (!NO_GLOBAL_AWS_LAMBDA && globalThis.awslambda) {
                    globalThis.awslambda.InvokeStore = newInstance;
                    return newInstance;
                }
                else {
                    return newInstance;
                }
            })();
        }
        return instance;
    }
    InvokeStore.getInstanceAsync = getInstanceAsync;
    InvokeStore._testing = process.env.AWS_LAMBDA_BENCHMARK_MODE === "1"
        ? {
            reset: () => {
                instance = null;
                if (globalThis.awslambda?.InvokeStore) {
                    delete globalThis.awslambda.InvokeStore;
                }
                globalThis.awslambda = { InvokeStore: undefined };
            },
        }
        : undefined;
})(exports.InvokeStore || (exports.InvokeStore = {}));

exports.InvokeStoreBase = InvokeStoreBase;


/***/ }),

/***/ 39316:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var utilConfigProvider = __webpack_require__(56716);
var utilMiddleware = __webpack_require__(76324);
var utilEndpoints = __webpack_require__(79674);

const ENV_USE_DUALSTACK_ENDPOINT = "AWS_USE_DUALSTACK_ENDPOINT";
const CONFIG_USE_DUALSTACK_ENDPOINT = "use_dualstack_endpoint";
const DEFAULT_USE_DUALSTACK_ENDPOINT = false;
const NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => utilConfigProvider.booleanSelector(env, ENV_USE_DUALSTACK_ENDPOINT, utilConfigProvider.SelectorType.ENV),
    configFileSelector: (profile) => utilConfigProvider.booleanSelector(profile, CONFIG_USE_DUALSTACK_ENDPOINT, utilConfigProvider.SelectorType.CONFIG),
    default: false,
};
const nodeDualstackConfigSelectors = {
    environmentVariableSelector: (env) => utilConfigProvider.booleanSelector(env, ENV_USE_DUALSTACK_ENDPOINT, utilConfigProvider.SelectorType.ENV),
    configFileSelector: (profile) => utilConfigProvider.booleanSelector(profile, CONFIG_USE_DUALSTACK_ENDPOINT, utilConfigProvider.SelectorType.CONFIG),
    default: undefined,
};

const ENV_USE_FIPS_ENDPOINT = "AWS_USE_FIPS_ENDPOINT";
const CONFIG_USE_FIPS_ENDPOINT = "use_fips_endpoint";
const DEFAULT_USE_FIPS_ENDPOINT = false;
const NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => utilConfigProvider.booleanSelector(env, ENV_USE_FIPS_ENDPOINT, utilConfigProvider.SelectorType.ENV),
    configFileSelector: (profile) => utilConfigProvider.booleanSelector(profile, CONFIG_USE_FIPS_ENDPOINT, utilConfigProvider.SelectorType.CONFIG),
    default: false,
};
const nodeFipsConfigSelectors = {
    environmentVariableSelector: (env) => utilConfigProvider.booleanSelector(env, ENV_USE_FIPS_ENDPOINT, utilConfigProvider.SelectorType.ENV),
    configFileSelector: (profile) => utilConfigProvider.booleanSelector(profile, CONFIG_USE_FIPS_ENDPOINT, utilConfigProvider.SelectorType.CONFIG),
    default: undefined,
};

const resolveCustomEndpointsConfig = (input) => {
    const { tls, endpoint, urlParser, useDualstackEndpoint } = input;
    return Object.assign(input, {
        tls: tls ?? true,
        endpoint: utilMiddleware.normalizeProvider(typeof endpoint === "string" ? urlParser(endpoint) : endpoint),
        isCustomEndpoint: true,
        useDualstackEndpoint: utilMiddleware.normalizeProvider(useDualstackEndpoint ?? false),
    });
};

const getEndpointFromRegion = async (input) => {
    const { tls = true } = input;
    const region = await input.region();
    const dnsHostRegex = new RegExp(/^([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])$/);
    if (!dnsHostRegex.test(region)) {
        throw new Error("Invalid region in client config");
    }
    const useDualstackEndpoint = await input.useDualstackEndpoint();
    const useFipsEndpoint = await input.useFipsEndpoint();
    const { hostname } = (await input.regionInfoProvider(region, { useDualstackEndpoint, useFipsEndpoint })) ?? {};
    if (!hostname) {
        throw new Error("Cannot resolve hostname from client config");
    }
    return input.urlParser(`${tls ? "https:" : "http:"}//${hostname}`);
};

const resolveEndpointsConfig = (input) => {
    const useDualstackEndpoint = utilMiddleware.normalizeProvider(input.useDualstackEndpoint ?? false);
    const { endpoint, useFipsEndpoint, urlParser, tls } = input;
    return Object.assign(input, {
        tls: tls ?? true,
        endpoint: endpoint
            ? utilMiddleware.normalizeProvider(typeof endpoint === "string" ? urlParser(endpoint) : endpoint)
            : () => getEndpointFromRegion({ ...input, useDualstackEndpoint, useFipsEndpoint }),
        isCustomEndpoint: !!endpoint,
        useDualstackEndpoint,
    });
};

const REGION_ENV_NAME = "AWS_REGION";
const REGION_INI_NAME = "region";
const NODE_REGION_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => env[REGION_ENV_NAME],
    configFileSelector: (profile) => profile[REGION_INI_NAME],
    default: () => {
        throw new Error("Region is missing");
    },
};
const NODE_REGION_CONFIG_FILE_OPTIONS = {
    preferredFile: "credentials",
};

const validRegions = new Set();
const checkRegion = (region, check = utilEndpoints.isValidHostLabel) => {
    if (!validRegions.has(region) && !check(region)) {
        if (region === "*") {
            console.warn(`@smithy/config-resolver WARN - Please use the caller region instead of "*". See "sigv4a" in https://github.com/aws/aws-sdk-js-v3/blob/main/supplemental-docs/CLIENTS.md.`);
        }
        else {
            throw new Error(`Region not accepted: region="${region}" is not a valid hostname component.`);
        }
    }
    else {
        validRegions.add(region);
    }
};

const isFipsRegion = (region) => typeof region === "string" && (region.startsWith("fips-") || region.endsWith("-fips"));

const getRealRegion = (region) => isFipsRegion(region)
    ? ["fips-aws-global", "aws-fips"].includes(region)
        ? "us-east-1"
        : region.replace(/fips-(dkr-|prod-)?|-fips/, "")
    : region;

const resolveRegionConfig = (input) => {
    const { region, useFipsEndpoint } = input;
    if (!region) {
        throw new Error("Region is missing");
    }
    return Object.assign(input, {
        region: async () => {
            const providedRegion = typeof region === "function" ? await region() : region;
            const realRegion = getRealRegion(providedRegion);
            checkRegion(realRegion);
            return realRegion;
        },
        useFipsEndpoint: async () => {
            const providedRegion = typeof region === "string" ? region : await region();
            if (isFipsRegion(providedRegion)) {
                return true;
            }
            return typeof useFipsEndpoint !== "function" ? Promise.resolve(!!useFipsEndpoint) : useFipsEndpoint();
        },
    });
};

const getHostnameFromVariants = (variants = [], { useFipsEndpoint, useDualstackEndpoint }) => variants.find(({ tags }) => useFipsEndpoint === tags.includes("fips") && useDualstackEndpoint === tags.includes("dualstack"))?.hostname;

const getResolvedHostname = (resolvedRegion, { regionHostname, partitionHostname }) => regionHostname
    ? regionHostname
    : partitionHostname
        ? partitionHostname.replace("{region}", resolvedRegion)
        : undefined;

const getResolvedPartition = (region, { partitionHash }) => Object.keys(partitionHash || {}).find((key) => partitionHash[key].regions.includes(region)) ?? "aws";

const getResolvedSigningRegion = (hostname, { signingRegion, regionRegex, useFipsEndpoint }) => {
    if (signingRegion) {
        return signingRegion;
    }
    else if (useFipsEndpoint) {
        const regionRegexJs = regionRegex.replace("\\\\", "\\").replace(/^\^/g, "\\.").replace(/\$$/g, "\\.");
        const regionRegexmatchArray = hostname.match(regionRegexJs);
        if (regionRegexmatchArray) {
            return regionRegexmatchArray[0].slice(1, -1);
        }
    }
};

const getRegionInfo = (region, { useFipsEndpoint = false, useDualstackEndpoint = false, signingService, regionHash, partitionHash, }) => {
    const partition = getResolvedPartition(region, { partitionHash });
    const resolvedRegion = region in regionHash ? region : partitionHash[partition]?.endpoint ?? region;
    const hostnameOptions = { useFipsEndpoint, useDualstackEndpoint };
    const regionHostname = getHostnameFromVariants(regionHash[resolvedRegion]?.variants, hostnameOptions);
    const partitionHostname = getHostnameFromVariants(partitionHash[partition]?.variants, hostnameOptions);
    const hostname = getResolvedHostname(resolvedRegion, { regionHostname, partitionHostname });
    if (hostname === undefined) {
        throw new Error(`Endpoint resolution failed for: ${{ resolvedRegion, useFipsEndpoint, useDualstackEndpoint }}`);
    }
    const signingRegion = getResolvedSigningRegion(hostname, {
        signingRegion: regionHash[resolvedRegion]?.signingRegion,
        regionRegex: partitionHash[partition].regionRegex,
        useFipsEndpoint,
    });
    return {
        partition,
        signingService,
        hostname,
        ...(signingRegion && { signingRegion }),
        ...(regionHash[resolvedRegion]?.signingService && {
            signingService: regionHash[resolvedRegion].signingService,
        }),
    };
};

exports.CONFIG_USE_DUALSTACK_ENDPOINT = CONFIG_USE_DUALSTACK_ENDPOINT;
exports.CONFIG_USE_FIPS_ENDPOINT = CONFIG_USE_FIPS_ENDPOINT;
exports.DEFAULT_USE_DUALSTACK_ENDPOINT = DEFAULT_USE_DUALSTACK_ENDPOINT;
exports.DEFAULT_USE_FIPS_ENDPOINT = DEFAULT_USE_FIPS_ENDPOINT;
exports.ENV_USE_DUALSTACK_ENDPOINT = ENV_USE_DUALSTACK_ENDPOINT;
exports.ENV_USE_FIPS_ENDPOINT = ENV_USE_FIPS_ENDPOINT;
exports.NODE_REGION_CONFIG_FILE_OPTIONS = NODE_REGION_CONFIG_FILE_OPTIONS;
exports.NODE_REGION_CONFIG_OPTIONS = NODE_REGION_CONFIG_OPTIONS;
exports.NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS = NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS;
exports.NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS = NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS;
exports.REGION_ENV_NAME = REGION_ENV_NAME;
exports.REGION_INI_NAME = REGION_INI_NAME;
exports.getRegionInfo = getRegionInfo;
exports.nodeDualstackConfigSelectors = nodeDualstackConfigSelectors;
exports.nodeFipsConfigSelectors = nodeFipsConfigSelectors;
exports.resolveCustomEndpointsConfig = resolveCustomEndpointsConfig;
exports.resolveEndpointsConfig = resolveEndpointsConfig;
exports.resolveRegionConfig = resolveRegionConfig;


/***/ }),

/***/ 90402:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var types = __webpack_require__(90690);
var protocolHttp = __webpack_require__(72356);
var utilMiddleware = __webpack_require__(76324);
var protocols = __webpack_require__(93422);

const getSmithyContext = (context) => context[types.SMITHY_CONTEXT_KEY] || (context[types.SMITHY_CONTEXT_KEY] = {});

const resolveAuthOptions = (candidateAuthOptions, authSchemePreference) => {
    if (!authSchemePreference || authSchemePreference.length === 0) {
        return candidateAuthOptions;
    }
    const preferredAuthOptions = [];
    for (const preferredSchemeName of authSchemePreference) {
        for (const candidateAuthOption of candidateAuthOptions) {
            const candidateAuthSchemeName = candidateAuthOption.schemeId.split("#")[1];
            if (candidateAuthSchemeName === preferredSchemeName) {
                preferredAuthOptions.push(candidateAuthOption);
            }
        }
    }
    for (const candidateAuthOption of candidateAuthOptions) {
        if (!preferredAuthOptions.find(({ schemeId }) => schemeId === candidateAuthOption.schemeId)) {
            preferredAuthOptions.push(candidateAuthOption);
        }
    }
    return preferredAuthOptions;
};

function convertHttpAuthSchemesToMap(httpAuthSchemes) {
    const map = new Map();
    for (const scheme of httpAuthSchemes) {
        map.set(scheme.schemeId, scheme);
    }
    return map;
}
const httpAuthSchemeMiddleware = (config, mwOptions) => (next, context) => async (args) => {
    const options = config.httpAuthSchemeProvider(await mwOptions.httpAuthSchemeParametersProvider(config, context, args.input));
    const authSchemePreference = config.authSchemePreference ? await config.authSchemePreference() : [];
    const resolvedOptions = resolveAuthOptions(options, authSchemePreference);
    const authSchemes = convertHttpAuthSchemesToMap(config.httpAuthSchemes);
    const smithyContext = utilMiddleware.getSmithyContext(context);
    const failureReasons = [];
    for (const option of resolvedOptions) {
        const scheme = authSchemes.get(option.schemeId);
        if (!scheme) {
            failureReasons.push(`HttpAuthScheme \`${option.schemeId}\` was not enabled for this service.`);
            continue;
        }
        const identityProvider = scheme.identityProvider(await mwOptions.identityProviderConfigProvider(config));
        if (!identityProvider) {
            failureReasons.push(`HttpAuthScheme \`${option.schemeId}\` did not have an IdentityProvider configured.`);
            continue;
        }
        const { identityProperties = {}, signingProperties = {} } = option.propertiesExtractor?.(config, context) || {};
        option.identityProperties = Object.assign(option.identityProperties || {}, identityProperties);
        option.signingProperties = Object.assign(option.signingProperties || {}, signingProperties);
        smithyContext.selectedHttpAuthScheme = {
            httpAuthOption: option,
            identity: await identityProvider(option.identityProperties),
            signer: scheme.signer,
        };
        break;
    }
    if (!smithyContext.selectedHttpAuthScheme) {
        throw new Error(failureReasons.join("\n"));
    }
    return next(args);
};

const httpAuthSchemeEndpointRuleSetMiddlewareOptions = {
    step: "serialize",
    tags: ["HTTP_AUTH_SCHEME"],
    name: "httpAuthSchemeMiddleware",
    override: true,
    relation: "before",
    toMiddleware: "endpointV2Middleware",
};
const getHttpAuthSchemeEndpointRuleSetPlugin = (config, { httpAuthSchemeParametersProvider, identityProviderConfigProvider, }) => ({
    applyToStack: (clientStack) => {
        clientStack.addRelativeTo(httpAuthSchemeMiddleware(config, {
            httpAuthSchemeParametersProvider,
            identityProviderConfigProvider,
        }), httpAuthSchemeEndpointRuleSetMiddlewareOptions);
    },
});

const httpAuthSchemeMiddlewareOptions = {
    step: "serialize",
    tags: ["HTTP_AUTH_SCHEME"],
    name: "httpAuthSchemeMiddleware",
    override: true,
    relation: "before",
    toMiddleware: "serializerMiddleware",
};
const getHttpAuthSchemePlugin = (config, { httpAuthSchemeParametersProvider, identityProviderConfigProvider, }) => ({
    applyToStack: (clientStack) => {
        clientStack.addRelativeTo(httpAuthSchemeMiddleware(config, {
            httpAuthSchemeParametersProvider,
            identityProviderConfigProvider,
        }), httpAuthSchemeMiddlewareOptions);
    },
});

const defaultErrorHandler = (signingProperties) => (error) => {
    throw error;
};
const defaultSuccessHandler = (httpResponse, signingProperties) => { };
const httpSigningMiddleware = (config) => (next, context) => async (args) => {
    if (!protocolHttp.HttpRequest.isInstance(args.request)) {
        return next(args);
    }
    const smithyContext = utilMiddleware.getSmithyContext(context);
    const scheme = smithyContext.selectedHttpAuthScheme;
    if (!scheme) {
        throw new Error(`No HttpAuthScheme was selected: unable to sign request`);
    }
    const { httpAuthOption: { signingProperties = {} }, identity, signer, } = scheme;
    const output = await next({
        ...args,
        request: await signer.sign(args.request, identity, signingProperties),
    }).catch((signer.errorHandler || defaultErrorHandler)(signingProperties));
    (signer.successHandler || defaultSuccessHandler)(output.response, signingProperties);
    return output;
};

const httpSigningMiddlewareOptions = {
    step: "finalizeRequest",
    tags: ["HTTP_SIGNING"],
    name: "httpSigningMiddleware",
    aliases: ["apiKeyMiddleware", "tokenMiddleware", "awsAuthMiddleware"],
    override: true,
    relation: "after",
    toMiddleware: "retryMiddleware",
};
const getHttpSigningPlugin = (config) => ({
    applyToStack: (clientStack) => {
        clientStack.addRelativeTo(httpSigningMiddleware(), httpSigningMiddlewareOptions);
    },
});

const normalizeProvider = (input) => {
    if (typeof input === "function")
        return input;
    const promisified = Promise.resolve(input);
    return () => promisified;
};

const makePagedClientRequest = async (CommandCtor, client, input, withCommand = (_) => _, ...args) => {
    let command = new CommandCtor(input);
    command = withCommand(command) ?? command;
    return await client.send(command, ...args);
};
function createPaginator(ClientCtor, CommandCtor, inputTokenName, outputTokenName, pageSizeTokenName) {
    return async function* paginateOperation(config, input, ...additionalArguments) {
        const _input = input;
        let token = config.startingToken ?? _input[inputTokenName];
        let hasNext = true;
        let page;
        while (hasNext) {
            _input[inputTokenName] = token;
            if (pageSizeTokenName) {
                _input[pageSizeTokenName] = _input[pageSizeTokenName] ?? config.pageSize;
            }
            if (config.client instanceof ClientCtor) {
                page = await makePagedClientRequest(CommandCtor, config.client, input, config.withCommand, ...additionalArguments);
            }
            else {
                throw new Error(`Invalid client, expected instance of ${ClientCtor.name}`);
            }
            yield page;
            const prevToken = token;
            token = get(page, outputTokenName);
            hasNext = !!(token && (!config.stopOnSameToken || token !== prevToken));
        }
        return undefined;
    };
}
const get = (fromObject, path) => {
    let cursor = fromObject;
    const pathComponents = path.split(".");
    for (const step of pathComponents) {
        if (!cursor || typeof cursor !== "object") {
            return undefined;
        }
        cursor = cursor[step];
    }
    return cursor;
};

function setFeature(context, feature, value) {
    if (!context.__smithy_context) {
        context.__smithy_context = {
            features: {},
        };
    }
    else if (!context.__smithy_context.features) {
        context.__smithy_context.features = {};
    }
    context.__smithy_context.features[feature] = value;
}

class DefaultIdentityProviderConfig {
    authSchemes = new Map();
    constructor(config) {
        for (const [key, value] of Object.entries(config)) {
            if (value !== undefined) {
                this.authSchemes.set(key, value);
            }
        }
    }
    getIdentityProvider(schemeId) {
        return this.authSchemes.get(schemeId);
    }
}

class HttpApiKeyAuthSigner {
    async sign(httpRequest, identity, signingProperties) {
        if (!signingProperties) {
            throw new Error("request could not be signed with `apiKey` since the `name` and `in` signer properties are missing");
        }
        if (!signingProperties.name) {
            throw new Error("request could not be signed with `apiKey` since the `name` signer property is missing");
        }
        if (!signingProperties.in) {
            throw new Error("request could not be signed with `apiKey` since the `in` signer property is missing");
        }
        if (!identity.apiKey) {
            throw new Error("request could not be signed with `apiKey` since the `apiKey` is not defined");
        }
        const clonedRequest = protocolHttp.HttpRequest.clone(httpRequest);
        if (signingProperties.in === types.HttpApiKeyAuthLocation.QUERY) {
            clonedRequest.query[signingProperties.name] = identity.apiKey;
        }
        else if (signingProperties.in === types.HttpApiKeyAuthLocation.HEADER) {
            clonedRequest.headers[signingProperties.name] = signingProperties.scheme
                ? `${signingProperties.scheme} ${identity.apiKey}`
                : identity.apiKey;
        }
        else {
            throw new Error("request can only be signed with `apiKey` locations `query` or `header`, " +
                "but found: `" +
                signingProperties.in +
                "`");
        }
        return clonedRequest;
    }
}

class HttpBearerAuthSigner {
    async sign(httpRequest, identity, signingProperties) {
        const clonedRequest = protocolHttp.HttpRequest.clone(httpRequest);
        if (!identity.token) {
            throw new Error("request could not be signed with `token` since the `token` is not defined");
        }
        clonedRequest.headers["Authorization"] = `Bearer ${identity.token}`;
        return clonedRequest;
    }
}

class NoAuthSigner {
    async sign(httpRequest, identity, signingProperties) {
        return httpRequest;
    }
}

const createIsIdentityExpiredFunction = (expirationMs) => function isIdentityExpired(identity) {
    return doesIdentityRequireRefresh(identity) && identity.expiration.getTime() - Date.now() < expirationMs;
};
const EXPIRATION_MS = 300_000;
const isIdentityExpired = createIsIdentityExpiredFunction(EXPIRATION_MS);
const doesIdentityRequireRefresh = (identity) => identity.expiration !== undefined;
const memoizeIdentityProvider = (provider, isExpired, requiresRefresh) => {
    if (provider === undefined) {
        return undefined;
    }
    const normalizedProvider = typeof provider !== "function" ? async () => Promise.resolve(provider) : provider;
    let resolved;
    let pending;
    let hasResult;
    let isConstant = false;
    const coalesceProvider = async (options) => {
        if (!pending) {
            pending = normalizedProvider(options);
        }
        try {
            resolved = await pending;
            hasResult = true;
            isConstant = false;
        }
        finally {
            pending = undefined;
        }
        return resolved;
    };
    if (isExpired === undefined) {
        return async (options) => {
            if (!hasResult || options?.forceRefresh) {
                resolved = await coalesceProvider(options);
            }
            return resolved;
        };
    }
    return async (options) => {
        if (!hasResult || options?.forceRefresh) {
            resolved = await coalesceProvider(options);
        }
        if (isConstant) {
            return resolved;
        }
        if (!requiresRefresh(resolved)) {
            isConstant = true;
            return resolved;
        }
        if (isExpired(resolved)) {
            await coalesceProvider(options);
            return resolved;
        }
        return resolved;
    };
};

exports.requestBuilder = protocols.requestBuilder;
exports.DefaultIdentityProviderConfig = DefaultIdentityProviderConfig;
exports.EXPIRATION_MS = EXPIRATION_MS;
exports.HttpApiKeyAuthSigner = HttpApiKeyAuthSigner;
exports.HttpBearerAuthSigner = HttpBearerAuthSigner;
exports.NoAuthSigner = NoAuthSigner;
exports.createIsIdentityExpiredFunction = createIsIdentityExpiredFunction;
exports.createPaginator = createPaginator;
exports.doesIdentityRequireRefresh = doesIdentityRequireRefresh;
exports.getHttpAuthSchemeEndpointRuleSetPlugin = getHttpAuthSchemeEndpointRuleSetPlugin;
exports.getHttpAuthSchemePlugin = getHttpAuthSchemePlugin;
exports.getHttpSigningPlugin = getHttpSigningPlugin;
exports.getSmithyContext = getSmithyContext;
exports.httpAuthSchemeEndpointRuleSetMiddlewareOptions = httpAuthSchemeEndpointRuleSetMiddlewareOptions;
exports.httpAuthSchemeMiddleware = httpAuthSchemeMiddleware;
exports.httpAuthSchemeMiddlewareOptions = httpAuthSchemeMiddlewareOptions;
exports.httpSigningMiddleware = httpSigningMiddleware;
exports.httpSigningMiddlewareOptions = httpSigningMiddlewareOptions;
exports.isIdentityExpired = isIdentityExpired;
exports.memoizeIdentityProvider = memoizeIdentityProvider;
exports.normalizeProvider = normalizeProvider;
exports.setFeature = setFeature;


/***/ }),

/***/ 64645:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var serde = __webpack_require__(92430);
var utilUtf8 = __webpack_require__(71577);
var protocols = __webpack_require__(93422);
var protocolHttp = __webpack_require__(72356);
var utilBodyLengthBrowser = __webpack_require__(12098);
var schema = __webpack_require__(26890);
var utilMiddleware = __webpack_require__(76324);
var utilBase64 = __webpack_require__(68385);

const majorUint64 = 0;
const majorNegativeInt64 = 1;
const majorUnstructuredByteString = 2;
const majorUtf8String = 3;
const majorList = 4;
const majorMap = 5;
const majorTag = 6;
const majorSpecial = 7;
const specialFalse = 20;
const specialTrue = 21;
const specialNull = 22;
const specialUndefined = 23;
const extendedOneByte = 24;
const extendedFloat16 = 25;
const extendedFloat32 = 26;
const extendedFloat64 = 27;
const minorIndefinite = 31;
function alloc(size) {
    return typeof Buffer !== "undefined" ? Buffer.alloc(size) : new Uint8Array(size);
}
const tagSymbol = Symbol("@smithy/core/cbor::tagSymbol");
function tag(data) {
    data[tagSymbol] = true;
    return data;
}

const USE_TEXT_DECODER = typeof TextDecoder !== "undefined";
const USE_BUFFER$1 = typeof Buffer !== "undefined";
let payload = alloc(0);
let dataView$1 = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
const textDecoder = USE_TEXT_DECODER ? new TextDecoder() : null;
let _offset = 0;
function setPayload(bytes) {
    payload = bytes;
    dataView$1 = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
}
function decode(at, to) {
    if (at >= to) {
        throw new Error("unexpected end of (decode) payload.");
    }
    const major = (payload[at] & 0b1110_0000) >> 5;
    const minor = payload[at] & 0b0001_1111;
    switch (major) {
        case majorUint64:
        case majorNegativeInt64:
        case majorTag:
            let unsignedInt;
            let offset;
            if (minor < 24) {
                unsignedInt = minor;
                offset = 1;
            }
            else {
                switch (minor) {
                    case extendedOneByte:
                    case extendedFloat16:
                    case extendedFloat32:
                    case extendedFloat64:
                        const countLength = minorValueToArgumentLength[minor];
                        const countOffset = (countLength + 1);
                        offset = countOffset;
                        if (to - at < countOffset) {
                            throw new Error(`countLength ${countLength} greater than remaining buf len.`);
                        }
                        const countIndex = at + 1;
                        if (countLength === 1) {
                            unsignedInt = payload[countIndex];
                        }
                        else if (countLength === 2) {
                            unsignedInt = dataView$1.getUint16(countIndex);
                        }
                        else if (countLength === 4) {
                            unsignedInt = dataView$1.getUint32(countIndex);
                        }
                        else {
                            unsignedInt = dataView$1.getBigUint64(countIndex);
                        }
                        break;
                    default:
                        throw new Error(`unexpected minor value ${minor}.`);
                }
            }
            if (major === majorUint64) {
                _offset = offset;
                return castBigInt(unsignedInt);
            }
            else if (major === majorNegativeInt64) {
                let negativeInt;
                if (typeof unsignedInt === "bigint") {
                    negativeInt = BigInt(-1) - unsignedInt;
                }
                else {
                    negativeInt = -1 - unsignedInt;
                }
                _offset = offset;
                return castBigInt(negativeInt);
            }
            else {
                if (minor === 2 || minor === 3) {
                    const length = decodeCount(at + offset, to);
                    let b = BigInt(0);
                    const start = at + offset + _offset;
                    for (let i = start; i < start + length; ++i) {
                        b = (b << BigInt(8)) | BigInt(payload[i]);
                    }
                    _offset = offset + _offset + length;
                    return minor === 3 ? -b - BigInt(1) : b;
                }
                else if (minor === 4) {
                    const decimalFraction = decode(at + offset, to);
                    const [exponent, mantissa] = decimalFraction;
                    const normalizer = mantissa < 0 ? -1 : 1;
                    const mantissaStr = "0".repeat(Math.abs(exponent) + 1) + String(BigInt(normalizer) * BigInt(mantissa));
                    let numericString;
                    const sign = mantissa < 0 ? "-" : "";
                    numericString =
                        exponent === 0
                            ? mantissaStr
                            : mantissaStr.slice(0, mantissaStr.length + exponent) + "." + mantissaStr.slice(exponent);
                    numericString = numericString.replace(/^0+/g, "");
                    if (numericString === "") {
                        numericString = "0";
                    }
                    if (numericString[0] === ".") {
                        numericString = "0" + numericString;
                    }
                    numericString = sign + numericString;
                    _offset = offset + _offset;
                    return serde.nv(numericString);
                }
                else {
                    const value = decode(at + offset, to);
                    const valueOffset = _offset;
                    _offset = offset + valueOffset;
                    return tag({ tag: castBigInt(unsignedInt), value });
                }
            }
        case majorUtf8String:
        case majorMap:
        case majorList:
        case majorUnstructuredByteString:
            if (minor === minorIndefinite) {
                switch (major) {
                    case majorUtf8String:
                        return decodeUtf8StringIndefinite(at, to);
                    case majorMap:
                        return decodeMapIndefinite(at, to);
                    case majorList:
                        return decodeListIndefinite(at, to);
                    case majorUnstructuredByteString:
                        return decodeUnstructuredByteStringIndefinite(at, to);
                }
            }
            else {
                switch (major) {
                    case majorUtf8String:
                        return decodeUtf8String(at, to);
                    case majorMap:
                        return decodeMap(at, to);
                    case majorList:
                        return decodeList(at, to);
                    case majorUnstructuredByteString:
                        return decodeUnstructuredByteString(at, to);
                }
            }
        default:
            return decodeSpecial(at, to);
    }
}
function bytesToUtf8(bytes, at, to) {
    if (USE_BUFFER$1 && bytes.constructor?.name === "Buffer") {
        return bytes.toString("utf-8", at, to);
    }
    if (textDecoder) {
        return textDecoder.decode(bytes.subarray(at, to));
    }
    return utilUtf8.toUtf8(bytes.subarray(at, to));
}
function demote(bigInteger) {
    const num = Number(bigInteger);
    if (num < Number.MIN_SAFE_INTEGER || Number.MAX_SAFE_INTEGER < num) {
        console.warn(new Error(`@smithy/core/cbor - truncating BigInt(${bigInteger}) to ${num} with loss of precision.`));
    }
    return num;
}
const minorValueToArgumentLength = {
    [extendedOneByte]: 1,
    [extendedFloat16]: 2,
    [extendedFloat32]: 4,
    [extendedFloat64]: 8,
};
function bytesToFloat16(a, b) {
    const sign = a >> 7;
    const exponent = (a & 0b0111_1100) >> 2;
    const fraction = ((a & 0b0000_0011) << 8) | b;
    const scalar = sign === 0 ? 1 : -1;
    let exponentComponent;
    let summation;
    if (exponent === 0b00000) {
        if (fraction === 0b00000_00000) {
            return 0;
        }
        else {
            exponentComponent = Math.pow(2, 1 - 15);
            summation = 0;
        }
    }
    else if (exponent === 0b11111) {
        if (fraction === 0b00000_00000) {
            return scalar * Infinity;
        }
        else {
            return NaN;
        }
    }
    else {
        exponentComponent = Math.pow(2, exponent - 15);
        summation = 1;
    }
    summation += fraction / 1024;
    return scalar * (exponentComponent * summation);
}
function decodeCount(at, to) {
    const minor = payload[at] & 0b0001_1111;
    if (minor < 24) {
        _offset = 1;
        return minor;
    }
    if (minor === extendedOneByte ||
        minor === extendedFloat16 ||
        minor === extendedFloat32 ||
        minor === extendedFloat64) {
        const countLength = minorValueToArgumentLength[minor];
        _offset = (countLength + 1);
        if (to - at < _offset) {
            throw new Error(`countLength ${countLength} greater than remaining buf len.`);
        }
        const countIndex = at + 1;
        if (countLength === 1) {
            return payload[countIndex];
        }
        else if (countLength === 2) {
            return dataView$1.getUint16(countIndex);
        }
        else if (countLength === 4) {
            return dataView$1.getUint32(countIndex);
        }
        return demote(dataView$1.getBigUint64(countIndex));
    }
    throw new Error(`unexpected minor value ${minor}.`);
}
function decodeUtf8String(at, to) {
    const length = decodeCount(at, to);
    const offset = _offset;
    at += offset;
    if (to - at < length) {
        throw new Error(`string len ${length} greater than remaining buf len.`);
    }
    const value = bytesToUtf8(payload, at, at + length);
    _offset = offset + length;
    return value;
}
function decodeUtf8StringIndefinite(at, to) {
    at += 1;
    const vector = [];
    for (const base = at; at < to;) {
        if (payload[at] === 0b1111_1111) {
            const data = alloc(vector.length);
            data.set(vector, 0);
            _offset = at - base + 2;
            return bytesToUtf8(data, 0, data.length);
        }
        const major = (payload[at] & 0b1110_0000) >> 5;
        const minor = payload[at] & 0b0001_1111;
        if (major !== majorUtf8String) {
            throw new Error(`unexpected major type ${major} in indefinite string.`);
        }
        if (minor === minorIndefinite) {
            throw new Error("nested indefinite string.");
        }
        const bytes = decodeUnstructuredByteString(at, to);
        const length = _offset;
        at += length;
        for (let i = 0; i < bytes.length; ++i) {
            vector.push(bytes[i]);
        }
    }
    throw new Error("expected break marker.");
}
function decodeUnstructuredByteString(at, to) {
    const length = decodeCount(at, to);
    const offset = _offset;
    at += offset;
    if (to - at < length) {
        throw new Error(`unstructured byte string len ${length} greater than remaining buf len.`);
    }
    const value = payload.subarray(at, at + length);
    _offset = offset + length;
    return value;
}
function decodeUnstructuredByteStringIndefinite(at, to) {
    at += 1;
    const vector = [];
    for (const base = at; at < to;) {
        if (payload[at] === 0b1111_1111) {
            const data = alloc(vector.length);
            data.set(vector, 0);
            _offset = at - base + 2;
            return data;
        }
        const major = (payload[at] & 0b1110_0000) >> 5;
        const minor = payload[at] & 0b0001_1111;
        if (major !== majorUnstructuredByteString) {
            throw new Error(`unexpected major type ${major} in indefinite string.`);
        }
        if (minor === minorIndefinite) {
            throw new Error("nested indefinite string.");
        }
        const bytes = decodeUnstructuredByteString(at, to);
        const length = _offset;
        at += length;
        for (let i = 0; i < bytes.length; ++i) {
            vector.push(bytes[i]);
        }
    }
    throw new Error("expected break marker.");
}
function decodeList(at, to) {
    const listDataLength = decodeCount(at, to);
    const offset = _offset;
    at += offset;
    const base = at;
    const list = Array(listDataLength);
    for (let i = 0; i < listDataLength; ++i) {
        const item = decode(at, to);
        const itemOffset = _offset;
        list[i] = item;
        at += itemOffset;
    }
    _offset = offset + (at - base);
    return list;
}
function decodeListIndefinite(at, to) {
    at += 1;
    const list = [];
    for (const base = at; at < to;) {
        if (payload[at] === 0b1111_1111) {
            _offset = at - base + 2;
            return list;
        }
        const item = decode(at, to);
        const n = _offset;
        at += n;
        list.push(item);
    }
    throw new Error("expected break marker.");
}
function decodeMap(at, to) {
    const mapDataLength = decodeCount(at, to);
    const offset = _offset;
    at += offset;
    const base = at;
    const map = {};
    for (let i = 0; i < mapDataLength; ++i) {
        if (at >= to) {
            throw new Error("unexpected end of map payload.");
        }
        const major = (payload[at] & 0b1110_0000) >> 5;
        if (major !== majorUtf8String) {
            throw new Error(`unexpected major type ${major} for map key at index ${at}.`);
        }
        const key = decode(at, to);
        at += _offset;
        const value = decode(at, to);
        at += _offset;
        map[key] = value;
    }
    _offset = offset + (at - base);
    return map;
}
function decodeMapIndefinite(at, to) {
    at += 1;
    const base = at;
    const map = {};
    for (; at < to;) {
        if (at >= to) {
            throw new Error("unexpected end of map payload.");
        }
        if (payload[at] === 0b1111_1111) {
            _offset = at - base + 2;
            return map;
        }
        const major = (payload[at] & 0b1110_0000) >> 5;
        if (major !== majorUtf8String) {
            throw new Error(`unexpected major type ${major} for map key.`);
        }
        const key = decode(at, to);
        at += _offset;
        const value = decode(at, to);
        at += _offset;
        map[key] = value;
    }
    throw new Error("expected break marker.");
}
function decodeSpecial(at, to) {
    const minor = payload[at] & 0b0001_1111;
    switch (minor) {
        case specialTrue:
        case specialFalse:
            _offset = 1;
            return minor === specialTrue;
        case specialNull:
            _offset = 1;
            return null;
        case specialUndefined:
            _offset = 1;
            return null;
        case extendedFloat16:
            if (to - at < 3) {
                throw new Error("incomplete float16 at end of buf.");
            }
            _offset = 3;
            return bytesToFloat16(payload[at + 1], payload[at + 2]);
        case extendedFloat32:
            if (to - at < 5) {
                throw new Error("incomplete float32 at end of buf.");
            }
            _offset = 5;
            return dataView$1.getFloat32(at + 1);
        case extendedFloat64:
            if (to - at < 9) {
                throw new Error("incomplete float64 at end of buf.");
            }
            _offset = 9;
            return dataView$1.getFloat64(at + 1);
        default:
            throw new Error(`unexpected minor value ${minor}.`);
    }
}
function castBigInt(bigInt) {
    if (typeof bigInt === "number") {
        return bigInt;
    }
    const num = Number(bigInt);
    if (Number.MIN_SAFE_INTEGER <= num && num <= Number.MAX_SAFE_INTEGER) {
        return num;
    }
    return bigInt;
}

const USE_BUFFER = typeof Buffer !== "undefined";
const initialSize = 2048;
let data = alloc(initialSize);
let dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
let cursor = 0;
function ensureSpace(bytes) {
    const remaining = data.byteLength - cursor;
    if (remaining < bytes) {
        if (cursor < 16_000_000) {
            resize(Math.max(data.byteLength * 4, data.byteLength + bytes));
        }
        else {
            resize(data.byteLength + bytes + 16_000_000);
        }
    }
}
function toUint8Array() {
    const out = alloc(cursor);
    out.set(data.subarray(0, cursor), 0);
    cursor = 0;
    return out;
}
function resize(size) {
    const old = data;
    data = alloc(size);
    if (old) {
        if (old.copy) {
            old.copy(data, 0, 0, old.byteLength);
        }
        else {
            data.set(old, 0);
        }
    }
    dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
}
function encodeHeader(major, value) {
    if (value < 24) {
        data[cursor++] = (major << 5) | value;
    }
    else if (value < 1 << 8) {
        data[cursor++] = (major << 5) | 24;
        data[cursor++] = value;
    }
    else if (value < 1 << 16) {
        data[cursor++] = (major << 5) | extendedFloat16;
        dataView.setUint16(cursor, value);
        cursor += 2;
    }
    else if (value < 2 ** 32) {
        data[cursor++] = (major << 5) | extendedFloat32;
        dataView.setUint32(cursor, value);
        cursor += 4;
    }
    else {
        data[cursor++] = (major << 5) | extendedFloat64;
        dataView.setBigUint64(cursor, typeof value === "bigint" ? value : BigInt(value));
        cursor += 8;
    }
}
function encode(_input) {
    const encodeStack = [_input];
    while (encodeStack.length) {
        const input = encodeStack.pop();
        ensureSpace(typeof input === "string" ? input.length * 4 : 64);
        if (typeof input === "string") {
            if (USE_BUFFER) {
                encodeHeader(majorUtf8String, Buffer.byteLength(input));
                cursor += data.write(input, cursor);
            }
            else {
                const bytes = utilUtf8.fromUtf8(input);
                encodeHeader(majorUtf8String, bytes.byteLength);
                data.set(bytes, cursor);
                cursor += bytes.byteLength;
            }
            continue;
        }
        else if (typeof input === "number") {
            if (Number.isInteger(input)) {
                const nonNegative = input >= 0;
                const major = nonNegative ? majorUint64 : majorNegativeInt64;
                const value = nonNegative ? input : -input - 1;
                if (value < 24) {
                    data[cursor++] = (major << 5) | value;
                }
                else if (value < 256) {
                    data[cursor++] = (major << 5) | 24;
                    data[cursor++] = value;
                }
                else if (value < 65536) {
                    data[cursor++] = (major << 5) | extendedFloat16;
                    data[cursor++] = value >> 8;
                    data[cursor++] = value;
                }
                else if (value < 4294967296) {
                    data[cursor++] = (major << 5) | extendedFloat32;
                    dataView.setUint32(cursor, value);
                    cursor += 4;
                }
                else {
                    data[cursor++] = (major << 5) | extendedFloat64;
                    dataView.setBigUint64(cursor, BigInt(value));
                    cursor += 8;
                }
                continue;
            }
            data[cursor++] = (majorSpecial << 5) | extendedFloat64;
            dataView.setFloat64(cursor, input);
            cursor += 8;
            continue;
        }
        else if (typeof input === "bigint") {
            const nonNegative = input >= 0;
            const major = nonNegative ? majorUint64 : majorNegativeInt64;
            const value = nonNegative ? input : -input - BigInt(1);
            const n = Number(value);
            if (n < 24) {
                data[cursor++] = (major << 5) | n;
            }
            else if (n < 256) {
                data[cursor++] = (major << 5) | 24;
                data[cursor++] = n;
            }
            else if (n < 65536) {
                data[cursor++] = (major << 5) | extendedFloat16;
                data[cursor++] = n >> 8;
                data[cursor++] = n & 0b1111_1111;
            }
            else if (n < 4294967296) {
                data[cursor++] = (major << 5) | extendedFloat32;
                dataView.setUint32(cursor, n);
                cursor += 4;
            }
            else if (value < BigInt("18446744073709551616")) {
                data[cursor++] = (major << 5) | extendedFloat64;
                dataView.setBigUint64(cursor, value);
                cursor += 8;
            }
            else {
                const binaryBigInt = value.toString(2);
                const bigIntBytes = new Uint8Array(Math.ceil(binaryBigInt.length / 8));
                let b = value;
                let i = 0;
                while (bigIntBytes.byteLength - ++i >= 0) {
                    bigIntBytes[bigIntBytes.byteLength - i] = Number(b & BigInt(255));
                    b >>= BigInt(8);
                }
                ensureSpace(bigIntBytes.byteLength * 2);
                data[cursor++] = nonNegative ? 0b110_00010 : 0b110_00011;
                if (USE_BUFFER) {
                    encodeHeader(majorUnstructuredByteString, Buffer.byteLength(bigIntBytes));
                }
                else {
                    encodeHeader(majorUnstructuredByteString, bigIntBytes.byteLength);
                }
                data.set(bigIntBytes, cursor);
                cursor += bigIntBytes.byteLength;
            }
            continue;
        }
        else if (input === null) {
            data[cursor++] = (majorSpecial << 5) | specialNull;
            continue;
        }
        else if (typeof input === "boolean") {
            data[cursor++] = (majorSpecial << 5) | (input ? specialTrue : specialFalse);
            continue;
        }
        else if (typeof input === "undefined") {
            throw new Error("@smithy/core/cbor: client may not serialize undefined value.");
        }
        else if (Array.isArray(input)) {
            for (let i = input.length - 1; i >= 0; --i) {
                encodeStack.push(input[i]);
            }
            encodeHeader(majorList, input.length);
            continue;
        }
        else if (typeof input.byteLength === "number") {
            ensureSpace(input.length * 2);
            encodeHeader(majorUnstructuredByteString, input.length);
            data.set(input, cursor);
            cursor += input.byteLength;
            continue;
        }
        else if (typeof input === "object") {
            if (input instanceof serde.NumericValue) {
                const decimalIndex = input.string.indexOf(".");
                const exponent = decimalIndex === -1 ? 0 : decimalIndex - input.string.length + 1;
                const mantissa = BigInt(input.string.replace(".", ""));
                data[cursor++] = 0b110_00100;
                encodeStack.push(mantissa);
                encodeStack.push(exponent);
                encodeHeader(majorList, 2);
                continue;
            }
            if (input[tagSymbol]) {
                if ("tag" in input && "value" in input) {
                    encodeStack.push(input.value);
                    encodeHeader(majorTag, input.tag);
                    continue;
                }
                else {
                    throw new Error("tag encountered with missing fields, need 'tag' and 'value', found: " + JSON.stringify(input));
                }
            }
            const keys = Object.keys(input);
            for (let i = keys.length - 1; i >= 0; --i) {
                const key = keys[i];
                encodeStack.push(input[key]);
                encodeStack.push(key);
            }
            encodeHeader(majorMap, keys.length);
            continue;
        }
        throw new Error(`data type ${input?.constructor?.name ?? typeof input} not compatible for encoding.`);
    }
}

const cbor = {
    deserialize(payload) {
        setPayload(payload);
        return decode(0, payload.length);
    },
    serialize(input) {
        try {
            encode(input);
            return toUint8Array();
        }
        catch (e) {
            toUint8Array();
            throw e;
        }
    },
    resizeEncodingBuffer(size) {
        resize(size);
    },
};

const parseCborBody = (streamBody, context) => {
    return protocols.collectBody(streamBody, context).then(async (bytes) => {
        if (bytes.length) {
            try {
                return cbor.deserialize(bytes);
            }
            catch (e) {
                Object.defineProperty(e, "$responseBodyText", {
                    value: context.utf8Encoder(bytes),
                });
                throw e;
            }
        }
        return {};
    });
};
const dateToTag = (date) => {
    return tag({
        tag: 1,
        value: date.getTime() / 1000,
    });
};
const parseCborErrorBody = async (errorBody, context) => {
    const value = await parseCborBody(errorBody, context);
    value.message = value.message ?? value.Message;
    return value;
};
const loadSmithyRpcV2CborErrorCode = (output, data) => {
    const sanitizeErrorCode = (rawValue) => {
        let cleanValue = rawValue;
        if (typeof cleanValue === "number") {
            cleanValue = cleanValue.toString();
        }
        if (cleanValue.indexOf(",") >= 0) {
            cleanValue = cleanValue.split(",")[0];
        }
        if (cleanValue.indexOf(":") >= 0) {
            cleanValue = cleanValue.split(":")[0];
        }
        if (cleanValue.indexOf("#") >= 0) {
            cleanValue = cleanValue.split("#")[1];
        }
        return cleanValue;
    };
    if (data["__type"] !== undefined) {
        return sanitizeErrorCode(data["__type"]);
    }
    const codeKey = Object.keys(data).find((key) => key.toLowerCase() === "code");
    if (codeKey && data[codeKey] !== undefined) {
        return sanitizeErrorCode(data[codeKey]);
    }
};
const checkCborResponse = (response) => {
    if (String(response.headers["smithy-protocol"]).toLowerCase() !== "rpc-v2-cbor") {
        throw new Error("Malformed RPCv2 CBOR response, status: " + response.statusCode);
    }
};
const buildHttpRpcRequest = async (context, headers, path, resolvedHostname, body) => {
    const endpoint = await context.endpoint();
    const { hostname, protocol = "https", port, path: basePath } = endpoint;
    const contents = {
        protocol,
        hostname,
        port,
        method: "POST",
        path: basePath.endsWith("/") ? basePath.slice(0, -1) + path : basePath + path,
        headers: {
            ...headers,
        },
    };
    if (resolvedHostname !== undefined) {
        contents.hostname = resolvedHostname;
    }
    if (endpoint.headers) {
        for (const [name, value] of Object.entries(endpoint.headers)) {
            contents.headers[name] = value;
        }
    }
    if (body !== undefined) {
        contents.body = body;
        try {
            contents.headers["content-length"] = String(utilBodyLengthBrowser.calculateBodyLength(body));
        }
        catch (e) { }
    }
    return new protocolHttp.HttpRequest(contents);
};

class CborCodec extends protocols.SerdeContext {
    createSerializer() {
        const serializer = new CborShapeSerializer();
        serializer.setSerdeContext(this.serdeContext);
        return serializer;
    }
    createDeserializer() {
        const deserializer = new CborShapeDeserializer();
        deserializer.setSerdeContext(this.serdeContext);
        return deserializer;
    }
}
class CborShapeSerializer extends protocols.SerdeContext {
    value;
    write(schema, value) {
        this.value = this.serialize(schema, value);
    }
    serialize(schema$1, source) {
        const ns = schema.NormalizedSchema.of(schema$1);
        if (source == null) {
            if (ns.isIdempotencyToken()) {
                return serde.generateIdempotencyToken();
            }
            return source;
        }
        if (ns.isBlobSchema()) {
            if (typeof source === "string") {
                return (this.serdeContext?.base64Decoder ?? utilBase64.fromBase64)(source);
            }
            return source;
        }
        if (ns.isTimestampSchema()) {
            if (typeof source === "number" || typeof source === "bigint") {
                return dateToTag(new Date((Number(source) / 1000) | 0));
            }
            return dateToTag(source);
        }
        if (typeof source === "function" || typeof source === "object") {
            const sourceObject = source;
            if (ns.isListSchema() && Array.isArray(sourceObject)) {
                const sparse = !!ns.getMergedTraits().sparse;
                const newArray = [];
                let i = 0;
                for (const item of sourceObject) {
                    const value = this.serialize(ns.getValueSchema(), item);
                    if (value != null || sparse) {
                        newArray[i++] = value;
                    }
                }
                return newArray;
            }
            if (sourceObject instanceof Date) {
                return dateToTag(sourceObject);
            }
            const newObject = {};
            if (ns.isMapSchema()) {
                const sparse = !!ns.getMergedTraits().sparse;
                for (const key of Object.keys(sourceObject)) {
                    const value = this.serialize(ns.getValueSchema(), sourceObject[key]);
                    if (value != null || sparse) {
                        newObject[key] = value;
                    }
                }
            }
            else if (ns.isStructSchema()) {
                for (const [key, memberSchema] of ns.structIterator()) {
                    const value = this.serialize(memberSchema, sourceObject[key]);
                    if (value != null) {
                        newObject[key] = value;
                    }
                }
                const isUnion = ns.isUnionSchema();
                if (isUnion && Array.isArray(sourceObject.$unknown)) {
                    const [k, v] = sourceObject.$unknown;
                    newObject[k] = v;
                }
                else if (typeof sourceObject.__type === "string") {
                    for (const [k, v] of Object.entries(sourceObject)) {
                        if (!(k in newObject)) {
                            newObject[k] = this.serialize(15, v);
                        }
                    }
                }
            }
            else if (ns.isDocumentSchema()) {
                for (const key of Object.keys(sourceObject)) {
                    newObject[key] = this.serialize(ns.getValueSchema(), sourceObject[key]);
                }
            }
            else if (ns.isBigDecimalSchema()) {
                return sourceObject;
            }
            return newObject;
        }
        return source;
    }
    flush() {
        const buffer = cbor.serialize(this.value);
        this.value = undefined;
        return buffer;
    }
}
class CborShapeDeserializer extends protocols.SerdeContext {
    read(schema, bytes) {
        const data = cbor.deserialize(bytes);
        return this.readValue(schema, data);
    }
    readValue(_schema, value) {
        const ns = schema.NormalizedSchema.of(_schema);
        if (ns.isTimestampSchema()) {
            if (typeof value === "number") {
                return serde._parseEpochTimestamp(value);
            }
            if (typeof value === "object") {
                if (value.tag === 1 && "value" in value) {
                    return serde._parseEpochTimestamp(value.value);
                }
            }
        }
        if (ns.isBlobSchema()) {
            if (typeof value === "string") {
                return (this.serdeContext?.base64Decoder ?? utilBase64.fromBase64)(value);
            }
            return value;
        }
        if (typeof value === "undefined" ||
            typeof value === "boolean" ||
            typeof value === "number" ||
            typeof value === "string" ||
            typeof value === "bigint" ||
            typeof value === "symbol") {
            return value;
        }
        else if (typeof value === "object") {
            if (value === null) {
                return null;
            }
            if ("byteLength" in value) {
                return value;
            }
            if (value instanceof Date) {
                return value;
            }
            if (ns.isDocumentSchema()) {
                return value;
            }
            if (ns.isListSchema()) {
                const newArray = [];
                const memberSchema = ns.getValueSchema();
                for (const item of value) {
                    const itemValue = this.readValue(memberSchema, item);
                    newArray.push(itemValue);
                }
                return newArray;
            }
            const newObject = {};
            if (ns.isMapSchema()) {
                const targetSchema = ns.getValueSchema();
                for (const key of Object.keys(value)) {
                    const itemValue = this.readValue(targetSchema, value[key]);
                    newObject[key] = itemValue;
                }
            }
            else if (ns.isStructSchema()) {
                const isUnion = ns.isUnionSchema();
                let keys;
                if (isUnion) {
                    keys = new Set(Object.keys(value).filter((k) => k !== "__type"));
                }
                for (const [key, memberSchema] of ns.structIterator()) {
                    if (isUnion) {
                        keys.delete(key);
                    }
                    if (value[key] != null) {
                        newObject[key] = this.readValue(memberSchema, value[key]);
                    }
                }
                if (isUnion && keys?.size === 1 && Object.keys(newObject).length === 0) {
                    const k = keys.values().next().value;
                    newObject.$unknown = [k, value[k]];
                }
                else if (typeof value.__type === "string") {
                    for (const [k, v] of Object.entries(value)) {
                        if (!(k in newObject)) {
                            newObject[k] = v;
                        }
                    }
                }
            }
            else if (value instanceof serde.NumericValue) {
                return value;
            }
            return newObject;
        }
        else {
            return value;
        }
    }
}

class SmithyRpcV2CborProtocol extends protocols.RpcProtocol {
    codec = new CborCodec();
    serializer = this.codec.createSerializer();
    deserializer = this.codec.createDeserializer();
    constructor({ defaultNamespace, errorTypeRegistries, }) {
        super({ defaultNamespace, errorTypeRegistries });
    }
    getShapeId() {
        return "smithy.protocols#rpcv2Cbor";
    }
    getPayloadCodec() {
        return this.codec;
    }
    async serializeRequest(operationSchema, input, context) {
        const request = await super.serializeRequest(operationSchema, input, context);
        Object.assign(request.headers, {
            "content-type": this.getDefaultContentType(),
            "smithy-protocol": "rpc-v2-cbor",
            accept: this.getDefaultContentType(),
        });
        if (schema.deref(operationSchema.input) === "unit") {
            delete request.body;
            delete request.headers["content-type"];
        }
        else {
            if (!request.body) {
                this.serializer.write(15, {});
                request.body = this.serializer.flush();
            }
            try {
                request.headers["content-length"] = String(request.body.byteLength);
            }
            catch (e) { }
        }
        const { service, operation } = utilMiddleware.getSmithyContext(context);
        const path = `/service/${service}/operation/${operation}`;
        if (request.path.endsWith("/")) {
            request.path += path.slice(1);
        }
        else {
            request.path += path;
        }
        return request;
    }
    async deserializeResponse(operationSchema, context, response) {
        return super.deserializeResponse(operationSchema, context, response);
    }
    async handleError(operationSchema, context, response, dataObject, metadata) {
        const errorName = loadSmithyRpcV2CborErrorCode(response, dataObject) ?? "Unknown";
        const errorMetadata = {
            $metadata: metadata,
            $fault: response.statusCode <= 500 ? "client" : "server",
        };
        let namespace = this.options.defaultNamespace;
        if (errorName.includes("#")) {
            [namespace] = errorName.split("#");
        }
        const registry = this.compositeErrorRegistry;
        const nsRegistry = schema.TypeRegistry.for(namespace);
        registry.copyFrom(nsRegistry);
        let errorSchema;
        try {
            errorSchema = registry.getSchema(errorName);
        }
        catch (e) {
            if (dataObject.Message) {
                dataObject.message = dataObject.Message;
            }
            const syntheticRegistry = schema.TypeRegistry.for("smithy.ts.sdk.synthetic." + namespace);
            registry.copyFrom(syntheticRegistry);
            const baseExceptionSchema = registry.getBaseException();
            if (baseExceptionSchema) {
                const ErrorCtor = registry.getErrorCtor(baseExceptionSchema);
                throw Object.assign(new ErrorCtor({ name: errorName }), errorMetadata, dataObject);
            }
            throw Object.assign(new Error(errorName), errorMetadata, dataObject);
        }
        const ns = schema.NormalizedSchema.of(errorSchema);
        const ErrorCtor = registry.getErrorCtor(errorSchema);
        const message = dataObject.message ?? dataObject.Message ?? "Unknown";
        const exception = new ErrorCtor(message);
        const output = {};
        for (const [name, member] of ns.structIterator()) {
            output[name] = this.deserializer.readValue(member, dataObject[name]);
        }
        throw Object.assign(exception, errorMetadata, {
            $fault: ns.getMergedTraits().error,
            message,
        }, output);
    }
    getDefaultContentType() {
        return "application/cbor";
    }
}

exports.CborCodec = CborCodec;
exports.CborShapeDeserializer = CborShapeDeserializer;
exports.CborShapeSerializer = CborShapeSerializer;
exports.SmithyRpcV2CborProtocol = SmithyRpcV2CborProtocol;
exports.buildHttpRpcRequest = buildHttpRpcRequest;
exports.cbor = cbor;
exports.checkCborResponse = checkCborResponse;
exports.dateToTag = dateToTag;
exports.loadSmithyRpcV2CborErrorCode = loadSmithyRpcV2CborErrorCode;
exports.parseCborBody = parseCborBody;
exports.parseCborErrorBody = parseCborErrorBody;
exports.tag = tag;
exports.tagSymbol = tagSymbol;


/***/ }),

/***/ 62085:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var urlParser = __webpack_require__(14494);

const toEndpointV1 = (endpoint) => {
    if (typeof endpoint === "object") {
        if ("url" in endpoint) {
            const v1Endpoint = urlParser.parseUrl(endpoint.url);
            if (endpoint.headers) {
                v1Endpoint.headers = {};
                for (const [name, values] of Object.entries(endpoint.headers)) {
                    v1Endpoint.headers[name.toLowerCase()] = values.join(", ");
                }
            }
            return v1Endpoint;
        }
        return endpoint;
    }
    return urlParser.parseUrl(endpoint);
};

exports.toEndpointV1 = toEndpointV1;


/***/ }),

/***/ 93422:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var utilStream = __webpack_require__(4252);
var schema = __webpack_require__(26890);
var serde = __webpack_require__(92430);
var protocolHttp = __webpack_require__(72356);
var utilBase64 = __webpack_require__(68385);
var utilUtf8 = __webpack_require__(71577);

const collectBody = async (streamBody = new Uint8Array(), context) => {
    if (streamBody instanceof Uint8Array) {
        return utilStream.Uint8ArrayBlobAdapter.mutate(streamBody);
    }
    if (!streamBody) {
        return utilStream.Uint8ArrayBlobAdapter.mutate(new Uint8Array());
    }
    const fromContext = context.streamCollector(streamBody);
    return utilStream.Uint8ArrayBlobAdapter.mutate(await fromContext);
};

function extendedEncodeURIComponent(str) {
    return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
        return "%" + c.charCodeAt(0).toString(16).toUpperCase();
    });
}

class SerdeContext {
    serdeContext;
    setSerdeContext(serdeContext) {
        this.serdeContext = serdeContext;
    }
}

class HttpProtocol extends SerdeContext {
    options;
    compositeErrorRegistry;
    constructor(options) {
        super();
        this.options = options;
        this.compositeErrorRegistry = schema.TypeRegistry.for(options.defaultNamespace);
        for (const etr of options.errorTypeRegistries ?? []) {
            this.compositeErrorRegistry.copyFrom(etr);
        }
    }
    getRequestType() {
        return protocolHttp.HttpRequest;
    }
    getResponseType() {
        return protocolHttp.HttpResponse;
    }
    setSerdeContext(serdeContext) {
        this.serdeContext = serdeContext;
        this.serializer.setSerdeContext(serdeContext);
        this.deserializer.setSerdeContext(serdeContext);
        if (this.getPayloadCodec()) {
            this.getPayloadCodec().setSerdeContext(serdeContext);
        }
    }
    updateServiceEndpoint(request, endpoint) {
        if ("url" in endpoint) {
            request.protocol = endpoint.url.protocol;
            request.hostname = endpoint.url.hostname;
            request.port = endpoint.url.port ? Number(endpoint.url.port) : undefined;
            request.path = endpoint.url.pathname;
            request.fragment = endpoint.url.hash || void 0;
            request.username = endpoint.url.username || void 0;
            request.password = endpoint.url.password || void 0;
            if (!request.query) {
                request.query = {};
            }
            for (const [k, v] of endpoint.url.searchParams.entries()) {
                request.query[k] = v;
            }
            if (endpoint.headers) {
                for (const [name, values] of Object.entries(endpoint.headers)) {
                    request.headers[name] = values.join(", ");
                }
            }
            return request;
        }
        else {
            request.protocol = endpoint.protocol;
            request.hostname = endpoint.hostname;
            request.port = endpoint.port ? Number(endpoint.port) : undefined;
            request.path = endpoint.path;
            request.query = {
                ...endpoint.query,
            };
            if (endpoint.headers) {
                for (const [name, value] of Object.entries(endpoint.headers)) {
                    request.headers[name] = value;
                }
            }
            return request;
        }
    }
    setHostPrefix(request, operationSchema, input) {
        if (this.serdeContext?.disableHostPrefix) {
            return;
        }
        const inputNs = schema.NormalizedSchema.of(operationSchema.input);
        const opTraits = schema.translateTraits(operationSchema.traits ?? {});
        if (opTraits.endpoint) {
            let hostPrefix = opTraits.endpoint?.[0];
            if (typeof hostPrefix === "string") {
                const hostLabelInputs = [...inputNs.structIterator()].filter(([, member]) => member.getMergedTraits().hostLabel);
                for (const [name] of hostLabelInputs) {
                    const replacement = input[name];
                    if (typeof replacement !== "string") {
                        throw new Error(`@smithy/core/schema - ${name} in input must be a string as hostLabel.`);
                    }
                    hostPrefix = hostPrefix.replace(`{${name}}`, replacement);
                }
                request.hostname = hostPrefix + request.hostname;
            }
        }
    }
    deserializeMetadata(output) {
        return {
            httpStatusCode: output.statusCode,
            requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
            extendedRequestId: output.headers["x-amz-id-2"],
            cfId: output.headers["x-amz-cf-id"],
        };
    }
    async serializeEventStream({ eventStream, requestSchema, initialRequest, }) {
        const eventStreamSerde = await this.loadEventStreamCapability();
        return eventStreamSerde.serializeEventStream({
            eventStream,
            requestSchema,
            initialRequest,
        });
    }
    async deserializeEventStream({ response, responseSchema, initialResponseContainer, }) {
        const eventStreamSerde = await this.loadEventStreamCapability();
        return eventStreamSerde.deserializeEventStream({
            response,
            responseSchema,
            initialResponseContainer,
        });
    }
    async loadEventStreamCapability() {
        const { EventStreamSerde } = await __webpack_require__.e(/* import() */ 579).then(__webpack_require__.t.bind(__webpack_require__, 56579, 19));
        return new EventStreamSerde({
            marshaller: this.getEventStreamMarshaller(),
            serializer: this.serializer,
            deserializer: this.deserializer,
            serdeContext: this.serdeContext,
            defaultContentType: this.getDefaultContentType(),
        });
    }
    getDefaultContentType() {
        throw new Error(`@smithy/core/protocols - ${this.constructor.name} getDefaultContentType() implementation missing.`);
    }
    async deserializeHttpMessage(schema, context, response, arg4, arg5) {
        return [];
    }
    getEventStreamMarshaller() {
        const context = this.serdeContext;
        if (!context.eventStreamMarshaller) {
            throw new Error("@smithy/core - HttpProtocol: eventStreamMarshaller missing in serdeContext.");
        }
        return context.eventStreamMarshaller;
    }
}

class HttpBindingProtocol extends HttpProtocol {
    async serializeRequest(operationSchema, _input, context) {
        const input = _input && typeof _input === "object" ? _input : {};
        const serializer = this.serializer;
        const query = {};
        const headers = {};
        const endpoint = await context.endpoint();
        const ns = schema.NormalizedSchema.of(operationSchema?.input);
        const payloadMemberNames = [];
        const payloadMemberSchemas = [];
        let hasNonHttpBindingMember = false;
        let payload;
        const request = new protocolHttp.HttpRequest({
            protocol: "",
            hostname: "",
            port: undefined,
            path: "",
            fragment: undefined,
            query: query,
            headers: headers,
            body: undefined,
        });
        if (endpoint) {
            this.updateServiceEndpoint(request, endpoint);
            this.setHostPrefix(request, operationSchema, input);
            const opTraits = schema.translateTraits(operationSchema.traits);
            if (opTraits.http) {
                request.method = opTraits.http[0];
                const [path, search] = opTraits.http[1].split("?");
                if (request.path == "/") {
                    request.path = path;
                }
                else {
                    request.path += path;
                }
                const traitSearchParams = new URLSearchParams(search ?? "");
                Object.assign(query, Object.fromEntries(traitSearchParams));
            }
        }
        for (const [memberName, memberNs] of ns.structIterator()) {
            const memberTraits = memberNs.getMergedTraits() ?? {};
            const inputMemberValue = input[memberName];
            if (inputMemberValue == null && !memberNs.isIdempotencyToken()) {
                if (memberTraits.httpLabel) {
                    if (request.path.includes(`{${memberName}+}`) || request.path.includes(`{${memberName}}`)) {
                        throw new Error(`No value provided for input HTTP label: ${memberName}.`);
                    }
                }
                continue;
            }
            if (memberTraits.httpPayload) {
                const isStreaming = memberNs.isStreaming();
                if (isStreaming) {
                    const isEventStream = memberNs.isStructSchema();
                    if (isEventStream) {
                        if (input[memberName]) {
                            payload = await this.serializeEventStream({
                                eventStream: input[memberName],
                                requestSchema: ns,
                            });
                        }
                    }
                    else {
                        payload = inputMemberValue;
                    }
                }
                else {
                    serializer.write(memberNs, inputMemberValue);
                    payload = serializer.flush();
                }
            }
            else if (memberTraits.httpLabel) {
                serializer.write(memberNs, inputMemberValue);
                const replacement = serializer.flush();
                if (request.path.includes(`{${memberName}+}`)) {
                    request.path = request.path.replace(`{${memberName}+}`, replacement.split("/").map(extendedEncodeURIComponent).join("/"));
                }
                else if (request.path.includes(`{${memberName}}`)) {
                    request.path = request.path.replace(`{${memberName}}`, extendedEncodeURIComponent(replacement));
                }
            }
            else if (memberTraits.httpHeader) {
                serializer.write(memberNs, inputMemberValue);
                headers[memberTraits.httpHeader.toLowerCase()] = String(serializer.flush());
            }
            else if (typeof memberTraits.httpPrefixHeaders === "string") {
                for (const [key, val] of Object.entries(inputMemberValue)) {
                    const amalgam = memberTraits.httpPrefixHeaders + key;
                    serializer.write([memberNs.getValueSchema(), { httpHeader: amalgam }], val);
                    headers[amalgam.toLowerCase()] = serializer.flush();
                }
            }
            else if (memberTraits.httpQuery || memberTraits.httpQueryParams) {
                this.serializeQuery(memberNs, inputMemberValue, query);
            }
            else {
                hasNonHttpBindingMember = true;
                payloadMemberNames.push(memberName);
                payloadMemberSchemas.push(memberNs);
            }
        }
        if (hasNonHttpBindingMember && input) {
            const [namespace, name] = (ns.getName(true) ?? "#Unknown").split("#");
            const requiredMembers = ns.getSchema()[6];
            const payloadSchema = [
                3,
                namespace,
                name,
                ns.getMergedTraits(),
                payloadMemberNames,
                payloadMemberSchemas,
                undefined,
            ];
            if (requiredMembers) {
                payloadSchema[6] = requiredMembers;
            }
            else {
                payloadSchema.pop();
            }
            serializer.write(payloadSchema, input);
            payload = serializer.flush();
        }
        request.headers = headers;
        request.query = query;
        request.body = payload;
        return request;
    }
    serializeQuery(ns, data, query) {
        const serializer = this.serializer;
        const traits = ns.getMergedTraits();
        if (traits.httpQueryParams) {
            for (const [key, val] of Object.entries(data)) {
                if (!(key in query)) {
                    const valueSchema = ns.getValueSchema();
                    Object.assign(valueSchema.getMergedTraits(), {
                        ...traits,
                        httpQuery: key,
                        httpQueryParams: undefined,
                    });
                    this.serializeQuery(valueSchema, val, query);
                }
            }
            return;
        }
        if (ns.isListSchema()) {
            const sparse = !!ns.getMergedTraits().sparse;
            const buffer = [];
            for (const item of data) {
                serializer.write([ns.getValueSchema(), traits], item);
                const serializable = serializer.flush();
                if (sparse || serializable !== undefined) {
                    buffer.push(serializable);
                }
            }
            query[traits.httpQuery] = buffer;
        }
        else {
            serializer.write([ns, traits], data);
            query[traits.httpQuery] = serializer.flush();
        }
    }
    async deserializeResponse(operationSchema, context, response) {
        const deserializer = this.deserializer;
        const ns = schema.NormalizedSchema.of(operationSchema.output);
        const dataObject = {};
        if (response.statusCode >= 300) {
            const bytes = await collectBody(response.body, context);
            if (bytes.byteLength > 0) {
                Object.assign(dataObject, await deserializer.read(15, bytes));
            }
            await this.handleError(operationSchema, context, response, dataObject, this.deserializeMetadata(response));
            throw new Error("@smithy/core/protocols - HTTP Protocol error handler failed to throw.");
        }
        for (const header in response.headers) {
            const value = response.headers[header];
            delete response.headers[header];
            response.headers[header.toLowerCase()] = value;
        }
        const nonHttpBindingMembers = await this.deserializeHttpMessage(ns, context, response, dataObject);
        if (nonHttpBindingMembers.length) {
            const bytes = await collectBody(response.body, context);
            if (bytes.byteLength > 0) {
                const dataFromBody = await deserializer.read(ns, bytes);
                for (const member of nonHttpBindingMembers) {
                    if (dataFromBody[member] != null) {
                        dataObject[member] = dataFromBody[member];
                    }
                }
            }
        }
        else if (nonHttpBindingMembers.discardResponseBody) {
            await collectBody(response.body, context);
        }
        dataObject.$metadata = this.deserializeMetadata(response);
        return dataObject;
    }
    async deserializeHttpMessage(schema$1, context, response, arg4, arg5) {
        let dataObject;
        if (arg4 instanceof Set) {
            dataObject = arg5;
        }
        else {
            dataObject = arg4;
        }
        let discardResponseBody = true;
        const deserializer = this.deserializer;
        const ns = schema.NormalizedSchema.of(schema$1);
        const nonHttpBindingMembers = [];
        for (const [memberName, memberSchema] of ns.structIterator()) {
            const memberTraits = memberSchema.getMemberTraits();
            if (memberTraits.httpPayload) {
                discardResponseBody = false;
                const isStreaming = memberSchema.isStreaming();
                if (isStreaming) {
                    const isEventStream = memberSchema.isStructSchema();
                    if (isEventStream) {
                        dataObject[memberName] = await this.deserializeEventStream({
                            response,
                            responseSchema: ns,
                        });
                    }
                    else {
                        dataObject[memberName] = utilStream.sdkStreamMixin(response.body);
                    }
                }
                else if (response.body) {
                    const bytes = await collectBody(response.body, context);
                    if (bytes.byteLength > 0) {
                        dataObject[memberName] = await deserializer.read(memberSchema, bytes);
                    }
                }
            }
            else if (memberTraits.httpHeader) {
                const key = String(memberTraits.httpHeader).toLowerCase();
                const value = response.headers[key];
                if (null != value) {
                    if (memberSchema.isListSchema()) {
                        const headerListValueSchema = memberSchema.getValueSchema();
                        headerListValueSchema.getMergedTraits().httpHeader = key;
                        let sections;
                        if (headerListValueSchema.isTimestampSchema() &&
                            headerListValueSchema.getSchema() === 4) {
                            sections = serde.splitEvery(value, ",", 2);
                        }
                        else {
                            sections = serde.splitHeader(value);
                        }
                        const list = [];
                        for (const section of sections) {
                            list.push(await deserializer.read(headerListValueSchema, section.trim()));
                        }
                        dataObject[memberName] = list;
                    }
                    else {
                        dataObject[memberName] = await deserializer.read(memberSchema, value);
                    }
                }
            }
            else if (memberTraits.httpPrefixHeaders !== undefined) {
                dataObject[memberName] = {};
                for (const [header, value] of Object.entries(response.headers)) {
                    if (header.startsWith(memberTraits.httpPrefixHeaders)) {
                        const valueSchema = memberSchema.getValueSchema();
                        valueSchema.getMergedTraits().httpHeader = header;
                        dataObject[memberName][header.slice(memberTraits.httpPrefixHeaders.length)] = await deserializer.read(valueSchema, value);
                    }
                }
            }
            else if (memberTraits.httpResponseCode) {
                dataObject[memberName] = response.statusCode;
            }
            else {
                nonHttpBindingMembers.push(memberName);
            }
        }
        nonHttpBindingMembers.discardResponseBody = discardResponseBody;
        return nonHttpBindingMembers;
    }
}

class RpcProtocol extends HttpProtocol {
    async serializeRequest(operationSchema, _input, context) {
        const serializer = this.serializer;
        const query = {};
        const headers = {};
        const endpoint = await context.endpoint();
        const ns = schema.NormalizedSchema.of(operationSchema?.input);
        const schema$1 = ns.getSchema();
        let payload;
        const input = _input && typeof _input === "object" ? _input : {};
        const request = new protocolHttp.HttpRequest({
            protocol: "",
            hostname: "",
            port: undefined,
            path: "/",
            fragment: undefined,
            query: query,
            headers: headers,
            body: undefined,
        });
        if (endpoint) {
            this.updateServiceEndpoint(request, endpoint);
            this.setHostPrefix(request, operationSchema, input);
        }
        if (input) {
            const eventStreamMember = ns.getEventStreamMember();
            if (eventStreamMember) {
                if (input[eventStreamMember]) {
                    const initialRequest = {};
                    for (const [memberName, memberSchema] of ns.structIterator()) {
                        if (memberName !== eventStreamMember && input[memberName]) {
                            serializer.write(memberSchema, input[memberName]);
                            initialRequest[memberName] = serializer.flush();
                        }
                    }
                    payload = await this.serializeEventStream({
                        eventStream: input[eventStreamMember],
                        requestSchema: ns,
                        initialRequest,
                    });
                }
            }
            else {
                serializer.write(schema$1, input);
                payload = serializer.flush();
            }
        }
        request.headers = Object.assign(request.headers, headers);
        request.query = query;
        request.body = payload;
        request.method = "POST";
        return request;
    }
    async deserializeResponse(operationSchema, context, response) {
        const deserializer = this.deserializer;
        const ns = schema.NormalizedSchema.of(operationSchema.output);
        const dataObject = {};
        if (response.statusCode >= 300) {
            const bytes = await collectBody(response.body, context);
            if (bytes.byteLength > 0) {
                Object.assign(dataObject, await deserializer.read(15, bytes));
            }
            await this.handleError(operationSchema, context, response, dataObject, this.deserializeMetadata(response));
            throw new Error("@smithy/core/protocols - RPC Protocol error handler failed to throw.");
        }
        for (const header in response.headers) {
            const value = response.headers[header];
            delete response.headers[header];
            response.headers[header.toLowerCase()] = value;
        }
        const eventStreamMember = ns.getEventStreamMember();
        if (eventStreamMember) {
            dataObject[eventStreamMember] = await this.deserializeEventStream({
                response,
                responseSchema: ns,
                initialResponseContainer: dataObject,
            });
        }
        else {
            const bytes = await collectBody(response.body, context);
            if (bytes.byteLength > 0) {
                Object.assign(dataObject, await deserializer.read(ns, bytes));
            }
        }
        dataObject.$metadata = this.deserializeMetadata(response);
        return dataObject;
    }
}

const resolvedPath = (resolvedPath, input, memberName, labelValueProvider, uriLabel, isGreedyLabel) => {
    if (input != null && input[memberName] !== undefined) {
        const labelValue = labelValueProvider();
        if (labelValue == null || labelValue.length <= 0) {
            throw new Error("Empty value provided for input HTTP label: " + memberName + ".");
        }
        resolvedPath = resolvedPath.replace(uriLabel, isGreedyLabel
            ? labelValue
                .split("/")
                .map((segment) => extendedEncodeURIComponent(segment))
                .join("/")
            : extendedEncodeURIComponent(labelValue));
    }
    else {
        throw new Error("No value provided for input HTTP label: " + memberName + ".");
    }
    return resolvedPath;
};

function requestBuilder(input, context) {
    return new RequestBuilder(input, context);
}
class RequestBuilder {
    input;
    context;
    query = {};
    method = "";
    headers = {};
    path = "";
    body = null;
    hostname = "";
    resolvePathStack = [];
    constructor(input, context) {
        this.input = input;
        this.context = context;
    }
    async build() {
        const { hostname, protocol = "https", port, path: basePath } = await this.context.endpoint();
        this.path = basePath;
        for (const resolvePath of this.resolvePathStack) {
            resolvePath(this.path);
        }
        return new protocolHttp.HttpRequest({
            protocol,
            hostname: this.hostname || hostname,
            port,
            method: this.method,
            path: this.path,
            query: this.query,
            body: this.body,
            headers: this.headers,
        });
    }
    hn(hostname) {
        this.hostname = hostname;
        return this;
    }
    bp(uriLabel) {
        this.resolvePathStack.push((basePath) => {
            this.path = `${basePath?.endsWith("/") ? basePath.slice(0, -1) : basePath || ""}` + uriLabel;
        });
        return this;
    }
    p(memberName, labelValueProvider, uriLabel, isGreedyLabel) {
        this.resolvePathStack.push((path) => {
            this.path = resolvedPath(path, this.input, memberName, labelValueProvider, uriLabel, isGreedyLabel);
        });
        return this;
    }
    h(headers) {
        this.headers = headers;
        return this;
    }
    q(query) {
        this.query = query;
        return this;
    }
    b(body) {
        this.body = body;
        return this;
    }
    m(method) {
        this.method = method;
        return this;
    }
}

function determineTimestampFormat(ns, settings) {
    if (settings.timestampFormat.useTrait) {
        if (ns.isTimestampSchema() &&
            (ns.getSchema() === 5 ||
                ns.getSchema() === 6 ||
                ns.getSchema() === 7)) {
            return ns.getSchema();
        }
    }
    const { httpLabel, httpPrefixHeaders, httpHeader, httpQuery } = ns.getMergedTraits();
    const bindingFormat = settings.httpBindings
        ? typeof httpPrefixHeaders === "string" || Boolean(httpHeader)
            ? 6
            : Boolean(httpQuery) || Boolean(httpLabel)
                ? 5
                : undefined
        : undefined;
    return bindingFormat ?? settings.timestampFormat.default;
}

class FromStringShapeDeserializer extends SerdeContext {
    settings;
    constructor(settings) {
        super();
        this.settings = settings;
    }
    read(_schema, data) {
        const ns = schema.NormalizedSchema.of(_schema);
        if (ns.isListSchema()) {
            return serde.splitHeader(data).map((item) => this.read(ns.getValueSchema(), item));
        }
        if (ns.isBlobSchema()) {
            return (this.serdeContext?.base64Decoder ?? utilBase64.fromBase64)(data);
        }
        if (ns.isTimestampSchema()) {
            const format = determineTimestampFormat(ns, this.settings);
            switch (format) {
                case 5:
                    return serde._parseRfc3339DateTimeWithOffset(data);
                case 6:
                    return serde._parseRfc7231DateTime(data);
                case 7:
                    return serde._parseEpochTimestamp(data);
                default:
                    console.warn("Missing timestamp format, parsing value with Date constructor:", data);
                    return new Date(data);
            }
        }
        if (ns.isStringSchema()) {
            const mediaType = ns.getMergedTraits().mediaType;
            let intermediateValue = data;
            if (mediaType) {
                if (ns.getMergedTraits().httpHeader) {
                    intermediateValue = this.base64ToUtf8(intermediateValue);
                }
                const isJson = mediaType === "application/json" || mediaType.endsWith("+json");
                if (isJson) {
                    intermediateValue = serde.LazyJsonString.from(intermediateValue);
                }
                return intermediateValue;
            }
        }
        if (ns.isNumericSchema()) {
            return Number(data);
        }
        if (ns.isBigIntegerSchema()) {
            return BigInt(data);
        }
        if (ns.isBigDecimalSchema()) {
            return new serde.NumericValue(data, "bigDecimal");
        }
        if (ns.isBooleanSchema()) {
            return String(data).toLowerCase() === "true";
        }
        return data;
    }
    base64ToUtf8(base64String) {
        return (this.serdeContext?.utf8Encoder ?? utilUtf8.toUtf8)((this.serdeContext?.base64Decoder ?? utilBase64.fromBase64)(base64String));
    }
}

class HttpInterceptingShapeDeserializer extends SerdeContext {
    codecDeserializer;
    stringDeserializer;
    constructor(codecDeserializer, codecSettings) {
        super();
        this.codecDeserializer = codecDeserializer;
        this.stringDeserializer = new FromStringShapeDeserializer(codecSettings);
    }
    setSerdeContext(serdeContext) {
        this.stringDeserializer.setSerdeContext(serdeContext);
        this.codecDeserializer.setSerdeContext(serdeContext);
        this.serdeContext = serdeContext;
    }
    read(schema$1, data) {
        const ns = schema.NormalizedSchema.of(schema$1);
        const traits = ns.getMergedTraits();
        const toString = this.serdeContext?.utf8Encoder ?? utilUtf8.toUtf8;
        if (traits.httpHeader || traits.httpResponseCode) {
            return this.stringDeserializer.read(ns, toString(data));
        }
        if (traits.httpPayload) {
            if (ns.isBlobSchema()) {
                const toBytes = this.serdeContext?.utf8Decoder ?? utilUtf8.fromUtf8;
                if (typeof data === "string") {
                    return toBytes(data);
                }
                return data;
            }
            else if (ns.isStringSchema()) {
                if ("byteLength" in data) {
                    return toString(data);
                }
                return data;
            }
        }
        return this.codecDeserializer.read(ns, data);
    }
}

class ToStringShapeSerializer extends SerdeContext {
    settings;
    stringBuffer = "";
    constructor(settings) {
        super();
        this.settings = settings;
    }
    write(schema$1, value) {
        const ns = schema.NormalizedSchema.of(schema$1);
        switch (typeof value) {
            case "object":
                if (value === null) {
                    this.stringBuffer = "null";
                    return;
                }
                if (ns.isTimestampSchema()) {
                    if (!(value instanceof Date)) {
                        throw new Error(`@smithy/core/protocols - received non-Date value ${value} when schema expected Date in ${ns.getName(true)}`);
                    }
                    const format = determineTimestampFormat(ns, this.settings);
                    switch (format) {
                        case 5:
                            this.stringBuffer = value.toISOString().replace(".000Z", "Z");
                            break;
                        case 6:
                            this.stringBuffer = serde.dateToUtcString(value);
                            break;
                        case 7:
                            this.stringBuffer = String(value.getTime() / 1000);
                            break;
                        default:
                            console.warn("Missing timestamp format, using epoch seconds", value);
                            this.stringBuffer = String(value.getTime() / 1000);
                    }
                    return;
                }
                if (ns.isBlobSchema() && "byteLength" in value) {
                    this.stringBuffer = (this.serdeContext?.base64Encoder ?? utilBase64.toBase64)(value);
                    return;
                }
                if (ns.isListSchema() && Array.isArray(value)) {
                    let buffer = "";
                    for (const item of value) {
                        this.write([ns.getValueSchema(), ns.getMergedTraits()], item);
                        const headerItem = this.flush();
                        const serialized = ns.getValueSchema().isTimestampSchema() ? headerItem : serde.quoteHeader(headerItem);
                        if (buffer !== "") {
                            buffer += ", ";
                        }
                        buffer += serialized;
                    }
                    this.stringBuffer = buffer;
                    return;
                }
                this.stringBuffer = JSON.stringify(value, null, 2);
                break;
            case "string":
                const mediaType = ns.getMergedTraits().mediaType;
                let intermediateValue = value;
                if (mediaType) {
                    const isJson = mediaType === "application/json" || mediaType.endsWith("+json");
                    if (isJson) {
                        intermediateValue = serde.LazyJsonString.from(intermediateValue);
                    }
                    if (ns.getMergedTraits().httpHeader) {
                        this.stringBuffer = (this.serdeContext?.base64Encoder ?? utilBase64.toBase64)(intermediateValue.toString());
                        return;
                    }
                }
                this.stringBuffer = value;
                break;
            default:
                if (ns.isIdempotencyToken()) {
                    this.stringBuffer = serde.generateIdempotencyToken();
                }
                else {
                    this.stringBuffer = String(value);
                }
        }
    }
    flush() {
        const buffer = this.stringBuffer;
        this.stringBuffer = "";
        return buffer;
    }
}

class HttpInterceptingShapeSerializer {
    codecSerializer;
    stringSerializer;
    buffer;
    constructor(codecSerializer, codecSettings, stringSerializer = new ToStringShapeSerializer(codecSettings)) {
        this.codecSerializer = codecSerializer;
        this.stringSerializer = stringSerializer;
    }
    setSerdeContext(serdeContext) {
        this.codecSerializer.setSerdeContext(serdeContext);
        this.stringSerializer.setSerdeContext(serdeContext);
    }
    write(schema$1, value) {
        const ns = schema.NormalizedSchema.of(schema$1);
        const traits = ns.getMergedTraits();
        if (traits.httpHeader || traits.httpLabel || traits.httpQuery) {
            this.stringSerializer.write(ns, value);
            this.buffer = this.stringSerializer.flush();
            return;
        }
        return this.codecSerializer.write(ns, value);
    }
    flush() {
        if (this.buffer !== undefined) {
            const buffer = this.buffer;
            this.buffer = undefined;
            return buffer;
        }
        return this.codecSerializer.flush();
    }
}

exports.FromStringShapeDeserializer = FromStringShapeDeserializer;
exports.HttpBindingProtocol = HttpBindingProtocol;
exports.HttpInterceptingShapeDeserializer = HttpInterceptingShapeDeserializer;
exports.HttpInterceptingShapeSerializer = HttpInterceptingShapeSerializer;
exports.HttpProtocol = HttpProtocol;
exports.RequestBuilder = RequestBuilder;
exports.RpcProtocol = RpcProtocol;
exports.SerdeContext = SerdeContext;
exports.ToStringShapeSerializer = ToStringShapeSerializer;
exports.collectBody = collectBody;
exports.determineTimestampFormat = determineTimestampFormat;
exports.extendedEncodeURIComponent = extendedEncodeURIComponent;
exports.requestBuilder = requestBuilder;
exports.resolvedPath = resolvedPath;


/***/ }),

/***/ 26890:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var protocolHttp = __webpack_require__(72356);
var utilMiddleware = __webpack_require__(76324);
var endpoints = __webpack_require__(62085);

const deref = (schemaRef) => {
    if (typeof schemaRef === "function") {
        return schemaRef();
    }
    return schemaRef;
};

const operation = (namespace, name, traits, input, output) => ({
    name,
    namespace,
    traits,
    input,
    output,
});

const schemaDeserializationMiddleware = (config) => (next, context) => async (args) => {
    const { response } = await next(args);
    const { operationSchema } = utilMiddleware.getSmithyContext(context);
    const [, ns, n, t, i, o] = operationSchema ?? [];
    try {
        const parsed = await config.protocol.deserializeResponse(operation(ns, n, t, i, o), {
            ...config,
            ...context,
        }, response);
        return {
            response,
            output: parsed,
        };
    }
    catch (error) {
        Object.defineProperty(error, "$response", {
            value: response,
            enumerable: false,
            writable: false,
            configurable: false,
        });
        if (!("$metadata" in error)) {
            const hint = `Deserialization error: to see the raw response, inspect the hidden field {error}.$response on this object.`;
            try {
                error.message += "\n  " + hint;
            }
            catch (e) {
                if (!context.logger || context.logger?.constructor?.name === "NoOpLogger") {
                    console.warn(hint);
                }
                else {
                    context.logger?.warn?.(hint);
                }
            }
            if (typeof error.$responseBodyText !== "undefined") {
                if (error.$response) {
                    error.$response.body = error.$responseBodyText;
                }
            }
            try {
                if (protocolHttp.HttpResponse.isInstance(response)) {
                    const { headers = {} } = response;
                    const headerEntries = Object.entries(headers);
                    error.$metadata = {
                        httpStatusCode: response.statusCode,
                        requestId: findHeader(/^x-[\w-]+-request-?id$/, headerEntries),
                        extendedRequestId: findHeader(/^x-[\w-]+-id-2$/, headerEntries),
                        cfId: findHeader(/^x-[\w-]+-cf-id$/, headerEntries),
                    };
                }
            }
            catch (e) {
            }
        }
        throw error;
    }
};
const findHeader = (pattern, headers) => {
    return (headers.find(([k]) => {
        return k.match(pattern);
    }) || [void 0, void 0])[1];
};

const schemaSerializationMiddleware = (config) => (next, context) => async (args) => {
    const { operationSchema } = utilMiddleware.getSmithyContext(context);
    const [, ns, n, t, i, o] = operationSchema ?? [];
    const endpoint = context.endpointV2
        ? async () => endpoints.toEndpointV1(context.endpointV2)
        : config.endpoint;
    const request = await config.protocol.serializeRequest(operation(ns, n, t, i, o), args.input, {
        ...config,
        ...context,
        endpoint,
    });
    return next({
        ...args,
        request,
    });
};

const deserializerMiddlewareOption = {
    name: "deserializerMiddleware",
    step: "deserialize",
    tags: ["DESERIALIZER"],
    override: true,
};
const serializerMiddlewareOption = {
    name: "serializerMiddleware",
    step: "serialize",
    tags: ["SERIALIZER"],
    override: true,
};
function getSchemaSerdePlugin(config) {
    return {
        applyToStack: (commandStack) => {
            commandStack.add(schemaSerializationMiddleware(config), serializerMiddlewareOption);
            commandStack.add(schemaDeserializationMiddleware(config), deserializerMiddlewareOption);
            config.protocol.setSerdeContext(config);
        },
    };
}

class Schema {
    name;
    namespace;
    traits;
    static assign(instance, values) {
        const schema = Object.assign(instance, values);
        return schema;
    }
    static [Symbol.hasInstance](lhs) {
        const isPrototype = this.prototype.isPrototypeOf(lhs);
        if (!isPrototype && typeof lhs === "object" && lhs !== null) {
            const list = lhs;
            return list.symbol === this.symbol;
        }
        return isPrototype;
    }
    getName() {
        return this.namespace + "#" + this.name;
    }
}

class ListSchema extends Schema {
    static symbol = Symbol.for("@smithy/lis");
    name;
    traits;
    valueSchema;
    symbol = ListSchema.symbol;
}
const list = (namespace, name, traits, valueSchema) => Schema.assign(new ListSchema(), {
    name,
    namespace,
    traits,
    valueSchema,
});

class MapSchema extends Schema {
    static symbol = Symbol.for("@smithy/map");
    name;
    traits;
    keySchema;
    valueSchema;
    symbol = MapSchema.symbol;
}
const map = (namespace, name, traits, keySchema, valueSchema) => Schema.assign(new MapSchema(), {
    name,
    namespace,
    traits,
    keySchema,
    valueSchema,
});

class OperationSchema extends Schema {
    static symbol = Symbol.for("@smithy/ope");
    name;
    traits;
    input;
    output;
    symbol = OperationSchema.symbol;
}
const op = (namespace, name, traits, input, output) => Schema.assign(new OperationSchema(), {
    name,
    namespace,
    traits,
    input,
    output,
});

class StructureSchema extends Schema {
    static symbol = Symbol.for("@smithy/str");
    name;
    traits;
    memberNames;
    memberList;
    symbol = StructureSchema.symbol;
}
const struct = (namespace, name, traits, memberNames, memberList) => Schema.assign(new StructureSchema(), {
    name,
    namespace,
    traits,
    memberNames,
    memberList,
});

class ErrorSchema extends StructureSchema {
    static symbol = Symbol.for("@smithy/err");
    ctor;
    symbol = ErrorSchema.symbol;
}
const error = (namespace, name, traits, memberNames, memberList, ctor) => Schema.assign(new ErrorSchema(), {
    name,
    namespace,
    traits,
    memberNames,
    memberList,
    ctor: null,
});

const traitsCache = [];
function translateTraits(indicator) {
    if (typeof indicator === "object") {
        return indicator;
    }
    indicator = indicator | 0;
    if (traitsCache[indicator]) {
        return traitsCache[indicator];
    }
    const traits = {};
    let i = 0;
    for (const trait of [
        "httpLabel",
        "idempotent",
        "idempotencyToken",
        "sensitive",
        "httpPayload",
        "httpResponseCode",
        "httpQueryParams",
    ]) {
        if (((indicator >> i++) & 1) === 1) {
            traits[trait] = 1;
        }
    }
    return (traitsCache[indicator] = traits);
}

const anno = {
    it: Symbol.for("@smithy/nor-struct-it"),
    ns: Symbol.for("@smithy/ns"),
};
const simpleSchemaCacheN = [];
const simpleSchemaCacheS = {};
class NormalizedSchema {
    ref;
    memberName;
    static symbol = Symbol.for("@smithy/nor");
    symbol = NormalizedSchema.symbol;
    name;
    schema;
    _isMemberSchema;
    traits;
    memberTraits;
    normalizedTraits;
    constructor(ref, memberName) {
        this.ref = ref;
        this.memberName = memberName;
        const traitStack = [];
        let _ref = ref;
        let schema = ref;
        this._isMemberSchema = false;
        while (isMemberSchema(_ref)) {
            traitStack.push(_ref[1]);
            _ref = _ref[0];
            schema = deref(_ref);
            this._isMemberSchema = true;
        }
        if (traitStack.length > 0) {
            this.memberTraits = {};
            for (let i = traitStack.length - 1; i >= 0; --i) {
                const traitSet = traitStack[i];
                Object.assign(this.memberTraits, translateTraits(traitSet));
            }
        }
        else {
            this.memberTraits = 0;
        }
        if (schema instanceof NormalizedSchema) {
            const computedMemberTraits = this.memberTraits;
            Object.assign(this, schema);
            this.memberTraits = Object.assign({}, computedMemberTraits, schema.getMemberTraits(), this.getMemberTraits());
            this.normalizedTraits = void 0;
            this.memberName = memberName ?? schema.memberName;
            return;
        }
        this.schema = deref(schema);
        if (isStaticSchema(this.schema)) {
            this.name = `${this.schema[1]}#${this.schema[2]}`;
            this.traits = this.schema[3];
        }
        else {
            this.name = this.memberName ?? String(schema);
            this.traits = 0;
        }
        if (this._isMemberSchema && !memberName) {
            throw new Error(`@smithy/core/schema - NormalizedSchema member init ${this.getName(true)} missing member name.`);
        }
    }
    static [Symbol.hasInstance](lhs) {
        const isPrototype = this.prototype.isPrototypeOf(lhs);
        if (!isPrototype && typeof lhs === "object" && lhs !== null) {
            const ns = lhs;
            return ns.symbol === this.symbol;
        }
        return isPrototype;
    }
    static of(ref) {
        const keyAble = typeof ref === "function" || (typeof ref === "object" && ref !== null);
        if (typeof ref === "number") {
            if (simpleSchemaCacheN[ref]) {
                return simpleSchemaCacheN[ref];
            }
        }
        else if (typeof ref === "string") {
            if (simpleSchemaCacheS[ref]) {
                return simpleSchemaCacheS[ref];
            }
        }
        else if (keyAble) {
            if (ref[anno.ns]) {
                return ref[anno.ns];
            }
        }
        const sc = deref(ref);
        if (sc instanceof NormalizedSchema) {
            return sc;
        }
        if (isMemberSchema(sc)) {
            const [ns, traits] = sc;
            if (ns instanceof NormalizedSchema) {
                Object.assign(ns.getMergedTraits(), translateTraits(traits));
                return ns;
            }
            throw new Error(`@smithy/core/schema - may not init unwrapped member schema=${JSON.stringify(ref, null, 2)}.`);
        }
        const ns = new NormalizedSchema(sc);
        if (keyAble) {
            return (ref[anno.ns] = ns);
        }
        if (typeof sc === "string") {
            return (simpleSchemaCacheS[sc] = ns);
        }
        if (typeof sc === "number") {
            return (simpleSchemaCacheN[sc] = ns);
        }
        return ns;
    }
    getSchema() {
        const sc = this.schema;
        if (Array.isArray(sc) && sc[0] === 0) {
            return sc[4];
        }
        return sc;
    }
    getName(withNamespace = false) {
        const { name } = this;
        const short = !withNamespace && name && name.includes("#");
        return short ? name.split("#")[1] : name || undefined;
    }
    getMemberName() {
        return this.memberName;
    }
    isMemberSchema() {
        return this._isMemberSchema;
    }
    isListSchema() {
        const sc = this.getSchema();
        return typeof sc === "number"
            ? sc >= 64 && sc < 128
            : sc[0] === 1;
    }
    isMapSchema() {
        const sc = this.getSchema();
        return typeof sc === "number"
            ? sc >= 128 && sc <= 0b1111_1111
            : sc[0] === 2;
    }
    isStructSchema() {
        const sc = this.getSchema();
        if (typeof sc !== "object") {
            return false;
        }
        const id = sc[0];
        return (id === 3 ||
            id === -3 ||
            id === 4);
    }
    isUnionSchema() {
        const sc = this.getSchema();
        if (typeof sc !== "object") {
            return false;
        }
        return sc[0] === 4;
    }
    isBlobSchema() {
        const sc = this.getSchema();
        return sc === 21 || sc === 42;
    }
    isTimestampSchema() {
        const sc = this.getSchema();
        return (typeof sc === "number" &&
            sc >= 4 &&
            sc <= 7);
    }
    isUnitSchema() {
        return this.getSchema() === "unit";
    }
    isDocumentSchema() {
        return this.getSchema() === 15;
    }
    isStringSchema() {
        return this.getSchema() === 0;
    }
    isBooleanSchema() {
        return this.getSchema() === 2;
    }
    isNumericSchema() {
        return this.getSchema() === 1;
    }
    isBigIntegerSchema() {
        return this.getSchema() === 17;
    }
    isBigDecimalSchema() {
        return this.getSchema() === 19;
    }
    isStreaming() {
        const { streaming } = this.getMergedTraits();
        return !!streaming || this.getSchema() === 42;
    }
    isIdempotencyToken() {
        return !!this.getMergedTraits().idempotencyToken;
    }
    getMergedTraits() {
        return (this.normalizedTraits ??
            (this.normalizedTraits = {
                ...this.getOwnTraits(),
                ...this.getMemberTraits(),
            }));
    }
    getMemberTraits() {
        return translateTraits(this.memberTraits);
    }
    getOwnTraits() {
        return translateTraits(this.traits);
    }
    getKeySchema() {
        const [isDoc, isMap] = [this.isDocumentSchema(), this.isMapSchema()];
        if (!isDoc && !isMap) {
            throw new Error(`@smithy/core/schema - cannot get key for non-map: ${this.getName(true)}`);
        }
        const schema = this.getSchema();
        const memberSchema = isDoc
            ? 15
            : schema[4] ?? 0;
        return member([memberSchema, 0], "key");
    }
    getValueSchema() {
        const sc = this.getSchema();
        const [isDoc, isMap, isList] = [this.isDocumentSchema(), this.isMapSchema(), this.isListSchema()];
        const memberSchema = typeof sc === "number"
            ? 0b0011_1111 & sc
            : sc && typeof sc === "object" && (isMap || isList)
                ? sc[3 + sc[0]]
                : isDoc
                    ? 15
                    : void 0;
        if (memberSchema != null) {
            return member([memberSchema, 0], isMap ? "value" : "member");
        }
        throw new Error(`@smithy/core/schema - ${this.getName(true)} has no value member.`);
    }
    getMemberSchema(memberName) {
        const struct = this.getSchema();
        if (this.isStructSchema() && struct[4].includes(memberName)) {
            const i = struct[4].indexOf(memberName);
            const memberSchema = struct[5][i];
            return member(isMemberSchema(memberSchema) ? memberSchema : [memberSchema, 0], memberName);
        }
        if (this.isDocumentSchema()) {
            return member([15, 0], memberName);
        }
        throw new Error(`@smithy/core/schema - ${this.getName(true)} has no member=${memberName}.`);
    }
    getMemberSchemas() {
        const buffer = {};
        try {
            for (const [k, v] of this.structIterator()) {
                buffer[k] = v;
            }
        }
        catch (ignored) { }
        return buffer;
    }
    getEventStreamMember() {
        if (this.isStructSchema()) {
            for (const [memberName, memberSchema] of this.structIterator()) {
                if (memberSchema.isStreaming() && memberSchema.isStructSchema()) {
                    return memberName;
                }
            }
        }
        return "";
    }
    *structIterator() {
        if (this.isUnitSchema()) {
            return;
        }
        if (!this.isStructSchema()) {
            throw new Error("@smithy/core/schema - cannot iterate non-struct schema.");
        }
        const struct = this.getSchema();
        const z = struct[4].length;
        let it = struct[anno.it];
        if (it && z === it.length) {
            yield* it;
            return;
        }
        it = Array(z);
        for (let i = 0; i < z; ++i) {
            const k = struct[4][i];
            const v = member([struct[5][i], 0], k);
            yield (it[i] = [k, v]);
        }
        struct[anno.it] = it;
    }
}
function member(memberSchema, memberName) {
    if (memberSchema instanceof NormalizedSchema) {
        return Object.assign(memberSchema, {
            memberName,
            _isMemberSchema: true,
        });
    }
    const internalCtorAccess = NormalizedSchema;
    return new internalCtorAccess(memberSchema, memberName);
}
const isMemberSchema = (sc) => Array.isArray(sc) && sc.length === 2;
const isStaticSchema = (sc) => Array.isArray(sc) && sc.length >= 5;

class SimpleSchema extends Schema {
    static symbol = Symbol.for("@smithy/sim");
    name;
    schemaRef;
    traits;
    symbol = SimpleSchema.symbol;
}
const sim = (namespace, name, schemaRef, traits) => Schema.assign(new SimpleSchema(), {
    name,
    namespace,
    traits,
    schemaRef,
});
const simAdapter = (namespace, name, traits, schemaRef) => Schema.assign(new SimpleSchema(), {
    name,
    namespace,
    traits,
    schemaRef,
});

const SCHEMA = {
    BLOB: 0b0001_0101,
    STREAMING_BLOB: 0b0010_1010,
    BOOLEAN: 0b0000_0010,
    STRING: 0b0000_0000,
    NUMERIC: 0b0000_0001,
    BIG_INTEGER: 0b0001_0001,
    BIG_DECIMAL: 0b0001_0011,
    DOCUMENT: 0b0000_1111,
    TIMESTAMP_DEFAULT: 0b0000_0100,
    TIMESTAMP_DATE_TIME: 0b0000_0101,
    TIMESTAMP_HTTP_DATE: 0b0000_0110,
    TIMESTAMP_EPOCH_SECONDS: 0b0000_0111,
    LIST_MODIFIER: 0b0100_0000,
    MAP_MODIFIER: 0b1000_0000,
};

class TypeRegistry {
    namespace;
    schemas;
    exceptions;
    static registries = new Map();
    constructor(namespace, schemas = new Map(), exceptions = new Map()) {
        this.namespace = namespace;
        this.schemas = schemas;
        this.exceptions = exceptions;
    }
    static for(namespace) {
        if (!TypeRegistry.registries.has(namespace)) {
            TypeRegistry.registries.set(namespace, new TypeRegistry(namespace));
        }
        return TypeRegistry.registries.get(namespace);
    }
    copyFrom(other) {
        const { schemas, exceptions } = this;
        for (const [k, v] of other.schemas) {
            if (!schemas.has(k)) {
                schemas.set(k, v);
            }
        }
        for (const [k, v] of other.exceptions) {
            if (!exceptions.has(k)) {
                exceptions.set(k, v);
            }
        }
    }
    register(shapeId, schema) {
        const qualifiedName = this.normalizeShapeId(shapeId);
        for (const r of [this, TypeRegistry.for(qualifiedName.split("#")[0])]) {
            r.schemas.set(qualifiedName, schema);
        }
    }
    getSchema(shapeId) {
        const id = this.normalizeShapeId(shapeId);
        if (!this.schemas.has(id)) {
            throw new Error(`@smithy/core/schema - schema not found for ${id}`);
        }
        return this.schemas.get(id);
    }
    registerError(es, ctor) {
        const $error = es;
        const ns = $error[1];
        for (const r of [this, TypeRegistry.for(ns)]) {
            r.schemas.set(ns + "#" + $error[2], $error);
            r.exceptions.set($error, ctor);
        }
    }
    getErrorCtor(es) {
        const $error = es;
        if (this.exceptions.has($error)) {
            return this.exceptions.get($error);
        }
        const registry = TypeRegistry.for($error[1]);
        return registry.exceptions.get($error);
    }
    getBaseException() {
        for (const exceptionKey of this.exceptions.keys()) {
            if (Array.isArray(exceptionKey)) {
                const [, ns, name] = exceptionKey;
                const id = ns + "#" + name;
                if (id.startsWith("smithy.ts.sdk.synthetic.") && id.endsWith("ServiceException")) {
                    return exceptionKey;
                }
            }
        }
        return undefined;
    }
    find(predicate) {
        return [...this.schemas.values()].find(predicate);
    }
    clear() {
        this.schemas.clear();
        this.exceptions.clear();
    }
    normalizeShapeId(shapeId) {
        if (shapeId.includes("#")) {
            return shapeId;
        }
        return this.namespace + "#" + shapeId;
    }
}

exports.ErrorSchema = ErrorSchema;
exports.ListSchema = ListSchema;
exports.MapSchema = MapSchema;
exports.NormalizedSchema = NormalizedSchema;
exports.OperationSchema = OperationSchema;
exports.SCHEMA = SCHEMA;
exports.Schema = Schema;
exports.SimpleSchema = SimpleSchema;
exports.StructureSchema = StructureSchema;
exports.TypeRegistry = TypeRegistry;
exports.deref = deref;
exports.deserializerMiddlewareOption = deserializerMiddlewareOption;
exports.error = error;
exports.getSchemaSerdePlugin = getSchemaSerdePlugin;
exports.isStaticSchema = isStaticSchema;
exports.list = list;
exports.map = map;
exports.op = op;
exports.operation = operation;
exports.serializerMiddlewareOption = serializerMiddlewareOption;
exports.sim = sim;
exports.simAdapter = simAdapter;
exports.simpleSchemaCacheN = simpleSchemaCacheN;
exports.simpleSchemaCacheS = simpleSchemaCacheS;
exports.struct = struct;
exports.traitsCache = traitsCache;
exports.translateTraits = translateTraits;


/***/ }),

/***/ 92430:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var uuid = __webpack_require__(90266);

const copyDocumentWithTransform = (source, schemaRef, transform = (_) => _) => source;

const parseBoolean = (value) => {
    switch (value) {
        case "true":
            return true;
        case "false":
            return false;
        default:
            throw new Error(`Unable to parse boolean value "${value}"`);
    }
};
const expectBoolean = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === "number") {
        if (value === 0 || value === 1) {
            logger.warn(stackTraceWarning(`Expected boolean, got ${typeof value}: ${value}`));
        }
        if (value === 0) {
            return false;
        }
        if (value === 1) {
            return true;
        }
    }
    if (typeof value === "string") {
        const lower = value.toLowerCase();
        if (lower === "false" || lower === "true") {
            logger.warn(stackTraceWarning(`Expected boolean, got ${typeof value}: ${value}`));
        }
        if (lower === "false") {
            return false;
        }
        if (lower === "true") {
            return true;
        }
    }
    if (typeof value === "boolean") {
        return value;
    }
    throw new TypeError(`Expected boolean, got ${typeof value}: ${value}`);
};
const expectNumber = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === "string") {
        const parsed = parseFloat(value);
        if (!Number.isNaN(parsed)) {
            if (String(parsed) !== String(value)) {
                logger.warn(stackTraceWarning(`Expected number but observed string: ${value}`));
            }
            return parsed;
        }
    }
    if (typeof value === "number") {
        return value;
    }
    throw new TypeError(`Expected number, got ${typeof value}: ${value}`);
};
const MAX_FLOAT = Math.ceil(2 ** 127 * (2 - 2 ** -23));
const expectFloat32 = (value) => {
    const expected = expectNumber(value);
    if (expected !== undefined && !Number.isNaN(expected) && expected !== Infinity && expected !== -Infinity) {
        if (Math.abs(expected) > MAX_FLOAT) {
            throw new TypeError(`Expected 32-bit float, got ${value}`);
        }
    }
    return expected;
};
const expectLong = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (Number.isInteger(value) && !Number.isNaN(value)) {
        return value;
    }
    throw new TypeError(`Expected integer, got ${typeof value}: ${value}`);
};
const expectInt = expectLong;
const expectInt32 = (value) => expectSizedInt(value, 32);
const expectShort = (value) => expectSizedInt(value, 16);
const expectByte = (value) => expectSizedInt(value, 8);
const expectSizedInt = (value, size) => {
    const expected = expectLong(value);
    if (expected !== undefined && castInt(expected, size) !== expected) {
        throw new TypeError(`Expected ${size}-bit integer, got ${value}`);
    }
    return expected;
};
const castInt = (value, size) => {
    switch (size) {
        case 32:
            return Int32Array.of(value)[0];
        case 16:
            return Int16Array.of(value)[0];
        case 8:
            return Int8Array.of(value)[0];
    }
};
const expectNonNull = (value, location) => {
    if (value === null || value === undefined) {
        if (location) {
            throw new TypeError(`Expected a non-null value for ${location}`);
        }
        throw new TypeError("Expected a non-null value");
    }
    return value;
};
const expectObject = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    const receivedType = Array.isArray(value) ? "array" : typeof value;
    throw new TypeError(`Expected object, got ${receivedType}: ${value}`);
};
const expectString = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === "string") {
        return value;
    }
    if (["boolean", "number", "bigint"].includes(typeof value)) {
        logger.warn(stackTraceWarning(`Expected string, got ${typeof value}: ${value}`));
        return String(value);
    }
    throw new TypeError(`Expected string, got ${typeof value}: ${value}`);
};
const expectUnion = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    const asObject = expectObject(value);
    const setKeys = Object.entries(asObject)
        .filter(([, v]) => v != null)
        .map(([k]) => k);
    if (setKeys.length === 0) {
        throw new TypeError(`Unions must have exactly one non-null member. None were found.`);
    }
    if (setKeys.length > 1) {
        throw new TypeError(`Unions must have exactly one non-null member. Keys ${setKeys} were not null.`);
    }
    return asObject;
};
const strictParseDouble = (value) => {
    if (typeof value == "string") {
        return expectNumber(parseNumber(value));
    }
    return expectNumber(value);
};
const strictParseFloat = strictParseDouble;
const strictParseFloat32 = (value) => {
    if (typeof value == "string") {
        return expectFloat32(parseNumber(value));
    }
    return expectFloat32(value);
};
const NUMBER_REGEX = /(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|(-?Infinity)|(NaN)/g;
const parseNumber = (value) => {
    const matches = value.match(NUMBER_REGEX);
    if (matches === null || matches[0].length !== value.length) {
        throw new TypeError(`Expected real number, got implicit NaN`);
    }
    return parseFloat(value);
};
const limitedParseDouble = (value) => {
    if (typeof value == "string") {
        return parseFloatString(value);
    }
    return expectNumber(value);
};
const handleFloat = limitedParseDouble;
const limitedParseFloat = limitedParseDouble;
const limitedParseFloat32 = (value) => {
    if (typeof value == "string") {
        return parseFloatString(value);
    }
    return expectFloat32(value);
};
const parseFloatString = (value) => {
    switch (value) {
        case "NaN":
            return NaN;
        case "Infinity":
            return Infinity;
        case "-Infinity":
            return -Infinity;
        default:
            throw new Error(`Unable to parse float value: ${value}`);
    }
};
const strictParseLong = (value) => {
    if (typeof value === "string") {
        return expectLong(parseNumber(value));
    }
    return expectLong(value);
};
const strictParseInt = strictParseLong;
const strictParseInt32 = (value) => {
    if (typeof value === "string") {
        return expectInt32(parseNumber(value));
    }
    return expectInt32(value);
};
const strictParseShort = (value) => {
    if (typeof value === "string") {
        return expectShort(parseNumber(value));
    }
    return expectShort(value);
};
const strictParseByte = (value) => {
    if (typeof value === "string") {
        return expectByte(parseNumber(value));
    }
    return expectByte(value);
};
const stackTraceWarning = (message) => {
    return String(new TypeError(message).stack || message)
        .split("\n")
        .slice(0, 5)
        .filter((s) => !s.includes("stackTraceWarning"))
        .join("\n");
};
const logger = {
    warn: console.warn,
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateToUtcString(date) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const dayOfWeek = date.getUTCDay();
    const dayOfMonthInt = date.getUTCDate();
    const hoursInt = date.getUTCHours();
    const minutesInt = date.getUTCMinutes();
    const secondsInt = date.getUTCSeconds();
    const dayOfMonthString = dayOfMonthInt < 10 ? `0${dayOfMonthInt}` : `${dayOfMonthInt}`;
    const hoursString = hoursInt < 10 ? `0${hoursInt}` : `${hoursInt}`;
    const minutesString = minutesInt < 10 ? `0${minutesInt}` : `${minutesInt}`;
    const secondsString = secondsInt < 10 ? `0${secondsInt}` : `${secondsInt}`;
    return `${DAYS[dayOfWeek]}, ${dayOfMonthString} ${MONTHS[month]} ${year} ${hoursString}:${minutesString}:${secondsString} GMT`;
}
const RFC3339 = new RegExp(/^(\d{4})-(\d{2})-(\d{2})[tT](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?[zZ]$/);
const parseRfc3339DateTime = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new TypeError("RFC-3339 date-times must be expressed as strings");
    }
    const match = RFC3339.exec(value);
    if (!match) {
        throw new TypeError("Invalid RFC-3339 date-time value");
    }
    const [_, yearStr, monthStr, dayStr, hours, minutes, seconds, fractionalMilliseconds] = match;
    const year = strictParseShort(stripLeadingZeroes(yearStr));
    const month = parseDateValue(monthStr, "month", 1, 12);
    const day = parseDateValue(dayStr, "day", 1, 31);
    return buildDate(year, month, day, { hours, minutes, seconds, fractionalMilliseconds });
};
const RFC3339_WITH_OFFSET$1 = new RegExp(/^(\d{4})-(\d{2})-(\d{2})[tT](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(([-+]\d{2}\:\d{2})|[zZ])$/);
const parseRfc3339DateTimeWithOffset = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new TypeError("RFC-3339 date-times must be expressed as strings");
    }
    const match = RFC3339_WITH_OFFSET$1.exec(value);
    if (!match) {
        throw new TypeError("Invalid RFC-3339 date-time value");
    }
    const [_, yearStr, monthStr, dayStr, hours, minutes, seconds, fractionalMilliseconds, offsetStr] = match;
    const year = strictParseShort(stripLeadingZeroes(yearStr));
    const month = parseDateValue(monthStr, "month", 1, 12);
    const day = parseDateValue(dayStr, "day", 1, 31);
    const date = buildDate(year, month, day, { hours, minutes, seconds, fractionalMilliseconds });
    if (offsetStr.toUpperCase() != "Z") {
        date.setTime(date.getTime() - parseOffsetToMilliseconds(offsetStr));
    }
    return date;
};
const IMF_FIXDATE$1 = new RegExp(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))? GMT$/);
const RFC_850_DATE$1 = new RegExp(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))? GMT$/);
const ASC_TIME$1 = new RegExp(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ( [1-9]|\d{2}) (\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))? (\d{4})$/);
const parseRfc7231DateTime = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new TypeError("RFC-7231 date-times must be expressed as strings");
    }
    let match = IMF_FIXDATE$1.exec(value);
    if (match) {
        const [_, dayStr, monthStr, yearStr, hours, minutes, seconds, fractionalMilliseconds] = match;
        return buildDate(strictParseShort(stripLeadingZeroes(yearStr)), parseMonthByShortName(monthStr), parseDateValue(dayStr, "day", 1, 31), { hours, minutes, seconds, fractionalMilliseconds });
    }
    match = RFC_850_DATE$1.exec(value);
    if (match) {
        const [_, dayStr, monthStr, yearStr, hours, minutes, seconds, fractionalMilliseconds] = match;
        return adjustRfc850Year(buildDate(parseTwoDigitYear(yearStr), parseMonthByShortName(monthStr), parseDateValue(dayStr, "day", 1, 31), {
            hours,
            minutes,
            seconds,
            fractionalMilliseconds,
        }));
    }
    match = ASC_TIME$1.exec(value);
    if (match) {
        const [_, monthStr, dayStr, hours, minutes, seconds, fractionalMilliseconds, yearStr] = match;
        return buildDate(strictParseShort(stripLeadingZeroes(yearStr)), parseMonthByShortName(monthStr), parseDateValue(dayStr.trimLeft(), "day", 1, 31), { hours, minutes, seconds, fractionalMilliseconds });
    }
    throw new TypeError("Invalid RFC-7231 date-time value");
};
const parseEpochTimestamp = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    let valueAsDouble;
    if (typeof value === "number") {
        valueAsDouble = value;
    }
    else if (typeof value === "string") {
        valueAsDouble = strictParseDouble(value);
    }
    else if (typeof value === "object" && value.tag === 1) {
        valueAsDouble = value.value;
    }
    else {
        throw new TypeError("Epoch timestamps must be expressed as floating point numbers or their string representation");
    }
    if (Number.isNaN(valueAsDouble) || valueAsDouble === Infinity || valueAsDouble === -Infinity) {
        throw new TypeError("Epoch timestamps must be valid, non-Infinite, non-NaN numerics");
    }
    return new Date(Math.round(valueAsDouble * 1000));
};
const buildDate = (year, month, day, time) => {
    const adjustedMonth = month - 1;
    validateDayOfMonth(year, adjustedMonth, day);
    return new Date(Date.UTC(year, adjustedMonth, day, parseDateValue(time.hours, "hour", 0, 23), parseDateValue(time.minutes, "minute", 0, 59), parseDateValue(time.seconds, "seconds", 0, 60), parseMilliseconds(time.fractionalMilliseconds)));
};
const parseTwoDigitYear = (value) => {
    const thisYear = new Date().getUTCFullYear();
    const valueInThisCentury = Math.floor(thisYear / 100) * 100 + strictParseShort(stripLeadingZeroes(value));
    if (valueInThisCentury < thisYear) {
        return valueInThisCentury + 100;
    }
    return valueInThisCentury;
};
const FIFTY_YEARS_IN_MILLIS = 50 * 365 * 24 * 60 * 60 * 1000;
const adjustRfc850Year = (input) => {
    if (input.getTime() - new Date().getTime() > FIFTY_YEARS_IN_MILLIS) {
        return new Date(Date.UTC(input.getUTCFullYear() - 100, input.getUTCMonth(), input.getUTCDate(), input.getUTCHours(), input.getUTCMinutes(), input.getUTCSeconds(), input.getUTCMilliseconds()));
    }
    return input;
};
const parseMonthByShortName = (value) => {
    const monthIdx = MONTHS.indexOf(value);
    if (monthIdx < 0) {
        throw new TypeError(`Invalid month: ${value}`);
    }
    return monthIdx + 1;
};
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const validateDayOfMonth = (year, month, day) => {
    let maxDays = DAYS_IN_MONTH[month];
    if (month === 1 && isLeapYear(year)) {
        maxDays = 29;
    }
    if (day > maxDays) {
        throw new TypeError(`Invalid day for ${MONTHS[month]} in ${year}: ${day}`);
    }
};
const isLeapYear = (year) => {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
};
const parseDateValue = (value, type, lower, upper) => {
    const dateVal = strictParseByte(stripLeadingZeroes(value));
    if (dateVal < lower || dateVal > upper) {
        throw new TypeError(`${type} must be between ${lower} and ${upper}, inclusive`);
    }
    return dateVal;
};
const parseMilliseconds = (value) => {
    if (value === null || value === undefined) {
        return 0;
    }
    return strictParseFloat32("0." + value) * 1000;
};
const parseOffsetToMilliseconds = (value) => {
    const directionStr = value[0];
    let direction = 1;
    if (directionStr == "+") {
        direction = 1;
    }
    else if (directionStr == "-") {
        direction = -1;
    }
    else {
        throw new TypeError(`Offset direction, ${directionStr}, must be "+" or "-"`);
    }
    const hour = Number(value.substring(1, 3));
    const minute = Number(value.substring(4, 6));
    return direction * (hour * 60 + minute) * 60 * 1000;
};
const stripLeadingZeroes = (value) => {
    let idx = 0;
    while (idx < value.length - 1 && value.charAt(idx) === "0") {
        idx++;
    }
    if (idx === 0) {
        return value;
    }
    return value.slice(idx);
};

const LazyJsonString = function LazyJsonString(val) {
    const str = Object.assign(new String(val), {
        deserializeJSON() {
            return JSON.parse(String(val));
        },
        toString() {
            return String(val);
        },
        toJSON() {
            return String(val);
        },
    });
    return str;
};
LazyJsonString.from = (object) => {
    if (object && typeof object === "object" && (object instanceof LazyJsonString || "deserializeJSON" in object)) {
        return object;
    }
    else if (typeof object === "string" || Object.getPrototypeOf(object) === String.prototype) {
        return LazyJsonString(String(object));
    }
    return LazyJsonString(JSON.stringify(object));
};
LazyJsonString.fromObject = LazyJsonString.from;

function quoteHeader(part) {
    if (part.includes(",") || part.includes('"')) {
        part = `"${part.replace(/"/g, '\\"')}"`;
    }
    return part;
}

const ddd = `(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:[ne|u?r]?s?day)?`;
const mmm = `(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)`;
const time = `(\\d?\\d):(\\d{2}):(\\d{2})(?:\\.(\\d+))?`;
const date = `(\\d?\\d)`;
const year = `(\\d{4})`;
const RFC3339_WITH_OFFSET = new RegExp(/^(\d{4})-(\d\d)-(\d\d)[tT](\d\d):(\d\d):(\d\d)(\.(\d+))?(([-+]\d\d:\d\d)|[zZ])$/);
const IMF_FIXDATE = new RegExp(`^${ddd}, ${date} ${mmm} ${year} ${time} GMT$`);
const RFC_850_DATE = new RegExp(`^${ddd}, ${date}-${mmm}-(\\d\\d) ${time} GMT$`);
const ASC_TIME = new RegExp(`^${ddd} ${mmm} ( [1-9]|\\d\\d) ${time} ${year}$`);
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const _parseEpochTimestamp = (value) => {
    if (value == null) {
        return void 0;
    }
    let num = NaN;
    if (typeof value === "number") {
        num = value;
    }
    else if (typeof value === "string") {
        if (!/^-?\d*\.?\d+$/.test(value)) {
            throw new TypeError(`parseEpochTimestamp - numeric string invalid.`);
        }
        num = Number.parseFloat(value);
    }
    else if (typeof value === "object" && value.tag === 1) {
        num = value.value;
    }
    if (isNaN(num) || Math.abs(num) === Infinity) {
        throw new TypeError("Epoch timestamps must be valid finite numbers.");
    }
    return new Date(Math.round(num * 1000));
};
const _parseRfc3339DateTimeWithOffset = (value) => {
    if (value == null) {
        return void 0;
    }
    if (typeof value !== "string") {
        throw new TypeError("RFC3339 timestamps must be strings");
    }
    const matches = RFC3339_WITH_OFFSET.exec(value);
    if (!matches) {
        throw new TypeError(`Invalid RFC3339 timestamp format ${value}`);
    }
    const [, yearStr, monthStr, dayStr, hours, minutes, seconds, , ms, offsetStr] = matches;
    range(monthStr, 1, 12);
    range(dayStr, 1, 31);
    range(hours, 0, 23);
    range(minutes, 0, 59);
    range(seconds, 0, 60);
    const date = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr), Number(hours), Number(minutes), Number(seconds), Number(ms) ? Math.round(parseFloat(`0.${ms}`) * 1000) : 0));
    date.setUTCFullYear(Number(yearStr));
    if (offsetStr.toUpperCase() != "Z") {
        const [, sign, offsetH, offsetM] = /([+-])(\d\d):(\d\d)/.exec(offsetStr) || [void 0, "+", 0, 0];
        const scalar = sign === "-" ? 1 : -1;
        date.setTime(date.getTime() + scalar * (Number(offsetH) * 60 * 60 * 1000 + Number(offsetM) * 60 * 1000));
    }
    return date;
};
const _parseRfc7231DateTime = (value) => {
    if (value == null) {
        return void 0;
    }
    if (typeof value !== "string") {
        throw new TypeError("RFC7231 timestamps must be strings.");
    }
    let day;
    let month;
    let year;
    let hour;
    let minute;
    let second;
    let fraction;
    let matches;
    if ((matches = IMF_FIXDATE.exec(value))) {
        [, day, month, year, hour, minute, second, fraction] = matches;
    }
    else if ((matches = RFC_850_DATE.exec(value))) {
        [, day, month, year, hour, minute, second, fraction] = matches;
        year = (Number(year) + 1900).toString();
    }
    else if ((matches = ASC_TIME.exec(value))) {
        [, month, day, hour, minute, second, fraction, year] = matches;
    }
    if (year && second) {
        const timestamp = Date.UTC(Number(year), months.indexOf(month), Number(day), Number(hour), Number(minute), Number(second), fraction ? Math.round(parseFloat(`0.${fraction}`) * 1000) : 0);
        range(day, 1, 31);
        range(hour, 0, 23);
        range(minute, 0, 59);
        range(second, 0, 60);
        const date = new Date(timestamp);
        date.setUTCFullYear(Number(year));
        return date;
    }
    throw new TypeError(`Invalid RFC7231 date-time value ${value}.`);
};
function range(v, min, max) {
    const _v = Number(v);
    if (_v < min || _v > max) {
        throw new Error(`Value ${_v} out of range [${min}, ${max}]`);
    }
}

function splitEvery(value, delimiter, numDelimiters) {
    if (numDelimiters <= 0 || !Number.isInteger(numDelimiters)) {
        throw new Error("Invalid number of delimiters (" + numDelimiters + ") for splitEvery.");
    }
    const segments = value.split(delimiter);
    if (numDelimiters === 1) {
        return segments;
    }
    const compoundSegments = [];
    let currentSegment = "";
    for (let i = 0; i < segments.length; i++) {
        if (currentSegment === "") {
            currentSegment = segments[i];
        }
        else {
            currentSegment += delimiter + segments[i];
        }
        if ((i + 1) % numDelimiters === 0) {
            compoundSegments.push(currentSegment);
            currentSegment = "";
        }
    }
    if (currentSegment !== "") {
        compoundSegments.push(currentSegment);
    }
    return compoundSegments;
}

const splitHeader = (value) => {
    const z = value.length;
    const values = [];
    let withinQuotes = false;
    let prevChar = undefined;
    let anchor = 0;
    for (let i = 0; i < z; ++i) {
        const char = value[i];
        switch (char) {
            case `"`:
                if (prevChar !== "\\") {
                    withinQuotes = !withinQuotes;
                }
                break;
            case ",":
                if (!withinQuotes) {
                    values.push(value.slice(anchor, i));
                    anchor = i + 1;
                }
                break;
        }
        prevChar = char;
    }
    values.push(value.slice(anchor));
    return values.map((v) => {
        v = v.trim();
        const z = v.length;
        if (z < 2) {
            return v;
        }
        if (v[0] === `"` && v[z - 1] === `"`) {
            v = v.slice(1, z - 1);
        }
        return v.replace(/\\"/g, '"');
    });
};

const format = /^-?\d*(\.\d+)?$/;
class NumericValue {
    string;
    type;
    constructor(string, type) {
        this.string = string;
        this.type = type;
        if (!format.test(string)) {
            throw new Error(`@smithy/core/serde - NumericValue must only contain [0-9], at most one decimal point ".", and an optional negation prefix "-".`);
        }
    }
    toString() {
        return this.string;
    }
    static [Symbol.hasInstance](object) {
        if (!object || typeof object !== "object") {
            return false;
        }
        const _nv = object;
        return NumericValue.prototype.isPrototypeOf(object) || (_nv.type === "bigDecimal" && format.test(_nv.string));
    }
}
function nv(input) {
    return new NumericValue(String(input), "bigDecimal");
}

exports.generateIdempotencyToken = uuid.v4;
exports.LazyJsonString = LazyJsonString;
exports.NumericValue = NumericValue;
exports._parseEpochTimestamp = _parseEpochTimestamp;
exports._parseRfc3339DateTimeWithOffset = _parseRfc3339DateTimeWithOffset;
exports._parseRfc7231DateTime = _parseRfc7231DateTime;
exports.copyDocumentWithTransform = copyDocumentWithTransform;
exports.dateToUtcString = dateToUtcString;
exports.expectBoolean = expectBoolean;
exports.expectByte = expectByte;
exports.expectFloat32 = expectFloat32;
exports.expectInt = expectInt;
exports.expectInt32 = expectInt32;
exports.expectLong = expectLong;
exports.expectNonNull = expectNonNull;
exports.expectNumber = expectNumber;
exports.expectObject = expectObject;
exports.expectShort = expectShort;
exports.expectString = expectString;
exports.expectUnion = expectUnion;
exports.handleFloat = handleFloat;
exports.limitedParseDouble = limitedParseDouble;
exports.limitedParseFloat = limitedParseFloat;
exports.limitedParseFloat32 = limitedParseFloat32;
exports.logger = logger;
exports.nv = nv;
exports.parseBoolean = parseBoolean;
exports.parseEpochTimestamp = parseEpochTimestamp;
exports.parseRfc3339DateTime = parseRfc3339DateTime;
exports.parseRfc3339DateTimeWithOffset = parseRfc3339DateTimeWithOffset;
exports.parseRfc7231DateTime = parseRfc7231DateTime;
exports.quoteHeader = quoteHeader;
exports.splitEvery = splitEvery;
exports.splitHeader = splitHeader;
exports.strictParseByte = strictParseByte;
exports.strictParseDouble = strictParseDouble;
exports.strictParseFloat = strictParseFloat;
exports.strictParseFloat32 = strictParseFloat32;
exports.strictParseInt = strictParseInt;
exports.strictParseInt32 = strictParseInt32;
exports.strictParseLong = strictParseLong;
exports.strictParseShort = strictParseShort;


/***/ }),

/***/ 47809:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var protocolHttp = __webpack_require__(72356);
var querystringBuilder = __webpack_require__(18256);
var utilBase64 = __webpack_require__(68385);

function createRequest(url, requestOptions) {
    return new Request(url, requestOptions);
}

function requestTimeout(timeoutInMs = 0) {
    return new Promise((resolve, reject) => {
        if (timeoutInMs) {
            setTimeout(() => {
                const timeoutError = new Error(`Request did not complete within ${timeoutInMs} ms`);
                timeoutError.name = "TimeoutError";
                reject(timeoutError);
            }, timeoutInMs);
        }
    });
}

const keepAliveSupport = {
    supported: undefined,
};
class FetchHttpHandler {
    config;
    configProvider;
    static create(instanceOrOptions) {
        if (typeof instanceOrOptions?.handle === "function") {
            return instanceOrOptions;
        }
        return new FetchHttpHandler(instanceOrOptions);
    }
    constructor(options) {
        if (typeof options === "function") {
            this.configProvider = options().then((opts) => opts || {});
        }
        else {
            this.config = options ?? {};
            this.configProvider = Promise.resolve(this.config);
        }
        if (keepAliveSupport.supported === undefined) {
            keepAliveSupport.supported = Boolean(typeof Request !== "undefined" && "keepalive" in createRequest("https://[::1]"));
        }
    }
    destroy() {
    }
    async handle(request, { abortSignal, requestTimeout: requestTimeout$1 } = {}) {
        if (!this.config) {
            this.config = await this.configProvider;
        }
        const requestTimeoutInMs = requestTimeout$1 ?? this.config.requestTimeout;
        const keepAlive = this.config.keepAlive === true;
        const credentials = this.config.credentials;
        if (abortSignal?.aborted) {
            const abortError = buildAbortError(abortSignal);
            return Promise.reject(abortError);
        }
        let path = request.path;
        const queryString = querystringBuilder.buildQueryString(request.query || {});
        if (queryString) {
            path += `?${queryString}`;
        }
        if (request.fragment) {
            path += `#${request.fragment}`;
        }
        let auth = "";
        if (request.username != null || request.password != null) {
            const username = request.username ?? "";
            const password = request.password ?? "";
            auth = `${username}:${password}@`;
        }
        const { port, method } = request;
        const url = `${request.protocol}//${auth}${request.hostname}${port ? `:${port}` : ""}${path}`;
        const body = method === "GET" || method === "HEAD" ? undefined : request.body;
        const requestOptions = {
            body,
            headers: new Headers(request.headers),
            method: method,
            credentials,
        };
        if (this.config?.cache) {
            requestOptions.cache = this.config.cache;
        }
        if (body) {
            requestOptions.duplex = "half";
        }
        if (typeof AbortController !== "undefined") {
            requestOptions.signal = abortSignal;
        }
        if (keepAliveSupport.supported) {
            requestOptions.keepalive = keepAlive;
        }
        if (typeof this.config.requestInit === "function") {
            Object.assign(requestOptions, this.config.requestInit(request));
        }
        let removeSignalEventListener = () => { };
        const fetchRequest = createRequest(url, requestOptions);
        const raceOfPromises = [
            fetch(fetchRequest).then((response) => {
                const fetchHeaders = response.headers;
                const transformedHeaders = {};
                for (const pair of fetchHeaders.entries()) {
                    transformedHeaders[pair[0]] = pair[1];
                }
                const hasReadableStream = response.body != undefined;
                if (!hasReadableStream) {
                    return response.blob().then((body) => ({
                        response: new protocolHttp.HttpResponse({
                            headers: transformedHeaders,
                            reason: response.statusText,
                            statusCode: response.status,
                            body,
                        }),
                    }));
                }
                return {
                    response: new protocolHttp.HttpResponse({
                        headers: transformedHeaders,
                        reason: response.statusText,
                        statusCode: response.status,
                        body: response.body,
                    }),
                };
            }),
            requestTimeout(requestTimeoutInMs),
        ];
        if (abortSignal) {
            raceOfPromises.push(new Promise((resolve, reject) => {
                const onAbort = () => {
                    const abortError = buildAbortError(abortSignal);
                    reject(abortError);
                };
                if (typeof abortSignal.addEventListener === "function") {
                    const signal = abortSignal;
                    signal.addEventListener("abort", onAbort, { once: true });
                    removeSignalEventListener = () => signal.removeEventListener("abort", onAbort);
                }
                else {
                    abortSignal.onabort = onAbort;
                }
            }));
        }
        return Promise.race(raceOfPromises).finally(removeSignalEventListener);
    }
    updateHttpClientConfig(key, value) {
        this.config = undefined;
        this.configProvider = this.configProvider.then((config) => {
            config[key] = value;
            return config;
        });
    }
    httpHandlerConfigs() {
        return this.config ?? {};
    }
}
function buildAbortError(abortSignal) {
    const reason = abortSignal && typeof abortSignal === "object" && "reason" in abortSignal
        ? abortSignal.reason
        : undefined;
    if (reason) {
        if (reason instanceof Error) {
            const abortError = new Error("Request aborted");
            abortError.name = "AbortError";
            abortError.cause = reason;
            return abortError;
        }
        const abortError = new Error(String(reason));
        abortError.name = "AbortError";
        return abortError;
    }
    const abortError = new Error("Request aborted");
    abortError.name = "AbortError";
    return abortError;
}

const streamCollector = async (stream) => {
    if ((typeof Blob === "function" && stream instanceof Blob) || stream.constructor?.name === "Blob") {
        if (Blob.prototype.arrayBuffer !== undefined) {
            return new Uint8Array(await stream.arrayBuffer());
        }
        return collectBlob(stream);
    }
    return collectStream(stream);
};
async function collectBlob(blob) {
    const base64 = await readToBase64(blob);
    const arrayBuffer = utilBase64.fromBase64(base64);
    return new Uint8Array(arrayBuffer);
}
async function collectStream(stream) {
    const chunks = [];
    const reader = stream.getReader();
    let isDone = false;
    let length = 0;
    while (!isDone) {
        const { done, value } = await reader.read();
        if (value) {
            chunks.push(value);
            length += value.length;
        }
        isDone = done;
    }
    const collected = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        collected.set(chunk, offset);
        offset += chunk.length;
    }
    return collected;
}
function readToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.readyState !== 2) {
                return reject(new Error("Reader aborted too early"));
            }
            const result = (reader.result ?? "");
            const commaIndex = result.indexOf(",");
            const dataOffset = commaIndex > -1 ? commaIndex + 1 : result.length;
            resolve(result.substring(dataOffset));
        };
        reader.onabort = () => reject(new Error("Read aborted"));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

exports.FetchHttpHandler = FetchHttpHandler;
exports.keepAliveSupport = keepAliveSupport;
exports.streamCollector = streamCollector;


/***/ }),

/***/ 5092:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var utilBufferFrom = __webpack_require__(44151);
var utilUtf8 = __webpack_require__(71577);
var buffer = __webpack_require__(20181);
var crypto = __webpack_require__(76982);

class Hash {
    algorithmIdentifier;
    secret;
    hash;
    constructor(algorithmIdentifier, secret) {
        this.algorithmIdentifier = algorithmIdentifier;
        this.secret = secret;
        this.reset();
    }
    update(toHash, encoding) {
        this.hash.update(utilUtf8.toUint8Array(castSourceData(toHash, encoding)));
    }
    digest() {
        return Promise.resolve(this.hash.digest());
    }
    reset() {
        this.hash = this.secret
            ? crypto.createHmac(this.algorithmIdentifier, castSourceData(this.secret))
            : crypto.createHash(this.algorithmIdentifier);
    }
}
function castSourceData(toCast, encoding) {
    if (buffer.Buffer.isBuffer(toCast)) {
        return toCast;
    }
    if (typeof toCast === "string") {
        return utilBufferFrom.fromString(toCast, encoding);
    }
    if (ArrayBuffer.isView(toCast)) {
        return utilBufferFrom.fromArrayBuffer(toCast.buffer, toCast.byteOffset, toCast.byteLength);
    }
    return utilBufferFrom.fromArrayBuffer(toCast);
}

exports.Hash = Hash;


/***/ }),

/***/ 86130:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


const isArrayBuffer = (arg) => (typeof ArrayBuffer === "function" && arg instanceof ArrayBuffer) ||
    Object.prototype.toString.call(arg) === "[object ArrayBuffer]";

exports.isArrayBuffer = isArrayBuffer;


/***/ }),

/***/ 47212:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var protocolHttp = __webpack_require__(72356);

const CONTENT_LENGTH_HEADER = "content-length";
function contentLengthMiddleware(bodyLengthChecker) {
    return (next) => async (args) => {
        const request = args.request;
        if (protocolHttp.HttpRequest.isInstance(request)) {
            const { body, headers } = request;
            if (body &&
                Object.keys(headers)
                    .map((str) => str.toLowerCase())
                    .indexOf(CONTENT_LENGTH_HEADER) === -1) {
                try {
                    const length = bodyLengthChecker(body);
                    request.headers = {
                        ...request.headers,
                        [CONTENT_LENGTH_HEADER]: String(length),
                    };
                }
                catch (error) {
                }
            }
        }
        return next({
            ...args,
            request,
        });
    };
}
const contentLengthMiddlewareOptions = {
    step: "build",
    tags: ["SET_CONTENT_LENGTH", "CONTENT_LENGTH"],
    name: "contentLengthMiddleware",
    override: true,
};
const getContentLengthPlugin = (options) => ({
    applyToStack: (clientStack) => {
        clientStack.add(contentLengthMiddleware(options.bodyLengthChecker), contentLengthMiddlewareOptions);
    },
});

exports.contentLengthMiddleware = contentLengthMiddleware;
exports.contentLengthMiddlewareOptions = contentLengthMiddlewareOptions;
exports.getContentLengthPlugin = getContentLengthPlugin;


/***/ }),

/***/ 76041:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getEndpointFromConfig = void 0;
const node_config_provider_1 = __webpack_require__(55704);
const getEndpointUrlConfig_1 = __webpack_require__(18008);
const getEndpointFromConfig = async (serviceId) => (0, node_config_provider_1.loadConfig)((0, getEndpointUrlConfig_1.getEndpointUrlConfig)(serviceId ?? ""))();
exports.getEndpointFromConfig = getEndpointFromConfig;


/***/ }),

/***/ 18008:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getEndpointUrlConfig = void 0;
const shared_ini_file_loader_1 = __webpack_require__(94964);
const ENV_ENDPOINT_URL = "AWS_ENDPOINT_URL";
const CONFIG_ENDPOINT_URL = "endpoint_url";
const getEndpointUrlConfig = (serviceId) => ({
    environmentVariableSelector: (env) => {
        const serviceSuffixParts = serviceId.split(" ").map((w) => w.toUpperCase());
        const serviceEndpointUrl = env[[ENV_ENDPOINT_URL, ...serviceSuffixParts].join("_")];
        if (serviceEndpointUrl)
            return serviceEndpointUrl;
        const endpointUrl = env[ENV_ENDPOINT_URL];
        if (endpointUrl)
            return endpointUrl;
        return undefined;
    },
    configFileSelector: (profile, config) => {
        if (config && profile.services) {
            const servicesSection = config[["services", profile.services].join(shared_ini_file_loader_1.CONFIG_PREFIX_SEPARATOR)];
            if (servicesSection) {
                const servicePrefixParts = serviceId.split(" ").map((w) => w.toLowerCase());
                const endpointUrl = servicesSection[[servicePrefixParts.join("_"), CONFIG_ENDPOINT_URL].join(shared_ini_file_loader_1.CONFIG_PREFIX_SEPARATOR)];
                if (endpointUrl)
                    return endpointUrl;
            }
        }
        const endpointUrl = profile[CONFIG_ENDPOINT_URL];
        if (endpointUrl)
            return endpointUrl;
        return undefined;
    },
    default: undefined,
});
exports.getEndpointUrlConfig = getEndpointUrlConfig;


/***/ }),

/***/ 40099:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var core = __webpack_require__(90402);
var utilMiddleware = __webpack_require__(76324);
var getEndpointFromConfig = __webpack_require__(76041);
var urlParser = __webpack_require__(14494);
var middlewareSerde = __webpack_require__(83255);

const resolveParamsForS3 = async (endpointParams) => {
    const bucket = endpointParams?.Bucket || "";
    if (typeof endpointParams.Bucket === "string") {
        endpointParams.Bucket = bucket.replace(/#/g, encodeURIComponent("#")).replace(/\?/g, encodeURIComponent("?"));
    }
    if (isArnBucketName(bucket)) {
        if (endpointParams.ForcePathStyle === true) {
            throw new Error("Path-style addressing cannot be used with ARN buckets");
        }
    }
    else if (!isDnsCompatibleBucketName(bucket) ||
        (bucket.indexOf(".") !== -1 && !String(endpointParams.Endpoint).startsWith("http:")) ||
        bucket.toLowerCase() !== bucket ||
        bucket.length < 3) {
        endpointParams.ForcePathStyle = true;
    }
    if (endpointParams.DisableMultiRegionAccessPoints) {
        endpointParams.disableMultiRegionAccessPoints = true;
        endpointParams.DisableMRAP = true;
    }
    return endpointParams;
};
const DOMAIN_PATTERN = /^[a-z0-9][a-z0-9\.\-]{1,61}[a-z0-9]$/;
const IP_ADDRESS_PATTERN = /(\d+\.){3}\d+/;
const DOTS_PATTERN = /\.\./;
const isDnsCompatibleBucketName = (bucketName) => DOMAIN_PATTERN.test(bucketName) && !IP_ADDRESS_PATTERN.test(bucketName) && !DOTS_PATTERN.test(bucketName);
const isArnBucketName = (bucketName) => {
    const [arn, partition, service, , , bucket] = bucketName.split(":");
    const isArn = arn === "arn" && bucketName.split(":").length >= 6;
    const isValidArn = Boolean(isArn && partition && service && bucket);
    if (isArn && !isValidArn) {
        throw new Error(`Invalid ARN: ${bucketName} was an invalid ARN.`);
    }
    return isValidArn;
};

const createConfigValueProvider = (configKey, canonicalEndpointParamKey, config, isClientContextParam = false) => {
    const configProvider = async () => {
        let configValue;
        if (isClientContextParam) {
            const clientContextParams = config.clientContextParams;
            const nestedValue = clientContextParams?.[configKey];
            configValue = nestedValue ?? config[configKey] ?? config[canonicalEndpointParamKey];
        }
        else {
            configValue = config[configKey] ?? config[canonicalEndpointParamKey];
        }
        if (typeof configValue === "function") {
            return configValue();
        }
        return configValue;
    };
    if (configKey === "credentialScope" || canonicalEndpointParamKey === "CredentialScope") {
        return async () => {
            const credentials = typeof config.credentials === "function" ? await config.credentials() : config.credentials;
            const configValue = credentials?.credentialScope ?? credentials?.CredentialScope;
            return configValue;
        };
    }
    if (configKey === "accountId" || canonicalEndpointParamKey === "AccountId") {
        return async () => {
            const credentials = typeof config.credentials === "function" ? await config.credentials() : config.credentials;
            const configValue = credentials?.accountId ?? credentials?.AccountId;
            return configValue;
        };
    }
    if (configKey === "endpoint" || canonicalEndpointParamKey === "endpoint") {
        return async () => {
            if (config.isCustomEndpoint === false) {
                return undefined;
            }
            const endpoint = await configProvider();
            if (endpoint && typeof endpoint === "object") {
                if ("url" in endpoint) {
                    return endpoint.url.href;
                }
                if ("hostname" in endpoint) {
                    const { protocol, hostname, port, path } = endpoint;
                    return `${protocol}//${hostname}${port ? ":" + port : ""}${path}`;
                }
            }
            return endpoint;
        };
    }
    return configProvider;
};

const toEndpointV1 = (endpoint) => {
    if (typeof endpoint === "object") {
        if ("url" in endpoint) {
            const v1Endpoint = urlParser.parseUrl(endpoint.url);
            if (endpoint.headers) {
                v1Endpoint.headers = {};
                for (const [name, values] of Object.entries(endpoint.headers)) {
                    v1Endpoint.headers[name.toLowerCase()] = values.join(", ");
                }
            }
            return v1Endpoint;
        }
        return endpoint;
    }
    return urlParser.parseUrl(endpoint);
};

const getEndpointFromInstructions = async (commandInput, instructionsSupplier, clientConfig, context) => {
    if (!clientConfig.isCustomEndpoint) {
        let endpointFromConfig;
        if (clientConfig.serviceConfiguredEndpoint) {
            endpointFromConfig = await clientConfig.serviceConfiguredEndpoint();
        }
        else {
            endpointFromConfig = await getEndpointFromConfig.getEndpointFromConfig(clientConfig.serviceId);
        }
        if (endpointFromConfig) {
            clientConfig.endpoint = () => Promise.resolve(toEndpointV1(endpointFromConfig));
            clientConfig.isCustomEndpoint = true;
        }
    }
    const endpointParams = await resolveParams(commandInput, instructionsSupplier, clientConfig);
    if (typeof clientConfig.endpointProvider !== "function") {
        throw new Error("config.endpointProvider is not set.");
    }
    const endpoint = clientConfig.endpointProvider(endpointParams, context);
    if (clientConfig.isCustomEndpoint && clientConfig.endpoint) {
        const customEndpoint = await clientConfig.endpoint();
        if (customEndpoint?.headers) {
            endpoint.headers ??= {};
            for (const [name, value] of Object.entries(customEndpoint.headers)) {
                endpoint.headers[name] = Array.isArray(value) ? value : [value];
            }
        }
    }
    return endpoint;
};
const resolveParams = async (commandInput, instructionsSupplier, clientConfig) => {
    const endpointParams = {};
    const instructions = instructionsSupplier?.getEndpointParameterInstructions?.() || {};
    for (const [name, instruction] of Object.entries(instructions)) {
        switch (instruction.type) {
            case "staticContextParams":
                endpointParams[name] = instruction.value;
                break;
            case "contextParams":
                endpointParams[name] = commandInput[instruction.name];
                break;
            case "clientContextParams":
            case "builtInParams":
                endpointParams[name] = await createConfigValueProvider(instruction.name, name, clientConfig, instruction.type !== "builtInParams")();
                break;
            case "operationContextParams":
                endpointParams[name] = instruction.get(commandInput);
                break;
            default:
                throw new Error("Unrecognized endpoint parameter instruction: " + JSON.stringify(instruction));
        }
    }
    if (Object.keys(instructions).length === 0) {
        Object.assign(endpointParams, clientConfig);
    }
    if (String(clientConfig.serviceId).toLowerCase() === "s3") {
        await resolveParamsForS3(endpointParams);
    }
    return endpointParams;
};

const endpointMiddleware = ({ config, instructions, }) => {
    return (next, context) => async (args) => {
        if (config.isCustomEndpoint) {
            core.setFeature(context, "ENDPOINT_OVERRIDE", "N");
        }
        const endpoint = await getEndpointFromInstructions(args.input, {
            getEndpointParameterInstructions() {
                return instructions;
            },
        }, { ...config }, context);
        context.endpointV2 = endpoint;
        context.authSchemes = endpoint.properties?.authSchemes;
        const authScheme = context.authSchemes?.[0];
        if (authScheme) {
            context["signing_region"] = authScheme.signingRegion;
            context["signing_service"] = authScheme.signingName;
            const smithyContext = utilMiddleware.getSmithyContext(context);
            const httpAuthOption = smithyContext?.selectedHttpAuthScheme?.httpAuthOption;
            if (httpAuthOption) {
                httpAuthOption.signingProperties = Object.assign(httpAuthOption.signingProperties || {}, {
                    signing_region: authScheme.signingRegion,
                    signingRegion: authScheme.signingRegion,
                    signing_service: authScheme.signingName,
                    signingName: authScheme.signingName,
                    signingRegionSet: authScheme.signingRegionSet,
                }, authScheme.properties);
            }
        }
        return next({
            ...args,
        });
    };
};

const endpointMiddlewareOptions = {
    step: "serialize",
    tags: ["ENDPOINT_PARAMETERS", "ENDPOINT_V2", "ENDPOINT"],
    name: "endpointV2Middleware",
    override: true,
    relation: "before",
    toMiddleware: middlewareSerde.serializerMiddlewareOption.name,
};
const getEndpointPlugin = (config, instructions) => ({
    applyToStack: (clientStack) => {
        clientStack.addRelativeTo(endpointMiddleware({
            config,
            instructions,
        }), endpointMiddlewareOptions);
    },
});

const resolveEndpointConfig = (input) => {
    const tls = input.tls ?? true;
    const { endpoint, useDualstackEndpoint, useFipsEndpoint } = input;
    const customEndpointProvider = endpoint != null ? async () => toEndpointV1(await utilMiddleware.normalizeProvider(endpoint)()) : undefined;
    const isCustomEndpoint = !!endpoint;
    const resolvedConfig = Object.assign(input, {
        endpoint: customEndpointProvider,
        tls,
        isCustomEndpoint,
        useDualstackEndpoint: utilMiddleware.normalizeProvider(useDualstackEndpoint ?? false),
        useFipsEndpoint: utilMiddleware.normalizeProvider(useFipsEndpoint ?? false),
    });
    let configuredEndpointPromise = undefined;
    resolvedConfig.serviceConfiguredEndpoint = async () => {
        if (input.serviceId && !configuredEndpointPromise) {
            configuredEndpointPromise = getEndpointFromConfig.getEndpointFromConfig(input.serviceId);
        }
        return configuredEndpointPromise;
    };
    return resolvedConfig;
};

const resolveEndpointRequiredConfig = (input) => {
    const { endpoint } = input;
    if (endpoint === undefined) {
        input.endpoint = async () => {
            throw new Error("@smithy/middleware-endpoint: (default endpointRuleSet) endpoint is not set - you must configure an endpoint.");
        };
    }
    return input;
};

exports.endpointMiddleware = endpointMiddleware;
exports.endpointMiddlewareOptions = endpointMiddlewareOptions;
exports.getEndpointFromInstructions = getEndpointFromInstructions;
exports.getEndpointPlugin = getEndpointPlugin;
exports.resolveEndpointConfig = resolveEndpointConfig;
exports.resolveEndpointRequiredConfig = resolveEndpointRequiredConfig;
exports.resolveParams = resolveParams;
exports.toEndpointV1 = toEndpointV1;


/***/ }),

/***/ 19618:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var utilRetry = __webpack_require__(15518);
var protocolHttp = __webpack_require__(72356);
var serviceErrorClassification = __webpack_require__(42058);
var uuid = __webpack_require__(90266);
var utilMiddleware = __webpack_require__(76324);
var smithyClient = __webpack_require__(61411);
var isStreamingPayload = __webpack_require__(49831);
var serde = __webpack_require__(92430);

const asSdkError = (error) => {
    if (error instanceof Error)
        return error;
    if (error instanceof Object)
        return Object.assign(new Error(), error);
    if (typeof error === "string")
        return new Error(error);
    return new Error(`AWS SDK error wrapper for ${error}`);
};

const getDefaultRetryQuota = (initialRetryTokens, options) => {
    const MAX_CAPACITY = initialRetryTokens;
    const noRetryIncrement = utilRetry.NO_RETRY_INCREMENT;
    const retryCost = utilRetry.RETRY_COST;
    const timeoutRetryCost = utilRetry.TIMEOUT_RETRY_COST;
    let availableCapacity = initialRetryTokens;
    const getCapacityAmount = (error) => (error.name === "TimeoutError" ? timeoutRetryCost : retryCost);
    const hasRetryTokens = (error) => getCapacityAmount(error) <= availableCapacity;
    const retrieveRetryTokens = (error) => {
        if (!hasRetryTokens(error)) {
            throw new Error("No retry token available");
        }
        const capacityAmount = getCapacityAmount(error);
        availableCapacity -= capacityAmount;
        return capacityAmount;
    };
    const releaseRetryTokens = (capacityReleaseAmount) => {
        availableCapacity += capacityReleaseAmount ?? noRetryIncrement;
        availableCapacity = Math.min(availableCapacity, MAX_CAPACITY);
    };
    return Object.freeze({
        hasRetryTokens,
        retrieveRetryTokens,
        releaseRetryTokens,
    });
};

const defaultDelayDecider = (delayBase, attempts) => Math.floor(Math.min(utilRetry.MAXIMUM_RETRY_DELAY, Math.random() * 2 ** attempts * delayBase));

const defaultRetryDecider = (error) => {
    if (!error) {
        return false;
    }
    return serviceErrorClassification.isRetryableByTrait(error) || serviceErrorClassification.isClockSkewError(error) || serviceErrorClassification.isThrottlingError(error) || serviceErrorClassification.isTransientError(error);
};

class StandardRetryStrategy {
    maxAttemptsProvider;
    retryDecider;
    delayDecider;
    retryQuota;
    mode = utilRetry.RETRY_MODES.STANDARD;
    constructor(maxAttemptsProvider, options) {
        this.maxAttemptsProvider = maxAttemptsProvider;
        this.retryDecider = options?.retryDecider ?? defaultRetryDecider;
        this.delayDecider = options?.delayDecider ?? defaultDelayDecider;
        this.retryQuota = options?.retryQuota ?? getDefaultRetryQuota(utilRetry.INITIAL_RETRY_TOKENS);
    }
    shouldRetry(error, attempts, maxAttempts) {
        return attempts < maxAttempts && this.retryDecider(error) && this.retryQuota.hasRetryTokens(error);
    }
    async getMaxAttempts() {
        let maxAttempts;
        try {
            maxAttempts = await this.maxAttemptsProvider();
        }
        catch (error) {
            maxAttempts = utilRetry.DEFAULT_MAX_ATTEMPTS;
        }
        return maxAttempts;
    }
    async retry(next, args, options) {
        let retryTokenAmount;
        let attempts = 0;
        let totalDelay = 0;
        const maxAttempts = await this.getMaxAttempts();
        const { request } = args;
        if (protocolHttp.HttpRequest.isInstance(request)) {
            request.headers[utilRetry.INVOCATION_ID_HEADER] = uuid.v4();
        }
        while (true) {
            try {
                if (protocolHttp.HttpRequest.isInstance(request)) {
                    request.headers[utilRetry.REQUEST_HEADER] = `attempt=${attempts + 1}; max=${maxAttempts}`;
                }
                if (options?.beforeRequest) {
                    await options.beforeRequest();
                }
                const { response, output } = await next(args);
                if (options?.afterRequest) {
                    options.afterRequest(response);
                }
                this.retryQuota.releaseRetryTokens(retryTokenAmount);
                output.$metadata.attempts = attempts + 1;
                output.$metadata.totalRetryDelay = totalDelay;
                return { response, output };
            }
            catch (e) {
                const err = asSdkError(e);
                attempts++;
                if (this.shouldRetry(err, attempts, maxAttempts)) {
                    retryTokenAmount = this.retryQuota.retrieveRetryTokens(err);
                    const delayFromDecider = this.delayDecider(serviceErrorClassification.isThrottlingError(err) ? utilRetry.THROTTLING_RETRY_DELAY_BASE : utilRetry.DEFAULT_RETRY_DELAY_BASE, attempts);
                    const delayFromResponse = getDelayFromRetryAfterHeader(err.$response);
                    const delay = Math.max(delayFromResponse || 0, delayFromDecider);
                    totalDelay += delay;
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }
                if (!err.$metadata) {
                    err.$metadata = {};
                }
                err.$metadata.attempts = attempts;
                err.$metadata.totalRetryDelay = totalDelay;
                throw err;
            }
        }
    }
}
const getDelayFromRetryAfterHeader = (response) => {
    if (!protocolHttp.HttpResponse.isInstance(response))
        return;
    const retryAfterHeaderName = Object.keys(response.headers).find((key) => key.toLowerCase() === "retry-after");
    if (!retryAfterHeaderName)
        return;
    const retryAfter = response.headers[retryAfterHeaderName];
    const retryAfterSeconds = Number(retryAfter);
    if (!Number.isNaN(retryAfterSeconds))
        return retryAfterSeconds * 1000;
    const retryAfterDate = new Date(retryAfter);
    return retryAfterDate.getTime() - Date.now();
};

class AdaptiveRetryStrategy extends StandardRetryStrategy {
    rateLimiter;
    constructor(maxAttemptsProvider, options) {
        const { rateLimiter, ...superOptions } = options ?? {};
        super(maxAttemptsProvider, superOptions);
        this.rateLimiter = rateLimiter ?? new utilRetry.DefaultRateLimiter();
        this.mode = utilRetry.RETRY_MODES.ADAPTIVE;
    }
    async retry(next, args) {
        return super.retry(next, args, {
            beforeRequest: async () => {
                return this.rateLimiter.getSendToken();
            },
            afterRequest: (response) => {
                this.rateLimiter.updateClientSendingRate(response);
            },
        });
    }
}

const ENV_MAX_ATTEMPTS = "AWS_MAX_ATTEMPTS";
const CONFIG_MAX_ATTEMPTS = "max_attempts";
const NODE_MAX_ATTEMPT_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => {
        const value = env[ENV_MAX_ATTEMPTS];
        if (!value)
            return undefined;
        const maxAttempt = parseInt(value);
        if (Number.isNaN(maxAttempt)) {
            throw new Error(`Environment variable ${ENV_MAX_ATTEMPTS} mast be a number, got "${value}"`);
        }
        return maxAttempt;
    },
    configFileSelector: (profile) => {
        const value = profile[CONFIG_MAX_ATTEMPTS];
        if (!value)
            return undefined;
        const maxAttempt = parseInt(value);
        if (Number.isNaN(maxAttempt)) {
            throw new Error(`Shared config file entry ${CONFIG_MAX_ATTEMPTS} mast be a number, got "${value}"`);
        }
        return maxAttempt;
    },
    default: utilRetry.DEFAULT_MAX_ATTEMPTS,
};
const resolveRetryConfig = (input) => {
    const { retryStrategy, retryMode } = input;
    const maxAttempts = utilMiddleware.normalizeProvider(input.maxAttempts ?? utilRetry.DEFAULT_MAX_ATTEMPTS);
    let controller = retryStrategy
        ? Promise.resolve(retryStrategy)
        : undefined;
    const getDefault = async () => (await utilMiddleware.normalizeProvider(retryMode)()) === utilRetry.RETRY_MODES.ADAPTIVE
        ? new utilRetry.AdaptiveRetryStrategy(maxAttempts)
        : new utilRetry.StandardRetryStrategy(maxAttempts);
    return Object.assign(input, {
        maxAttempts,
        retryStrategy: () => (controller ??= getDefault()),
    });
};
const ENV_RETRY_MODE = "AWS_RETRY_MODE";
const CONFIG_RETRY_MODE = "retry_mode";
const NODE_RETRY_MODE_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => env[ENV_RETRY_MODE],
    configFileSelector: (profile) => profile[CONFIG_RETRY_MODE],
    default: utilRetry.DEFAULT_RETRY_MODE,
};

const omitRetryHeadersMiddleware = () => (next) => async (args) => {
    const { request } = args;
    if (protocolHttp.HttpRequest.isInstance(request)) {
        delete request.headers[utilRetry.INVOCATION_ID_HEADER];
        delete request.headers[utilRetry.REQUEST_HEADER];
    }
    return next(args);
};
const omitRetryHeadersMiddlewareOptions = {
    name: "omitRetryHeadersMiddleware",
    tags: ["RETRY", "HEADERS", "OMIT_RETRY_HEADERS"],
    relation: "before",
    toMiddleware: "awsAuthMiddleware",
    override: true,
};
const getOmitRetryHeadersPlugin = (options) => ({
    applyToStack: (clientStack) => {
        clientStack.addRelativeTo(omitRetryHeadersMiddleware(), omitRetryHeadersMiddlewareOptions);
    },
});

function parseRetryAfterHeader(response, logger) {
    if (!protocolHttp.HttpResponse.isInstance(response)) {
        return;
    }
    for (const header of Object.keys(response.headers)) {
        const h = header.toLowerCase();
        if (h === "retry-after") {
            const retryAfter = response.headers[header];
            let retryAfterSeconds = NaN;
            if (retryAfter.endsWith("GMT")) {
                try {
                    const date = serde.parseRfc7231DateTime(retryAfter);
                    retryAfterSeconds = (date.getTime() - Date.now()) / 1000;
                }
                catch (e) {
                    logger?.trace?.("Failed to parse retry-after header");
                    logger?.trace?.(e);
                }
            }
            else if (retryAfter.match(/ GMT, ((\d+)|(\d+\.\d+))$/)) {
                retryAfterSeconds = Number(retryAfter.match(/ GMT, ([\d.]+)$/)?.[1]);
            }
            else if (retryAfter.match(/^((\d+)|(\d+\.\d+))$/)) {
                retryAfterSeconds = Number(retryAfter);
            }
            else if (Date.parse(retryAfter) >= Date.now()) {
                retryAfterSeconds = (Date.parse(retryAfter) - Date.now()) / 1000;
            }
            if (isNaN(retryAfterSeconds)) {
                return;
            }
            return new Date(Date.now() + retryAfterSeconds * 1000);
        }
        else if (h === "x-amz-retry-after") {
            const v = response.headers[header];
            const backoffMilliseconds = Number(v);
            if (isNaN(backoffMilliseconds)) {
                logger?.trace?.(`Failed to parse x-amz-retry-after=${v}`);
                return;
            }
            return new Date(Date.now() + backoffMilliseconds);
        }
    }
}
function getRetryAfterHint(response, logger) {
    return parseRetryAfterHeader(response, logger);
}

const retryMiddleware = (options) => (next, context) => async (args) => {
    let retryStrategy = await options.retryStrategy();
    const maxAttempts = await options.maxAttempts();
    if (isRetryStrategyV2(retryStrategy)) {
        retryStrategy = retryStrategy;
        let retryToken = await retryStrategy.acquireInitialRetryToken((context["partition_id"] ?? "") + (context.__retryLongPoll ? ":longpoll" : ""));
        let lastError = new Error();
        let attempts = 0;
        let totalRetryDelay = 0;
        const { request } = args;
        const isRequest = protocolHttp.HttpRequest.isInstance(request);
        if (isRequest) {
            request.headers[utilRetry.INVOCATION_ID_HEADER] = uuid.v4();
        }
        while (true) {
            try {
                if (isRequest) {
                    request.headers[utilRetry.REQUEST_HEADER] = `attempt=${attempts + 1}; max=${maxAttempts}`;
                }
                const { response, output } = await next(args);
                retryStrategy.recordSuccess(retryToken);
                output.$metadata.attempts = attempts + 1;
                output.$metadata.totalRetryDelay = totalRetryDelay;
                return { response, output };
            }
            catch (e) {
                const retryErrorInfo = getRetryErrorInfo(e, options.logger);
                lastError = asSdkError(e);
                if (isRequest && isStreamingPayload.isStreamingPayload(request)) {
                    (context.logger instanceof smithyClient.NoOpLogger ? console : context.logger)?.warn("An error was encountered in a non-retryable streaming request.");
                    throw lastError;
                }
                try {
                    retryToken = await retryStrategy.refreshRetryTokenForRetry(retryToken, retryErrorInfo);
                }
                catch (refreshError) {
                    if (typeof refreshError.$backoff === "number") {
                        await cooldown(refreshError.$backoff);
                    }
                    if (!lastError.$metadata) {
                        lastError.$metadata = {};
                    }
                    lastError.$metadata.attempts = attempts + 1;
                    lastError.$metadata.totalRetryDelay = totalRetryDelay;
                    throw lastError;
                }
                attempts = retryToken.getRetryCount();
                const delay = retryToken.getRetryDelay();
                totalRetryDelay += delay;
                await cooldown(delay);
            }
        }
    }
    else {
        retryStrategy = retryStrategy;
        if (retryStrategy?.mode) {
            context.userAgent = [...(context.userAgent || []), ["cfg/retry-mode", retryStrategy.mode]];
        }
        return retryStrategy.retry(next, args);
    }
};
const cooldown = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRetryStrategyV2 = (retryStrategy) => typeof retryStrategy.acquireInitialRetryToken !== "undefined" &&
    typeof retryStrategy.refreshRetryTokenForRetry !== "undefined" &&
    typeof retryStrategy.recordSuccess !== "undefined";
const getRetryErrorInfo = (error, logger) => {
    const errorInfo = {
        error,
        errorType: getRetryErrorType(error),
    };
    const retryAfterHint = parseRetryAfterHeader(error.$response, logger);
    if (retryAfterHint) {
        errorInfo.retryAfterHint = retryAfterHint;
    }
    return errorInfo;
};
const getRetryErrorType = (error) => {
    if (serviceErrorClassification.isThrottlingError(error))
        return "THROTTLING";
    if (serviceErrorClassification.isTransientError(error))
        return "TRANSIENT";
    if (serviceErrorClassification.isServerError(error))
        return "SERVER_ERROR";
    return "CLIENT_ERROR";
};
const retryMiddlewareOptions = {
    name: "retryMiddleware",
    tags: ["RETRY"],
    step: "finalizeRequest",
    priority: "high",
    override: true,
};
const getRetryPlugin = (options) => ({
    applyToStack: (clientStack) => {
        clientStack.add(retryMiddleware(options), retryMiddlewareOptions);
    },
});

exports.AdaptiveRetryStrategy = AdaptiveRetryStrategy;
exports.CONFIG_MAX_ATTEMPTS = CONFIG_MAX_ATTEMPTS;
exports.CONFIG_RETRY_MODE = CONFIG_RETRY_MODE;
exports.ENV_MAX_ATTEMPTS = ENV_MAX_ATTEMPTS;
exports.ENV_RETRY_MODE = ENV_RETRY_MODE;
exports.NODE_MAX_ATTEMPT_CONFIG_OPTIONS = NODE_MAX_ATTEMPT_CONFIG_OPTIONS;
exports.NODE_RETRY_MODE_CONFIG_OPTIONS = NODE_RETRY_MODE_CONFIG_OPTIONS;
exports.StandardRetryStrategy = StandardRetryStrategy;
exports.defaultDelayDecider = defaultDelayDecider;
exports.defaultRetryDecider = defaultRetryDecider;
exports.getOmitRetryHeadersPlugin = getOmitRetryHeadersPlugin;
exports.getRetryAfterHint = getRetryAfterHint;
exports.getRetryPlugin = getRetryPlugin;
exports.omitRetryHeadersMiddleware = omitRetryHeadersMiddleware;
exports.omitRetryHeadersMiddlewareOptions = omitRetryHeadersMiddlewareOptions;
exports.resolveRetryConfig = resolveRetryConfig;
exports.retryMiddleware = retryMiddleware;
exports.retryMiddlewareOptions = retryMiddlewareOptions;


/***/ }),

/***/ 49831:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isStreamingPayload = void 0;
const stream_1 = __webpack_require__(2203);
const isStreamingPayload = (request) => request?.body instanceof stream_1.Readable ||
    (typeof ReadableStream !== "undefined" && request?.body instanceof ReadableStream);
exports.isStreamingPayload = isStreamingPayload;


/***/ }),

/***/ 83255:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var protocolHttp = __webpack_require__(72356);
var endpoints = __webpack_require__(62085);

const deserializerMiddleware = (options, deserializer) => (next, context) => async (args) => {
    const { response } = await next(args);
    try {
        const parsed = await deserializer(response, options);
        return {
            response,
            output: parsed,
        };
    }
    catch (error) {
        Object.defineProperty(error, "$response", {
            value: response,
            enumerable: false,
            writable: false,
            configurable: false,
        });
        if (!("$metadata" in error)) {
            const hint = `Deserialization error: to see the raw response, inspect the hidden field {error}.$response on this object.`;
            try {
                error.message += "\n  " + hint;
            }
            catch (e) {
                if (!context.logger || context.logger?.constructor?.name === "NoOpLogger") {
                    console.warn(hint);
                }
                else {
                    context.logger?.warn?.(hint);
                }
            }
            if (typeof error.$responseBodyText !== "undefined") {
                if (error.$response) {
                    error.$response.body = error.$responseBodyText;
                }
            }
            try {
                if (protocolHttp.HttpResponse.isInstance(response)) {
                    const { headers = {} } = response;
                    const headerEntries = Object.entries(headers);
                    error.$metadata = {
                        httpStatusCode: response.statusCode,
                        requestId: findHeader(/^x-[\w-]+-request-?id$/, headerEntries),
                        extendedRequestId: findHeader(/^x-[\w-]+-id-2$/, headerEntries),
                        cfId: findHeader(/^x-[\w-]+-cf-id$/, headerEntries),
                    };
                }
            }
            catch (e) {
            }
        }
        throw error;
    }
};
const findHeader = (pattern, headers) => {
    return (headers.find(([k]) => {
        return k.match(pattern);
    }) || [void 0, void 0])[1];
};

const serializerMiddleware = (options, serializer) => (next, context) => async (args) => {
    const endpointConfig = options;
    const endpoint = context.endpointV2
        ? async () => endpoints.toEndpointV1(context.endpointV2)
        : endpointConfig.endpoint;
    if (!endpoint) {
        throw new Error("No valid endpoint provider available.");
    }
    const request = await serializer(args.input, { ...options, endpoint });
    return next({
        ...args,
        request,
    });
};

const deserializerMiddlewareOption = {
    name: "deserializerMiddleware",
    step: "deserialize",
    tags: ["DESERIALIZER"],
    override: true,
};
const serializerMiddlewareOption = {
    name: "serializerMiddleware",
    step: "serialize",
    tags: ["SERIALIZER"],
    override: true,
};
function getSerdePlugin(config, serializer, deserializer) {
    return {
        applyToStack: (commandStack) => {
            commandStack.add(deserializerMiddleware(config, deserializer), deserializerMiddlewareOption);
            commandStack.add(serializerMiddleware(config, serializer), serializerMiddlewareOption);
        },
    };
}

exports.deserializerMiddleware = deserializerMiddleware;
exports.deserializerMiddlewareOption = deserializerMiddlewareOption;
exports.getSerdePlugin = getSerdePlugin;
exports.serializerMiddleware = serializerMiddleware;
exports.serializerMiddlewareOption = serializerMiddlewareOption;


/***/ }),

/***/ 9208:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


const getAllAliases = (name, aliases) => {
    const _aliases = [];
    if (name) {
        _aliases.push(name);
    }
    if (aliases) {
        for (const alias of aliases) {
            _aliases.push(alias);
        }
    }
    return _aliases;
};
const getMiddlewareNameWithAliases = (name, aliases) => {
    return `${name || "anonymous"}${aliases && aliases.length > 0 ? ` (a.k.a. ${aliases.join(",")})` : ""}`;
};
const constructStack = () => {
    let absoluteEntries = [];
    let relativeEntries = [];
    let identifyOnResolve = false;
    const entriesNameSet = new Set();
    const sort = (entries) => entries.sort((a, b) => stepWeights[b.step] - stepWeights[a.step] ||
        priorityWeights[b.priority || "normal"] - priorityWeights[a.priority || "normal"]);
    const removeByName = (toRemove) => {
        let isRemoved = false;
        const filterCb = (entry) => {
            const aliases = getAllAliases(entry.name, entry.aliases);
            if (aliases.includes(toRemove)) {
                isRemoved = true;
                for (const alias of aliases) {
                    entriesNameSet.delete(alias);
                }
                return false;
            }
            return true;
        };
        absoluteEntries = absoluteEntries.filter(filterCb);
        relativeEntries = relativeEntries.filter(filterCb);
        return isRemoved;
    };
    const removeByReference = (toRemove) => {
        let isRemoved = false;
        const filterCb = (entry) => {
            if (entry.middleware === toRemove) {
                isRemoved = true;
                for (const alias of getAllAliases(entry.name, entry.aliases)) {
                    entriesNameSet.delete(alias);
                }
                return false;
            }
            return true;
        };
        absoluteEntries = absoluteEntries.filter(filterCb);
        relativeEntries = relativeEntries.filter(filterCb);
        return isRemoved;
    };
    const cloneTo = (toStack) => {
        absoluteEntries.forEach((entry) => {
            toStack.add(entry.middleware, { ...entry });
        });
        relativeEntries.forEach((entry) => {
            toStack.addRelativeTo(entry.middleware, { ...entry });
        });
        toStack.identifyOnResolve?.(stack.identifyOnResolve());
        return toStack;
    };
    const expandRelativeMiddlewareList = (from) => {
        const expandedMiddlewareList = [];
        from.before.forEach((entry) => {
            if (entry.before.length === 0 && entry.after.length === 0) {
                expandedMiddlewareList.push(entry);
            }
            else {
                expandedMiddlewareList.push(...expandRelativeMiddlewareList(entry));
            }
        });
        expandedMiddlewareList.push(from);
        from.after.reverse().forEach((entry) => {
            if (entry.before.length === 0 && entry.after.length === 0) {
                expandedMiddlewareList.push(entry);
            }
            else {
                expandedMiddlewareList.push(...expandRelativeMiddlewareList(entry));
            }
        });
        return expandedMiddlewareList;
    };
    const getMiddlewareList = (debug = false) => {
        const normalizedAbsoluteEntries = [];
        const normalizedRelativeEntries = [];
        const normalizedEntriesNameMap = {};
        absoluteEntries.forEach((entry) => {
            const normalizedEntry = {
                ...entry,
                before: [],
                after: [],
            };
            for (const alias of getAllAliases(normalizedEntry.name, normalizedEntry.aliases)) {
                normalizedEntriesNameMap[alias] = normalizedEntry;
            }
            normalizedAbsoluteEntries.push(normalizedEntry);
        });
        relativeEntries.forEach((entry) => {
            const normalizedEntry = {
                ...entry,
                before: [],
                after: [],
            };
            for (const alias of getAllAliases(normalizedEntry.name, normalizedEntry.aliases)) {
                normalizedEntriesNameMap[alias] = normalizedEntry;
            }
            normalizedRelativeEntries.push(normalizedEntry);
        });
        normalizedRelativeEntries.forEach((entry) => {
            if (entry.toMiddleware) {
                const toMiddleware = normalizedEntriesNameMap[entry.toMiddleware];
                if (toMiddleware === undefined) {
                    if (debug) {
                        return;
                    }
                    throw new Error(`${entry.toMiddleware} is not found when adding ` +
                        `${getMiddlewareNameWithAliases(entry.name, entry.aliases)} ` +
                        `middleware ${entry.relation} ${entry.toMiddleware}`);
                }
                if (entry.relation === "after") {
                    toMiddleware.after.push(entry);
                }
                if (entry.relation === "before") {
                    toMiddleware.before.push(entry);
                }
            }
        });
        const mainChain = sort(normalizedAbsoluteEntries)
            .map(expandRelativeMiddlewareList)
            .reduce((wholeList, expandedMiddlewareList) => {
            wholeList.push(...expandedMiddlewareList);
            return wholeList;
        }, []);
        return mainChain;
    };
    const stack = {
        add: (middleware, options = {}) => {
            const { name, override, aliases: _aliases } = options;
            const entry = {
                step: "initialize",
                priority: "normal",
                middleware,
                ...options,
            };
            const aliases = getAllAliases(name, _aliases);
            if (aliases.length > 0) {
                if (aliases.some((alias) => entriesNameSet.has(alias))) {
                    if (!override)
                        throw new Error(`Duplicate middleware name '${getMiddlewareNameWithAliases(name, _aliases)}'`);
                    for (const alias of aliases) {
                        const toOverrideIndex = absoluteEntries.findIndex((entry) => entry.name === alias || entry.aliases?.some((a) => a === alias));
                        if (toOverrideIndex === -1) {
                            continue;
                        }
                        const toOverride = absoluteEntries[toOverrideIndex];
                        if (toOverride.step !== entry.step || entry.priority !== toOverride.priority) {
                            throw new Error(`"${getMiddlewareNameWithAliases(toOverride.name, toOverride.aliases)}" middleware with ` +
                                `${toOverride.priority} priority in ${toOverride.step} step cannot ` +
                                `be overridden by "${getMiddlewareNameWithAliases(name, _aliases)}" middleware with ` +
                                `${entry.priority} priority in ${entry.step} step.`);
                        }
                        absoluteEntries.splice(toOverrideIndex, 1);
                    }
                }
                for (const alias of aliases) {
                    entriesNameSet.add(alias);
                }
            }
            absoluteEntries.push(entry);
        },
        addRelativeTo: (middleware, options) => {
            const { name, override, aliases: _aliases } = options;
            const entry = {
                middleware,
                ...options,
            };
            const aliases = getAllAliases(name, _aliases);
            if (aliases.length > 0) {
                if (aliases.some((alias) => entriesNameSet.has(alias))) {
                    if (!override)
                        throw new Error(`Duplicate middleware name '${getMiddlewareNameWithAliases(name, _aliases)}'`);
                    for (const alias of aliases) {
                        const toOverrideIndex = relativeEntries.findIndex((entry) => entry.name === alias || entry.aliases?.some((a) => a === alias));
                        if (toOverrideIndex === -1) {
                            continue;
                        }
                        const toOverride = relativeEntries[toOverrideIndex];
                        if (toOverride.toMiddleware !== entry.toMiddleware || toOverride.relation !== entry.relation) {
                            throw new Error(`"${getMiddlewareNameWithAliases(toOverride.name, toOverride.aliases)}" middleware ` +
                                `${toOverride.relation} "${toOverride.toMiddleware}" middleware cannot be overridden ` +
                                `by "${getMiddlewareNameWithAliases(name, _aliases)}" middleware ${entry.relation} ` +
                                `"${entry.toMiddleware}" middleware.`);
                        }
                        relativeEntries.splice(toOverrideIndex, 1);
                    }
                }
                for (const alias of aliases) {
                    entriesNameSet.add(alias);
                }
            }
            relativeEntries.push(entry);
        },
        clone: () => cloneTo(constructStack()),
        use: (plugin) => {
            plugin.applyToStack(stack);
        },
        remove: (toRemove) => {
            if (typeof toRemove === "string")
                return removeByName(toRemove);
            else
                return removeByReference(toRemove);
        },
        removeByTag: (toRemove) => {
            let isRemoved = false;
            const filterCb = (entry) => {
                const { tags, name, aliases: _aliases } = entry;
                if (tags && tags.includes(toRemove)) {
                    const aliases = getAllAliases(name, _aliases);
                    for (const alias of aliases) {
                        entriesNameSet.delete(alias);
                    }
                    isRemoved = true;
                    return false;
                }
                return true;
            };
            absoluteEntries = absoluteEntries.filter(filterCb);
            relativeEntries = relativeEntries.filter(filterCb);
            return isRemoved;
        },
        concat: (from) => {
            const cloned = cloneTo(constructStack());
            cloned.use(from);
            cloned.identifyOnResolve(identifyOnResolve || cloned.identifyOnResolve() || (from.identifyOnResolve?.() ?? false));
            return cloned;
        },
        applyToStack: cloneTo,
        identify: () => {
            return getMiddlewareList(true).map((mw) => {
                const step = mw.step ??
                    mw.relation +
                        " " +
                        mw.toMiddleware;
                return getMiddlewareNameWithAliases(mw.name, mw.aliases) + " - " + step;
            });
        },
        identifyOnResolve(toggle) {
            if (typeof toggle === "boolean")
                identifyOnResolve = toggle;
            return identifyOnResolve;
        },
        resolve: (handler, context) => {
            for (const middleware of getMiddlewareList()
                .map((entry) => entry.middleware)
                .reverse()) {
                handler = middleware(handler, context);
            }
            if (identifyOnResolve) {
                console.log(stack.identify());
            }
            return handler;
        },
    };
    return stack;
};
const stepWeights = {
    initialize: 5,
    serialize: 4,
    build: 3,
    finalizeRequest: 2,
    deserialize: 1,
};
const priorityWeights = {
    high: 3,
    normal: 2,
    low: 1,
};

exports.constructStack = constructStack;


/***/ }),

/***/ 55704:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var propertyProvider = __webpack_require__(71238);
var sharedIniFileLoader = __webpack_require__(94964);

function getSelectorName(functionString) {
    try {
        const constants = new Set(Array.from(functionString.match(/([A-Z_]){3,}/g) ?? []));
        constants.delete("CONFIG");
        constants.delete("CONFIG_PREFIX_SEPARATOR");
        constants.delete("ENV");
        return [...constants].join(", ");
    }
    catch (e) {
        return functionString;
    }
}

const fromEnv = (envVarSelector, options) => async () => {
    try {
        const config = envVarSelector(process.env, options);
        if (config === undefined) {
            throw new Error();
        }
        return config;
    }
    catch (e) {
        throw new propertyProvider.CredentialsProviderError(e.message || `Not found in ENV: ${getSelectorName(envVarSelector.toString())}`, { logger: options?.logger });
    }
};

const fromSharedConfigFiles = (configSelector, { preferredFile = "config", ...init } = {}) => async () => {
    const profile = sharedIniFileLoader.getProfileName(init);
    const { configFile, credentialsFile } = await sharedIniFileLoader.loadSharedConfigFiles(init);
    const profileFromCredentials = credentialsFile[profile] || {};
    const profileFromConfig = configFile[profile] || {};
    const mergedProfile = preferredFile === "config"
        ? { ...profileFromCredentials, ...profileFromConfig }
        : { ...profileFromConfig, ...profileFromCredentials };
    try {
        const cfgFile = preferredFile === "config" ? configFile : credentialsFile;
        const configValue = configSelector(mergedProfile, cfgFile);
        if (configValue === undefined) {
            throw new Error();
        }
        return configValue;
    }
    catch (e) {
        throw new propertyProvider.CredentialsProviderError(e.message || `Not found in config files w/ profile [${profile}]: ${getSelectorName(configSelector.toString())}`, { logger: init.logger });
    }
};

const isFunction = (func) => typeof func === "function";
const fromStatic = (defaultValue) => isFunction(defaultValue) ? async () => await defaultValue() : propertyProvider.fromStatic(defaultValue);

const loadConfig = ({ environmentVariableSelector, configFileSelector, default: defaultValue }, configuration = {}) => {
    const { signingName, logger } = configuration;
    const envOptions = { signingName, logger };
    return propertyProvider.memoize(propertyProvider.chain(fromEnv(environmentVariableSelector, envOptions), fromSharedConfigFiles(configFileSelector, configuration), fromStatic(defaultValue)));
};

exports.loadConfig = loadConfig;


/***/ }),

/***/ 61279:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var protocolHttp = __webpack_require__(72356);
var querystringBuilder = __webpack_require__(18256);
var node_https = __webpack_require__(44708);
var node_stream = __webpack_require__(57075);
var http2 = __webpack_require__(32467);

function buildAbortError(abortSignal) {
    const reason = abortSignal && typeof abortSignal === "object" && "reason" in abortSignal
        ? abortSignal.reason
        : undefined;
    if (reason) {
        if (reason instanceof Error) {
            const abortError = new Error("Request aborted");
            abortError.name = "AbortError";
            abortError.cause = reason;
            return abortError;
        }
        const abortError = new Error(String(reason));
        abortError.name = "AbortError";
        return abortError;
    }
    const abortError = new Error("Request aborted");
    abortError.name = "AbortError";
    return abortError;
}

const NODEJS_TIMEOUT_ERROR_CODES = ["ECONNRESET", "EPIPE", "ETIMEDOUT"];

const getTransformedHeaders = (headers) => {
    const transformedHeaders = {};
    for (const name of Object.keys(headers)) {
        const headerValues = headers[name];
        transformedHeaders[name] = Array.isArray(headerValues) ? headerValues.join(",") : headerValues;
    }
    return transformedHeaders;
};

const timing = {
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    clearTimeout: (timeoutId) => clearTimeout(timeoutId),
};

const DEFER_EVENT_LISTENER_TIME$2 = 1000;
const setConnectionTimeout = (request, reject, timeoutInMs = 0) => {
    if (!timeoutInMs) {
        return -1;
    }
    const registerTimeout = (offset) => {
        const timeoutId = timing.setTimeout(() => {
            request.destroy();
            reject(Object.assign(new Error(`@smithy/node-http-handler - the request socket did not establish a connection with the server within the configured timeout of ${timeoutInMs} ms.`), {
                name: "TimeoutError",
            }));
        }, timeoutInMs - offset);
        const doWithSocket = (socket) => {
            if (socket?.connecting) {
                socket.on("connect", () => {
                    timing.clearTimeout(timeoutId);
                });
            }
            else {
                timing.clearTimeout(timeoutId);
            }
        };
        if (request.socket) {
            doWithSocket(request.socket);
        }
        else {
            request.on("socket", doWithSocket);
        }
    };
    if (timeoutInMs < 2000) {
        registerTimeout(0);
        return 0;
    }
    return timing.setTimeout(registerTimeout.bind(null, DEFER_EVENT_LISTENER_TIME$2), DEFER_EVENT_LISTENER_TIME$2);
};

const setRequestTimeout = (req, reject, timeoutInMs = 0, throwOnRequestTimeout, logger) => {
    if (timeoutInMs) {
        return timing.setTimeout(() => {
            let msg = `@smithy/node-http-handler - [${throwOnRequestTimeout ? "ERROR" : "WARN"}] a request has exceeded the configured ${timeoutInMs} ms requestTimeout.`;
            if (throwOnRequestTimeout) {
                const error = Object.assign(new Error(msg), {
                    name: "TimeoutError",
                    code: "ETIMEDOUT",
                });
                req.destroy(error);
                reject(error);
            }
            else {
                msg += ` Init client requestHandler with throwOnRequestTimeout=true to turn this into an error.`;
                logger?.warn?.(msg);
            }
        }, timeoutInMs);
    }
    return -1;
};

const DEFER_EVENT_LISTENER_TIME$1 = 3000;
const setSocketKeepAlive = (request, { keepAlive, keepAliveMsecs }, deferTimeMs = DEFER_EVENT_LISTENER_TIME$1) => {
    if (keepAlive !== true) {
        return -1;
    }
    const registerListener = () => {
        if (request.socket) {
            request.socket.setKeepAlive(keepAlive, keepAliveMsecs || 0);
        }
        else {
            request.on("socket", (socket) => {
                socket.setKeepAlive(keepAlive, keepAliveMsecs || 0);
            });
        }
    };
    if (deferTimeMs === 0) {
        registerListener();
        return 0;
    }
    return timing.setTimeout(registerListener, deferTimeMs);
};

const DEFER_EVENT_LISTENER_TIME = 3000;
const setSocketTimeout = (request, reject, timeoutInMs = 0) => {
    const registerTimeout = (offset) => {
        const timeout = timeoutInMs - offset;
        const onTimeout = () => {
            request.destroy();
            reject(Object.assign(new Error(`@smithy/node-http-handler - the request socket timed out after ${timeoutInMs} ms of inactivity (configured by client requestHandler).`), { name: "TimeoutError" }));
        };
        if (request.socket) {
            request.socket.setTimeout(timeout, onTimeout);
            request.on("close", () => request.socket?.removeListener("timeout", onTimeout));
        }
        else {
            request.setTimeout(timeout, onTimeout);
        }
    };
    if (0 < timeoutInMs && timeoutInMs < 6000) {
        registerTimeout(0);
        return 0;
    }
    return timing.setTimeout(registerTimeout.bind(null, timeoutInMs === 0 ? 0 : DEFER_EVENT_LISTENER_TIME), DEFER_EVENT_LISTENER_TIME);
};

const MIN_WAIT_TIME = 6_000;
async function writeRequestBody(httpRequest, request, maxContinueTimeoutMs = MIN_WAIT_TIME, externalAgent = false) {
    const headers = request.headers ?? {};
    const expect = headers.Expect || headers.expect;
    let timeoutId = -1;
    let sendBody = true;
    if (!externalAgent && expect === "100-continue") {
        sendBody = await Promise.race([
            new Promise((resolve) => {
                timeoutId = Number(timing.setTimeout(() => resolve(true), Math.max(MIN_WAIT_TIME, maxContinueTimeoutMs)));
            }),
            new Promise((resolve) => {
                httpRequest.on("continue", () => {
                    timing.clearTimeout(timeoutId);
                    resolve(true);
                });
                httpRequest.on("response", () => {
                    timing.clearTimeout(timeoutId);
                    resolve(false);
                });
                httpRequest.on("error", () => {
                    timing.clearTimeout(timeoutId);
                    resolve(false);
                });
            }),
        ]);
    }
    if (sendBody) {
        writeBody(httpRequest, request.body);
    }
}
function writeBody(httpRequest, body) {
    if (body instanceof node_stream.Readable) {
        body.pipe(httpRequest);
        return;
    }
    if (body) {
        const isBuffer = Buffer.isBuffer(body);
        const isString = typeof body === "string";
        if (isBuffer || isString) {
            if (isBuffer && body.byteLength === 0) {
                httpRequest.end();
            }
            else {
                httpRequest.end(body);
            }
            return;
        }
        const uint8 = body;
        if (typeof uint8 === "object" &&
            uint8.buffer &&
            typeof uint8.byteOffset === "number" &&
            typeof uint8.byteLength === "number") {
            httpRequest.end(Buffer.from(uint8.buffer, uint8.byteOffset, uint8.byteLength));
            return;
        }
        httpRequest.end(Buffer.from(body));
        return;
    }
    httpRequest.end();
}

const DEFAULT_REQUEST_TIMEOUT = 0;
let hAgent = undefined;
let hRequest = undefined;
class NodeHttpHandler {
    config;
    configProvider;
    socketWarningTimestamp = 0;
    externalAgent = false;
    metadata = { handlerProtocol: "http/1.1" };
    static create(instanceOrOptions) {
        if (typeof instanceOrOptions?.handle === "function") {
            return instanceOrOptions;
        }
        return new NodeHttpHandler(instanceOrOptions);
    }
    static checkSocketUsage(agent, socketWarningTimestamp, logger = console) {
        const { sockets, requests, maxSockets } = agent;
        if (typeof maxSockets !== "number" || maxSockets === Infinity) {
            return socketWarningTimestamp;
        }
        const interval = 15_000;
        if (Date.now() - interval < socketWarningTimestamp) {
            return socketWarningTimestamp;
        }
        if (sockets && requests) {
            for (const origin in sockets) {
                const socketsInUse = sockets[origin]?.length ?? 0;
                const requestsEnqueued = requests[origin]?.length ?? 0;
                if (socketsInUse >= maxSockets && requestsEnqueued >= 2 * maxSockets) {
                    logger?.warn?.(`@smithy/node-http-handler:WARN - socket usage at capacity=${socketsInUse} and ${requestsEnqueued} additional requests are enqueued.
See https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-configuring-maxsockets.html
or increase socketAcquisitionWarningTimeout=(millis) in the NodeHttpHandler config.`);
                    return Date.now();
                }
            }
        }
        return socketWarningTimestamp;
    }
    constructor(options) {
        this.configProvider = new Promise((resolve, reject) => {
            if (typeof options === "function") {
                options()
                    .then((_options) => {
                    resolve(this.resolveDefaultConfig(_options));
                })
                    .catch(reject);
            }
            else {
                resolve(this.resolveDefaultConfig(options));
            }
        });
    }
    destroy() {
        this.config?.httpAgent?.destroy();
        this.config?.httpsAgent?.destroy();
    }
    async handle(request, { abortSignal, requestTimeout } = {}) {
        if (!this.config) {
            this.config = await this.configProvider;
        }
        const config = this.config;
        const isSSL = request.protocol === "https:";
        if (!isSSL && !this.config.httpAgent) {
            this.config.httpAgent = await this.config.httpAgentProvider();
        }
        return new Promise((_resolve, _reject) => {
            let writeRequestBodyPromise = undefined;
            const timeouts = [];
            const resolve = async (arg) => {
                await writeRequestBodyPromise;
                timeouts.forEach(timing.clearTimeout);
                _resolve(arg);
            };
            const reject = async (arg) => {
                await writeRequestBodyPromise;
                timeouts.forEach(timing.clearTimeout);
                _reject(arg);
            };
            if (abortSignal?.aborted) {
                const abortError = buildAbortError(abortSignal);
                reject(abortError);
                return;
            }
            const headers = request.headers ?? {};
            const expectContinue = (headers.Expect ?? headers.expect) === "100-continue";
            let agent = isSSL ? config.httpsAgent : config.httpAgent;
            if (expectContinue && !this.externalAgent) {
                agent = new (isSSL ? node_https.Agent : hAgent)({
                    keepAlive: false,
                    maxSockets: Infinity,
                });
            }
            timeouts.push(timing.setTimeout(() => {
                this.socketWarningTimestamp = NodeHttpHandler.checkSocketUsage(agent, this.socketWarningTimestamp, config.logger);
            }, config.socketAcquisitionWarningTimeout ?? (config.requestTimeout ?? 2000) + (config.connectionTimeout ?? 1000)));
            const queryString = querystringBuilder.buildQueryString(request.query || {});
            let auth = undefined;
            if (request.username != null || request.password != null) {
                const username = request.username ?? "";
                const password = request.password ?? "";
                auth = `${username}:${password}`;
            }
            let path = request.path;
            if (queryString) {
                path += `?${queryString}`;
            }
            if (request.fragment) {
                path += `#${request.fragment}`;
            }
            let hostname = request.hostname ?? "";
            if (hostname[0] === "[" && hostname.endsWith("]")) {
                hostname = request.hostname.slice(1, -1);
            }
            else {
                hostname = request.hostname;
            }
            const nodeHttpsOptions = {
                headers: request.headers,
                host: hostname,
                method: request.method,
                path,
                port: request.port,
                agent,
                auth,
            };
            const requestFunc = isSSL ? node_https.request : hRequest;
            const req = requestFunc(nodeHttpsOptions, (res) => {
                const httpResponse = new protocolHttp.HttpResponse({
                    statusCode: res.statusCode || -1,
                    reason: res.statusMessage,
                    headers: getTransformedHeaders(res.headers),
                    body: res,
                });
                resolve({ response: httpResponse });
            });
            req.on("error", (err) => {
                if (NODEJS_TIMEOUT_ERROR_CODES.includes(err.code)) {
                    reject(Object.assign(err, { name: "TimeoutError" }));
                }
                else {
                    reject(err);
                }
            });
            if (abortSignal) {
                const onAbort = () => {
                    req.destroy();
                    const abortError = buildAbortError(abortSignal);
                    reject(abortError);
                };
                if (typeof abortSignal.addEventListener === "function") {
                    const signal = abortSignal;
                    signal.addEventListener("abort", onAbort, { once: true });
                    req.once("close", () => signal.removeEventListener("abort", onAbort));
                }
                else {
                    abortSignal.onabort = onAbort;
                }
            }
            const effectiveRequestTimeout = requestTimeout ?? config.requestTimeout;
            timeouts.push(setConnectionTimeout(req, reject, config.connectionTimeout));
            timeouts.push(setRequestTimeout(req, reject, effectiveRequestTimeout, config.throwOnRequestTimeout, config.logger ?? console));
            timeouts.push(setSocketTimeout(req, reject, config.socketTimeout));
            const httpAgent = nodeHttpsOptions.agent;
            if (typeof httpAgent === "object" && "keepAlive" in httpAgent) {
                timeouts.push(setSocketKeepAlive(req, {
                    keepAlive: httpAgent.keepAlive,
                    keepAliveMsecs: httpAgent.keepAliveMsecs,
                }));
            }
            writeRequestBodyPromise = writeRequestBody(req, request, effectiveRequestTimeout, this.externalAgent).catch((e) => {
                timeouts.forEach(timing.clearTimeout);
                return _reject(e);
            });
        });
    }
    updateHttpClientConfig(key, value) {
        this.config = undefined;
        this.configProvider = this.configProvider.then((config) => {
            return {
                ...config,
                [key]: value,
            };
        });
    }
    httpHandlerConfigs() {
        return this.config ?? {};
    }
    resolveDefaultConfig(options) {
        const { requestTimeout, connectionTimeout, socketTimeout, socketAcquisitionWarningTimeout, httpAgent, httpsAgent, throwOnRequestTimeout, logger, } = options || {};
        const keepAlive = true;
        const maxSockets = 50;
        return {
            connectionTimeout,
            requestTimeout,
            socketTimeout,
            socketAcquisitionWarningTimeout,
            throwOnRequestTimeout,
            httpAgentProvider: async () => {
                const { Agent, request } = await Promise.resolve(/* import() */).then(__webpack_require__.t.bind(__webpack_require__, 37067, 23));
                hRequest = request;
                hAgent = Agent;
                if (httpAgent instanceof hAgent || typeof httpAgent?.destroy === "function") {
                    this.externalAgent = true;
                    return httpAgent;
                }
                return new hAgent({ keepAlive, maxSockets, ...httpAgent });
            },
            httpsAgent: (() => {
                if (httpsAgent instanceof node_https.Agent || typeof httpsAgent?.destroy === "function") {
                    this.externalAgent = true;
                    return httpsAgent;
                }
                return new node_https.Agent({ keepAlive, maxSockets, ...httpsAgent });
            })(),
            logger,
        };
    }
}

class NodeHttp2ConnectionPool {
    sessions = [];
    constructor(sessions) {
        this.sessions = sessions ?? [];
    }
    poll() {
        if (this.sessions.length > 0) {
            return this.sessions.shift();
        }
    }
    offerLast(session) {
        this.sessions.push(session);
    }
    contains(session) {
        return this.sessions.includes(session);
    }
    remove(session) {
        this.sessions = this.sessions.filter((s) => s !== session);
    }
    [Symbol.iterator]() {
        return this.sessions[Symbol.iterator]();
    }
    destroy(connection) {
        for (const session of this.sessions) {
            if (session === connection) {
                if (!session.destroyed) {
                    session.destroy();
                }
            }
        }
    }
}

class NodeHttp2ConnectionManager {
    constructor(config) {
        this.config = config;
        if (this.config.maxConcurrency && this.config.maxConcurrency <= 0) {
            throw new RangeError("maxConcurrency must be greater than zero.");
        }
    }
    config;
    sessionCache = new Map();
    lease(requestContext, connectionConfiguration) {
        const url = this.getUrlString(requestContext);
        const existingPool = this.sessionCache.get(url);
        if (existingPool) {
            const existingSession = existingPool.poll();
            if (existingSession && !this.config.disableConcurrency) {
                return existingSession;
            }
        }
        const session = http2.connect(url);
        if (this.config.maxConcurrency) {
            session.settings({ maxConcurrentStreams: this.config.maxConcurrency }, (err) => {
                if (err) {
                    throw new Error("Fail to set maxConcurrentStreams to " +
                        this.config.maxConcurrency +
                        "when creating new session for " +
                        requestContext.destination.toString());
                }
            });
        }
        session.unref();
        const destroySessionCb = () => {
            session.destroy();
            this.deleteSession(url, session);
        };
        session.on("goaway", destroySessionCb);
        session.on("error", destroySessionCb);
        session.on("frameError", destroySessionCb);
        session.on("close", () => this.deleteSession(url, session));
        if (connectionConfiguration.requestTimeout) {
            session.setTimeout(connectionConfiguration.requestTimeout, destroySessionCb);
        }
        const connectionPool = this.sessionCache.get(url) || new NodeHttp2ConnectionPool();
        connectionPool.offerLast(session);
        this.sessionCache.set(url, connectionPool);
        return session;
    }
    deleteSession(authority, session) {
        const existingConnectionPool = this.sessionCache.get(authority);
        if (!existingConnectionPool) {
            return;
        }
        if (!existingConnectionPool.contains(session)) {
            return;
        }
        existingConnectionPool.remove(session);
        this.sessionCache.set(authority, existingConnectionPool);
    }
    release(requestContext, session) {
        const cacheKey = this.getUrlString(requestContext);
        this.sessionCache.get(cacheKey)?.offerLast(session);
    }
    destroy() {
        for (const [key, connectionPool] of this.sessionCache) {
            for (const session of connectionPool) {
                if (!session.destroyed) {
                    session.destroy();
                }
                connectionPool.remove(session);
            }
            this.sessionCache.delete(key);
        }
    }
    setMaxConcurrentStreams(maxConcurrentStreams) {
        if (maxConcurrentStreams && maxConcurrentStreams <= 0) {
            throw new RangeError("maxConcurrentStreams must be greater than zero.");
        }
        this.config.maxConcurrency = maxConcurrentStreams;
    }
    setDisableConcurrentStreams(disableConcurrentStreams) {
        this.config.disableConcurrency = disableConcurrentStreams;
    }
    getUrlString(request) {
        return request.destination.toString();
    }
}

class NodeHttp2Handler {
    config;
    configProvider;
    metadata = { handlerProtocol: "h2" };
    connectionManager = new NodeHttp2ConnectionManager({});
    static create(instanceOrOptions) {
        if (typeof instanceOrOptions?.handle === "function") {
            return instanceOrOptions;
        }
        return new NodeHttp2Handler(instanceOrOptions);
    }
    constructor(options) {
        this.configProvider = new Promise((resolve, reject) => {
            if (typeof options === "function") {
                options()
                    .then((opts) => {
                    resolve(opts || {});
                })
                    .catch(reject);
            }
            else {
                resolve(options || {});
            }
        });
    }
    destroy() {
        this.connectionManager.destroy();
    }
    async handle(request, { abortSignal, requestTimeout } = {}) {
        if (!this.config) {
            this.config = await this.configProvider;
            this.connectionManager.setDisableConcurrentStreams(this.config.disableConcurrentStreams || false);
            if (this.config.maxConcurrentStreams) {
                this.connectionManager.setMaxConcurrentStreams(this.config.maxConcurrentStreams);
            }
        }
        const { requestTimeout: configRequestTimeout, disableConcurrentStreams } = this.config;
        const effectiveRequestTimeout = requestTimeout ?? configRequestTimeout;
        return new Promise((_resolve, _reject) => {
            let fulfilled = false;
            let writeRequestBodyPromise = undefined;
            const resolve = async (arg) => {
                await writeRequestBodyPromise;
                _resolve(arg);
            };
            const reject = async (arg) => {
                await writeRequestBodyPromise;
                _reject(arg);
            };
            if (abortSignal?.aborted) {
                fulfilled = true;
                const abortError = buildAbortError(abortSignal);
                reject(abortError);
                return;
            }
            const { hostname, method, port, protocol, query } = request;
            let auth = "";
            if (request.username != null || request.password != null) {
                const username = request.username ?? "";
                const password = request.password ?? "";
                auth = `${username}:${password}@`;
            }
            const authority = `${protocol}//${auth}${hostname}${port ? `:${port}` : ""}`;
            const requestContext = { destination: new URL(authority) };
            const session = this.connectionManager.lease(requestContext, {
                requestTimeout: this.config?.sessionTimeout,
                disableConcurrentStreams: disableConcurrentStreams || false,
            });
            const rejectWithDestroy = (err) => {
                if (disableConcurrentStreams) {
                    this.destroySession(session);
                }
                fulfilled = true;
                reject(err);
            };
            const queryString = querystringBuilder.buildQueryString(query || {});
            let path = request.path;
            if (queryString) {
                path += `?${queryString}`;
            }
            if (request.fragment) {
                path += `#${request.fragment}`;
            }
            const req = session.request({
                ...request.headers,
                [http2.constants.HTTP2_HEADER_PATH]: path,
                [http2.constants.HTTP2_HEADER_METHOD]: method,
            });
            session.ref();
            req.on("response", (headers) => {
                const httpResponse = new protocolHttp.HttpResponse({
                    statusCode: headers[":status"] || -1,
                    headers: getTransformedHeaders(headers),
                    body: req,
                });
                fulfilled = true;
                resolve({ response: httpResponse });
                if (disableConcurrentStreams) {
                    session.close();
                    this.connectionManager.deleteSession(authority, session);
                }
            });
            if (effectiveRequestTimeout) {
                req.setTimeout(effectiveRequestTimeout, () => {
                    req.close();
                    const timeoutError = new Error(`Stream timed out because of no activity for ${effectiveRequestTimeout} ms`);
                    timeoutError.name = "TimeoutError";
                    rejectWithDestroy(timeoutError);
                });
            }
            if (abortSignal) {
                const onAbort = () => {
                    req.close();
                    const abortError = buildAbortError(abortSignal);
                    rejectWithDestroy(abortError);
                };
                if (typeof abortSignal.addEventListener === "function") {
                    const signal = abortSignal;
                    signal.addEventListener("abort", onAbort, { once: true });
                    req.once("close", () => signal.removeEventListener("abort", onAbort));
                }
                else {
                    abortSignal.onabort = onAbort;
                }
            }
            req.on("frameError", (type, code, id) => {
                rejectWithDestroy(new Error(`Frame type id ${type} in stream id ${id} has failed with code ${code}.`));
            });
            req.on("error", rejectWithDestroy);
            req.on("aborted", () => {
                rejectWithDestroy(new Error(`HTTP/2 stream is abnormally aborted in mid-communication with result code ${req.rstCode}.`));
            });
            req.on("close", () => {
                session.unref();
                if (disableConcurrentStreams) {
                    session.destroy();
                }
                if (!fulfilled) {
                    rejectWithDestroy(new Error("Unexpected error: http2 request did not get a response"));
                }
            });
            writeRequestBodyPromise = writeRequestBody(req, request, effectiveRequestTimeout);
        });
    }
    updateHttpClientConfig(key, value) {
        this.config = undefined;
        this.configProvider = this.configProvider.then((config) => {
            return {
                ...config,
                [key]: value,
            };
        });
    }
    httpHandlerConfigs() {
        return this.config ?? {};
    }
    destroySession(session) {
        if (!session.destroyed) {
            session.destroy();
        }
    }
}

class Collector extends node_stream.Writable {
    bufferedBytes = [];
    _write(chunk, encoding, callback) {
        this.bufferedBytes.push(chunk);
        callback();
    }
}

const streamCollector = (stream) => {
    if (isReadableStreamInstance(stream)) {
        return collectReadableStream(stream);
    }
    return new Promise((resolve, reject) => {
        const collector = new Collector();
        stream.pipe(collector);
        stream.on("error", (err) => {
            collector.end();
            reject(err);
        });
        collector.on("error", reject);
        collector.on("finish", function () {
            const bytes = new Uint8Array(Buffer.concat(this.bufferedBytes));
            resolve(bytes);
        });
    });
};
const isReadableStreamInstance = (stream) => typeof ReadableStream === "function" && stream instanceof ReadableStream;
async function collectReadableStream(stream) {
    const chunks = [];
    const reader = stream.getReader();
    let isDone = false;
    let length = 0;
    while (!isDone) {
        const { done, value } = await reader.read();
        if (value) {
            chunks.push(value);
            length += value.length;
        }
        isDone = done;
    }
    const collected = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        collected.set(chunk, offset);
        offset += chunk.length;
    }
    return collected;
}

exports.DEFAULT_REQUEST_TIMEOUT = DEFAULT_REQUEST_TIMEOUT;
exports.NodeHttp2Handler = NodeHttp2Handler;
exports.NodeHttpHandler = NodeHttpHandler;
exports.streamCollector = streamCollector;


/***/ }),

/***/ 71238:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


class ProviderError extends Error {
    name = "ProviderError";
    tryNextLink;
    constructor(message, options = true) {
        let logger;
        let tryNextLink = true;
        if (typeof options === "boolean") {
            logger = undefined;
            tryNextLink = options;
        }
        else if (options != null && typeof options === "object") {
            logger = options.logger;
            tryNextLink = options.tryNextLink ?? true;
        }
        super(message);
        this.tryNextLink = tryNextLink;
        Object.setPrototypeOf(this, ProviderError.prototype);
        logger?.debug?.(`@smithy/property-provider ${tryNextLink ? "->" : "(!)"} ${message}`);
    }
    static from(error, options = true) {
        return Object.assign(new this(error.message, options), error);
    }
}

class CredentialsProviderError extends ProviderError {
    name = "CredentialsProviderError";
    constructor(message, options = true) {
        super(message, options);
        Object.setPrototypeOf(this, CredentialsProviderError.prototype);
    }
}

class TokenProviderError extends ProviderError {
    name = "TokenProviderError";
    constructor(message, options = true) {
        super(message, options);
        Object.setPrototypeOf(this, TokenProviderError.prototype);
    }
}

const chain = (...providers) => async () => {
    if (providers.length === 0) {
        throw new ProviderError("No providers in chain");
    }
    let lastProviderError;
    for (const provider of providers) {
        try {
            const credentials = await provider();
            return credentials;
        }
        catch (err) {
            lastProviderError = err;
            if (err?.tryNextLink) {
                continue;
            }
            throw err;
        }
    }
    throw lastProviderError;
};

const fromStatic = (staticValue) => () => Promise.resolve(staticValue);

const memoize = (provider, isExpired, requiresRefresh) => {
    let resolved;
    let pending;
    let hasResult;
    let isConstant = false;
    const coalesceProvider = async () => {
        if (!pending) {
            pending = provider();
        }
        try {
            resolved = await pending;
            hasResult = true;
            isConstant = false;
        }
        finally {
            pending = undefined;
        }
        return resolved;
    };
    if (isExpired === undefined) {
        return async (options) => {
            if (!hasResult || options?.forceRefresh) {
                resolved = await coalesceProvider();
            }
            return resolved;
        };
    }
    return async (options) => {
        if (!hasResult || options?.forceRefresh) {
            resolved = await coalesceProvider();
        }
        if (isConstant) {
            return resolved;
        }
        if (requiresRefresh && !requiresRefresh(resolved)) {
            isConstant = true;
            return resolved;
        }
        if (isExpired(resolved)) {
            await coalesceProvider();
            return resolved;
        }
        return resolved;
    };
};

exports.CredentialsProviderError = CredentialsProviderError;
exports.ProviderError = ProviderError;
exports.TokenProviderError = TokenProviderError;
exports.chain = chain;
exports.fromStatic = fromStatic;
exports.memoize = memoize;


/***/ }),

/***/ 72356:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var types = __webpack_require__(90690);

const getHttpHandlerExtensionConfiguration = (runtimeConfig) => {
    return {
        setHttpHandler(handler) {
            runtimeConfig.httpHandler = handler;
        },
        httpHandler() {
            return runtimeConfig.httpHandler;
        },
        updateHttpClientConfig(key, value) {
            runtimeConfig.httpHandler?.updateHttpClientConfig(key, value);
        },
        httpHandlerConfigs() {
            return runtimeConfig.httpHandler.httpHandlerConfigs();
        },
    };
};
const resolveHttpHandlerRuntimeConfig = (httpHandlerExtensionConfiguration) => {
    return {
        httpHandler: httpHandlerExtensionConfiguration.httpHandler(),
    };
};

class Field {
    name;
    kind;
    values;
    constructor({ name, kind = types.FieldPosition.HEADER, values = [] }) {
        this.name = name;
        this.kind = kind;
        this.values = values;
    }
    add(value) {
        this.values.push(value);
    }
    set(values) {
        this.values = values;
    }
    remove(value) {
        this.values = this.values.filter((v) => v !== value);
    }
    toString() {
        return this.values.map((v) => (v.includes(",") || v.includes(" ") ? `"${v}"` : v)).join(", ");
    }
    get() {
        return this.values;
    }
}

class Fields {
    entries = {};
    encoding;
    constructor({ fields = [], encoding = "utf-8" }) {
        fields.forEach(this.setField.bind(this));
        this.encoding = encoding;
    }
    setField(field) {
        this.entries[field.name.toLowerCase()] = field;
    }
    getField(name) {
        return this.entries[name.toLowerCase()];
    }
    removeField(name) {
        delete this.entries[name.toLowerCase()];
    }
    getByType(kind) {
        return Object.values(this.entries).filter((field) => field.kind === kind);
    }
}

class HttpRequest {
    method;
    protocol;
    hostname;
    port;
    path;
    query;
    headers;
    username;
    password;
    fragment;
    body;
    constructor(options) {
        this.method = options.method || "GET";
        this.hostname = options.hostname || "localhost";
        this.port = options.port;
        this.query = options.query || {};
        this.headers = options.headers || {};
        this.body = options.body;
        this.protocol = options.protocol
            ? options.protocol.slice(-1) !== ":"
                ? `${options.protocol}:`
                : options.protocol
            : "https:";
        this.path = options.path ? (options.path.charAt(0) !== "/" ? `/${options.path}` : options.path) : "/";
        this.username = options.username;
        this.password = options.password;
        this.fragment = options.fragment;
    }
    static clone(request) {
        const cloned = new HttpRequest({
            ...request,
            headers: { ...request.headers },
        });
        if (cloned.query) {
            cloned.query = cloneQuery(cloned.query);
        }
        return cloned;
    }
    static isInstance(request) {
        if (!request) {
            return false;
        }
        const req = request;
        return ("method" in req &&
            "protocol" in req &&
            "hostname" in req &&
            "path" in req &&
            typeof req["query"] === "object" &&
            typeof req["headers"] === "object");
    }
    clone() {
        return HttpRequest.clone(this);
    }
}
function cloneQuery(query) {
    return Object.keys(query).reduce((carry, paramName) => {
        const param = query[paramName];
        return {
            ...carry,
            [paramName]: Array.isArray(param) ? [...param] : param,
        };
    }, {});
}

class HttpResponse {
    statusCode;
    reason;
    headers;
    body;
    constructor(options) {
        this.statusCode = options.statusCode;
        this.reason = options.reason;
        this.headers = options.headers || {};
        this.body = options.body;
    }
    static isInstance(response) {
        if (!response)
            return false;
        const resp = response;
        return typeof resp.statusCode === "number" && typeof resp.headers === "object";
    }
}

function isValidHostname(hostname) {
    const hostPattern = /^[a-z0-9][a-z0-9\.\-]*[a-z0-9]$/;
    return hostPattern.test(hostname);
}

exports.Field = Field;
exports.Fields = Fields;
exports.HttpRequest = HttpRequest;
exports.HttpResponse = HttpResponse;
exports.getHttpHandlerExtensionConfiguration = getHttpHandlerExtensionConfiguration;
exports.isValidHostname = isValidHostname;
exports.resolveHttpHandlerRuntimeConfig = resolveHttpHandlerRuntimeConfig;


/***/ }),

/***/ 18256:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var utilUriEscape = __webpack_require__(80146);

function buildQueryString(query) {
    const parts = [];
    for (let key of Object.keys(query).sort()) {
        const value = query[key];
        key = utilUriEscape.escapeUri(key);
        if (Array.isArray(value)) {
            for (let i = 0, iLen = value.length; i < iLen; i++) {
                parts.push(`${key}=${utilUriEscape.escapeUri(value[i])}`);
            }
        }
        else {
            let qsEntry = key;
            if (value || typeof value === "string") {
                qsEntry += `=${utilUriEscape.escapeUri(value)}`;
            }
            parts.push(qsEntry);
        }
    }
    return parts.join("&");
}

exports.buildQueryString = buildQueryString;


/***/ }),

/***/ 18822:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


function parseQueryString(querystring) {
    const query = {};
    querystring = querystring.replace(/^\?/, "");
    if (querystring) {
        for (const pair of querystring.split("&")) {
            let [key, value = null] = pair.split("=");
            key = decodeURIComponent(key);
            if (value) {
                value = decodeURIComponent(value);
            }
            if (!(key in query)) {
                query[key] = value;
            }
            else if (Array.isArray(query[key])) {
                query[key].push(value);
            }
            else {
                query[key] = [query[key], value];
            }
        }
    }
    return query;
}

exports.parseQueryString = parseQueryString;


/***/ }),

/***/ 42058:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


const CLOCK_SKEW_ERROR_CODES = [
    "AuthFailure",
    "InvalidSignatureException",
    "RequestExpired",
    "RequestInTheFuture",
    "RequestTimeTooSkewed",
    "SignatureDoesNotMatch",
];
const THROTTLING_ERROR_CODES = [
    "BandwidthLimitExceeded",
    "EC2ThrottledException",
    "LimitExceededException",
    "PriorRequestNotComplete",
    "ProvisionedThroughputExceededException",
    "RequestLimitExceeded",
    "RequestThrottled",
    "RequestThrottledException",
    "SlowDown",
    "ThrottledException",
    "Throttling",
    "ThrottlingException",
    "TooManyRequestsException",
    "TransactionInProgressException",
];
const TRANSIENT_ERROR_CODES = ["TimeoutError", "RequestTimeout", "RequestTimeoutException"];
const TRANSIENT_ERROR_STATUS_CODES = [500, 502, 503, 504];
const NODEJS_TIMEOUT_ERROR_CODES = ["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT"];
const NODEJS_NETWORK_ERROR_CODES = ["EHOSTUNREACH", "ENETUNREACH", "ENOTFOUND"];

const isRetryableByTrait = (error) => error?.$retryable !== undefined;
const isClockSkewError = (error) => CLOCK_SKEW_ERROR_CODES.includes(error.name);
const isClockSkewCorrectedError = (error) => error.$metadata?.clockSkewCorrected;
const isBrowserNetworkError = (error) => {
    const errorMessages = new Set([
        "Failed to fetch",
        "NetworkError when attempting to fetch resource",
        "The Internet connection appears to be offline",
        "Load failed",
        "Network request failed",
    ]);
    const isValid = error && error instanceof TypeError;
    if (!isValid) {
        return false;
    }
    return errorMessages.has(error.message);
};
const isThrottlingError = (error) => error.$metadata?.httpStatusCode === 429 ||
    THROTTLING_ERROR_CODES.includes(error.name) ||
    error.$retryable?.throttling == true;
const isTransientError = (error, depth = 0) => isRetryableByTrait(error) ||
    isClockSkewCorrectedError(error) ||
    TRANSIENT_ERROR_CODES.includes(error.name) ||
    NODEJS_TIMEOUT_ERROR_CODES.includes(error?.code || "") ||
    NODEJS_NETWORK_ERROR_CODES.includes(error?.code || "") ||
    TRANSIENT_ERROR_STATUS_CODES.includes(error.$metadata?.httpStatusCode || 0) ||
    isBrowserNetworkError(error) ||
    (error.cause !== undefined && depth <= 10 && isTransientError(error.cause, depth + 1));
const isServerError = (error) => {
    if (error.$metadata?.httpStatusCode !== undefined) {
        const statusCode = error.$metadata.httpStatusCode;
        if (500 <= statusCode && statusCode <= 599 && !isTransientError(error)) {
            return true;
        }
        return false;
    }
    return false;
};

exports.isBrowserNetworkError = isBrowserNetworkError;
exports.isClockSkewCorrectedError = isClockSkewCorrectedError;
exports.isClockSkewError = isClockSkewError;
exports.isRetryableByTrait = isRetryableByTrait;
exports.isServerError = isServerError;
exports.isThrottlingError = isThrottlingError;
exports.isTransientError = isTransientError;


/***/ }),

/***/ 54172:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getHomeDir = void 0;
const os_1 = __webpack_require__(70857);
const path_1 = __webpack_require__(16928);
const homeDirCache = {};
const getHomeDirCacheKey = () => {
    if (process && process.geteuid) {
        return `${process.geteuid()}`;
    }
    return "DEFAULT";
};
const getHomeDir = () => {
    const { HOME, USERPROFILE, HOMEPATH, HOMEDRIVE = `C:${path_1.sep}` } = process.env;
    if (HOME)
        return HOME;
    if (USERPROFILE)
        return USERPROFILE;
    if (HOMEPATH)
        return `${HOMEDRIVE}${HOMEPATH}`;
    const homeDirCacheKey = getHomeDirCacheKey();
    if (!homeDirCache[homeDirCacheKey])
        homeDirCache[homeDirCacheKey] = (0, os_1.homedir)();
    return homeDirCache[homeDirCacheKey];
};
exports.getHomeDir = getHomeDir;


/***/ }),

/***/ 20269:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getSSOTokenFilepath = void 0;
const crypto_1 = __webpack_require__(76982);
const path_1 = __webpack_require__(16928);
const getHomeDir_1 = __webpack_require__(54172);
const getSSOTokenFilepath = (id) => {
    const hasher = (0, crypto_1.createHash)("sha1");
    const cacheName = hasher.update(id).digest("hex");
    return (0, path_1.join)((0, getHomeDir_1.getHomeDir)(), ".aws", "sso", "cache", `${cacheName}.json`);
};
exports.getSSOTokenFilepath = getSSOTokenFilepath;


/***/ }),

/***/ 11326:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getSSOTokenFromFile = exports.tokenIntercept = void 0;
const promises_1 = __webpack_require__(91943);
const getSSOTokenFilepath_1 = __webpack_require__(20269);
exports.tokenIntercept = {};
const getSSOTokenFromFile = async (id) => {
    if (exports.tokenIntercept[id]) {
        return exports.tokenIntercept[id];
    }
    const ssoTokenFilepath = (0, getSSOTokenFilepath_1.getSSOTokenFilepath)(id);
    const ssoTokenText = await (0, promises_1.readFile)(ssoTokenFilepath, "utf8");
    return JSON.parse(ssoTokenText);
};
exports.getSSOTokenFromFile = getSSOTokenFromFile;


/***/ }),

/***/ 94964:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var getHomeDir = __webpack_require__(54172);
var getSSOTokenFilepath = __webpack_require__(20269);
var getSSOTokenFromFile = __webpack_require__(11326);
var path = __webpack_require__(16928);
var types = __webpack_require__(90690);
var readFile = __webpack_require__(96684);

const ENV_PROFILE = "AWS_PROFILE";
const DEFAULT_PROFILE = "default";
const getProfileName = (init) => init.profile || process.env[ENV_PROFILE] || DEFAULT_PROFILE;

const CONFIG_PREFIX_SEPARATOR = ".";

const getConfigData = (data) => Object.entries(data)
    .filter(([key]) => {
    const indexOfSeparator = key.indexOf(CONFIG_PREFIX_SEPARATOR);
    if (indexOfSeparator === -1) {
        return false;
    }
    return Object.values(types.IniSectionType).includes(key.substring(0, indexOfSeparator));
})
    .reduce((acc, [key, value]) => {
    const indexOfSeparator = key.indexOf(CONFIG_PREFIX_SEPARATOR);
    const updatedKey = key.substring(0, indexOfSeparator) === types.IniSectionType.PROFILE ? key.substring(indexOfSeparator + 1) : key;
    acc[updatedKey] = value;
    return acc;
}, {
    ...(data.default && { default: data.default }),
});

const ENV_CONFIG_PATH = "AWS_CONFIG_FILE";
const getConfigFilepath = () => process.env[ENV_CONFIG_PATH] || path.join(getHomeDir.getHomeDir(), ".aws", "config");

const ENV_CREDENTIALS_PATH = "AWS_SHARED_CREDENTIALS_FILE";
const getCredentialsFilepath = () => process.env[ENV_CREDENTIALS_PATH] || path.join(getHomeDir.getHomeDir(), ".aws", "credentials");

const prefixKeyRegex = /^([\w-]+)\s(["'])?([\w-@\+\.%:/]+)\2$/;
const profileNameBlockList = ["__proto__", "profile __proto__"];
const parseIni = (iniData) => {
    const map = {};
    let currentSection;
    let currentSubSection;
    for (const iniLine of iniData.split(/\r?\n/)) {
        const trimmedLine = iniLine.split(/(^|\s)[;#]/)[0].trim();
        const isSection = trimmedLine[0] === "[" && trimmedLine[trimmedLine.length - 1] === "]";
        if (isSection) {
            currentSection = undefined;
            currentSubSection = undefined;
            const sectionName = trimmedLine.substring(1, trimmedLine.length - 1);
            const matches = prefixKeyRegex.exec(sectionName);
            if (matches) {
                const [, prefix, , name] = matches;
                if (Object.values(types.IniSectionType).includes(prefix)) {
                    currentSection = [prefix, name].join(CONFIG_PREFIX_SEPARATOR);
                }
            }
            else {
                currentSection = sectionName;
            }
            if (profileNameBlockList.includes(sectionName)) {
                throw new Error(`Found invalid profile name "${sectionName}"`);
            }
        }
        else if (currentSection) {
            const indexOfEqualsSign = trimmedLine.indexOf("=");
            if (![0, -1].includes(indexOfEqualsSign)) {
                const [name, value] = [
                    trimmedLine.substring(0, indexOfEqualsSign).trim(),
                    trimmedLine.substring(indexOfEqualsSign + 1).trim(),
                ];
                if (value === "") {
                    currentSubSection = name;
                }
                else {
                    if (currentSubSection && iniLine.trimStart() === iniLine) {
                        currentSubSection = undefined;
                    }
                    map[currentSection] = map[currentSection] || {};
                    const key = currentSubSection ? [currentSubSection, name].join(CONFIG_PREFIX_SEPARATOR) : name;
                    map[currentSection][key] = value;
                }
            }
        }
    }
    return map;
};

const swallowError$1 = () => ({});
const loadSharedConfigFiles = async (init = {}) => {
    const { filepath = getCredentialsFilepath(), configFilepath = getConfigFilepath() } = init;
    const homeDir = getHomeDir.getHomeDir();
    const relativeHomeDirPrefix = "~/";
    let resolvedFilepath = filepath;
    if (filepath.startsWith(relativeHomeDirPrefix)) {
        resolvedFilepath = path.join(homeDir, filepath.slice(2));
    }
    let resolvedConfigFilepath = configFilepath;
    if (configFilepath.startsWith(relativeHomeDirPrefix)) {
        resolvedConfigFilepath = path.join(homeDir, configFilepath.slice(2));
    }
    const parsedFiles = await Promise.all([
        readFile.readFile(resolvedConfigFilepath, {
            ignoreCache: init.ignoreCache,
        })
            .then(parseIni)
            .then(getConfigData)
            .catch(swallowError$1),
        readFile.readFile(resolvedFilepath, {
            ignoreCache: init.ignoreCache,
        })
            .then(parseIni)
            .catch(swallowError$1),
    ]);
    return {
        configFile: parsedFiles[0],
        credentialsFile: parsedFiles[1],
    };
};

const getSsoSessionData = (data) => Object.entries(data)
    .filter(([key]) => key.startsWith(types.IniSectionType.SSO_SESSION + CONFIG_PREFIX_SEPARATOR))
    .reduce((acc, [key, value]) => ({ ...acc, [key.substring(key.indexOf(CONFIG_PREFIX_SEPARATOR) + 1)]: value }), {});

const swallowError = () => ({});
const loadSsoSessionData = async (init = {}) => readFile.readFile(init.configFilepath ?? getConfigFilepath())
    .then(parseIni)
    .then(getSsoSessionData)
    .catch(swallowError);

const mergeConfigFiles = (...files) => {
    const merged = {};
    for (const file of files) {
        for (const [key, values] of Object.entries(file)) {
            if (merged[key] !== undefined) {
                Object.assign(merged[key], values);
            }
            else {
                merged[key] = values;
            }
        }
    }
    return merged;
};

const parseKnownFiles = async (init) => {
    const parsedFiles = await loadSharedConfigFiles(init);
    return mergeConfigFiles(parsedFiles.configFile, parsedFiles.credentialsFile);
};

const externalDataInterceptor = {
    getFileRecord() {
        return readFile.fileIntercept;
    },
    interceptFile(path, contents) {
        readFile.fileIntercept[path] = Promise.resolve(contents);
    },
    getTokenRecord() {
        return getSSOTokenFromFile.tokenIntercept;
    },
    interceptToken(id, contents) {
        getSSOTokenFromFile.tokenIntercept[id] = contents;
    },
};

exports.getSSOTokenFromFile = getSSOTokenFromFile.getSSOTokenFromFile;
exports.readFile = readFile.readFile;
exports.CONFIG_PREFIX_SEPARATOR = CONFIG_PREFIX_SEPARATOR;
exports.DEFAULT_PROFILE = DEFAULT_PROFILE;
exports.ENV_PROFILE = ENV_PROFILE;
exports.externalDataInterceptor = externalDataInterceptor;
exports.getProfileName = getProfileName;
exports.loadSharedConfigFiles = loadSharedConfigFiles;
exports.loadSsoSessionData = loadSsoSessionData;
exports.parseKnownFiles = parseKnownFiles;
Object.prototype.hasOwnProperty.call(getHomeDir, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: getHomeDir['__proto__']
    });

Object.keys(getHomeDir).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = getHomeDir[k];
});
Object.prototype.hasOwnProperty.call(getSSOTokenFilepath, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: getSSOTokenFilepath['__proto__']
    });

Object.keys(getSSOTokenFilepath).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = getSSOTokenFilepath[k];
});


/***/ }),

/***/ 96684:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.readFile = exports.fileIntercept = exports.filePromises = void 0;
const promises_1 = __webpack_require__(51455);
exports.filePromises = {};
exports.fileIntercept = {};
const readFile = (path, options) => {
    if (exports.fileIntercept[path] !== undefined) {
        return exports.fileIntercept[path];
    }
    if (!exports.filePromises[path] || options?.ignoreCache) {
        exports.filePromises[path] = (0, promises_1.readFile)(path, "utf8");
    }
    return exports.filePromises[path];
};
exports.readFile = readFile;


/***/ }),

/***/ 75118:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var utilHexEncoding = __webpack_require__(96435);
var utilUtf8 = __webpack_require__(71577);
var isArrayBuffer = __webpack_require__(86130);
var protocolHttp = __webpack_require__(72356);
var utilMiddleware = __webpack_require__(76324);
var utilUriEscape = __webpack_require__(80146);

const ALGORITHM_QUERY_PARAM = "X-Amz-Algorithm";
const CREDENTIAL_QUERY_PARAM = "X-Amz-Credential";
const AMZ_DATE_QUERY_PARAM = "X-Amz-Date";
const SIGNED_HEADERS_QUERY_PARAM = "X-Amz-SignedHeaders";
const EXPIRES_QUERY_PARAM = "X-Amz-Expires";
const SIGNATURE_QUERY_PARAM = "X-Amz-Signature";
const TOKEN_QUERY_PARAM = "X-Amz-Security-Token";
const REGION_SET_PARAM = "X-Amz-Region-Set";
const AUTH_HEADER = "authorization";
const AMZ_DATE_HEADER = AMZ_DATE_QUERY_PARAM.toLowerCase();
const DATE_HEADER = "date";
const GENERATED_HEADERS = [AUTH_HEADER, AMZ_DATE_HEADER, DATE_HEADER];
const SIGNATURE_HEADER = SIGNATURE_QUERY_PARAM.toLowerCase();
const SHA256_HEADER = "x-amz-content-sha256";
const TOKEN_HEADER = TOKEN_QUERY_PARAM.toLowerCase();
const HOST_HEADER = "host";
const ALWAYS_UNSIGNABLE_HEADERS = {
    authorization: true,
    "cache-control": true,
    connection: true,
    expect: true,
    from: true,
    "keep-alive": true,
    "max-forwards": true,
    pragma: true,
    referer: true,
    te: true,
    trailer: true,
    "transfer-encoding": true,
    upgrade: true,
    "user-agent": true,
    "x-amzn-trace-id": true,
};
const PROXY_HEADER_PATTERN = /^proxy-/;
const SEC_HEADER_PATTERN = /^sec-/;
const UNSIGNABLE_PATTERNS = [/^proxy-/i, /^sec-/i];
const ALGORITHM_IDENTIFIER = "AWS4-HMAC-SHA256";
const ALGORITHM_IDENTIFIER_V4A = "AWS4-ECDSA-P256-SHA256";
const EVENT_ALGORITHM_IDENTIFIER = "AWS4-HMAC-SHA256-PAYLOAD";
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
const MAX_CACHE_SIZE = 50;
const KEY_TYPE_IDENTIFIER = "aws4_request";
const MAX_PRESIGNED_TTL = 60 * 60 * 24 * 7;

const signingKeyCache = {};
const cacheQueue = [];
const createScope = (shortDate, region, service) => `${shortDate}/${region}/${service}/${KEY_TYPE_IDENTIFIER}`;
const getSigningKey = async (sha256Constructor, credentials, shortDate, region, service) => {
    const credsHash = await hmac(sha256Constructor, credentials.secretAccessKey, credentials.accessKeyId);
    const cacheKey = `${shortDate}:${region}:${service}:${utilHexEncoding.toHex(credsHash)}:${credentials.sessionToken}`;
    if (cacheKey in signingKeyCache) {
        return signingKeyCache[cacheKey];
    }
    cacheQueue.push(cacheKey);
    while (cacheQueue.length > MAX_CACHE_SIZE) {
        delete signingKeyCache[cacheQueue.shift()];
    }
    let key = `AWS4${credentials.secretAccessKey}`;
    for (const signable of [shortDate, region, service, KEY_TYPE_IDENTIFIER]) {
        key = await hmac(sha256Constructor, key, signable);
    }
    return (signingKeyCache[cacheKey] = key);
};
const clearCredentialCache = () => {
    cacheQueue.length = 0;
    Object.keys(signingKeyCache).forEach((cacheKey) => {
        delete signingKeyCache[cacheKey];
    });
};
const hmac = (ctor, secret, data) => {
    const hash = new ctor(secret);
    hash.update(utilUtf8.toUint8Array(data));
    return hash.digest();
};

const getCanonicalHeaders = ({ headers }, unsignableHeaders, signableHeaders) => {
    const canonical = {};
    for (const headerName of Object.keys(headers).sort()) {
        if (headers[headerName] == undefined) {
            continue;
        }
        const canonicalHeaderName = headerName.toLowerCase();
        if (canonicalHeaderName in ALWAYS_UNSIGNABLE_HEADERS ||
            unsignableHeaders?.has(canonicalHeaderName) ||
            PROXY_HEADER_PATTERN.test(canonicalHeaderName) ||
            SEC_HEADER_PATTERN.test(canonicalHeaderName)) {
            if (!signableHeaders || (signableHeaders && !signableHeaders.has(canonicalHeaderName))) {
                continue;
            }
        }
        canonical[canonicalHeaderName] = headers[headerName].trim().replace(/\s+/g, " ");
    }
    return canonical;
};

const getPayloadHash = async ({ headers, body }, hashConstructor) => {
    for (const headerName of Object.keys(headers)) {
        if (headerName.toLowerCase() === SHA256_HEADER) {
            return headers[headerName];
        }
    }
    if (body == undefined) {
        return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    }
    else if (typeof body === "string" || ArrayBuffer.isView(body) || isArrayBuffer.isArrayBuffer(body)) {
        const hashCtor = new hashConstructor();
        hashCtor.update(utilUtf8.toUint8Array(body));
        return utilHexEncoding.toHex(await hashCtor.digest());
    }
    return UNSIGNED_PAYLOAD;
};

class HeaderFormatter {
    format(headers) {
        const chunks = [];
        for (const headerName of Object.keys(headers)) {
            const bytes = utilUtf8.fromUtf8(headerName);
            chunks.push(Uint8Array.from([bytes.byteLength]), bytes, this.formatHeaderValue(headers[headerName]));
        }
        const out = new Uint8Array(chunks.reduce((carry, bytes) => carry + bytes.byteLength, 0));
        let position = 0;
        for (const chunk of chunks) {
            out.set(chunk, position);
            position += chunk.byteLength;
        }
        return out;
    }
    formatHeaderValue(header) {
        switch (header.type) {
            case "boolean":
                return Uint8Array.from([header.value ? 0 : 1]);
            case "byte":
                return Uint8Array.from([2, header.value]);
            case "short":
                const shortView = new DataView(new ArrayBuffer(3));
                shortView.setUint8(0, 3);
                shortView.setInt16(1, header.value, false);
                return new Uint8Array(shortView.buffer);
            case "integer":
                const intView = new DataView(new ArrayBuffer(5));
                intView.setUint8(0, 4);
                intView.setInt32(1, header.value, false);
                return new Uint8Array(intView.buffer);
            case "long":
                const longBytes = new Uint8Array(9);
                longBytes[0] = 5;
                longBytes.set(header.value.bytes, 1);
                return longBytes;
            case "binary":
                const binView = new DataView(new ArrayBuffer(3 + header.value.byteLength));
                binView.setUint8(0, 6);
                binView.setUint16(1, header.value.byteLength, false);
                const binBytes = new Uint8Array(binView.buffer);
                binBytes.set(header.value, 3);
                return binBytes;
            case "string":
                const utf8Bytes = utilUtf8.fromUtf8(header.value);
                const strView = new DataView(new ArrayBuffer(3 + utf8Bytes.byteLength));
                strView.setUint8(0, 7);
                strView.setUint16(1, utf8Bytes.byteLength, false);
                const strBytes = new Uint8Array(strView.buffer);
                strBytes.set(utf8Bytes, 3);
                return strBytes;
            case "timestamp":
                const tsBytes = new Uint8Array(9);
                tsBytes[0] = 8;
                tsBytes.set(Int64.fromNumber(header.value.valueOf()).bytes, 1);
                return tsBytes;
            case "uuid":
                if (!UUID_PATTERN.test(header.value)) {
                    throw new Error(`Invalid UUID received: ${header.value}`);
                }
                const uuidBytes = new Uint8Array(17);
                uuidBytes[0] = 9;
                uuidBytes.set(utilHexEncoding.fromHex(header.value.replace(/\-/g, "")), 1);
                return uuidBytes;
        }
    }
}
var HEADER_VALUE_TYPE;
(function (HEADER_VALUE_TYPE) {
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["boolTrue"] = 0] = "boolTrue";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["boolFalse"] = 1] = "boolFalse";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["byte"] = 2] = "byte";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["short"] = 3] = "short";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["integer"] = 4] = "integer";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["long"] = 5] = "long";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["byteArray"] = 6] = "byteArray";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["string"] = 7] = "string";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["timestamp"] = 8] = "timestamp";
    HEADER_VALUE_TYPE[HEADER_VALUE_TYPE["uuid"] = 9] = "uuid";
})(HEADER_VALUE_TYPE || (HEADER_VALUE_TYPE = {}));
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
class Int64 {
    bytes;
    constructor(bytes) {
        this.bytes = bytes;
        if (bytes.byteLength !== 8) {
            throw new Error("Int64 buffers must be exactly 8 bytes");
        }
    }
    static fromNumber(number) {
        if (number > 9_223_372_036_854_775_807 || number < -9223372036854776e3) {
            throw new Error(`${number} is too large (or, if negative, too small) to represent as an Int64`);
        }
        const bytes = new Uint8Array(8);
        for (let i = 7, remaining = Math.abs(Math.round(number)); i > -1 && remaining > 0; i--, remaining /= 256) {
            bytes[i] = remaining;
        }
        if (number < 0) {
            negate(bytes);
        }
        return new Int64(bytes);
    }
    valueOf() {
        const bytes = this.bytes.slice(0);
        const negative = bytes[0] & 0b10000000;
        if (negative) {
            negate(bytes);
        }
        return parseInt(utilHexEncoding.toHex(bytes), 16) * (negative ? -1 : 1);
    }
    toString() {
        return String(this.valueOf());
    }
}
function negate(bytes) {
    for (let i = 0; i < 8; i++) {
        bytes[i] ^= 0xff;
    }
    for (let i = 7; i > -1; i--) {
        bytes[i]++;
        if (bytes[i] !== 0)
            break;
    }
}

const hasHeader = (soughtHeader, headers) => {
    soughtHeader = soughtHeader.toLowerCase();
    for (const headerName of Object.keys(headers)) {
        if (soughtHeader === headerName.toLowerCase()) {
            return true;
        }
    }
    return false;
};

const moveHeadersToQuery = (request, options = {}) => {
    const { headers, query = {} } = protocolHttp.HttpRequest.clone(request);
    for (const name of Object.keys(headers)) {
        const lname = name.toLowerCase();
        if ((lname.slice(0, 6) === "x-amz-" && !options.unhoistableHeaders?.has(lname)) ||
            options.hoistableHeaders?.has(lname)) {
            query[name] = headers[name];
            delete headers[name];
        }
    }
    return {
        ...request,
        headers,
        query,
    };
};

const prepareRequest = (request) => {
    request = protocolHttp.HttpRequest.clone(request);
    for (const headerName of Object.keys(request.headers)) {
        if (GENERATED_HEADERS.indexOf(headerName.toLowerCase()) > -1) {
            delete request.headers[headerName];
        }
    }
    return request;
};

const getCanonicalQuery = ({ query = {} }) => {
    const keys = [];
    const serialized = {};
    for (const key of Object.keys(query)) {
        if (key.toLowerCase() === SIGNATURE_HEADER) {
            continue;
        }
        const encodedKey = utilUriEscape.escapeUri(key);
        keys.push(encodedKey);
        const value = query[key];
        if (typeof value === "string") {
            serialized[encodedKey] = `${encodedKey}=${utilUriEscape.escapeUri(value)}`;
        }
        else if (Array.isArray(value)) {
            serialized[encodedKey] = value
                .slice(0)
                .reduce((encoded, value) => encoded.concat([`${encodedKey}=${utilUriEscape.escapeUri(value)}`]), [])
                .sort()
                .join("&");
        }
    }
    return keys
        .sort()
        .map((key) => serialized[key])
        .filter((serialized) => serialized)
        .join("&");
};

const iso8601 = (time) => toDate(time)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
const toDate = (time) => {
    if (typeof time === "number") {
        return new Date(time * 1000);
    }
    if (typeof time === "string") {
        if (Number(time)) {
            return new Date(Number(time) * 1000);
        }
        return new Date(time);
    }
    return time;
};

class SignatureV4Base {
    service;
    regionProvider;
    credentialProvider;
    sha256;
    uriEscapePath;
    applyChecksum;
    constructor({ applyChecksum, credentials, region, service, sha256, uriEscapePath = true, }) {
        this.service = service;
        this.sha256 = sha256;
        this.uriEscapePath = uriEscapePath;
        this.applyChecksum = typeof applyChecksum === "boolean" ? applyChecksum : true;
        this.regionProvider = utilMiddleware.normalizeProvider(region);
        this.credentialProvider = utilMiddleware.normalizeProvider(credentials);
    }
    createCanonicalRequest(request, canonicalHeaders, payloadHash) {
        const sortedHeaders = Object.keys(canonicalHeaders).sort();
        return `${request.method}
${this.getCanonicalPath(request)}
${getCanonicalQuery(request)}
${sortedHeaders.map((name) => `${name}:${canonicalHeaders[name]}`).join("\n")}

${sortedHeaders.join(";")}
${payloadHash}`;
    }
    async createStringToSign(longDate, credentialScope, canonicalRequest, algorithmIdentifier) {
        const hash = new this.sha256();
        hash.update(utilUtf8.toUint8Array(canonicalRequest));
        const hashedRequest = await hash.digest();
        return `${algorithmIdentifier}
${longDate}
${credentialScope}
${utilHexEncoding.toHex(hashedRequest)}`;
    }
    getCanonicalPath({ path }) {
        if (this.uriEscapePath) {
            const normalizedPathSegments = [];
            for (const pathSegment of path.split("/")) {
                if (pathSegment?.length === 0)
                    continue;
                if (pathSegment === ".")
                    continue;
                if (pathSegment === "..") {
                    normalizedPathSegments.pop();
                }
                else {
                    normalizedPathSegments.push(pathSegment);
                }
            }
            const normalizedPath = `${path?.startsWith("/") ? "/" : ""}${normalizedPathSegments.join("/")}${normalizedPathSegments.length > 0 && path?.endsWith("/") ? "/" : ""}`;
            const doubleEncoded = utilUriEscape.escapeUri(normalizedPath);
            return doubleEncoded.replace(/%2F/g, "/");
        }
        return path;
    }
    validateResolvedCredentials(credentials) {
        if (typeof credentials !== "object" ||
            typeof credentials.accessKeyId !== "string" ||
            typeof credentials.secretAccessKey !== "string") {
            throw new Error("Resolved credential object is not valid");
        }
    }
    formatDate(now) {
        const longDate = iso8601(now).replace(/[\-:]/g, "");
        return {
            longDate,
            shortDate: longDate.slice(0, 8),
        };
    }
    getCanonicalHeaderList(headers) {
        return Object.keys(headers).sort().join(";");
    }
}

class SignatureV4 extends SignatureV4Base {
    headerFormatter = new HeaderFormatter();
    constructor({ applyChecksum, credentials, region, service, sha256, uriEscapePath = true, }) {
        super({
            applyChecksum,
            credentials,
            region,
            service,
            sha256,
            uriEscapePath,
        });
    }
    async presign(originalRequest, options = {}) {
        const { signingDate = new Date(), expiresIn = 3600, unsignableHeaders, unhoistableHeaders, signableHeaders, hoistableHeaders, signingRegion, signingService, } = options;
        const credentials = await this.credentialProvider();
        this.validateResolvedCredentials(credentials);
        const region = signingRegion ?? (await this.regionProvider());
        const { longDate, shortDate } = this.formatDate(signingDate);
        if (expiresIn > MAX_PRESIGNED_TTL) {
            return Promise.reject("Signature version 4 presigned URLs" + " must have an expiration date less than one week in" + " the future");
        }
        const scope = createScope(shortDate, region, signingService ?? this.service);
        const request = moveHeadersToQuery(prepareRequest(originalRequest), { unhoistableHeaders, hoistableHeaders });
        if (credentials.sessionToken) {
            request.query[TOKEN_QUERY_PARAM] = credentials.sessionToken;
        }
        request.query[ALGORITHM_QUERY_PARAM] = ALGORITHM_IDENTIFIER;
        request.query[CREDENTIAL_QUERY_PARAM] = `${credentials.accessKeyId}/${scope}`;
        request.query[AMZ_DATE_QUERY_PARAM] = longDate;
        request.query[EXPIRES_QUERY_PARAM] = expiresIn.toString(10);
        const canonicalHeaders = getCanonicalHeaders(request, unsignableHeaders, signableHeaders);
        request.query[SIGNED_HEADERS_QUERY_PARAM] = this.getCanonicalHeaderList(canonicalHeaders);
        request.query[SIGNATURE_QUERY_PARAM] = await this.getSignature(longDate, scope, this.getSigningKey(credentials, region, shortDate, signingService), this.createCanonicalRequest(request, canonicalHeaders, await getPayloadHash(originalRequest, this.sha256)));
        return request;
    }
    async sign(toSign, options) {
        if (typeof toSign === "string") {
            return this.signString(toSign, options);
        }
        else if (toSign.headers && toSign.payload) {
            return this.signEvent(toSign, options);
        }
        else if (toSign.message) {
            return this.signMessage(toSign, options);
        }
        else {
            return this.signRequest(toSign, options);
        }
    }
    async signEvent({ headers, payload }, { signingDate = new Date(), priorSignature, signingRegion, signingService }) {
        const region = signingRegion ?? (await this.regionProvider());
        const { shortDate, longDate } = this.formatDate(signingDate);
        const scope = createScope(shortDate, region, signingService ?? this.service);
        const hashedPayload = await getPayloadHash({ headers: {}, body: payload }, this.sha256);
        const hash = new this.sha256();
        hash.update(headers);
        const hashedHeaders = utilHexEncoding.toHex(await hash.digest());
        const stringToSign = [
            EVENT_ALGORITHM_IDENTIFIER,
            longDate,
            scope,
            priorSignature,
            hashedHeaders,
            hashedPayload,
        ].join("\n");
        return this.signString(stringToSign, { signingDate, signingRegion: region, signingService });
    }
    async signMessage(signableMessage, { signingDate = new Date(), signingRegion, signingService }) {
        const promise = this.signEvent({
            headers: this.headerFormatter.format(signableMessage.message.headers),
            payload: signableMessage.message.body,
        }, {
            signingDate,
            signingRegion,
            signingService,
            priorSignature: signableMessage.priorSignature,
        });
        return promise.then((signature) => {
            return { message: signableMessage.message, signature };
        });
    }
    async signString(stringToSign, { signingDate = new Date(), signingRegion, signingService } = {}) {
        const credentials = await this.credentialProvider();
        this.validateResolvedCredentials(credentials);
        const region = signingRegion ?? (await this.regionProvider());
        const { shortDate } = this.formatDate(signingDate);
        const hash = new this.sha256(await this.getSigningKey(credentials, region, shortDate, signingService));
        hash.update(utilUtf8.toUint8Array(stringToSign));
        return utilHexEncoding.toHex(await hash.digest());
    }
    async signRequest(requestToSign, { signingDate = new Date(), signableHeaders, unsignableHeaders, signingRegion, signingService, } = {}) {
        const credentials = await this.credentialProvider();
        this.validateResolvedCredentials(credentials);
        const region = signingRegion ?? (await this.regionProvider());
        const request = prepareRequest(requestToSign);
        const { longDate, shortDate } = this.formatDate(signingDate);
        const scope = createScope(shortDate, region, signingService ?? this.service);
        request.headers[AMZ_DATE_HEADER] = longDate;
        if (credentials.sessionToken) {
            request.headers[TOKEN_HEADER] = credentials.sessionToken;
        }
        const payloadHash = await getPayloadHash(request, this.sha256);
        if (!hasHeader(SHA256_HEADER, request.headers) && this.applyChecksum) {
            request.headers[SHA256_HEADER] = payloadHash;
        }
        const canonicalHeaders = getCanonicalHeaders(request, unsignableHeaders, signableHeaders);
        const signature = await this.getSignature(longDate, scope, this.getSigningKey(credentials, region, shortDate, signingService), this.createCanonicalRequest(request, canonicalHeaders, payloadHash));
        request.headers[AUTH_HEADER] =
            `${ALGORITHM_IDENTIFIER} ` +
                `Credential=${credentials.accessKeyId}/${scope}, ` +
                `SignedHeaders=${this.getCanonicalHeaderList(canonicalHeaders)}, ` +
                `Signature=${signature}`;
        return request;
    }
    async getSignature(longDate, credentialScope, keyPromise, canonicalRequest) {
        const stringToSign = await this.createStringToSign(longDate, credentialScope, canonicalRequest, ALGORITHM_IDENTIFIER);
        const hash = new this.sha256(await keyPromise);
        hash.update(utilUtf8.toUint8Array(stringToSign));
        return utilHexEncoding.toHex(await hash.digest());
    }
    getSigningKey(credentials, region, shortDate, service) {
        return getSigningKey(this.sha256, credentials, shortDate, region, service || this.service);
    }
}

const signatureV4aContainer = {
    SignatureV4a: null,
};

exports.ALGORITHM_IDENTIFIER = ALGORITHM_IDENTIFIER;
exports.ALGORITHM_IDENTIFIER_V4A = ALGORITHM_IDENTIFIER_V4A;
exports.ALGORITHM_QUERY_PARAM = ALGORITHM_QUERY_PARAM;
exports.ALWAYS_UNSIGNABLE_HEADERS = ALWAYS_UNSIGNABLE_HEADERS;
exports.AMZ_DATE_HEADER = AMZ_DATE_HEADER;
exports.AMZ_DATE_QUERY_PARAM = AMZ_DATE_QUERY_PARAM;
exports.AUTH_HEADER = AUTH_HEADER;
exports.CREDENTIAL_QUERY_PARAM = CREDENTIAL_QUERY_PARAM;
exports.DATE_HEADER = DATE_HEADER;
exports.EVENT_ALGORITHM_IDENTIFIER = EVENT_ALGORITHM_IDENTIFIER;
exports.EXPIRES_QUERY_PARAM = EXPIRES_QUERY_PARAM;
exports.GENERATED_HEADERS = GENERATED_HEADERS;
exports.HOST_HEADER = HOST_HEADER;
exports.KEY_TYPE_IDENTIFIER = KEY_TYPE_IDENTIFIER;
exports.MAX_CACHE_SIZE = MAX_CACHE_SIZE;
exports.MAX_PRESIGNED_TTL = MAX_PRESIGNED_TTL;
exports.PROXY_HEADER_PATTERN = PROXY_HEADER_PATTERN;
exports.REGION_SET_PARAM = REGION_SET_PARAM;
exports.SEC_HEADER_PATTERN = SEC_HEADER_PATTERN;
exports.SHA256_HEADER = SHA256_HEADER;
exports.SIGNATURE_HEADER = SIGNATURE_HEADER;
exports.SIGNATURE_QUERY_PARAM = SIGNATURE_QUERY_PARAM;
exports.SIGNED_HEADERS_QUERY_PARAM = SIGNED_HEADERS_QUERY_PARAM;
exports.SignatureV4 = SignatureV4;
exports.SignatureV4Base = SignatureV4Base;
exports.TOKEN_HEADER = TOKEN_HEADER;
exports.TOKEN_QUERY_PARAM = TOKEN_QUERY_PARAM;
exports.UNSIGNABLE_PATTERNS = UNSIGNABLE_PATTERNS;
exports.UNSIGNED_PAYLOAD = UNSIGNED_PAYLOAD;
exports.clearCredentialCache = clearCredentialCache;
exports.createScope = createScope;
exports.getCanonicalHeaders = getCanonicalHeaders;
exports.getCanonicalQuery = getCanonicalQuery;
exports.getPayloadHash = getPayloadHash;
exports.getSigningKey = getSigningKey;
exports.hasHeader = hasHeader;
exports.moveHeadersToQuery = moveHeadersToQuery;
exports.prepareRequest = prepareRequest;
exports.signatureV4aContainer = signatureV4aContainer;


/***/ }),

/***/ 61411:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var middlewareStack = __webpack_require__(9208);
var types = __webpack_require__(90690);
var schema = __webpack_require__(26890);
var serde = __webpack_require__(92430);
var protocols = __webpack_require__(93422);

class Client {
    config;
    middlewareStack = middlewareStack.constructStack();
    initConfig;
    handlers;
    constructor(config) {
        this.config = config;
        const { protocol, protocolSettings } = config;
        if (protocolSettings) {
            if (typeof protocol === "function") {
                config.protocol = new protocol(protocolSettings);
            }
        }
    }
    send(command, optionsOrCb, cb) {
        const options = typeof optionsOrCb !== "function" ? optionsOrCb : undefined;
        const callback = typeof optionsOrCb === "function" ? optionsOrCb : cb;
        const useHandlerCache = options === undefined && this.config.cacheMiddleware === true;
        let handler;
        if (useHandlerCache) {
            if (!this.handlers) {
                this.handlers = new WeakMap();
            }
            const handlers = this.handlers;
            if (handlers.has(command.constructor)) {
                handler = handlers.get(command.constructor);
            }
            else {
                handler = command.resolveMiddleware(this.middlewareStack, this.config, options);
                handlers.set(command.constructor, handler);
            }
        }
        else {
            delete this.handlers;
            handler = command.resolveMiddleware(this.middlewareStack, this.config, options);
        }
        if (callback) {
            handler(command)
                .then((result) => callback(null, result.output), (err) => callback(err))
                .catch(() => { });
        }
        else {
            return handler(command).then((result) => result.output);
        }
    }
    destroy() {
        this.config?.requestHandler?.destroy?.();
        delete this.handlers;
    }
}

const SENSITIVE_STRING$1 = "***SensitiveInformation***";
function schemaLogFilter(schema$1, data) {
    if (data == null) {
        return data;
    }
    const ns = schema.NormalizedSchema.of(schema$1);
    if (ns.getMergedTraits().sensitive) {
        return SENSITIVE_STRING$1;
    }
    if (ns.isListSchema()) {
        const isSensitive = !!ns.getValueSchema().getMergedTraits().sensitive;
        if (isSensitive) {
            return SENSITIVE_STRING$1;
        }
    }
    else if (ns.isMapSchema()) {
        const isSensitive = !!ns.getKeySchema().getMergedTraits().sensitive || !!ns.getValueSchema().getMergedTraits().sensitive;
        if (isSensitive) {
            return SENSITIVE_STRING$1;
        }
    }
    else if (ns.isStructSchema() && typeof data === "object") {
        const object = data;
        const newObject = {};
        for (const [member, memberNs] of ns.structIterator()) {
            if (object[member] != null) {
                newObject[member] = schemaLogFilter(memberNs, object[member]);
            }
        }
        return newObject;
    }
    return data;
}

class Command {
    middlewareStack = middlewareStack.constructStack();
    schema;
    static classBuilder() {
        return new ClassBuilder();
    }
    resolveMiddlewareWithContext(clientStack, configuration, options, { middlewareFn, clientName, commandName, inputFilterSensitiveLog, outputFilterSensitiveLog, smithyContext, additionalContext, CommandCtor, }) {
        for (const mw of middlewareFn.bind(this)(CommandCtor, clientStack, configuration, options)) {
            this.middlewareStack.use(mw);
        }
        const stack = clientStack.concat(this.middlewareStack);
        const { logger } = configuration;
        const handlerExecutionContext = {
            logger,
            clientName,
            commandName,
            inputFilterSensitiveLog,
            outputFilterSensitiveLog,
            [types.SMITHY_CONTEXT_KEY]: {
                commandInstance: this,
                ...smithyContext,
            },
            ...additionalContext,
        };
        const { requestHandler } = configuration;
        return stack.resolve((request) => requestHandler.handle(request.request, options || {}), handlerExecutionContext);
    }
}
class ClassBuilder {
    _init = () => { };
    _ep = {};
    _middlewareFn = () => [];
    _commandName = "";
    _clientName = "";
    _additionalContext = {};
    _smithyContext = {};
    _inputFilterSensitiveLog = undefined;
    _outputFilterSensitiveLog = undefined;
    _serializer = null;
    _deserializer = null;
    _operationSchema;
    init(cb) {
        this._init = cb;
    }
    ep(endpointParameterInstructions) {
        this._ep = endpointParameterInstructions;
        return this;
    }
    m(middlewareSupplier) {
        this._middlewareFn = middlewareSupplier;
        return this;
    }
    s(service, operation, smithyContext = {}) {
        this._smithyContext = {
            service,
            operation,
            ...smithyContext,
        };
        return this;
    }
    c(additionalContext = {}) {
        this._additionalContext = additionalContext;
        return this;
    }
    n(clientName, commandName) {
        this._clientName = clientName;
        this._commandName = commandName;
        return this;
    }
    f(inputFilter = (_) => _, outputFilter = (_) => _) {
        this._inputFilterSensitiveLog = inputFilter;
        this._outputFilterSensitiveLog = outputFilter;
        return this;
    }
    ser(serializer) {
        this._serializer = serializer;
        return this;
    }
    de(deserializer) {
        this._deserializer = deserializer;
        return this;
    }
    sc(operation) {
        this._operationSchema = operation;
        this._smithyContext.operationSchema = operation;
        return this;
    }
    build() {
        const closure = this;
        let CommandRef;
        return (CommandRef = class extends Command {
            input;
            static getEndpointParameterInstructions() {
                return closure._ep;
            }
            constructor(...[input]) {
                super();
                this.input = input ?? {};
                closure._init(this);
                this.schema = closure._operationSchema;
            }
            resolveMiddleware(stack, configuration, options) {
                const op = closure._operationSchema;
                const input = op?.[4] ?? op?.input;
                const output = op?.[5] ?? op?.output;
                return this.resolveMiddlewareWithContext(stack, configuration, options, {
                    CommandCtor: CommandRef,
                    middlewareFn: closure._middlewareFn,
                    clientName: closure._clientName,
                    commandName: closure._commandName,
                    inputFilterSensitiveLog: closure._inputFilterSensitiveLog ?? (op ? schemaLogFilter.bind(null, input) : (_) => _),
                    outputFilterSensitiveLog: closure._outputFilterSensitiveLog ?? (op ? schemaLogFilter.bind(null, output) : (_) => _),
                    smithyContext: closure._smithyContext,
                    additionalContext: closure._additionalContext,
                });
            }
            serialize = closure._serializer;
            deserialize = closure._deserializer;
        });
    }
}

const SENSITIVE_STRING = "***SensitiveInformation***";

const createAggregatedClient = (commands, Client, options) => {
    for (const [command, CommandCtor] of Object.entries(commands)) {
        const methodImpl = async function (args, optionsOrCb, cb) {
            const command = new CommandCtor(args);
            if (typeof optionsOrCb === "function") {
                this.send(command, optionsOrCb);
            }
            else if (typeof cb === "function") {
                if (typeof optionsOrCb !== "object")
                    throw new Error(`Expected http options but got ${typeof optionsOrCb}`);
                this.send(command, optionsOrCb || {}, cb);
            }
            else {
                return this.send(command, optionsOrCb);
            }
        };
        const methodName = (command[0].toLowerCase() + command.slice(1)).replace(/Command$/, "");
        Client.prototype[methodName] = methodImpl;
    }
    const { paginators = {}, waiters = {} } = options ?? {};
    for (const [paginatorName, paginatorFn] of Object.entries(paginators)) {
        if (Client.prototype[paginatorName] === void 0) {
            Client.prototype[paginatorName] = function (commandInput = {}, paginationConfiguration, ...rest) {
                return paginatorFn({
                    ...paginationConfiguration,
                    client: this,
                }, commandInput, ...rest);
            };
        }
    }
    for (const [waiterName, waiterFn] of Object.entries(waiters)) {
        if (Client.prototype[waiterName] === void 0) {
            Client.prototype[waiterName] = async function (commandInput = {}, waiterConfiguration, ...rest) {
                let config = waiterConfiguration;
                if (typeof waiterConfiguration === "number") {
                    config = {
                        maxWaitTime: waiterConfiguration,
                    };
                }
                return waiterFn({
                    ...config,
                    client: this,
                }, commandInput, ...rest);
            };
        }
    }
};

class ServiceException extends Error {
    $fault;
    $response;
    $retryable;
    $metadata;
    constructor(options) {
        super(options.message);
        Object.setPrototypeOf(this, Object.getPrototypeOf(this).constructor.prototype);
        this.name = options.name;
        this.$fault = options.$fault;
        this.$metadata = options.$metadata;
    }
    static isInstance(value) {
        if (!value)
            return false;
        const candidate = value;
        return (ServiceException.prototype.isPrototypeOf(candidate) ||
            (Boolean(candidate.$fault) &&
                Boolean(candidate.$metadata) &&
                (candidate.$fault === "client" || candidate.$fault === "server")));
    }
    static [Symbol.hasInstance](instance) {
        if (!instance)
            return false;
        const candidate = instance;
        if (this === ServiceException) {
            return ServiceException.isInstance(instance);
        }
        if (ServiceException.isInstance(instance)) {
            if (candidate.name && this.name) {
                return this.prototype.isPrototypeOf(instance) || candidate.name === this.name;
            }
            return this.prototype.isPrototypeOf(instance);
        }
        return false;
    }
}
const decorateServiceException = (exception, additions = {}) => {
    Object.entries(additions)
        .filter(([, v]) => v !== undefined)
        .forEach(([k, v]) => {
        if (exception[k] == undefined || exception[k] === "") {
            exception[k] = v;
        }
    });
    const message = exception.message || exception.Message || "UnknownError";
    exception.message = message;
    delete exception.Message;
    return exception;
};

const throwDefaultError = ({ output, parsedBody, exceptionCtor, errorCode }) => {
    const $metadata = deserializeMetadata(output);
    const statusCode = $metadata.httpStatusCode ? $metadata.httpStatusCode + "" : undefined;
    const response = new exceptionCtor({
        name: parsedBody?.code || parsedBody?.Code || errorCode || statusCode || "UnknownError",
        $fault: "client",
        $metadata,
    });
    throw decorateServiceException(response, parsedBody);
};
const withBaseException = (ExceptionCtor) => {
    return ({ output, parsedBody, errorCode }) => {
        throwDefaultError({ output, parsedBody, exceptionCtor: ExceptionCtor, errorCode });
    };
};
const deserializeMetadata = (output) => ({
    httpStatusCode: output.statusCode,
    requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
    extendedRequestId: output.headers["x-amz-id-2"],
    cfId: output.headers["x-amz-cf-id"],
});

const loadConfigsForDefaultMode = (mode) => {
    switch (mode) {
        case "standard":
            return {
                retryMode: "standard",
                connectionTimeout: 3100,
            };
        case "in-region":
            return {
                retryMode: "standard",
                connectionTimeout: 1100,
            };
        case "cross-region":
            return {
                retryMode: "standard",
                connectionTimeout: 3100,
            };
        case "mobile":
            return {
                retryMode: "standard",
                connectionTimeout: 30000,
            };
        default:
            return {};
    }
};

let warningEmitted = false;
const emitWarningIfUnsupportedVersion = (version) => {
    if (version && !warningEmitted && parseInt(version.substring(1, version.indexOf("."))) < 16) {
        warningEmitted = true;
    }
};

const knownAlgorithms = Object.values(types.AlgorithmId);
const getChecksumConfiguration = (runtimeConfig) => {
    const checksumAlgorithms = [];
    for (const id in types.AlgorithmId) {
        const algorithmId = types.AlgorithmId[id];
        if (runtimeConfig[algorithmId] === undefined) {
            continue;
        }
        checksumAlgorithms.push({
            algorithmId: () => algorithmId,
            checksumConstructor: () => runtimeConfig[algorithmId],
        });
    }
    for (const [id, ChecksumCtor] of Object.entries(runtimeConfig.checksumAlgorithms ?? {})) {
        checksumAlgorithms.push({
            algorithmId: () => id,
            checksumConstructor: () => ChecksumCtor,
        });
    }
    return {
        addChecksumAlgorithm(algo) {
            runtimeConfig.checksumAlgorithms = runtimeConfig.checksumAlgorithms ?? {};
            const id = algo.algorithmId();
            const ctor = algo.checksumConstructor();
            if (knownAlgorithms.includes(id)) {
                runtimeConfig.checksumAlgorithms[id.toUpperCase()] = ctor;
            }
            else {
                runtimeConfig.checksumAlgorithms[id] = ctor;
            }
            checksumAlgorithms.push(algo);
        },
        checksumAlgorithms() {
            return checksumAlgorithms;
        },
    };
};
const resolveChecksumRuntimeConfig = (clientConfig) => {
    const runtimeConfig = {};
    clientConfig.checksumAlgorithms().forEach((checksumAlgorithm) => {
        const id = checksumAlgorithm.algorithmId();
        if (knownAlgorithms.includes(id)) {
            runtimeConfig[id] = checksumAlgorithm.checksumConstructor();
        }
    });
    return runtimeConfig;
};

const getRetryConfiguration = (runtimeConfig) => {
    return {
        setRetryStrategy(retryStrategy) {
            runtimeConfig.retryStrategy = retryStrategy;
        },
        retryStrategy() {
            return runtimeConfig.retryStrategy;
        },
    };
};
const resolveRetryRuntimeConfig = (retryStrategyConfiguration) => {
    const runtimeConfig = {};
    runtimeConfig.retryStrategy = retryStrategyConfiguration.retryStrategy();
    return runtimeConfig;
};

const getDefaultExtensionConfiguration = (runtimeConfig) => {
    return Object.assign(getChecksumConfiguration(runtimeConfig), getRetryConfiguration(runtimeConfig));
};
const getDefaultClientConfiguration = getDefaultExtensionConfiguration;
const resolveDefaultRuntimeConfig = (config) => {
    return Object.assign(resolveChecksumRuntimeConfig(config), resolveRetryRuntimeConfig(config));
};

const getArrayIfSingleItem = (mayBeArray) => Array.isArray(mayBeArray) ? mayBeArray : [mayBeArray];

const getValueFromTextNode = (obj) => {
    const textNodeName = "#text";
    for (const key in obj) {
        if (obj.hasOwnProperty(key) && obj[key][textNodeName] !== undefined) {
            obj[key] = obj[key][textNodeName];
        }
        else if (typeof obj[key] === "object" && obj[key] !== null) {
            obj[key] = getValueFromTextNode(obj[key]);
        }
    }
    return obj;
};

const isSerializableHeaderValue = (value) => {
    return value != null;
};

class NoOpLogger {
    trace() { }
    debug() { }
    info() { }
    warn() { }
    error() { }
}

function map(arg0, arg1, arg2) {
    let target;
    let filter;
    let instructions;
    if (typeof arg1 === "undefined" && typeof arg2 === "undefined") {
        target = {};
        instructions = arg0;
    }
    else {
        target = arg0;
        if (typeof arg1 === "function") {
            filter = arg1;
            instructions = arg2;
            return mapWithFilter(target, filter, instructions);
        }
        else {
            instructions = arg1;
        }
    }
    for (const key of Object.keys(instructions)) {
        if (!Array.isArray(instructions[key])) {
            target[key] = instructions[key];
            continue;
        }
        applyInstruction(target, null, instructions, key);
    }
    return target;
}
const convertMap = (target) => {
    const output = {};
    for (const [k, v] of Object.entries(target || {})) {
        output[k] = [, v];
    }
    return output;
};
const take = (source, instructions) => {
    const out = {};
    for (const key in instructions) {
        applyInstruction(out, source, instructions, key);
    }
    return out;
};
const mapWithFilter = (target, filter, instructions) => {
    return map(target, Object.entries(instructions).reduce((_instructions, [key, value]) => {
        if (Array.isArray(value)) {
            _instructions[key] = value;
        }
        else {
            if (typeof value === "function") {
                _instructions[key] = [filter, value()];
            }
            else {
                _instructions[key] = [filter, value];
            }
        }
        return _instructions;
    }, {}));
};
const applyInstruction = (target, source, instructions, targetKey) => {
    if (source !== null) {
        let instruction = instructions[targetKey];
        if (typeof instruction === "function") {
            instruction = [, instruction];
        }
        const [filter = nonNullish, valueFn = pass, sourceKey = targetKey] = instruction;
        if ((typeof filter === "function" && filter(source[sourceKey])) || (typeof filter !== "function" && !!filter)) {
            target[targetKey] = valueFn(source[sourceKey]);
        }
        return;
    }
    let [filter, value] = instructions[targetKey];
    if (typeof value === "function") {
        let _value;
        const defaultFilterPassed = filter === undefined && (_value = value()) != null;
        const customFilterPassed = (typeof filter === "function" && !!filter(void 0)) || (typeof filter !== "function" && !!filter);
        if (defaultFilterPassed) {
            target[targetKey] = _value;
        }
        else if (customFilterPassed) {
            target[targetKey] = value();
        }
    }
    else {
        const defaultFilterPassed = filter === undefined && value != null;
        const customFilterPassed = (typeof filter === "function" && !!filter(value)) || (typeof filter !== "function" && !!filter);
        if (defaultFilterPassed || customFilterPassed) {
            target[targetKey] = value;
        }
    }
};
const nonNullish = (_) => _ != null;
const pass = (_) => _;

const serializeFloat = (value) => {
    if (value !== value) {
        return "NaN";
    }
    switch (value) {
        case Infinity:
            return "Infinity";
        case -Infinity:
            return "-Infinity";
        default:
            return value;
    }
};
const serializeDateTime = (date) => date.toISOString().replace(".000Z", "Z");

const _json = (obj) => {
    if (obj == null) {
        return {};
    }
    if (Array.isArray(obj)) {
        return obj.filter((_) => _ != null).map(_json);
    }
    if (typeof obj === "object") {
        const target = {};
        for (const key of Object.keys(obj)) {
            if (obj[key] == null) {
                continue;
            }
            target[key] = _json(obj[key]);
        }
        return target;
    }
    return obj;
};

exports.collectBody = protocols.collectBody;
exports.extendedEncodeURIComponent = protocols.extendedEncodeURIComponent;
exports.resolvedPath = protocols.resolvedPath;
exports.Client = Client;
exports.Command = Command;
exports.NoOpLogger = NoOpLogger;
exports.SENSITIVE_STRING = SENSITIVE_STRING;
exports.ServiceException = ServiceException;
exports._json = _json;
exports.convertMap = convertMap;
exports.createAggregatedClient = createAggregatedClient;
exports.decorateServiceException = decorateServiceException;
exports.emitWarningIfUnsupportedVersion = emitWarningIfUnsupportedVersion;
exports.getArrayIfSingleItem = getArrayIfSingleItem;
exports.getDefaultClientConfiguration = getDefaultClientConfiguration;
exports.getDefaultExtensionConfiguration = getDefaultExtensionConfiguration;
exports.getValueFromTextNode = getValueFromTextNode;
exports.isSerializableHeaderValue = isSerializableHeaderValue;
exports.loadConfigsForDefaultMode = loadConfigsForDefaultMode;
exports.map = map;
exports.resolveDefaultRuntimeConfig = resolveDefaultRuntimeConfig;
exports.serializeDateTime = serializeDateTime;
exports.serializeFloat = serializeFloat;
exports.take = take;
exports.throwDefaultError = throwDefaultError;
exports.withBaseException = withBaseException;
Object.prototype.hasOwnProperty.call(serde, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: serde['__proto__']
    });

Object.keys(serde).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = serde[k];
});


/***/ }),

/***/ 90690:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


exports.HttpAuthLocation = void 0;
(function (HttpAuthLocation) {
    HttpAuthLocation["HEADER"] = "header";
    HttpAuthLocation["QUERY"] = "query";
})(exports.HttpAuthLocation || (exports.HttpAuthLocation = {}));

exports.HttpApiKeyAuthLocation = void 0;
(function (HttpApiKeyAuthLocation) {
    HttpApiKeyAuthLocation["HEADER"] = "header";
    HttpApiKeyAuthLocation["QUERY"] = "query";
})(exports.HttpApiKeyAuthLocation || (exports.HttpApiKeyAuthLocation = {}));

exports.EndpointURLScheme = void 0;
(function (EndpointURLScheme) {
    EndpointURLScheme["HTTP"] = "http";
    EndpointURLScheme["HTTPS"] = "https";
})(exports.EndpointURLScheme || (exports.EndpointURLScheme = {}));

exports.AlgorithmId = void 0;
(function (AlgorithmId) {
    AlgorithmId["MD5"] = "md5";
    AlgorithmId["CRC32"] = "crc32";
    AlgorithmId["CRC32C"] = "crc32c";
    AlgorithmId["SHA1"] = "sha1";
    AlgorithmId["SHA256"] = "sha256";
})(exports.AlgorithmId || (exports.AlgorithmId = {}));
const getChecksumConfiguration = (runtimeConfig) => {
    const checksumAlgorithms = [];
    if (runtimeConfig.sha256 !== undefined) {
        checksumAlgorithms.push({
            algorithmId: () => exports.AlgorithmId.SHA256,
            checksumConstructor: () => runtimeConfig.sha256,
        });
    }
    if (runtimeConfig.md5 != undefined) {
        checksumAlgorithms.push({
            algorithmId: () => exports.AlgorithmId.MD5,
            checksumConstructor: () => runtimeConfig.md5,
        });
    }
    return {
        addChecksumAlgorithm(algo) {
            checksumAlgorithms.push(algo);
        },
        checksumAlgorithms() {
            return checksumAlgorithms;
        },
    };
};
const resolveChecksumRuntimeConfig = (clientConfig) => {
    const runtimeConfig = {};
    clientConfig.checksumAlgorithms().forEach((checksumAlgorithm) => {
        runtimeConfig[checksumAlgorithm.algorithmId()] = checksumAlgorithm.checksumConstructor();
    });
    return runtimeConfig;
};

const getDefaultClientConfiguration = (runtimeConfig) => {
    return getChecksumConfiguration(runtimeConfig);
};
const resolveDefaultRuntimeConfig = (config) => {
    return resolveChecksumRuntimeConfig(config);
};

exports.FieldPosition = void 0;
(function (FieldPosition) {
    FieldPosition[FieldPosition["HEADER"] = 0] = "HEADER";
    FieldPosition[FieldPosition["TRAILER"] = 1] = "TRAILER";
})(exports.FieldPosition || (exports.FieldPosition = {}));

const SMITHY_CONTEXT_KEY = "__smithy_context";

exports.IniSectionType = void 0;
(function (IniSectionType) {
    IniSectionType["PROFILE"] = "profile";
    IniSectionType["SSO_SESSION"] = "sso-session";
    IniSectionType["SERVICES"] = "services";
})(exports.IniSectionType || (exports.IniSectionType = {}));

exports.RequestHandlerProtocol = void 0;
(function (RequestHandlerProtocol) {
    RequestHandlerProtocol["HTTP_0_9"] = "http/0.9";
    RequestHandlerProtocol["HTTP_1_0"] = "http/1.0";
    RequestHandlerProtocol["TDS_8_0"] = "tds/8.0";
})(exports.RequestHandlerProtocol || (exports.RequestHandlerProtocol = {}));

exports.SMITHY_CONTEXT_KEY = SMITHY_CONTEXT_KEY;
exports.getDefaultClientConfiguration = getDefaultClientConfiguration;
exports.resolveDefaultRuntimeConfig = resolveDefaultRuntimeConfig;


/***/ }),

/***/ 14494:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var querystringParser = __webpack_require__(18822);

const parseUrl = (url) => {
    if (typeof url === "string") {
        return parseUrl(new URL(url));
    }
    const { hostname, pathname, port, protocol, search } = url;
    let query;
    if (search) {
        query = querystringParser.parseQueryString(search);
    }
    return {
        hostname,
        port: port ? parseInt(port) : undefined,
        protocol,
        path: pathname,
        query,
    };
};

exports.parseUrl = parseUrl;


/***/ }),

/***/ 72674:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.fromBase64 = void 0;
const util_buffer_from_1 = __webpack_require__(44151);
const BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;
const fromBase64 = (input) => {
    if ((input.length * 3) % 4 !== 0) {
        throw new TypeError(`Incorrect padding on base64 string.`);
    }
    if (!BASE64_REGEX.exec(input)) {
        throw new TypeError(`Invalid base64 string.`);
    }
    const buffer = (0, util_buffer_from_1.fromString)(input, "base64");
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
};
exports.fromBase64 = fromBase64;


/***/ }),

/***/ 68385:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var fromBase64 = __webpack_require__(72674);
var toBase64 = __webpack_require__(14871);



Object.prototype.hasOwnProperty.call(fromBase64, '__proto__') &&
	!Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
	Object.defineProperty(exports, '__proto__', {
		enumerable: true,
		value: fromBase64['__proto__']
	});

Object.keys(fromBase64).forEach(function (k) {
	if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = fromBase64[k];
});
Object.prototype.hasOwnProperty.call(toBase64, '__proto__') &&
	!Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
	Object.defineProperty(exports, '__proto__', {
		enumerable: true,
		value: toBase64['__proto__']
	});

Object.keys(toBase64).forEach(function (k) {
	if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = toBase64[k];
});


/***/ }),

/***/ 14871:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.toBase64 = void 0;
const util_buffer_from_1 = __webpack_require__(44151);
const util_utf8_1 = __webpack_require__(71577);
const toBase64 = (_input) => {
    let input;
    if (typeof _input === "string") {
        input = (0, util_utf8_1.fromUtf8)(_input);
    }
    else {
        input = _input;
    }
    if (typeof input !== "object" || typeof input.byteOffset !== "number" || typeof input.byteLength !== "number") {
        throw new Error("@smithy/util-base64: toBase64 encoder function only accepts string | Uint8Array.");
    }
    return (0, util_buffer_from_1.fromArrayBuffer)(input.buffer, input.byteOffset, input.byteLength).toString("base64");
};
exports.toBase64 = toBase64;


/***/ }),

/***/ 12098:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


const TEXT_ENCODER = typeof TextEncoder == "function" ? new TextEncoder() : null;
const calculateBodyLength = (body) => {
    if (typeof body === "string") {
        if (TEXT_ENCODER) {
            return TEXT_ENCODER.encode(body).byteLength;
        }
        let len = body.length;
        for (let i = len - 1; i >= 0; i--) {
            const code = body.charCodeAt(i);
            if (code > 0x7f && code <= 0x7ff)
                len++;
            else if (code > 0x7ff && code <= 0xffff)
                len += 2;
            if (code >= 0xdc00 && code <= 0xdfff)
                i--;
        }
        return len;
    }
    else if (typeof body.byteLength === "number") {
        return body.byteLength;
    }
    else if (typeof body.size === "number") {
        return body.size;
    }
    throw new Error(`Body Length computation failed for ${body}`);
};

exports.calculateBodyLength = calculateBodyLength;


/***/ }),

/***/ 13638:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var node_fs = __webpack_require__(73024);

const calculateBodyLength = (body) => {
    if (!body) {
        return 0;
    }
    if (typeof body === "string") {
        return Buffer.byteLength(body);
    }
    else if (typeof body.byteLength === "number") {
        return body.byteLength;
    }
    else if (typeof body.size === "number") {
        return body.size;
    }
    else if (typeof body.start === "number" && typeof body.end === "number") {
        return body.end + 1 - body.start;
    }
    else if (body instanceof node_fs.ReadStream) {
        if (body.path != null) {
            return node_fs.lstatSync(body.path).size;
        }
        else if (typeof body.fd === "number") {
            return node_fs.fstatSync(body.fd).size;
        }
    }
    throw new Error(`Body Length computation failed for ${body}`);
};

exports.calculateBodyLength = calculateBodyLength;


/***/ }),

/***/ 44151:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var isArrayBuffer = __webpack_require__(86130);
var buffer = __webpack_require__(20181);

const fromArrayBuffer = (input, offset = 0, length = input.byteLength - offset) => {
    if (!isArrayBuffer.isArrayBuffer(input)) {
        throw new TypeError(`The "input" argument must be ArrayBuffer. Received type ${typeof input} (${input})`);
    }
    return buffer.Buffer.from(input, offset, length);
};
const fromString = (input, encoding) => {
    if (typeof input !== "string") {
        throw new TypeError(`The "input" argument must be of type string. Received type ${typeof input} (${input})`);
    }
    return encoding ? buffer.Buffer.from(input, encoding) : buffer.Buffer.from(input);
};

exports.fromArrayBuffer = fromArrayBuffer;
exports.fromString = fromString;


/***/ }),

/***/ 56716:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


const booleanSelector = (obj, key, type) => {
    if (!(key in obj))
        return undefined;
    if (obj[key] === "true")
        return true;
    if (obj[key] === "false")
        return false;
    throw new Error(`Cannot load ${type} "${key}". Expected "true" or "false", got ${obj[key]}.`);
};

const numberSelector = (obj, key, type) => {
    if (!(key in obj))
        return undefined;
    const numberValue = parseInt(obj[key], 10);
    if (Number.isNaN(numberValue)) {
        throw new TypeError(`Cannot load ${type} '${key}'. Expected number, got '${obj[key]}'.`);
    }
    return numberValue;
};

exports.SelectorType = void 0;
(function (SelectorType) {
    SelectorType["ENV"] = "env";
    SelectorType["CONFIG"] = "shared config entry";
})(exports.SelectorType || (exports.SelectorType = {}));

exports.booleanSelector = booleanSelector;
exports.numberSelector = numberSelector;


/***/ }),

/***/ 15435:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var configResolver = __webpack_require__(39316);
var nodeConfigProvider = __webpack_require__(55704);
var propertyProvider = __webpack_require__(71238);

const AWS_EXECUTION_ENV = "AWS_EXECUTION_ENV";
const AWS_REGION_ENV = "AWS_REGION";
const AWS_DEFAULT_REGION_ENV = "AWS_DEFAULT_REGION";
const ENV_IMDS_DISABLED = "AWS_EC2_METADATA_DISABLED";
const DEFAULTS_MODE_OPTIONS = ["in-region", "cross-region", "mobile", "standard", "legacy"];
const IMDS_REGION_PATH = "/latest/meta-data/placement/region";

const AWS_DEFAULTS_MODE_ENV = "AWS_DEFAULTS_MODE";
const AWS_DEFAULTS_MODE_CONFIG = "defaults_mode";
const NODE_DEFAULTS_MODE_CONFIG_OPTIONS = {
    environmentVariableSelector: (env) => {
        return env[AWS_DEFAULTS_MODE_ENV];
    },
    configFileSelector: (profile) => {
        return profile[AWS_DEFAULTS_MODE_CONFIG];
    },
    default: "legacy",
};

const resolveDefaultsModeConfig = ({ region = nodeConfigProvider.loadConfig(configResolver.NODE_REGION_CONFIG_OPTIONS), defaultsMode = nodeConfigProvider.loadConfig(NODE_DEFAULTS_MODE_CONFIG_OPTIONS), } = {}) => propertyProvider.memoize(async () => {
    const mode = typeof defaultsMode === "function" ? await defaultsMode() : defaultsMode;
    switch (mode?.toLowerCase()) {
        case "auto":
            return resolveNodeDefaultsModeAuto(region);
        case "in-region":
        case "cross-region":
        case "mobile":
        case "standard":
        case "legacy":
            return Promise.resolve(mode?.toLocaleLowerCase());
        case undefined:
            return Promise.resolve("legacy");
        default:
            throw new Error(`Invalid parameter for "defaultsMode", expect ${DEFAULTS_MODE_OPTIONS.join(", ")}, got ${mode}`);
    }
});
const resolveNodeDefaultsModeAuto = async (clientRegion) => {
    if (clientRegion) {
        const resolvedRegion = typeof clientRegion === "function" ? await clientRegion() : clientRegion;
        const inferredRegion = await inferPhysicalRegion();
        if (!inferredRegion) {
            return "standard";
        }
        if (resolvedRegion === inferredRegion) {
            return "in-region";
        }
        else {
            return "cross-region";
        }
    }
    return "standard";
};
const inferPhysicalRegion = async () => {
    if (process.env[AWS_EXECUTION_ENV] && (process.env[AWS_REGION_ENV] || process.env[AWS_DEFAULT_REGION_ENV])) {
        return process.env[AWS_REGION_ENV] ?? process.env[AWS_DEFAULT_REGION_ENV];
    }
    if (!process.env[ENV_IMDS_DISABLED]) {
        try {
            const { getInstanceMetadataEndpoint, httpRequest } = await __webpack_require__.e(/* import() */ 566).then(__webpack_require__.t.bind(__webpack_require__, 40566, 19));
            const endpoint = await getInstanceMetadataEndpoint();
            return (await httpRequest({ ...endpoint, path: IMDS_REGION_PATH })).toString();
        }
        catch (e) {
        }
    }
};

exports.resolveDefaultsModeConfig = resolveDefaultsModeConfig;


/***/ }),

/***/ 79674:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var types = __webpack_require__(90690);

class EndpointCache {
    capacity;
    data = new Map();
    parameters = [];
    constructor({ size, params }) {
        this.capacity = size ?? 50;
        if (params) {
            this.parameters = params;
        }
    }
    get(endpointParams, resolver) {
        const key = this.hash(endpointParams);
        if (key === false) {
            return resolver();
        }
        if (!this.data.has(key)) {
            if (this.data.size > this.capacity + 10) {
                const keys = this.data.keys();
                let i = 0;
                while (true) {
                    const { value, done } = keys.next();
                    this.data.delete(value);
                    if (done || ++i > 10) {
                        break;
                    }
                }
            }
            this.data.set(key, resolver());
        }
        return this.data.get(key);
    }
    size() {
        return this.data.size;
    }
    hash(endpointParams) {
        let buffer = "";
        const { parameters } = this;
        if (parameters.length === 0) {
            return false;
        }
        for (const param of parameters) {
            const val = String(endpointParams[param] ?? "");
            if (val.includes("|;")) {
                return false;
            }
            buffer += val + "|;";
        }
        return buffer;
    }
}

const IP_V4_REGEX = new RegExp(`^(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]\\d|\\d)){3}$`);
const isIpAddress = (value) => IP_V4_REGEX.test(value) || (value.startsWith("[") && value.endsWith("]"));

const VALID_HOST_LABEL_REGEX = new RegExp(`^(?!.*-$)(?!-)[a-zA-Z0-9-]{1,63}$`);
const isValidHostLabel = (value, allowSubDomains = false) => {
    if (!allowSubDomains) {
        return VALID_HOST_LABEL_REGEX.test(value);
    }
    const labels = value.split(".");
    for (const label of labels) {
        if (!isValidHostLabel(label)) {
            return false;
        }
    }
    return true;
};

const customEndpointFunctions = {};

const debugId = "endpoints";

function toDebugString(input) {
    if (typeof input !== "object" || input == null) {
        return input;
    }
    if ("ref" in input) {
        return `$${toDebugString(input.ref)}`;
    }
    if ("fn" in input) {
        return `${input.fn}(${(input.argv || []).map(toDebugString).join(", ")})`;
    }
    return JSON.stringify(input, null, 2);
}

class EndpointError extends Error {
    constructor(message) {
        super(message);
        this.name = "EndpointError";
    }
}

const booleanEquals = (value1, value2) => value1 === value2;

const getAttrPathList = (path) => {
    const parts = path.split(".");
    const pathList = [];
    for (const part of parts) {
        const squareBracketIndex = part.indexOf("[");
        if (squareBracketIndex !== -1) {
            if (part.indexOf("]") !== part.length - 1) {
                throw new EndpointError(`Path: '${path}' does not end with ']'`);
            }
            const arrayIndex = part.slice(squareBracketIndex + 1, -1);
            if (Number.isNaN(parseInt(arrayIndex))) {
                throw new EndpointError(`Invalid array index: '${arrayIndex}' in path: '${path}'`);
            }
            if (squareBracketIndex !== 0) {
                pathList.push(part.slice(0, squareBracketIndex));
            }
            pathList.push(arrayIndex);
        }
        else {
            pathList.push(part);
        }
    }
    return pathList;
};

const getAttr = (value, path) => getAttrPathList(path).reduce((acc, index) => {
    if (typeof acc !== "object") {
        throw new EndpointError(`Index '${index}' in '${path}' not found in '${JSON.stringify(value)}'`);
    }
    else if (Array.isArray(acc)) {
        return acc[parseInt(index)];
    }
    return acc[index];
}, value);

const isSet = (value) => value != null;

const not = (value) => !value;

const DEFAULT_PORTS = {
    [types.EndpointURLScheme.HTTP]: 80,
    [types.EndpointURLScheme.HTTPS]: 443,
};
const parseURL = (value) => {
    const whatwgURL = (() => {
        try {
            if (value instanceof URL) {
                return value;
            }
            if (typeof value === "object" && "hostname" in value) {
                const { hostname, port, protocol = "", path = "", query = {} } = value;
                const url = new URL(`${protocol}//${hostname}${port ? `:${port}` : ""}${path}`);
                url.search = Object.entries(query)
                    .map(([k, v]) => `${k}=${v}`)
                    .join("&");
                return url;
            }
            return new URL(value);
        }
        catch (error) {
            return null;
        }
    })();
    if (!whatwgURL) {
        console.error(`Unable to parse ${JSON.stringify(value)} as a whatwg URL.`);
        return null;
    }
    const urlString = whatwgURL.href;
    const { host, hostname, pathname, protocol, search } = whatwgURL;
    if (search) {
        return null;
    }
    const scheme = protocol.slice(0, -1);
    if (!Object.values(types.EndpointURLScheme).includes(scheme)) {
        return null;
    }
    const isIp = isIpAddress(hostname);
    const inputContainsDefaultPort = urlString.includes(`${host}:${DEFAULT_PORTS[scheme]}`) ||
        (typeof value === "string" && value.includes(`${host}:${DEFAULT_PORTS[scheme]}`));
    const authority = `${host}${inputContainsDefaultPort ? `:${DEFAULT_PORTS[scheme]}` : ``}`;
    return {
        scheme,
        authority,
        path: pathname,
        normalizedPath: pathname.endsWith("/") ? pathname : `${pathname}/`,
        isIp,
    };
};

const stringEquals = (value1, value2) => value1 === value2;

const substring = (input, start, stop, reverse) => {
    if (start >= stop || input.length < stop || /[^\u0000-\u007f]/.test(input)) {
        return null;
    }
    if (!reverse) {
        return input.substring(start, stop);
    }
    return input.substring(input.length - stop, input.length - start);
};

const uriEncode = (value) => encodeURIComponent(value).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const endpointFunctions = {
    booleanEquals,
    getAttr,
    isSet,
    isValidHostLabel,
    not,
    parseURL,
    stringEquals,
    substring,
    uriEncode,
};

const evaluateTemplate = (template, options) => {
    const evaluatedTemplateArr = [];
    const templateContext = {
        ...options.endpointParams,
        ...options.referenceRecord,
    };
    let currentIndex = 0;
    while (currentIndex < template.length) {
        const openingBraceIndex = template.indexOf("{", currentIndex);
        if (openingBraceIndex === -1) {
            evaluatedTemplateArr.push(template.slice(currentIndex));
            break;
        }
        evaluatedTemplateArr.push(template.slice(currentIndex, openingBraceIndex));
        const closingBraceIndex = template.indexOf("}", openingBraceIndex);
        if (closingBraceIndex === -1) {
            evaluatedTemplateArr.push(template.slice(openingBraceIndex));
            break;
        }
        if (template[openingBraceIndex + 1] === "{" && template[closingBraceIndex + 1] === "}") {
            evaluatedTemplateArr.push(template.slice(openingBraceIndex + 1, closingBraceIndex));
            currentIndex = closingBraceIndex + 2;
        }
        const parameterName = template.substring(openingBraceIndex + 1, closingBraceIndex);
        if (parameterName.includes("#")) {
            const [refName, attrName] = parameterName.split("#");
            evaluatedTemplateArr.push(getAttr(templateContext[refName], attrName));
        }
        else {
            evaluatedTemplateArr.push(templateContext[parameterName]);
        }
        currentIndex = closingBraceIndex + 1;
    }
    return evaluatedTemplateArr.join("");
};

const getReferenceValue = ({ ref }, options) => {
    const referenceRecord = {
        ...options.endpointParams,
        ...options.referenceRecord,
    };
    return referenceRecord[ref];
};

const evaluateExpression = (obj, keyName, options) => {
    if (typeof obj === "string") {
        return evaluateTemplate(obj, options);
    }
    else if (obj["fn"]) {
        return group$2.callFunction(obj, options);
    }
    else if (obj["ref"]) {
        return getReferenceValue(obj, options);
    }
    throw new EndpointError(`'${keyName}': ${String(obj)} is not a string, function or reference.`);
};
const callFunction = ({ fn, argv }, options) => {
    const evaluatedArgs = argv.map((arg) => ["boolean", "number"].includes(typeof arg) ? arg : group$2.evaluateExpression(arg, "arg", options));
    const fnSegments = fn.split(".");
    if (fnSegments[0] in customEndpointFunctions && fnSegments[1] != null) {
        return customEndpointFunctions[fnSegments[0]][fnSegments[1]](...evaluatedArgs);
    }
    return endpointFunctions[fn](...evaluatedArgs);
};
const group$2 = {
    evaluateExpression,
    callFunction,
};

const evaluateCondition = ({ assign, ...fnArgs }, options) => {
    if (assign && assign in options.referenceRecord) {
        throw new EndpointError(`'${assign}' is already defined in Reference Record.`);
    }
    const value = callFunction(fnArgs, options);
    options.logger?.debug?.(`${debugId} evaluateCondition: ${toDebugString(fnArgs)} = ${toDebugString(value)}`);
    return {
        result: value === "" ? true : !!value,
        ...(assign != null && { toAssign: { name: assign, value } }),
    };
};

const evaluateConditions = (conditions = [], options) => {
    const conditionsReferenceRecord = {};
    for (const condition of conditions) {
        const { result, toAssign } = evaluateCondition(condition, {
            ...options,
            referenceRecord: {
                ...options.referenceRecord,
                ...conditionsReferenceRecord,
            },
        });
        if (!result) {
            return { result };
        }
        if (toAssign) {
            conditionsReferenceRecord[toAssign.name] = toAssign.value;
            options.logger?.debug?.(`${debugId} assign: ${toAssign.name} := ${toDebugString(toAssign.value)}`);
        }
    }
    return { result: true, referenceRecord: conditionsReferenceRecord };
};

const getEndpointHeaders = (headers, options) => Object.entries(headers).reduce((acc, [headerKey, headerVal]) => ({
    ...acc,
    [headerKey]: headerVal.map((headerValEntry) => {
        const processedExpr = evaluateExpression(headerValEntry, "Header value entry", options);
        if (typeof processedExpr !== "string") {
            throw new EndpointError(`Header '${headerKey}' value '${processedExpr}' is not a string`);
        }
        return processedExpr;
    }),
}), {});

const getEndpointProperties = (properties, options) => Object.entries(properties).reduce((acc, [propertyKey, propertyVal]) => ({
    ...acc,
    [propertyKey]: group$1.getEndpointProperty(propertyVal, options),
}), {});
const getEndpointProperty = (property, options) => {
    if (Array.isArray(property)) {
        return property.map((propertyEntry) => getEndpointProperty(propertyEntry, options));
    }
    switch (typeof property) {
        case "string":
            return evaluateTemplate(property, options);
        case "object":
            if (property === null) {
                throw new EndpointError(`Unexpected endpoint property: ${property}`);
            }
            return group$1.getEndpointProperties(property, options);
        case "boolean":
            return property;
        default:
            throw new EndpointError(`Unexpected endpoint property type: ${typeof property}`);
    }
};
const group$1 = {
    getEndpointProperty,
    getEndpointProperties,
};

const getEndpointUrl = (endpointUrl, options) => {
    const expression = evaluateExpression(endpointUrl, "Endpoint URL", options);
    if (typeof expression === "string") {
        try {
            return new URL(expression);
        }
        catch (error) {
            console.error(`Failed to construct URL with ${expression}`, error);
            throw error;
        }
    }
    throw new EndpointError(`Endpoint URL must be a string, got ${typeof expression}`);
};

const evaluateEndpointRule = (endpointRule, options) => {
    const { conditions, endpoint } = endpointRule;
    const { result, referenceRecord } = evaluateConditions(conditions, options);
    if (!result) {
        return;
    }
    const endpointRuleOptions = {
        ...options,
        referenceRecord: { ...options.referenceRecord, ...referenceRecord },
    };
    const { url, properties, headers } = endpoint;
    options.logger?.debug?.(`${debugId} Resolving endpoint from template: ${toDebugString(endpoint)}`);
    return {
        ...(headers != undefined && {
            headers: getEndpointHeaders(headers, endpointRuleOptions),
        }),
        ...(properties != undefined && {
            properties: getEndpointProperties(properties, endpointRuleOptions),
        }),
        url: getEndpointUrl(url, endpointRuleOptions),
    };
};

const evaluateErrorRule = (errorRule, options) => {
    const { conditions, error } = errorRule;
    const { result, referenceRecord } = evaluateConditions(conditions, options);
    if (!result) {
        return;
    }
    throw new EndpointError(evaluateExpression(error, "Error", {
        ...options,
        referenceRecord: { ...options.referenceRecord, ...referenceRecord },
    }));
};

const evaluateRules = (rules, options) => {
    for (const rule of rules) {
        if (rule.type === "endpoint") {
            const endpointOrUndefined = evaluateEndpointRule(rule, options);
            if (endpointOrUndefined) {
                return endpointOrUndefined;
            }
        }
        else if (rule.type === "error") {
            evaluateErrorRule(rule, options);
        }
        else if (rule.type === "tree") {
            const endpointOrUndefined = group.evaluateTreeRule(rule, options);
            if (endpointOrUndefined) {
                return endpointOrUndefined;
            }
        }
        else {
            throw new EndpointError(`Unknown endpoint rule: ${rule}`);
        }
    }
    throw new EndpointError(`Rules evaluation failed`);
};
const evaluateTreeRule = (treeRule, options) => {
    const { conditions, rules } = treeRule;
    const { result, referenceRecord } = evaluateConditions(conditions, options);
    if (!result) {
        return;
    }
    return group.evaluateRules(rules, {
        ...options,
        referenceRecord: { ...options.referenceRecord, ...referenceRecord },
    });
};
const group = {
    evaluateRules,
    evaluateTreeRule,
};

const resolveEndpoint = (ruleSetObject, options) => {
    const { endpointParams, logger } = options;
    const { parameters, rules } = ruleSetObject;
    options.logger?.debug?.(`${debugId} Initial EndpointParams: ${toDebugString(endpointParams)}`);
    const paramsWithDefault = Object.entries(parameters)
        .filter(([, v]) => v.default != null)
        .map(([k, v]) => [k, v.default]);
    if (paramsWithDefault.length > 0) {
        for (const [paramKey, paramDefaultValue] of paramsWithDefault) {
            endpointParams[paramKey] = endpointParams[paramKey] ?? paramDefaultValue;
        }
    }
    const requiredParams = Object.entries(parameters)
        .filter(([, v]) => v.required)
        .map(([k]) => k);
    for (const requiredParam of requiredParams) {
        if (endpointParams[requiredParam] == null) {
            throw new EndpointError(`Missing required parameter: '${requiredParam}'`);
        }
    }
    const endpoint = evaluateRules(rules, { endpointParams, logger, referenceRecord: {} });
    options.logger?.debug?.(`${debugId} Resolved endpoint: ${toDebugString(endpoint)}`);
    return endpoint;
};

exports.EndpointCache = EndpointCache;
exports.EndpointError = EndpointError;
exports.customEndpointFunctions = customEndpointFunctions;
exports.isIpAddress = isIpAddress;
exports.isValidHostLabel = isValidHostLabel;
exports.resolveEndpoint = resolveEndpoint;


/***/ }),

/***/ 96435:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


const SHORT_TO_HEX = {};
const HEX_TO_SHORT = {};
for (let i = 0; i < 256; i++) {
    let encodedByte = i.toString(16).toLowerCase();
    if (encodedByte.length === 1) {
        encodedByte = `0${encodedByte}`;
    }
    SHORT_TO_HEX[i] = encodedByte;
    HEX_TO_SHORT[encodedByte] = i;
}
function fromHex(encoded) {
    if (encoded.length % 2 !== 0) {
        throw new Error("Hex encoded strings must have an even number length");
    }
    const out = new Uint8Array(encoded.length / 2);
    for (let i = 0; i < encoded.length; i += 2) {
        const encodedByte = encoded.slice(i, i + 2).toLowerCase();
        if (encodedByte in HEX_TO_SHORT) {
            out[i / 2] = HEX_TO_SHORT[encodedByte];
        }
        else {
            throw new Error(`Cannot decode unrecognized sequence ${encodedByte} as hexadecimal`);
        }
    }
    return out;
}
function toHex(bytes) {
    let out = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        out += SHORT_TO_HEX[bytes[i]];
    }
    return out;
}

exports.fromHex = fromHex;
exports.toHex = toHex;


/***/ }),

/***/ 76324:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var types = __webpack_require__(90690);

const getSmithyContext = (context) => context[types.SMITHY_CONTEXT_KEY] || (context[types.SMITHY_CONTEXT_KEY] = {});

const normalizeProvider = (input) => {
    if (typeof input === "function")
        return input;
    const promisified = Promise.resolve(input);
    return () => promisified;
};

exports.getSmithyContext = getSmithyContext;
exports.normalizeProvider = normalizeProvider;


/***/ }),

/***/ 15518:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var serviceErrorClassification = __webpack_require__(42058);

exports.RETRY_MODES = void 0;
(function (RETRY_MODES) {
    RETRY_MODES["STANDARD"] = "standard";
    RETRY_MODES["ADAPTIVE"] = "adaptive";
})(exports.RETRY_MODES || (exports.RETRY_MODES = {}));
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_MODE = exports.RETRY_MODES.STANDARD;

class DefaultRateLimiter {
    static setTimeoutFn = setTimeout;
    beta;
    minCapacity;
    minFillRate;
    scaleConstant;
    smooth;
    enabled = false;
    availableTokens = 0;
    lastMaxRate = 0;
    measuredTxRate = 0;
    requestCount = 0;
    fillRate;
    lastThrottleTime;
    lastTimestamp = 0;
    lastTxRateBucket;
    maxCapacity;
    timeWindow = 0;
    constructor(options) {
        this.beta = options?.beta ?? 0.7;
        this.minCapacity = options?.minCapacity ?? 1;
        this.minFillRate = options?.minFillRate ?? 0.5;
        this.scaleConstant = options?.scaleConstant ?? 0.4;
        this.smooth = options?.smooth ?? 0.8;
        this.lastThrottleTime = this.getCurrentTimeInSeconds();
        this.lastTxRateBucket = Math.floor(this.getCurrentTimeInSeconds());
        this.fillRate = this.minFillRate;
        this.maxCapacity = this.minCapacity;
    }
    async getSendToken() {
        return this.acquireTokenBucket(1);
    }
    updateClientSendingRate(response) {
        let calculatedRate;
        this.updateMeasuredRate();
        const retryErrorInfo = response;
        const isThrottling = retryErrorInfo?.errorType === "THROTTLING" || serviceErrorClassification.isThrottlingError(retryErrorInfo?.error ?? response);
        if (isThrottling) {
            const rateToUse = !this.enabled ? this.measuredTxRate : Math.min(this.measuredTxRate, this.fillRate);
            this.lastMaxRate = rateToUse;
            this.calculateTimeWindow();
            this.lastThrottleTime = this.getCurrentTimeInSeconds();
            calculatedRate = this.cubicThrottle(rateToUse);
            this.enableTokenBucket();
        }
        else {
            this.calculateTimeWindow();
            calculatedRate = this.cubicSuccess(this.getCurrentTimeInSeconds());
        }
        const newRate = Math.min(calculatedRate, 2 * this.measuredTxRate);
        this.updateTokenBucketRate(newRate);
    }
    getCurrentTimeInSeconds() {
        return Date.now() / 1000;
    }
    async acquireTokenBucket(amount) {
        if (!this.enabled) {
            return;
        }
        this.refillTokenBucket();
        if (amount > this.availableTokens) {
            const delay = ((amount - this.availableTokens) / this.fillRate) * 1000;
            await new Promise((resolve) => DefaultRateLimiter.setTimeoutFn(resolve, delay));
        }
        this.availableTokens = this.availableTokens - amount;
    }
    refillTokenBucket() {
        const timestamp = this.getCurrentTimeInSeconds();
        if (!this.lastTimestamp) {
            this.lastTimestamp = timestamp;
            return;
        }
        const fillAmount = (timestamp - this.lastTimestamp) * this.fillRate;
        this.availableTokens = Math.min(this.maxCapacity, this.availableTokens + fillAmount);
        this.lastTimestamp = timestamp;
    }
    calculateTimeWindow() {
        this.timeWindow = this.getPrecise(Math.pow((this.lastMaxRate * (1 - this.beta)) / this.scaleConstant, 1 / 3));
    }
    cubicThrottle(rateToUse) {
        return this.getPrecise(rateToUse * this.beta);
    }
    cubicSuccess(timestamp) {
        return this.getPrecise(this.scaleConstant * Math.pow(timestamp - this.lastThrottleTime - this.timeWindow, 3) + this.lastMaxRate);
    }
    enableTokenBucket() {
        this.enabled = true;
    }
    updateTokenBucketRate(newRate) {
        this.refillTokenBucket();
        this.fillRate = Math.max(newRate, this.minFillRate);
        this.maxCapacity = Math.max(newRate, this.minCapacity);
        this.availableTokens = Math.min(this.availableTokens, this.maxCapacity);
    }
    updateMeasuredRate() {
        const t = this.getCurrentTimeInSeconds();
        const timeBucket = Math.floor(t * 2) / 2;
        this.requestCount++;
        if (timeBucket > this.lastTxRateBucket) {
            const currentRate = this.requestCount / (timeBucket - this.lastTxRateBucket);
            this.measuredTxRate = this.getPrecise(currentRate * this.smooth + this.measuredTxRate * (1 - this.smooth));
            this.requestCount = 0;
            this.lastTxRateBucket = timeBucket;
        }
    }
    getPrecise(num) {
        return parseFloat(num.toFixed(8));
    }
}

const DEFAULT_RETRY_DELAY_BASE = 100;
const MAXIMUM_RETRY_DELAY = 20 * 1000;
const THROTTLING_RETRY_DELAY_BASE = 500;
const INITIAL_RETRY_TOKENS = 500;
const RETRY_COST = 5;
const TIMEOUT_RETRY_COST = 10;
const NO_RETRY_INCREMENT = 1;
const INVOCATION_ID_HEADER = "amz-sdk-invocation-id";
const REQUEST_HEADER = "amz-sdk-request";

class Retry {
    static v2026 = typeof process !== "undefined" && process.env?.SMITHY_NEW_RETRIES_2026 === "true";
    static delay() {
        return Retry.v2026 ? 50 : 100;
    }
    static throttlingDelay() {
        return Retry.v2026 ? 1_000 : 500;
    }
    static cost() {
        return Retry.v2026 ? 14 : 5;
    }
    static throttlingCost() {
        return Retry.v2026 ? 5 : 10;
    }
    static modifiedCostType() {
        return Retry.v2026 ? "THROTTLING" : "TRANSIENT";
    }
}

class DefaultRetryBackoffStrategy {
    x = Retry.delay();
    computeNextBackoffDelay(i) {
        const b = Math.random();
        const r = 2;
        const t_i = b * Math.min(this.x * r ** i, MAXIMUM_RETRY_DELAY);
        return Math.floor(t_i);
    }
    setDelayBase(delay) {
        this.x = delay;
    }
}

class DefaultRetryToken {
    delay;
    count;
    cost;
    longPoll;
    constructor(delay, count, cost, longPoll) {
        this.delay = delay;
        this.count = count;
        this.cost = cost;
        this.longPoll = longPoll;
    }
    getRetryCount() {
        return this.count;
    }
    getRetryDelay() {
        return Math.min(MAXIMUM_RETRY_DELAY, this.delay);
    }
    getRetryCost() {
        return this.cost;
    }
    isLongPoll() {
        return this.longPoll;
    }
}

class StandardRetryStrategy {
    mode = exports.RETRY_MODES.STANDARD;
    capacity = INITIAL_RETRY_TOKENS;
    retryBackoffStrategy;
    maxAttemptsProvider;
    baseDelay;
    constructor(arg1) {
        if (typeof arg1 === "number") {
            this.maxAttemptsProvider = async () => arg1;
        }
        else if (typeof arg1 === "function") {
            this.maxAttemptsProvider = arg1;
        }
        else if (arg1 && typeof arg1 === "object") {
            this.maxAttemptsProvider = async () => arg1.maxAttempts;
            this.baseDelay = arg1.baseDelay;
            this.retryBackoffStrategy = arg1.backoff;
        }
        this.maxAttemptsProvider ??= async () => DEFAULT_MAX_ATTEMPTS;
        this.baseDelay ??= Retry.delay();
        this.retryBackoffStrategy ??= new DefaultRetryBackoffStrategy();
    }
    async acquireInitialRetryToken(retryTokenScope) {
        return new DefaultRetryToken(Retry.delay(), 0, undefined, Retry.v2026 && retryTokenScope.includes(":longpoll"));
    }
    async refreshRetryTokenForRetry(token, errorInfo) {
        const maxAttempts = await this.getMaxAttempts();
        const shouldRetry = this.shouldRetry(token, errorInfo, maxAttempts);
        if (shouldRetry || token.isLongPoll?.()) {
            const errorType = errorInfo.errorType;
            this.retryBackoffStrategy.setDelayBase(errorType === "THROTTLING" ? Retry.throttlingDelay() : this.baseDelay);
            const delayFromErrorType = this.retryBackoffStrategy.computeNextBackoffDelay(token.getRetryCount());
            let retryDelay = delayFromErrorType;
            if (errorInfo.retryAfterHint instanceof Date) {
                retryDelay = Math.max(delayFromErrorType, Math.min(errorInfo.retryAfterHint.getTime() - Date.now(), delayFromErrorType + 5_000));
            }
            if (!shouldRetry) {
                throw Object.assign(new Error("No retry token available"), { $backoff: Retry.v2026 ? retryDelay : 0 });
            }
            else {
                const capacityCost = this.getCapacityCost(errorType);
                this.capacity -= capacityCost;
                return new DefaultRetryToken(retryDelay, token.getRetryCount() + 1, capacityCost, token.isLongPoll?.() ?? false);
            }
        }
        throw new Error("No retry token available");
    }
    recordSuccess(token) {
        this.capacity = Math.min(INITIAL_RETRY_TOKENS, this.capacity + (token.getRetryCost() ?? NO_RETRY_INCREMENT));
    }
    getCapacity() {
        return this.capacity;
    }
    async getMaxAttempts() {
        try {
            return await this.maxAttemptsProvider();
        }
        catch (error) {
            console.warn(`Max attempts provider could not resolve. Using default of ${DEFAULT_MAX_ATTEMPTS}`);
            return DEFAULT_MAX_ATTEMPTS;
        }
    }
    shouldRetry(tokenToRenew, errorInfo, maxAttempts) {
        const attempts = tokenToRenew.getRetryCount() + 1;
        return (attempts < maxAttempts &&
            this.capacity >= this.getCapacityCost(errorInfo.errorType) &&
            this.isRetryableError(errorInfo.errorType));
    }
    getCapacityCost(errorType) {
        return errorType === Retry.modifiedCostType() ? Retry.throttlingCost() : Retry.cost();
    }
    isRetryableError(errorType) {
        return errorType === "THROTTLING" || errorType === "TRANSIENT";
    }
    async maxAttempts() {
        return this.maxAttemptsProvider();
    }
}

class AdaptiveRetryStrategy {
    mode = exports.RETRY_MODES.ADAPTIVE;
    rateLimiter;
    standardRetryStrategy;
    constructor(maxAttemptsProvider, options) {
        const { rateLimiter } = options ?? {};
        this.rateLimiter = rateLimiter ?? new DefaultRateLimiter();
        this.standardRetryStrategy = options
            ? new StandardRetryStrategy({
                maxAttempts: typeof maxAttemptsProvider === "number" ? maxAttemptsProvider : 3,
                ...options,
            })
            : new StandardRetryStrategy(maxAttemptsProvider);
    }
    async acquireInitialRetryToken(retryTokenScope) {
        await this.rateLimiter.getSendToken();
        return this.standardRetryStrategy.acquireInitialRetryToken(retryTokenScope);
    }
    async refreshRetryTokenForRetry(tokenToRenew, errorInfo) {
        this.rateLimiter.updateClientSendingRate(errorInfo);
        return this.standardRetryStrategy.refreshRetryTokenForRetry(tokenToRenew, errorInfo);
    }
    recordSuccess(token) {
        this.rateLimiter.updateClientSendingRate({});
        this.standardRetryStrategy.recordSuccess(token);
    }
    async maxAttemptsProvider() {
        return this.standardRetryStrategy.maxAttempts();
    }
}

class ConfiguredRetryStrategy extends StandardRetryStrategy {
    computeNextBackoffDelay;
    constructor(maxAttempts, computeNextBackoffDelay = Retry.delay()) {
        super(typeof maxAttempts === "function" ? maxAttempts : async () => maxAttempts);
        if (typeof computeNextBackoffDelay === "number") {
            this.computeNextBackoffDelay = () => computeNextBackoffDelay;
        }
        else {
            this.computeNextBackoffDelay = computeNextBackoffDelay;
        }
    }
    async refreshRetryTokenForRetry(tokenToRenew, errorInfo) {
        const token = await super.refreshRetryTokenForRetry(tokenToRenew, errorInfo);
        token.getRetryDelay = () => this.computeNextBackoffDelay(token.getRetryCount());
        return token;
    }
}

exports.AdaptiveRetryStrategy = AdaptiveRetryStrategy;
exports.ConfiguredRetryStrategy = ConfiguredRetryStrategy;
exports.DEFAULT_MAX_ATTEMPTS = DEFAULT_MAX_ATTEMPTS;
exports.DEFAULT_RETRY_DELAY_BASE = DEFAULT_RETRY_DELAY_BASE;
exports.DEFAULT_RETRY_MODE = DEFAULT_RETRY_MODE;
exports.DefaultRateLimiter = DefaultRateLimiter;
exports.INITIAL_RETRY_TOKENS = INITIAL_RETRY_TOKENS;
exports.INVOCATION_ID_HEADER = INVOCATION_ID_HEADER;
exports.MAXIMUM_RETRY_DELAY = MAXIMUM_RETRY_DELAY;
exports.NO_RETRY_INCREMENT = NO_RETRY_INCREMENT;
exports.REQUEST_HEADER = REQUEST_HEADER;
exports.RETRY_COST = RETRY_COST;
exports.Retry = Retry;
exports.StandardRetryStrategy = StandardRetryStrategy;
exports.THROTTLING_RETRY_DELAY_BASE = THROTTLING_RETRY_DELAY_BASE;
exports.TIMEOUT_RETRY_COST = TIMEOUT_RETRY_COST;


/***/ }),

/***/ 31732:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ByteArrayCollector = void 0;
class ByteArrayCollector {
    allocByteArray;
    byteLength = 0;
    byteArrays = [];
    constructor(allocByteArray) {
        this.allocByteArray = allocByteArray;
    }
    push(byteArray) {
        this.byteArrays.push(byteArray);
        this.byteLength += byteArray.byteLength;
    }
    flush() {
        if (this.byteArrays.length === 1) {
            const bytes = this.byteArrays[0];
            this.reset();
            return bytes;
        }
        const aggregation = this.allocByteArray(this.byteLength);
        let cursor = 0;
        for (let i = 0; i < this.byteArrays.length; ++i) {
            const bytes = this.byteArrays[i];
            aggregation.set(bytes, cursor);
            cursor += bytes.byteLength;
        }
        this.reset();
        return aggregation;
    }
    reset() {
        this.byteArrays = [];
        this.byteLength = 0;
    }
}
exports.ByteArrayCollector = ByteArrayCollector;


/***/ }),

/***/ 87753:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChecksumStream = void 0;
const ReadableStreamRef = typeof ReadableStream === "function" ? ReadableStream : function () { };
class ChecksumStream extends ReadableStreamRef {
}
exports.ChecksumStream = ChecksumStream;


/***/ }),

/***/ 71775:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChecksumStream = void 0;
const util_base64_1 = __webpack_require__(68385);
const stream_1 = __webpack_require__(2203);
class ChecksumStream extends stream_1.Duplex {
    expectedChecksum;
    checksumSourceLocation;
    checksum;
    source;
    base64Encoder;
    pendingCallback = null;
    constructor({ expectedChecksum, checksum, source, checksumSourceLocation, base64Encoder, }) {
        super();
        if (typeof source.pipe === "function") {
            this.source = source;
        }
        else {
            throw new Error(`@smithy/util-stream: unsupported source type ${source?.constructor?.name ?? source} in ChecksumStream.`);
        }
        this.base64Encoder = base64Encoder ?? util_base64_1.toBase64;
        this.expectedChecksum = expectedChecksum;
        this.checksum = checksum;
        this.checksumSourceLocation = checksumSourceLocation;
        this.source.pipe(this);
    }
    _read(size) {
        if (this.pendingCallback) {
            const callback = this.pendingCallback;
            this.pendingCallback = null;
            callback();
        }
    }
    _write(chunk, encoding, callback) {
        try {
            this.checksum.update(chunk);
            const canPushMore = this.push(chunk);
            if (!canPushMore) {
                this.pendingCallback = callback;
                return;
            }
        }
        catch (e) {
            return callback(e);
        }
        return callback();
    }
    async _final(callback) {
        try {
            const digest = await this.checksum.digest();
            const received = this.base64Encoder(digest);
            if (this.expectedChecksum !== received) {
                return callback(new Error(`Checksum mismatch: expected "${this.expectedChecksum}" but received "${received}"` +
                    ` in response header "${this.checksumSourceLocation}".`));
            }
        }
        catch (e) {
            return callback(e);
        }
        this.push(null);
        return callback();
    }
}
exports.ChecksumStream = ChecksumStream;


/***/ }),

/***/ 94129:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createChecksumStream = void 0;
const util_base64_1 = __webpack_require__(68385);
const stream_type_check_1 = __webpack_require__(4414);
const ChecksumStream_browser_1 = __webpack_require__(87753);
const createChecksumStream = ({ expectedChecksum, checksum, source, checksumSourceLocation, base64Encoder, }) => {
    if (!(0, stream_type_check_1.isReadableStream)(source)) {
        throw new Error(`@smithy/util-stream: unsupported source type ${source?.constructor?.name ?? source} in ChecksumStream.`);
    }
    const encoder = base64Encoder ?? util_base64_1.toBase64;
    if (typeof TransformStream !== "function") {
        throw new Error("@smithy/util-stream: unable to instantiate ChecksumStream because API unavailable: ReadableStream/TransformStream.");
    }
    const transform = new TransformStream({
        start() { },
        async transform(chunk, controller) {
            checksum.update(chunk);
            controller.enqueue(chunk);
        },
        async flush(controller) {
            const digest = await checksum.digest();
            const received = encoder(digest);
            if (expectedChecksum !== received) {
                const error = new Error(`Checksum mismatch: expected "${expectedChecksum}" but received "${received}"` +
                    ` in response header "${checksumSourceLocation}".`);
                controller.error(error);
            }
            else {
                controller.terminate();
            }
        },
    });
    source.pipeThrough(transform);
    const readable = transform.readable;
    Object.setPrototypeOf(readable, ChecksumStream_browser_1.ChecksumStream.prototype);
    return readable;
};
exports.createChecksumStream = createChecksumStream;


/***/ }),

/***/ 5639:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createChecksumStream = createChecksumStream;
const stream_type_check_1 = __webpack_require__(4414);
const ChecksumStream_1 = __webpack_require__(71775);
const createChecksumStream_browser_1 = __webpack_require__(94129);
function createChecksumStream(init) {
    if (typeof ReadableStream === "function" && (0, stream_type_check_1.isReadableStream)(init.source)) {
        return (0, createChecksumStream_browser_1.createChecksumStream)(init);
    }
    return new ChecksumStream_1.ChecksumStream(init);
}


/***/ }),

/***/ 72005:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createBufferedReadable = createBufferedReadable;
const node_stream_1 = __webpack_require__(57075);
const ByteArrayCollector_1 = __webpack_require__(31732);
const createBufferedReadableStream_1 = __webpack_require__(78213);
const stream_type_check_1 = __webpack_require__(4414);
function createBufferedReadable(upstream, size, logger) {
    if ((0, stream_type_check_1.isReadableStream)(upstream)) {
        return (0, createBufferedReadableStream_1.createBufferedReadableStream)(upstream, size, logger);
    }
    const downstream = new node_stream_1.Readable({ read() { } });
    let streamBufferingLoggedWarning = false;
    let bytesSeen = 0;
    const buffers = [
        "",
        new ByteArrayCollector_1.ByteArrayCollector((size) => new Uint8Array(size)),
        new ByteArrayCollector_1.ByteArrayCollector((size) => Buffer.from(new Uint8Array(size))),
    ];
    let mode = -1;
    upstream.on("data", (chunk) => {
        const chunkMode = (0, createBufferedReadableStream_1.modeOf)(chunk, true);
        if (mode !== chunkMode) {
            if (mode >= 0) {
                downstream.push((0, createBufferedReadableStream_1.flush)(buffers, mode));
            }
            mode = chunkMode;
        }
        if (mode === -1) {
            downstream.push(chunk);
            return;
        }
        const chunkSize = (0, createBufferedReadableStream_1.sizeOf)(chunk);
        bytesSeen += chunkSize;
        const bufferSize = (0, createBufferedReadableStream_1.sizeOf)(buffers[mode]);
        if (chunkSize >= size && bufferSize === 0) {
            downstream.push(chunk);
        }
        else {
            const newSize = (0, createBufferedReadableStream_1.merge)(buffers, mode, chunk);
            if (!streamBufferingLoggedWarning && bytesSeen > size * 2) {
                streamBufferingLoggedWarning = true;
                logger?.warn(`@smithy/util-stream - stream chunk size ${chunkSize} is below threshold of ${size}, automatically buffering.`);
            }
            if (newSize >= size) {
                downstream.push((0, createBufferedReadableStream_1.flush)(buffers, mode));
            }
        }
    });
    upstream.on("end", () => {
        if (mode !== -1) {
            const remainder = (0, createBufferedReadableStream_1.flush)(buffers, mode);
            if ((0, createBufferedReadableStream_1.sizeOf)(remainder) > 0) {
                downstream.push(remainder);
            }
        }
        downstream.push(null);
    });
    return downstream;
}


/***/ }),

/***/ 78213:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createBufferedReadable = void 0;
exports.createBufferedReadableStream = createBufferedReadableStream;
exports.merge = merge;
exports.flush = flush;
exports.sizeOf = sizeOf;
exports.modeOf = modeOf;
const ByteArrayCollector_1 = __webpack_require__(31732);
function createBufferedReadableStream(upstream, size, logger) {
    const reader = upstream.getReader();
    let streamBufferingLoggedWarning = false;
    let bytesSeen = 0;
    const buffers = ["", new ByteArrayCollector_1.ByteArrayCollector((size) => new Uint8Array(size))];
    let mode = -1;
    const pull = async (controller) => {
        const { value, done } = await reader.read();
        const chunk = value;
        if (done) {
            if (mode !== -1) {
                const remainder = flush(buffers, mode);
                if (sizeOf(remainder) > 0) {
                    controller.enqueue(remainder);
                }
            }
            controller.close();
        }
        else {
            const chunkMode = modeOf(chunk, false);
            if (mode !== chunkMode) {
                if (mode >= 0) {
                    controller.enqueue(flush(buffers, mode));
                }
                mode = chunkMode;
            }
            if (mode === -1) {
                controller.enqueue(chunk);
                return;
            }
            const chunkSize = sizeOf(chunk);
            bytesSeen += chunkSize;
            const bufferSize = sizeOf(buffers[mode]);
            if (chunkSize >= size && bufferSize === 0) {
                controller.enqueue(chunk);
            }
            else {
                const newSize = merge(buffers, mode, chunk);
                if (!streamBufferingLoggedWarning && bytesSeen > size * 2) {
                    streamBufferingLoggedWarning = true;
                    logger?.warn(`@smithy/util-stream - stream chunk size ${chunkSize} is below threshold of ${size}, automatically buffering.`);
                }
                if (newSize >= size) {
                    controller.enqueue(flush(buffers, mode));
                }
                else {
                    await pull(controller);
                }
            }
        }
    };
    return new ReadableStream({
        pull,
    });
}
exports.createBufferedReadable = createBufferedReadableStream;
function merge(buffers, mode, chunk) {
    switch (mode) {
        case 0:
            buffers[0] += chunk;
            return sizeOf(buffers[0]);
        case 1:
        case 2:
            buffers[mode].push(chunk);
            return sizeOf(buffers[mode]);
    }
}
function flush(buffers, mode) {
    switch (mode) {
        case 0:
            const s = buffers[0];
            buffers[0] = "";
            return s;
        case 1:
        case 2:
            return buffers[mode].flush();
    }
    throw new Error(`@smithy/util-stream - invalid index ${mode} given to flush()`);
}
function sizeOf(chunk) {
    return chunk?.byteLength ?? chunk?.length ?? 0;
}
function modeOf(chunk, allowBuffer = true) {
    if (allowBuffer && typeof Buffer !== "undefined" && chunk instanceof Buffer) {
        return 2;
    }
    if (chunk instanceof Uint8Array) {
        return 1;
    }
    if (typeof chunk === "string") {
        return 0;
    }
    return -1;
}


/***/ }),

/***/ 93492:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getAwsChunkedEncodingStream = void 0;
const getAwsChunkedEncodingStream = (readableStream, options) => {
    const { base64Encoder, bodyLengthChecker, checksumAlgorithmFn, checksumLocationName, streamHasher } = options;
    const checksumRequired = base64Encoder !== undefined &&
        bodyLengthChecker !== undefined &&
        checksumAlgorithmFn !== undefined &&
        checksumLocationName !== undefined &&
        streamHasher !== undefined;
    const digest = checksumRequired ? streamHasher(checksumAlgorithmFn, readableStream) : undefined;
    const reader = readableStream.getReader();
    return new ReadableStream({
        async pull(controller) {
            const { value, done } = await reader.read();
            if (done) {
                controller.enqueue(`0\r\n`);
                if (checksumRequired) {
                    const checksum = base64Encoder(await digest);
                    controller.enqueue(`${checksumLocationName}:${checksum}\r\n`);
                    controller.enqueue(`\r\n`);
                }
                controller.close();
            }
            else {
                controller.enqueue(`${(bodyLengthChecker(value) || 0).toString(16)}\r\n${value}\r\n`);
            }
        },
    });
};
exports.getAwsChunkedEncodingStream = getAwsChunkedEncodingStream;


/***/ }),

/***/ 6522:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getAwsChunkedEncodingStream = getAwsChunkedEncodingStream;
const node_stream_1 = __webpack_require__(57075);
const getAwsChunkedEncodingStream_browser_1 = __webpack_require__(93492);
const stream_type_check_1 = __webpack_require__(4414);
function getAwsChunkedEncodingStream(stream, options) {
    const readable = stream;
    const readableStream = stream;
    if ((0, stream_type_check_1.isReadableStream)(readableStream)) {
        return (0, getAwsChunkedEncodingStream_browser_1.getAwsChunkedEncodingStream)(readableStream, options);
    }
    const { base64Encoder, bodyLengthChecker, checksumAlgorithmFn, checksumLocationName, streamHasher } = options;
    const checksumRequired = base64Encoder !== undefined &&
        checksumAlgorithmFn !== undefined &&
        checksumLocationName !== undefined &&
        streamHasher !== undefined;
    const digest = checksumRequired ? streamHasher(checksumAlgorithmFn, readable) : undefined;
    const awsChunkedEncodingStream = new node_stream_1.Readable({
        read: () => { },
    });
    readable.on("data", (data) => {
        const length = bodyLengthChecker(data) || 0;
        if (length === 0) {
            return;
        }
        awsChunkedEncodingStream.push(`${length.toString(16)}\r\n`);
        awsChunkedEncodingStream.push(data);
        awsChunkedEncodingStream.push("\r\n");
    });
    readable.on("end", async () => {
        awsChunkedEncodingStream.push(`0\r\n`);
        if (checksumRequired) {
            const checksum = base64Encoder(await digest);
            awsChunkedEncodingStream.push(`${checksumLocationName}:${checksum}\r\n`);
            awsChunkedEncodingStream.push(`\r\n`);
        }
        awsChunkedEncodingStream.push(null);
    });
    return awsChunkedEncodingStream;
}


/***/ }),

/***/ 80066:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.headStream = headStream;
async function headStream(stream, bytes) {
    let byteLengthCounter = 0;
    const chunks = [];
    const reader = stream.getReader();
    let isDone = false;
    while (!isDone) {
        const { done, value } = await reader.read();
        if (value) {
            chunks.push(value);
            byteLengthCounter += value?.byteLength ?? 0;
        }
        if (byteLengthCounter >= bytes) {
            break;
        }
        isDone = done;
    }
    reader.releaseLock();
    const collected = new Uint8Array(Math.min(bytes, byteLengthCounter));
    let offset = 0;
    for (const chunk of chunks) {
        if (chunk.byteLength > collected.byteLength - offset) {
            collected.set(chunk.subarray(0, collected.byteLength - offset), offset);
            break;
        }
        else {
            collected.set(chunk, offset);
        }
        offset += chunk.length;
    }
    return collected;
}


/***/ }),

/***/ 88412:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.headStream = void 0;
const stream_1 = __webpack_require__(2203);
const headStream_browser_1 = __webpack_require__(80066);
const stream_type_check_1 = __webpack_require__(4414);
const headStream = (stream, bytes) => {
    if ((0, stream_type_check_1.isReadableStream)(stream)) {
        return (0, headStream_browser_1.headStream)(stream, bytes);
    }
    return new Promise((resolve, reject) => {
        const collector = new Collector();
        collector.limit = bytes;
        stream.pipe(collector);
        stream.on("error", (err) => {
            collector.end();
            reject(err);
        });
        collector.on("error", reject);
        collector.on("finish", function () {
            const bytes = new Uint8Array(Buffer.concat(this.buffers));
            resolve(bytes);
        });
    });
};
exports.headStream = headStream;
class Collector extends stream_1.Writable {
    buffers = [];
    limit = Infinity;
    bytesBuffered = 0;
    _write(chunk, encoding, callback) {
        this.buffers.push(chunk);
        this.bytesBuffered += chunk.byteLength ?? 0;
        if (this.bytesBuffered >= this.limit) {
            const excess = this.bytesBuffered - this.limit;
            const tailBuffer = this.buffers[this.buffers.length - 1];
            this.buffers[this.buffers.length - 1] = tailBuffer.subarray(0, tailBuffer.byteLength - excess);
            this.emit("finish");
        }
        callback();
    }
}


/***/ }),

/***/ 4252:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var utilBase64 = __webpack_require__(68385);
var utilUtf8 = __webpack_require__(71577);
var ChecksumStream = __webpack_require__(71775);
var createChecksumStream = __webpack_require__(5639);
var createBufferedReadable = __webpack_require__(72005);
var getAwsChunkedEncodingStream = __webpack_require__(6522);
var headStream = __webpack_require__(88412);
var sdkStreamMixin = __webpack_require__(77201);
var splitStream = __webpack_require__(82108);
var streamTypeCheck = __webpack_require__(4414);

class Uint8ArrayBlobAdapter extends Uint8Array {
    static fromString(source, encoding = "utf-8") {
        if (typeof source === "string") {
            if (encoding === "base64") {
                return Uint8ArrayBlobAdapter.mutate(utilBase64.fromBase64(source));
            }
            return Uint8ArrayBlobAdapter.mutate(utilUtf8.fromUtf8(source));
        }
        throw new Error(`Unsupported conversion from ${typeof source} to Uint8ArrayBlobAdapter.`);
    }
    static mutate(source) {
        Object.setPrototypeOf(source, Uint8ArrayBlobAdapter.prototype);
        return source;
    }
    transformToString(encoding = "utf-8") {
        if (encoding === "base64") {
            return utilBase64.toBase64(this);
        }
        return utilUtf8.toUtf8(this);
    }
}

exports.isBlob = streamTypeCheck.isBlob;
exports.isReadableStream = streamTypeCheck.isReadableStream;
exports.Uint8ArrayBlobAdapter = Uint8ArrayBlobAdapter;
Object.prototype.hasOwnProperty.call(ChecksumStream, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: ChecksumStream['__proto__']
    });

Object.keys(ChecksumStream).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = ChecksumStream[k];
});
Object.prototype.hasOwnProperty.call(createChecksumStream, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: createChecksumStream['__proto__']
    });

Object.keys(createChecksumStream).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = createChecksumStream[k];
});
Object.prototype.hasOwnProperty.call(createBufferedReadable, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: createBufferedReadable['__proto__']
    });

Object.keys(createBufferedReadable).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = createBufferedReadable[k];
});
Object.prototype.hasOwnProperty.call(getAwsChunkedEncodingStream, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: getAwsChunkedEncodingStream['__proto__']
    });

Object.keys(getAwsChunkedEncodingStream).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = getAwsChunkedEncodingStream[k];
});
Object.prototype.hasOwnProperty.call(headStream, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: headStream['__proto__']
    });

Object.keys(headStream).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = headStream[k];
});
Object.prototype.hasOwnProperty.call(sdkStreamMixin, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: sdkStreamMixin['__proto__']
    });

Object.keys(sdkStreamMixin).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = sdkStreamMixin[k];
});
Object.prototype.hasOwnProperty.call(splitStream, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: splitStream['__proto__']
    });

Object.keys(splitStream).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = splitStream[k];
});


/***/ }),

/***/ 82207:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.sdkStreamMixin = void 0;
const fetch_http_handler_1 = __webpack_require__(47809);
const util_base64_1 = __webpack_require__(68385);
const util_hex_encoding_1 = __webpack_require__(96435);
const util_utf8_1 = __webpack_require__(71577);
const stream_type_check_1 = __webpack_require__(4414);
const ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED = "The stream has already been transformed.";
const sdkStreamMixin = (stream) => {
    if (!isBlobInstance(stream) && !(0, stream_type_check_1.isReadableStream)(stream)) {
        const name = stream?.__proto__?.constructor?.name || stream;
        throw new Error(`Unexpected stream implementation, expect Blob or ReadableStream, got ${name}`);
    }
    let transformed = false;
    const transformToByteArray = async () => {
        if (transformed) {
            throw new Error(ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED);
        }
        transformed = true;
        return await (0, fetch_http_handler_1.streamCollector)(stream);
    };
    const blobToWebStream = (blob) => {
        if (typeof blob.stream !== "function") {
            throw new Error("Cannot transform payload Blob to web stream. Please make sure the Blob.stream() is polyfilled.\n" +
                "If you are using React Native, this API is not yet supported, see: https://react-native.canny.io/feature-requests/p/fetch-streaming-body");
        }
        return blob.stream();
    };
    return Object.assign(stream, {
        transformToByteArray: transformToByteArray,
        transformToString: async (encoding) => {
            const buf = await transformToByteArray();
            if (encoding === "base64") {
                return (0, util_base64_1.toBase64)(buf);
            }
            else if (encoding === "hex") {
                return (0, util_hex_encoding_1.toHex)(buf);
            }
            else if (encoding === undefined || encoding === "utf8" || encoding === "utf-8") {
                return (0, util_utf8_1.toUtf8)(buf);
            }
            else if (typeof TextDecoder === "function") {
                return new TextDecoder(encoding).decode(buf);
            }
            else {
                throw new Error("TextDecoder is not available, please make sure polyfill is provided.");
            }
        },
        transformToWebStream: () => {
            if (transformed) {
                throw new Error(ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED);
            }
            transformed = true;
            if (isBlobInstance(stream)) {
                return blobToWebStream(stream);
            }
            else if ((0, stream_type_check_1.isReadableStream)(stream)) {
                return stream;
            }
            else {
                throw new Error(`Cannot transform payload to web stream, got ${stream}`);
            }
        },
    });
};
exports.sdkStreamMixin = sdkStreamMixin;
const isBlobInstance = (stream) => typeof Blob === "function" && stream instanceof Blob;


/***/ }),

/***/ 77201:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.sdkStreamMixin = void 0;
const node_http_handler_1 = __webpack_require__(61279);
const util_buffer_from_1 = __webpack_require__(44151);
const stream_1 = __webpack_require__(2203);
const sdk_stream_mixin_browser_1 = __webpack_require__(82207);
const ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED = "The stream has already been transformed.";
const sdkStreamMixin = (stream) => {
    if (!(stream instanceof stream_1.Readable)) {
        try {
            return (0, sdk_stream_mixin_browser_1.sdkStreamMixin)(stream);
        }
        catch (e) {
            const name = stream?.__proto__?.constructor?.name || stream;
            throw new Error(`Unexpected stream implementation, expect Stream.Readable instance, got ${name}`);
        }
    }
    let transformed = false;
    const transformToByteArray = async () => {
        if (transformed) {
            throw new Error(ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED);
        }
        transformed = true;
        return await (0, node_http_handler_1.streamCollector)(stream);
    };
    return Object.assign(stream, {
        transformToByteArray,
        transformToString: async (encoding) => {
            const buf = await transformToByteArray();
            if (encoding === undefined || Buffer.isEncoding(encoding)) {
                return (0, util_buffer_from_1.fromArrayBuffer)(buf.buffer, buf.byteOffset, buf.byteLength).toString(encoding);
            }
            else {
                const decoder = new TextDecoder(encoding);
                return decoder.decode(buf);
            }
        },
        transformToWebStream: () => {
            if (transformed) {
                throw new Error(ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED);
            }
            if (stream.readableFlowing !== null) {
                throw new Error("The stream has been consumed by other callbacks.");
            }
            if (typeof stream_1.Readable.toWeb !== "function") {
                throw new Error("Readable.toWeb() is not supported. Please ensure a polyfill is available.");
            }
            transformed = true;
            return stream_1.Readable.toWeb(stream);
        },
    });
};
exports.sdkStreamMixin = sdkStreamMixin;


/***/ }),

/***/ 17570:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.splitStream = splitStream;
async function splitStream(stream) {
    if (typeof stream.stream === "function") {
        stream = stream.stream();
    }
    const readableStream = stream;
    return readableStream.tee();
}


/***/ }),

/***/ 82108:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.splitStream = splitStream;
const stream_1 = __webpack_require__(2203);
const splitStream_browser_1 = __webpack_require__(17570);
const stream_type_check_1 = __webpack_require__(4414);
async function splitStream(stream) {
    if ((0, stream_type_check_1.isReadableStream)(stream) || (0, stream_type_check_1.isBlob)(stream)) {
        return (0, splitStream_browser_1.splitStream)(stream);
    }
    const stream1 = new stream_1.PassThrough();
    const stream2 = new stream_1.PassThrough();
    stream.pipe(stream1);
    stream.pipe(stream2);
    return [stream1, stream2];
}


/***/ }),

/***/ 4414:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isBlob = exports.isReadableStream = void 0;
const isReadableStream = (stream) => typeof ReadableStream === "function" &&
    (stream?.constructor?.name === ReadableStream.name || stream instanceof ReadableStream);
exports.isReadableStream = isReadableStream;
const isBlob = (blob) => {
    return typeof Blob === "function" && (blob?.constructor?.name === Blob.name || blob instanceof Blob);
};
exports.isBlob = isBlob;


/***/ }),

/***/ 80146:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


const escapeUri = (uri) => encodeURIComponent(uri).replace(/[!'()*]/g, hexEncode);
const hexEncode = (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`;

const escapeUriPath = (uri) => uri.split("/").map(escapeUri).join("/");

exports.escapeUri = escapeUri;
exports.escapeUriPath = escapeUriPath;


/***/ }),

/***/ 71577:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var utilBufferFrom = __webpack_require__(44151);

const fromUtf8 = (input) => {
    const buf = utilBufferFrom.fromString(input, "utf8");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength / Uint8Array.BYTES_PER_ELEMENT);
};

const toUint8Array = (data) => {
    if (typeof data === "string") {
        return fromUtf8(data);
    }
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength / Uint8Array.BYTES_PER_ELEMENT);
    }
    return new Uint8Array(data);
};

const toUtf8 = (input) => {
    if (typeof input === "string") {
        return input;
    }
    if (typeof input !== "object" || typeof input.byteOffset !== "number" || typeof input.byteLength !== "number") {
        throw new Error("@smithy/util-utf8: toUtf8 encoder function only accepts string | Uint8Array.");
    }
    return utilBufferFrom.fromArrayBuffer(input.buffer, input.byteOffset, input.byteLength).toString("utf8");
};

exports.fromUtf8 = fromUtf8;
exports.toUint8Array = toUint8Array;
exports.toUtf8 = toUtf8;


/***/ }),

/***/ 95290:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


const getCircularReplacer = () => {
    const seen = new WeakSet();
    return (key, value) => {
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                return "[Circular]";
            }
            seen.add(value);
        }
        return value;
    };
};

const sleep = (seconds) => {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
};

const waiterServiceDefaults = {
    minDelay: 2,
    maxDelay: 120,
};
exports.WaiterState = void 0;
(function (WaiterState) {
    WaiterState["ABORTED"] = "ABORTED";
    WaiterState["FAILURE"] = "FAILURE";
    WaiterState["SUCCESS"] = "SUCCESS";
    WaiterState["RETRY"] = "RETRY";
    WaiterState["TIMEOUT"] = "TIMEOUT";
})(exports.WaiterState || (exports.WaiterState = {}));
const checkExceptions = (result) => {
    if (result.state === exports.WaiterState.ABORTED) {
        const abortError = new Error(`${JSON.stringify({
            ...result,
            reason: "Request was aborted",
        }, getCircularReplacer())}`);
        abortError.name = "AbortError";
        throw abortError;
    }
    else if (result.state === exports.WaiterState.TIMEOUT) {
        const timeoutError = new Error(`${JSON.stringify({
            ...result,
            reason: "Waiter has timed out",
        }, getCircularReplacer())}`);
        timeoutError.name = "TimeoutError";
        throw timeoutError;
    }
    else if (result.state !== exports.WaiterState.SUCCESS) {
        throw new Error(`${JSON.stringify(result, getCircularReplacer())}`);
    }
    return result;
};

const exponentialBackoffWithJitter = (minDelay, maxDelay, attemptCeiling, attempt) => {
    if (attempt > attemptCeiling)
        return maxDelay;
    const delay = minDelay * 2 ** (attempt - 1);
    return randomInRange(minDelay, delay);
};
const randomInRange = (min, max) => min + Math.random() * (max - min);
const runPolling = async ({ minDelay, maxDelay, maxWaitTime, abortController, client, abortSignal }, input, acceptorChecks) => {
    const observedResponses = {};
    const { state, reason } = await acceptorChecks(client, input);
    if (reason) {
        const message = createMessageFromResponse(reason);
        observedResponses[message] |= 0;
        observedResponses[message] += 1;
    }
    if (state !== exports.WaiterState.RETRY) {
        return { state, reason, observedResponses };
    }
    let currentAttempt = 1;
    const waitUntil = Date.now() + maxWaitTime * 1000;
    const attemptCeiling = Math.log(maxDelay / minDelay) / Math.log(2) + 1;
    while (true) {
        if (abortController?.signal?.aborted || abortSignal?.aborted) {
            const message = "AbortController signal aborted.";
            observedResponses[message] |= 0;
            observedResponses[message] += 1;
            return { state: exports.WaiterState.ABORTED, observedResponses };
        }
        const delay = exponentialBackoffWithJitter(minDelay, maxDelay, attemptCeiling, currentAttempt);
        if (Date.now() + delay * 1000 > waitUntil) {
            return { state: exports.WaiterState.TIMEOUT, observedResponses };
        }
        await sleep(delay);
        const { state, reason } = await acceptorChecks(client, input);
        if (reason) {
            const message = createMessageFromResponse(reason);
            observedResponses[message] |= 0;
            observedResponses[message] += 1;
        }
        if (state !== exports.WaiterState.RETRY) {
            return { state, reason, observedResponses };
        }
        currentAttempt += 1;
    }
};
const createMessageFromResponse = (reason) => {
    if (reason?.$responseBodyText) {
        return `Deserialization error for body: ${reason.$responseBodyText}`;
    }
    if (reason?.$metadata?.httpStatusCode) {
        if (reason.$response || reason.message) {
            return `${reason.$response?.statusCode ?? reason.$metadata.httpStatusCode ?? "Unknown"}: ${reason.message}`;
        }
        return `${reason.$metadata.httpStatusCode}: OK`;
    }
    return String(reason?.message ?? JSON.stringify(reason, getCircularReplacer()) ?? "Unknown");
};

const validateWaiterOptions = (options) => {
    if (options.maxWaitTime <= 0) {
        throw new Error(`WaiterConfiguration.maxWaitTime must be greater than 0`);
    }
    else if (options.minDelay <= 0) {
        throw new Error(`WaiterConfiguration.minDelay must be greater than 0`);
    }
    else if (options.maxDelay <= 0) {
        throw new Error(`WaiterConfiguration.maxDelay must be greater than 0`);
    }
    else if (options.maxWaitTime <= options.minDelay) {
        throw new Error(`WaiterConfiguration.maxWaitTime [${options.maxWaitTime}] must be greater than WaiterConfiguration.minDelay [${options.minDelay}] for this waiter`);
    }
    else if (options.maxDelay < options.minDelay) {
        throw new Error(`WaiterConfiguration.maxDelay [${options.maxDelay}] must be greater than WaiterConfiguration.minDelay [${options.minDelay}] for this waiter`);
    }
};

const abortTimeout = (abortSignal) => {
    let onAbort;
    const promise = new Promise((resolve) => {
        onAbort = () => resolve({ state: exports.WaiterState.ABORTED });
        if (typeof abortSignal.addEventListener === "function") {
            abortSignal.addEventListener("abort", onAbort);
        }
        else {
            abortSignal.onabort = onAbort;
        }
    });
    return {
        clearListener() {
            if (typeof abortSignal.removeEventListener === "function") {
                abortSignal.removeEventListener("abort", onAbort);
            }
        },
        aborted: promise,
    };
};
const createWaiter = async (options, input, acceptorChecks) => {
    const params = {
        ...waiterServiceDefaults,
        ...options,
    };
    validateWaiterOptions(params);
    const exitConditions = [runPolling(params, input, acceptorChecks)];
    const finalize = [];
    if (options.abortSignal) {
        const { aborted, clearListener } = abortTimeout(options.abortSignal);
        finalize.push(clearListener);
        exitConditions.push(aborted);
    }
    if (options.abortController?.signal) {
        const { aborted, clearListener } = abortTimeout(options.abortController.signal);
        finalize.push(clearListener);
        exitConditions.push(aborted);
    }
    return Promise.race(exitConditions).then((result) => {
        for (const fn of finalize) {
            fn();
        }
        return result;
    });
};

exports.checkExceptions = checkExceptions;
exports.createWaiter = createWaiter;
exports.waiterServiceDefaults = waiterServiceDefaults;


/***/ }),

/***/ 90266:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


var randomUUID = __webpack_require__(8492);

const decimalToHex = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
const v4 = () => {
    if (randomUUID.randomUUID) {
        return randomUUID.randomUUID();
    }
    const rnds = new Uint8Array(16);
    crypto.getRandomValues(rnds);
    rnds[6] = (rnds[6] & 0x0f) | 0x40;
    rnds[8] = (rnds[8] & 0x3f) | 0x80;
    return (decimalToHex[rnds[0]] +
        decimalToHex[rnds[1]] +
        decimalToHex[rnds[2]] +
        decimalToHex[rnds[3]] +
        "-" +
        decimalToHex[rnds[4]] +
        decimalToHex[rnds[5]] +
        "-" +
        decimalToHex[rnds[6]] +
        decimalToHex[rnds[7]] +
        "-" +
        decimalToHex[rnds[8]] +
        decimalToHex[rnds[9]] +
        "-" +
        decimalToHex[rnds[10]] +
        decimalToHex[rnds[11]] +
        decimalToHex[rnds[12]] +
        decimalToHex[rnds[13]] +
        decimalToHex[rnds[14]] +
        decimalToHex[rnds[15]]);
};

exports.v4 = v4;


/***/ }),

/***/ 8492:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.randomUUID = void 0;
const tslib_1 = __webpack_require__(61860);
const crypto_1 = tslib_1.__importDefault(__webpack_require__(76982));
exports.randomUUID = crypto_1.default.randomUUID.bind(crypto_1.default);


/***/ }),

/***/ 29214:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

/**
 * Mnemonist LRUCache
 * ===================
 *
 * JavaScript implementation of the LRU Cache data structure. To save up
 * memory and allocations this implementation represents its underlying
 * doubly-linked list as static arrays and pointers. Thus, memory is allocated
 * only once at instantiation and JS objects are never created to serve as
 * pointers. This also means this implementation does not trigger too many
 * garbage collections.
 *
 * Note that to save up memory, a LRU Cache can be implemented using a singly
 * linked list by storing predecessors' pointers as hashmap values.
 * However, this means more hashmap lookups and would probably slow the whole
 * thing down. What's more, pointers are not the things taking most space in
 * memory.
 */
var Iterator = __webpack_require__(91571),
    forEach = __webpack_require__(78095),
    typed = __webpack_require__(54909),
    iterables = __webpack_require__(177);

/**
 * LRUCache.
 *
 * @constructor
 * @param {function} Keys     - Array class for storing keys.
 * @param {function} Values   - Array class for storing values.
 * @param {number}   capacity - Desired capacity.
 */
function LRUCache(Keys, Values, capacity) {
  if (arguments.length < 2) {
    capacity = Keys;
    Keys = null;
    Values = null;
  }

  this.capacity = capacity;

  if (typeof this.capacity !== 'number' || this.capacity <= 0)
    throw new Error('mnemonist/lru-cache: capacity should be positive number.');

  var PointerArray = typed.getPointerArray(capacity);

  this.forward = new PointerArray(capacity);
  this.backward = new PointerArray(capacity);
  this.K = typeof Keys === 'function' ? new Keys(capacity) : new Array(capacity);
  this.V = typeof Values === 'function' ? new Values(capacity) : new Array(capacity);

  // Properties
  this.size = 0;
  this.head = 0;
  this.tail = 0;
  this.items = {};
}

/**
 * Method used to clear the structure.
 *
 * @return {undefined}
 */
LRUCache.prototype.clear = function() {
  this.size = 0;
  this.head = 0;
  this.tail = 0;
  this.items = {};
};

/**
 * Method used to splay a value on top.
 *
 * @param  {number}   pointer - Pointer of the value to splay on top.
 * @return {LRUCache}
 */
LRUCache.prototype.splayOnTop = function(pointer) {
  var oldHead = this.head;

  if (this.head === pointer)
    return this;

  var previous = this.backward[pointer],
      next = this.forward[pointer];

  if (this.tail === pointer) {
    this.tail = previous;
  }
  else {
    this.backward[next] = previous;
  }

  this.forward[previous] = next;

  this.backward[oldHead] = pointer;
  this.head = pointer;
  this.forward[pointer] = oldHead;

  return this;
};

/**
 * Method used to set the value for the given key in the cache.
 *
 * @param  {any} key   - Key.
 * @param  {any} value - Value.
 * @return {undefined}
 */
LRUCache.prototype.set = function(key, value) {

  // The key already exists, we just need to update the value and splay on top
  var pointer = this.items[key];

  if (typeof pointer !== 'undefined') {
    this.splayOnTop(pointer);
    this.V[pointer] = value;

    return;
  }

  // The cache is not yet full
  if (this.size < this.capacity) {
    pointer = this.size++;
  }

  // Cache is full, we need to drop the last value
  else {
    pointer = this.tail;
    this.tail = this.backward[pointer];
    delete this.items[this.K[pointer]];
  }

  // Storing key & value
  this.items[key] = pointer;
  this.K[pointer] = key;
  this.V[pointer] = value;

  // Moving the item at the front of the list
  this.forward[pointer] = this.head;
  this.backward[this.head] = pointer;
  this.head = pointer;
};

/**
 * Method used to set the value for the given key in the cache
 *
 * @param  {any} key   - Key.
 * @param  {any} value - Value.
 * @return {{evicted: boolean, key: any, value: any}} An object containing the
 * key and value of an item that was overwritten or evicted in the set
 * operation, as well as a boolean indicating whether it was evicted due to
 * limited capacity. Return value is null if nothing was evicted or overwritten
 * during the set operation.
 */
LRUCache.prototype.setpop = function(key, value) {
  var oldValue = null;
  var oldKey = null;
  // The key already exists, we just need to update the value and splay on top
  var pointer = this.items[key];

  if (typeof pointer !== 'undefined') {
    this.splayOnTop(pointer);
    oldValue = this.V[pointer];
    this.V[pointer] = value;
    return {evicted: false, key: key, value: oldValue};
  }

  // The cache is not yet full
  if (this.size < this.capacity) {
    pointer = this.size++;
  }

  // Cache is full, we need to drop the last value
  else {
    pointer = this.tail;
    this.tail = this.backward[pointer];
    oldValue = this.V[pointer];
    oldKey = this.K[pointer];
    delete this.items[this.K[pointer]];
  }

  // Storing key & value
  this.items[key] = pointer;
  this.K[pointer] = key;
  this.V[pointer] = value;

  // Moving the item at the front of the list
  this.forward[pointer] = this.head;
  this.backward[this.head] = pointer;
  this.head = pointer;

  // Return object if eviction took place, otherwise return null
  if (oldKey) {
    return {evicted: true, key: oldKey, value: oldValue};
  }
  else {
    return null;
  }
};

/**
 * Method used to check whether the key exists in the cache.
 *
 * @param  {any} key   - Key.
 * @return {boolean}
 */
LRUCache.prototype.has = function(key) {
  return key in this.items;
};

/**
 * Method used to get the value attached to the given key. Will move the
 * related key to the front of the underlying linked list.
 *
 * @param  {any} key   - Key.
 * @return {any}
 */
LRUCache.prototype.get = function(key) {
  var pointer = this.items[key];

  if (typeof pointer === 'undefined')
    return;

  this.splayOnTop(pointer);

  return this.V[pointer];
};

/**
 * Method used to get the value attached to the given key. Does not modify
 * the ordering of the underlying linked list.
 *
 * @param  {any} key   - Key.
 * @return {any}
 */
LRUCache.prototype.peek = function(key) {
    var pointer = this.items[key];

    if (typeof pointer === 'undefined')
        return;

    return this.V[pointer];
};

/**
 * Method used to iterate over the cache's entries using a callback.
 *
 * @param  {function}  callback - Function to call for each item.
 * @param  {object}    scope    - Optional scope.
 * @return {undefined}
 */
LRUCache.prototype.forEach = function(callback, scope) {
  scope = arguments.length > 1 ? scope : this;

  var i = 0,
      l = this.size;

  var pointer = this.head,
      keys = this.K,
      values = this.V,
      forward = this.forward;

  while (i < l) {

    callback.call(scope, values[pointer], keys[pointer], this);
    pointer = forward[pointer];

    i++;
  }
};

/**
 * Method used to create an iterator over the cache's keys from most
 * recently used to least recently used.
 *
 * @return {Iterator}
 */
LRUCache.prototype.keys = function() {
  var i = 0,
      l = this.size;

  var pointer = this.head,
      keys = this.K,
      forward = this.forward;

  return new Iterator(function() {
    if (i >= l)
      return {done: true};

    var key = keys[pointer];

    i++;

    if (i < l)
      pointer = forward[pointer];

    return {
      done: false,
      value: key
    };
  });
};

/**
 * Method used to create an iterator over the cache's values from most
 * recently used to least recently used.
 *
 * @return {Iterator}
 */
LRUCache.prototype.values = function() {
  var i = 0,
      l = this.size;

  var pointer = this.head,
      values = this.V,
      forward = this.forward;

  return new Iterator(function() {
    if (i >= l)
      return {done: true};

    var value = values[pointer];

    i++;

    if (i < l)
      pointer = forward[pointer];

    return {
      done: false,
      value: value
    };
  });
};

/**
 * Method used to create an iterator over the cache's entries from most
 * recently used to least recently used.
 *
 * @return {Iterator}
 */
LRUCache.prototype.entries = function() {
  var i = 0,
      l = this.size;

  var pointer = this.head,
      keys = this.K,
      values = this.V,
      forward = this.forward;

  return new Iterator(function() {
    if (i >= l)
      return {done: true};

    var key = keys[pointer],
        value = values[pointer];

    i++;

    if (i < l)
      pointer = forward[pointer];

    return {
      done: false,
      value: [key, value]
    };
  });
};

/**
 * Attaching the #.entries method to Symbol.iterator if possible.
 */
if (typeof Symbol !== 'undefined')
  LRUCache.prototype[Symbol.iterator] = LRUCache.prototype.entries;

/**
 * Convenience known methods.
 */
LRUCache.prototype.inspect = function() {
  var proxy = new Map();

  var iterator = this.entries(),
      step;

  while ((step = iterator.next(), !step.done))
    proxy.set(step.value[0], step.value[1]);

  // Trick so that node displays the name of the constructor
  Object.defineProperty(proxy, 'constructor', {
    value: LRUCache,
    enumerable: false
  });

  return proxy;
};

if (typeof Symbol !== 'undefined')
  LRUCache.prototype[Symbol.for('nodejs.util.inspect.custom')] = LRUCache.prototype.inspect;

/**
 * Static @.from function taking an arbitrary iterable & converting it into
 * a structure.
 *
 * @param  {Iterable} iterable - Target iterable.
 * @param  {function} Keys     - Array class for storing keys.
 * @param  {function} Values   - Array class for storing values.
 * @param  {number}   capacity - Cache's capacity.
 * @return {LRUCache}
 */
LRUCache.from = function(iterable, Keys, Values, capacity) {
  if (arguments.length < 2) {
    capacity = iterables.guessLength(iterable);

    if (typeof capacity !== 'number')
      throw new Error('mnemonist/lru-cache.from: could not guess iterable length. Please provide desired capacity as last argument.');
  }
  else if (arguments.length === 2) {
    capacity = Keys;
    Keys = null;
    Values = null;
  }

  var cache = new LRUCache(Keys, Values, capacity);

  forEach(iterable, function(value, key) {
    cache.set(key, value);
  });

  return cache;
};

/**
 * Exporting.
 */
module.exports = LRUCache;


/***/ }),

/***/ 177:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

/**
 * Mnemonist Iterable Function
 * ============================
 *
 * Harmonized iteration helpers over mixed iterable targets.
 */
var forEach = __webpack_require__(78095);

var typed = __webpack_require__(54909);

/**
 * Function used to determine whether the given object supports array-like
 * random access.
 *
 * @param  {any} target - Target object.
 * @return {boolean}
 */
function isArrayLike(target) {
  return Array.isArray(target) || typed.isTypedArray(target);
}

/**
 * Function used to guess the length of the structure over which we are going
 * to iterate.
 *
 * @param  {any} target - Target object.
 * @return {number|undefined}
 */
function guessLength(target) {
  if (typeof target.length === 'number')
    return target.length;

  if (typeof target.size === 'number')
    return target.size;

  return;
}

/**
 * Function used to convert an iterable to an array.
 *
 * @param  {any}   target - Iteration target.
 * @return {array}
 */
function toArray(target) {
  var l = guessLength(target);

  var array = typeof l === 'number' ? new Array(l) : [];

  var i = 0;

  // TODO: we could optimize when given target is array like
  forEach(target, function(value) {
    array[i++] = value;
  });

  return array;
}

/**
 * Same as above but returns a supplementary indices array.
 *
 * @param  {any}   target - Iteration target.
 * @return {array}
 */
function toArrayWithIndices(target) {
  var l = guessLength(target);

  var IndexArray = typeof l === 'number' ?
    typed.getPointerArray(l) :
    Array;

  var array = typeof l === 'number' ? new Array(l) : [];
  var indices = typeof l === 'number' ? new IndexArray(l) : [];

  var i = 0;

  // TODO: we could optimize when given target is array like
  forEach(target, function(value) {
    array[i] = value;
    indices[i] = i++;
  });

  return [array, indices];
}

/**
 * Exporting.
 */
exports.isArrayLike = isArrayLike;
exports.guessLength = guessLength;
exports.toArray = toArray;
exports.toArrayWithIndices = toArrayWithIndices;


/***/ }),

/***/ 54909:
/***/ ((__unused_webpack_module, exports) => {

/**
 * Mnemonist Typed Array Helpers
 * ==============================
 *
 * Miscellaneous helpers related to typed arrays.
 */

/**
 * When using an unsigned integer array to store pointers, one might want to
 * choose the optimal word size in regards to the actual numbers of pointers
 * to store.
 *
 * This helpers does just that.
 *
 * @param  {number} size - Expected size of the array to map.
 * @return {TypedArray}
 */
var MAX_8BIT_INTEGER = Math.pow(2, 8) - 1,
    MAX_16BIT_INTEGER = Math.pow(2, 16) - 1,
    MAX_32BIT_INTEGER = Math.pow(2, 32) - 1;

var MAX_SIGNED_8BIT_INTEGER = Math.pow(2, 7) - 1,
    MAX_SIGNED_16BIT_INTEGER = Math.pow(2, 15) - 1,
    MAX_SIGNED_32BIT_INTEGER = Math.pow(2, 31) - 1;

exports.getPointerArray = function(size) {
  var maxIndex = size - 1;

  if (maxIndex <= MAX_8BIT_INTEGER)
    return Uint8Array;

  if (maxIndex <= MAX_16BIT_INTEGER)
    return Uint16Array;

  if (maxIndex <= MAX_32BIT_INTEGER)
    return Uint32Array;

  return Float64Array;
};

exports.getSignedPointerArray = function(size) {
  var maxIndex = size - 1;

  if (maxIndex <= MAX_SIGNED_8BIT_INTEGER)
    return Int8Array;

  if (maxIndex <= MAX_SIGNED_16BIT_INTEGER)
    return Int16Array;

  if (maxIndex <= MAX_SIGNED_32BIT_INTEGER)
    return Int32Array;

  return Float64Array;
};

/**
 * Function returning the minimal type able to represent the given number.
 *
 * @param  {number} value - Value to test.
 * @return {TypedArrayClass}
 */
exports.getNumberType = function(value) {

  // <= 32 bits itnteger?
  if (value === (value | 0)) {

    // Negative
    if (Math.sign(value) === -1) {
      if (value <= 127 && value >= -128)
        return Int8Array;

      if (value <= 32767 && value >= -32768)
        return Int16Array;

      return Int32Array;
    }
    else {

      if (value <= 255)
        return Uint8Array;

      if (value <= 65535)
        return Uint16Array;

      return Uint32Array;
    }
  }

  // 53 bits integer & floats
  // NOTE: it's kinda hard to tell whether we could use 32bits or not...
  return Float64Array;
};

/**
 * Function returning the minimal type able to represent the given array
 * of JavaScript numbers.
 *
 * @param  {array}    array  - Array to represent.
 * @param  {function} getter - Optional getter.
 * @return {TypedArrayClass}
 */
var TYPE_PRIORITY = {
  Uint8Array: 1,
  Int8Array: 2,
  Uint16Array: 3,
  Int16Array: 4,
  Uint32Array: 5,
  Int32Array: 6,
  Float32Array: 7,
  Float64Array: 8
};

// TODO: make this a one-shot for one value
exports.getMinimalRepresentation = function(array, getter) {
  var maxType = null,
      maxPriority = 0,
      p,
      t,
      v,
      i,
      l;

  for (i = 0, l = array.length; i < l; i++) {
    v = getter ? getter(array[i]) : array[i];
    t = exports.getNumberType(v);
    p = TYPE_PRIORITY[t.name];

    if (p > maxPriority) {
      maxPriority = p;
      maxType = t;
    }
  }

  return maxType;
};

/**
 * Function returning whether the given value is a typed array.
 *
 * @param  {any} value - Value to test.
 * @return {boolean}
 */
exports.isTypedArray = function(value) {
  return typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value);
};

/**
 * Function used to concat byte arrays.
 *
 * @param  {...ByteArray}
 * @return {ByteArray}
 */
exports.concat = function() {
  var length = 0,
      i,
      o,
      l;

  for (i = 0, l = arguments.length; i < l; i++)
    length += arguments[i].length;

  var array = new (arguments[0].constructor)(length);

  for (i = 0, o = 0; i < l; i++) {
    array.set(arguments[i], o);
    o += arguments[i].length;
  }

  return array;
};

/**
 * Function used to initialize a byte array of indices.
 *
 * @param  {number}    length - Length of target.
 * @return {ByteArray}
 */
exports.indices = function(length) {
  var PointerArray = exports.getPointerArray(length);

  var array = new PointerArray(length);

  for (var i = 0; i < length; i++)
    array[i] = i;

  return array;
};


/***/ }),

/***/ 78095:
/***/ ((module) => {

/**
 * Obliterator ForEach Function
 * =============================
 *
 * Helper function used to easily iterate over mixed values.
 */

/**
 * Constants.
 */
var ARRAY_BUFFER_SUPPORT = typeof ArrayBuffer !== 'undefined',
    SYMBOL_SUPPORT = typeof Symbol !== 'undefined';

/**
 * Function able to iterate over almost any iterable JS value.
 *
 * @param  {any}      iterable - Iterable value.
 * @param  {function} callback - Callback function.
 */
function forEach(iterable, callback) {
  var iterator, k, i, l, s;

  if (!iterable)
    throw new Error('obliterator/forEach: invalid iterable.');

  if (typeof callback !== 'function')
    throw new Error('obliterator/forEach: expecting a callback.');

  // The target is an array or a string or function arguments
  if (
    Array.isArray(iterable) ||
    (ARRAY_BUFFER_SUPPORT && ArrayBuffer.isView(iterable)) ||
    typeof iterable === 'string' ||
    iterable.toString() === '[object Arguments]'
  ) {
    for (i = 0, l = iterable.length; i < l; i++)
      callback(iterable[i], i);
    return;
  }

  // The target has a #.forEach method
  if (typeof iterable.forEach === 'function') {
    iterable.forEach(callback);
    return;
  }

  // The target is iterable
  if (
    SYMBOL_SUPPORT &&
    Symbol.iterator in iterable &&
    typeof iterable.next !== 'function'
  ) {
    iterable = iterable[Symbol.iterator]();
  }

  // The target is an iterator
  if (typeof iterable.next === 'function') {
    iterator = iterable;
    i = 0;

    while ((s = iterator.next(), s.done !== true)) {
      callback(s.value, i);
      i++;
    }

    return;
  }

  // The target is a plain object
  for (k in iterable) {
    if (iterable.hasOwnProperty(k)) {
      callback(iterable[k], k);
    }
  }

  return;
}

/**
 * Same function as the above `forEach` but will yield `null` when the target
 * does not have keys.
 *
 * @param  {any}      iterable - Iterable value.
 * @param  {function} callback - Callback function.
 */
forEach.forEachWithNullKeys = function(iterable, callback) {
  var iterator, k, i, l, s;

  if (!iterable)
    throw new Error('obliterator/forEachWithNullKeys: invalid iterable.');

  if (typeof callback !== 'function')
    throw new Error('obliterator/forEachWithNullKeys: expecting a callback.');

  // The target is an array or a string or function arguments
  if (
    Array.isArray(iterable) ||
    (ARRAY_BUFFER_SUPPORT && ArrayBuffer.isView(iterable)) ||
    typeof iterable === 'string' ||
    iterable.toString() === '[object Arguments]'
  ) {
    for (i = 0, l = iterable.length; i < l; i++)
      callback(iterable[i], null);
    return;
  }

  // The target is a Set
  if (iterable instanceof Set) {
    iterable.forEach(function(value) {
      callback(value, null);
    });
    return;
  }

  // The target has a #.forEach method
  if (typeof iterable.forEach === 'function') {
    iterable.forEach(callback);
    return;
  }

  // The target is iterable
  if (
    SYMBOL_SUPPORT &&
    Symbol.iterator in iterable &&
    typeof iterable.next !== 'function'
  ) {
    iterable = iterable[Symbol.iterator]();
  }

  // The target is an iterator
  if (typeof iterable.next === 'function') {
    iterator = iterable;
    i = 0;

    while ((s = iterator.next(), s.done !== true)) {
      callback(s.value, null);
      i++;
    }

    return;
  }

  // The target is a plain object
  for (k in iterable) {
    if (iterable.hasOwnProperty(k)) {
      callback(iterable[k], k);
    }
  }

  return;
};

/**
 * Exporting.
 */
module.exports = forEach;


/***/ }),

/***/ 91571:
/***/ ((module) => {

/**
 * Obliterator Iterator Class
 * ===========================
 *
 * Simple class representing the library's iterators.
 */

/**
 * Iterator class.
 *
 * @constructor
 * @param {function} next - Next function.
 */
function Iterator(next) {

  // Hiding the given function
  Object.defineProperty(this, '_next', {
    writable: false,
    enumerable: false,
    value: next
  });

  // Is the iterator complete?
  this.done = false;
}

/**
 * Next function.
 *
 * @return {object}
 */
// NOTE: maybe this should dropped for performance?
Iterator.prototype.next = function() {
  if (this.done)
    return {done: true};

  var step = this._next();

  if (step.done)
    this.done = true;

  return step;
};

/**
 * If symbols are supported, we add `next` to `Symbol.iterator`.
 */
if (typeof Symbol !== 'undefined')
  Iterator.prototype[Symbol.iterator] = function() {
    return this;
  };

/**
 * Returning an iterator of the given values.
 *
 * @param  {any...} values - Values.
 * @return {Iterator}
 */
Iterator.of = function() {
  var args = arguments,
      l = args.length,
      i = 0;

  return new Iterator(function() {
    if (i >= l)
      return {done: true};

    return {done: false, value: args[i++]};
  });
};

/**
 * Returning an empty iterator.
 *
 * @return {Iterator}
 */
Iterator.empty = function() {
  var iterator = new Iterator(null);
  iterator.done = true;

  return iterator;
};

/**
 * Returning whether the given value is an iterator.
 *
 * @param  {any} value - Value.
 * @return {boolean}
 */
Iterator.is = function(value) {
  if (value instanceof Iterator)
    return true;

  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.next === 'function'
  );
};

/**
 * Exporting.
 */
module.exports = Iterator;


/***/ }),

/***/ 61860:
/***/ ((module) => {

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global global, define, Symbol, Reflect, Promise, SuppressedError, Iterator */
var __extends;
var __assign;
var __rest;
var __decorate;
var __param;
var __esDecorate;
var __runInitializers;
var __propKey;
var __setFunctionName;
var __metadata;
var __awaiter;
var __generator;
var __exportStar;
var __values;
var __read;
var __spread;
var __spreadArrays;
var __spreadArray;
var __await;
var __asyncGenerator;
var __asyncDelegator;
var __asyncValues;
var __makeTemplateObject;
var __importStar;
var __importDefault;
var __classPrivateFieldGet;
var __classPrivateFieldSet;
var __classPrivateFieldIn;
var __createBinding;
var __addDisposableResource;
var __disposeResources;
var __rewriteRelativeImportExtension;
(function (factory) {
    var root = typeof global === "object" ? global : typeof self === "object" ? self : typeof this === "object" ? this : {};
    if (typeof define === "function" && define.amd) {
        define("tslib", ["exports"], function (exports) { factory(createExporter(root, createExporter(exports))); });
    }
    else if ( true && typeof module.exports === "object") {
        factory(createExporter(root, createExporter(module.exports)));
    }
    else {
        factory(createExporter(root));
    }
    function createExporter(exports, previous) {
        if (exports !== root) {
            if (typeof Object.create === "function") {
                Object.defineProperty(exports, "__esModule", { value: true });
            }
            else {
                exports.__esModule = true;
            }
        }
        return function (id, v) { return exports[id] = previous ? previous(id, v) : v; };
    }
})
(function (exporter) {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };

    __extends = function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };

    __assign = Object.assign || function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
    };

    __rest = function (s, e) {
        var t = {};
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
            t[p] = s[p];
        if (s != null && typeof Object.getOwnPropertySymbols === "function")
            for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
                if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                    t[p[i]] = s[p[i]];
            }
        return t;
    };

    __decorate = function (decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    };

    __param = function (paramIndex, decorator) {
        return function (target, key) { decorator(target, key, paramIndex); }
    };

    __esDecorate = function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
        function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
        var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
        var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
        var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
        var _, done = false;
        for (var i = decorators.length - 1; i >= 0; i--) {
            var context = {};
            for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
            for (var p in contextIn.access) context.access[p] = contextIn.access[p];
            context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
            var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
            if (kind === "accessor") {
                if (result === void 0) continue;
                if (result === null || typeof result !== "object") throw new TypeError("Object expected");
                if (_ = accept(result.get)) descriptor.get = _;
                if (_ = accept(result.set)) descriptor.set = _;
                if (_ = accept(result.init)) initializers.unshift(_);
            }
            else if (_ = accept(result)) {
                if (kind === "field") initializers.unshift(_);
                else descriptor[key] = _;
            }
        }
        if (target) Object.defineProperty(target, contextIn.name, descriptor);
        done = true;
    };

    __runInitializers = function (thisArg, initializers, value) {
        var useValue = arguments.length > 2;
        for (var i = 0; i < initializers.length; i++) {
            value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
        }
        return useValue ? value : void 0;
    };

    __propKey = function (x) {
        return typeof x === "symbol" ? x : "".concat(x);
    };

    __setFunctionName = function (f, name, prefix) {
        if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
        return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
    };

    __metadata = function (metadataKey, metadataValue) {
        if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(metadataKey, metadataValue);
    };

    __awaiter = function (thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    };

    __generator = function (thisArg, body) {
        var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
        return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
        function verb(n) { return function (v) { return step([n, v]); }; }
        function step(op) {
            if (f) throw new TypeError("Generator is already executing.");
            while (g && (g = 0, op[0] && (_ = 0)), _) try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
                if (y = 0, t) op = [op[0] & 2, t.value];
                switch (op[0]) {
                    case 0: case 1: t = op; break;
                    case 4: _.label++; return { value: op[1], done: false };
                    case 5: _.label++; y = op[1]; op = [0]; continue;
                    case 7: op = _.ops.pop(); _.trys.pop(); continue;
                    default:
                        if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                        if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                        if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                        if (t[2]) _.ops.pop();
                        _.trys.pop(); continue;
                }
                op = body.call(thisArg, _);
            } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
            if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
        }
    };

    __exportStar = function(m, o) {
        for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(o, p)) __createBinding(o, m, p);
    };

    __createBinding = Object.create ? (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
            desc = { enumerable: true, get: function() { return m[k]; } };
        }
        Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
    });

    __values = function (o) {
        var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
        if (m) return m.call(o);
        if (o && typeof o.length === "number") return {
            next: function () {
                if (o && i >= o.length) o = void 0;
                return { value: o && o[i++], done: !o };
            }
        };
        throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    };

    __read = function (o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
            while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        }
        catch (error) { e = { error: error }; }
        finally {
            try {
                if (r && !r.done && (m = i["return"])) m.call(i);
            }
            finally { if (e) throw e.error; }
        }
        return ar;
    };

    /** @deprecated */
    __spread = function () {
        for (var ar = [], i = 0; i < arguments.length; i++)
            ar = ar.concat(__read(arguments[i]));
        return ar;
    };

    /** @deprecated */
    __spreadArrays = function () {
        for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
        for (var r = Array(s), k = 0, i = 0; i < il; i++)
            for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
                r[k] = a[j];
        return r;
    };

    __spreadArray = function (to, from, pack) {
        if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
            if (ar || !(i in from)) {
                if (!ar) ar = Array.prototype.slice.call(from, 0, i);
                ar[i] = from[i];
            }
        }
        return to.concat(ar || Array.prototype.slice.call(from));
    };

    __await = function (v) {
        return this instanceof __await ? (this.v = v, this) : new __await(v);
    };

    __asyncGenerator = function (thisArg, _arguments, generator) {
        if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
        var g = generator.apply(thisArg, _arguments || []), i, q = [];
        return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
        function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
        function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
        function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
        function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
        function fulfill(value) { resume("next", value); }
        function reject(value) { resume("throw", value); }
        function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
    };

    __asyncDelegator = function (o) {
        var i, p;
        return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
        function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await(o[n](v)), done: false } : f ? f(v) : v; } : f; }
    };

    __asyncValues = function (o) {
        if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
        var m = o[Symbol.asyncIterator], i;
        return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
        function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
        function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
    };

    __makeTemplateObject = function (cooked, raw) {
        if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
        return cooked;
    };

    var __setModuleDefault = Object.create ? (function(o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
        o["default"] = v;
    };

    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };

    __importStar = function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };

    __importDefault = function (mod) {
        return (mod && mod.__esModule) ? mod : { "default": mod };
    };

    __classPrivateFieldGet = function (receiver, state, kind, f) {
        if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
        if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
        return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
    };

    __classPrivateFieldSet = function (receiver, state, value, kind, f) {
        if (kind === "m") throw new TypeError("Private method is not writable");
        if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
        if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
        return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
    };

    __classPrivateFieldIn = function (state, receiver) {
        if (receiver === null || (typeof receiver !== "object" && typeof receiver !== "function")) throw new TypeError("Cannot use 'in' operator on non-object");
        return typeof state === "function" ? receiver === state : state.has(receiver);
    };

    __addDisposableResource = function (env, value, async) {
        if (value !== null && value !== void 0) {
            if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
            var dispose, inner;
            if (async) {
                if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
                dispose = value[Symbol.asyncDispose];
            }
            if (dispose === void 0) {
                if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
                dispose = value[Symbol.dispose];
                if (async) inner = dispose;
            }
            if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
            if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
            env.stack.push({ value: value, dispose: dispose, async: async });
        }
        else if (async) {
            env.stack.push({ async: true });
        }
        return value;
    };

    var _SuppressedError = typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
        var e = new Error(message);
        return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
    };

    __disposeResources = function (env) {
        function fail(e) {
            env.error = env.hasError ? new _SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };

    __rewriteRelativeImportExtension = function (path, preserveJsx) {
        if (typeof path === "string" && /^\.\.?\//.test(path)) {
            return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
                return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
            });
        }
        return path;
    };

    exporter("__extends", __extends);
    exporter("__assign", __assign);
    exporter("__rest", __rest);
    exporter("__decorate", __decorate);
    exporter("__param", __param);
    exporter("__esDecorate", __esDecorate);
    exporter("__runInitializers", __runInitializers);
    exporter("__propKey", __propKey);
    exporter("__setFunctionName", __setFunctionName);
    exporter("__metadata", __metadata);
    exporter("__awaiter", __awaiter);
    exporter("__generator", __generator);
    exporter("__exportStar", __exportStar);
    exporter("__createBinding", __createBinding);
    exporter("__values", __values);
    exporter("__read", __read);
    exporter("__spread", __spread);
    exporter("__spreadArrays", __spreadArrays);
    exporter("__spreadArray", __spreadArray);
    exporter("__await", __await);
    exporter("__asyncGenerator", __asyncGenerator);
    exporter("__asyncDelegator", __asyncDelegator);
    exporter("__asyncValues", __asyncValues);
    exporter("__makeTemplateObject", __makeTemplateObject);
    exporter("__importStar", __importStar);
    exporter("__importDefault", __importDefault);
    exporter("__classPrivateFieldGet", __classPrivateFieldGet);
    exporter("__classPrivateFieldSet", __classPrivateFieldSet);
    exporter("__classPrivateFieldIn", __classPrivateFieldIn);
    exporter("__addDisposableResource", __addDisposableResource);
    exporter("__disposeResources", __disposeResources);
    exporter("__rewriteRelativeImportExtension", __rewriteRelativeImportExtension);
});

0 && (0);


/***/ }),

/***/ 3035:
/***/ ((module) => {

(()=>{"use strict";var t={d:(e,i)=>{for(var n in i)t.o(i,n)&&!t.o(e,n)&&Object.defineProperty(e,n,{enumerable:!0,get:i[n]})},o:(t,e)=>Object.prototype.hasOwnProperty.call(t,e),r:t=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(t,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(t,"__esModule",{value:!0})}},e={};t.r(e),t.d(e,{XMLBuilder:()=>$t,XMLParser:()=>gt,XMLValidator:()=>It});const i=":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD",n=new RegExp("^["+i+"]["+i+"\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$");function s(t,e){const i=[];let n=e.exec(t);for(;n;){const s=[];s.startIndex=e.lastIndex-n[0].length;const r=n.length;for(let t=0;t<r;t++)s.push(n[t]);i.push(s),n=e.exec(t)}return i}const r=function(t){return!(null==n.exec(t))},o=["hasOwnProperty","toString","valueOf","__defineGetter__","__defineSetter__","__lookupGetter__","__lookupSetter__"],a=["__proto__","constructor","prototype"],h={allowBooleanAttributes:!1,unpairedTags:[]};function l(t,e){e=Object.assign({},h,e);const i=[];let n=!1,s=!1;"\ufeff"===t[0]&&(t=t.substr(1));for(let r=0;r<t.length;r++)if("<"===t[r]&&"?"===t[r+1]){if(r+=2,r=u(t,r),r.err)return r}else{if("<"!==t[r]){if(p(t[r]))continue;return b("InvalidChar","char '"+t[r]+"' is not expected.",w(t,r))}{let o=r;if(r++,"!"===t[r]){r=c(t,r);continue}{let a=!1;"/"===t[r]&&(a=!0,r++);let h="";for(;r<t.length&&">"!==t[r]&&" "!==t[r]&&"\t"!==t[r]&&"\n"!==t[r]&&"\r"!==t[r];r++)h+=t[r];if(h=h.trim(),"/"===h[h.length-1]&&(h=h.substring(0,h.length-1),r--),!y(h)){let e;return e=0===h.trim().length?"Invalid space after '<'.":"Tag '"+h+"' is an invalid name.",b("InvalidTag",e,w(t,r))}const l=g(t,r);if(!1===l)return b("InvalidAttr","Attributes for '"+h+"' have open quote.",w(t,r));let d=l.value;if(r=l.index,"/"===d[d.length-1]){const i=r-d.length;d=d.substring(0,d.length-1);const s=x(d,e);if(!0!==s)return b(s.err.code,s.err.msg,w(t,i+s.err.line));n=!0}else if(a){if(!l.tagClosed)return b("InvalidTag","Closing tag '"+h+"' doesn't have proper closing.",w(t,r));if(d.trim().length>0)return b("InvalidTag","Closing tag '"+h+"' can't have attributes or invalid starting.",w(t,o));if(0===i.length)return b("InvalidTag","Closing tag '"+h+"' has not been opened.",w(t,o));{const e=i.pop();if(h!==e.tagName){let i=w(t,e.tagStartPos);return b("InvalidTag","Expected closing tag '"+e.tagName+"' (opened in line "+i.line+", col "+i.col+") instead of closing tag '"+h+"'.",w(t,o))}0==i.length&&(s=!0)}}else{const a=x(d,e);if(!0!==a)return b(a.err.code,a.err.msg,w(t,r-d.length+a.err.line));if(!0===s)return b("InvalidXml","Multiple possible root nodes found.",w(t,r));-1!==e.unpairedTags.indexOf(h)||i.push({tagName:h,tagStartPos:o}),n=!0}for(r++;r<t.length;r++)if("<"===t[r]){if("!"===t[r+1]){r++,r=c(t,r);continue}if("?"!==t[r+1])break;if(r=u(t,++r),r.err)return r}else if("&"===t[r]){const e=N(t,r);if(-1==e)return b("InvalidChar","char '&' is not expected.",w(t,r));r=e}else if(!0===s&&!p(t[r]))return b("InvalidXml","Extra text at the end",w(t,r));"<"===t[r]&&r--}}}return n?1==i.length?b("InvalidTag","Unclosed tag '"+i[0].tagName+"'.",w(t,i[0].tagStartPos)):!(i.length>0)||b("InvalidXml","Invalid '"+JSON.stringify(i.map(t=>t.tagName),null,4).replace(/\r?\n/g,"")+"' found.",{line:1,col:1}):b("InvalidXml","Start tag expected.",1)}function p(t){return" "===t||"\t"===t||"\n"===t||"\r"===t}function u(t,e){const i=e;for(;e<t.length;e++)if("?"==t[e]||" "==t[e]){const n=t.substr(i,e-i);if(e>5&&"xml"===n)return b("InvalidXml","XML declaration allowed only at the start of the document.",w(t,e));if("?"==t[e]&&">"==t[e+1]){e++;break}continue}return e}function c(t,e){if(t.length>e+5&&"-"===t[e+1]&&"-"===t[e+2]){for(e+=3;e<t.length;e++)if("-"===t[e]&&"-"===t[e+1]&&">"===t[e+2]){e+=2;break}}else if(t.length>e+8&&"D"===t[e+1]&&"O"===t[e+2]&&"C"===t[e+3]&&"T"===t[e+4]&&"Y"===t[e+5]&&"P"===t[e+6]&&"E"===t[e+7]){let i=1;for(e+=8;e<t.length;e++)if("<"===t[e])i++;else if(">"===t[e]&&(i--,0===i))break}else if(t.length>e+9&&"["===t[e+1]&&"C"===t[e+2]&&"D"===t[e+3]&&"A"===t[e+4]&&"T"===t[e+5]&&"A"===t[e+6]&&"["===t[e+7])for(e+=8;e<t.length;e++)if("]"===t[e]&&"]"===t[e+1]&&">"===t[e+2]){e+=2;break}return e}const d='"',f="'";function g(t,e){let i="",n="",s=!1;for(;e<t.length;e++){if(t[e]===d||t[e]===f)""===n?n=t[e]:n!==t[e]||(n="");else if(">"===t[e]&&""===n){s=!0;break}i+=t[e]}return""===n&&{value:i,index:e,tagClosed:s}}const m=new RegExp("(\\s*)([^\\s=]+)(\\s*=)?(\\s*(['\"])(([\\s\\S])*?)\\5)?","g");function x(t,e){const i=s(t,m),n={};for(let t=0;t<i.length;t++){if(0===i[t][1].length)return b("InvalidAttr","Attribute '"+i[t][2]+"' has no space in starting.",v(i[t]));if(void 0!==i[t][3]&&void 0===i[t][4])return b("InvalidAttr","Attribute '"+i[t][2]+"' is without value.",v(i[t]));if(void 0===i[t][3]&&!e.allowBooleanAttributes)return b("InvalidAttr","boolean attribute '"+i[t][2]+"' is not allowed.",v(i[t]));const s=i[t][2];if(!E(s))return b("InvalidAttr","Attribute '"+s+"' is an invalid name.",v(i[t]));if(Object.prototype.hasOwnProperty.call(n,s))return b("InvalidAttr","Attribute '"+s+"' is repeated.",v(i[t]));n[s]=1}return!0}function N(t,e){if(";"===t[++e])return-1;if("#"===t[e])return function(t,e){let i=/\d/;for("x"===t[e]&&(e++,i=/[\da-fA-F]/);e<t.length;e++){if(";"===t[e])return e;if(!t[e].match(i))break}return-1}(t,++e);let i=0;for(;e<t.length;e++,i++)if(!(t[e].match(/\w/)&&i<20)){if(";"===t[e])break;return-1}return e}function b(t,e,i){return{err:{code:t,msg:e,line:i.line||i,col:i.col}}}function E(t){return r(t)}function y(t){return r(t)}function w(t,e){const i=t.substring(0,e).split(/\r?\n/);return{line:i.length,col:i[i.length-1].length+1}}function v(t){return t.startIndex+t[1].length}const T=t=>o.includes(t)?"__"+t:t,P={preserveOrder:!1,attributeNamePrefix:"@_",attributesGroupName:!1,textNodeName:"#text",ignoreAttributes:!0,removeNSPrefix:!1,allowBooleanAttributes:!1,parseTagValue:!0,parseAttributeValue:!1,trimValues:!0,cdataPropName:!1,numberParseOptions:{hex:!0,leadingZeros:!0,eNotation:!0},tagValueProcessor:function(t,e){return e},attributeValueProcessor:function(t,e){return e},stopNodes:[],alwaysCreateTextNode:!1,isArray:()=>!1,commentPropName:!1,unpairedTags:[],processEntities:!0,htmlEntities:!1,ignoreDeclaration:!1,ignorePiTags:!1,transformTagName:!1,transformAttributeName:!1,updateTag:function(t,e,i){return t},captureMetaData:!1,maxNestedTags:100,strictReservedNames:!0,jPath:!0,onDangerousProperty:T};function S(t,e){if("string"!=typeof t)return;const i=t.toLowerCase();if(o.some(t=>i===t.toLowerCase()))throw new Error(`[SECURITY] Invalid ${e}: "${t}" is a reserved JavaScript keyword that could cause prototype pollution`);if(a.some(t=>i===t.toLowerCase()))throw new Error(`[SECURITY] Invalid ${e}: "${t}" is a reserved JavaScript keyword that could cause prototype pollution`)}function A(t){return"boolean"==typeof t?{enabled:t,maxEntitySize:1e4,maxExpansionDepth:10,maxTotalExpansions:1e3,maxExpandedLength:1e5,maxEntityCount:100,allowedTags:null,tagFilter:null}:"object"==typeof t&&null!==t?{enabled:!1!==t.enabled,maxEntitySize:Math.max(1,t.maxEntitySize??1e4),maxExpansionDepth:Math.max(1,t.maxExpansionDepth??10),maxTotalExpansions:Math.max(1,t.maxTotalExpansions??1e3),maxExpandedLength:Math.max(1,t.maxExpandedLength??1e5),maxEntityCount:Math.max(1,t.maxEntityCount??100),allowedTags:t.allowedTags??null,tagFilter:t.tagFilter??null}:A(!0)}const O=function(t){const e=Object.assign({},P,t),i=[{value:e.attributeNamePrefix,name:"attributeNamePrefix"},{value:e.attributesGroupName,name:"attributesGroupName"},{value:e.textNodeName,name:"textNodeName"},{value:e.cdataPropName,name:"cdataPropName"},{value:e.commentPropName,name:"commentPropName"}];for(const{value:t,name:e}of i)t&&S(t,e);return null===e.onDangerousProperty&&(e.onDangerousProperty=T),e.processEntities=A(e.processEntities),e.stopNodes&&Array.isArray(e.stopNodes)&&(e.stopNodes=e.stopNodes.map(t=>"string"==typeof t&&t.startsWith("*.")?".."+t.substring(2):t)),e};let C;C="function"!=typeof Symbol?"@@xmlMetadata":Symbol("XML Node Metadata");class ${constructor(t){this.tagname=t,this.child=[],this[":@"]=Object.create(null)}add(t,e){"__proto__"===t&&(t="#__proto__"),this.child.push({[t]:e})}addChild(t,e){"__proto__"===t.tagname&&(t.tagname="#__proto__"),t[":@"]&&Object.keys(t[":@"]).length>0?this.child.push({[t.tagname]:t.child,":@":t[":@"]}):this.child.push({[t.tagname]:t.child}),void 0!==e&&(this.child[this.child.length-1][C]={startIndex:e})}static getMetaDataSymbol(){return C}}class I{constructor(t){this.suppressValidationErr=!t,this.options=t}readDocType(t,e){const i=Object.create(null);let n=0;if("O"!==t[e+3]||"C"!==t[e+4]||"T"!==t[e+5]||"Y"!==t[e+6]||"P"!==t[e+7]||"E"!==t[e+8])throw new Error("Invalid Tag instead of DOCTYPE");{e+=9;let s=1,r=!1,o=!1,a="";for(;e<t.length;e++)if("<"!==t[e]||o)if(">"===t[e]){if(o?"-"===t[e-1]&&"-"===t[e-2]&&(o=!1,s--):s--,0===s)break}else"["===t[e]?r=!0:a+=t[e];else{if(r&&M(t,"!ENTITY",e)){let s,r;if(e+=7,[s,r,e]=this.readEntityExp(t,e+1,this.suppressValidationErr),-1===r.indexOf("&")){if(!1!==this.options.enabled&&null!=this.options.maxEntityCount&&n>=this.options.maxEntityCount)throw new Error(`Entity count (${n+1}) exceeds maximum allowed (${this.options.maxEntityCount})`);const t=s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");i[s]={regx:RegExp(`&${t};`,"g"),val:r},n++}}else if(r&&M(t,"!ELEMENT",e)){e+=8;const{index:i}=this.readElementExp(t,e+1);e=i}else if(r&&M(t,"!ATTLIST",e))e+=8;else if(r&&M(t,"!NOTATION",e)){e+=9;const{index:i}=this.readNotationExp(t,e+1,this.suppressValidationErr);e=i}else{if(!M(t,"!--",e))throw new Error("Invalid DOCTYPE");o=!0}s++,a=""}if(0!==s)throw new Error("Unclosed DOCTYPE")}return{entities:i,i:e}}readEntityExp(t,e){const i=e=j(t,e);for(;e<t.length&&!/\s/.test(t[e])&&'"'!==t[e]&&"'"!==t[e];)e++;let n=t.substring(i,e);if(_(n),e=j(t,e),!this.suppressValidationErr){if("SYSTEM"===t.substring(e,e+6).toUpperCase())throw new Error("External entities are not supported");if("%"===t[e])throw new Error("Parameter entities are not supported")}let s="";if([e,s]=this.readIdentifierVal(t,e,"entity"),!1!==this.options.enabled&&null!=this.options.maxEntitySize&&s.length>this.options.maxEntitySize)throw new Error(`Entity "${n}" size (${s.length}) exceeds maximum allowed size (${this.options.maxEntitySize})`);return[n,s,--e]}readNotationExp(t,e){const i=e=j(t,e);for(;e<t.length&&!/\s/.test(t[e]);)e++;let n=t.substring(i,e);!this.suppressValidationErr&&_(n),e=j(t,e);const s=t.substring(e,e+6).toUpperCase();if(!this.suppressValidationErr&&"SYSTEM"!==s&&"PUBLIC"!==s)throw new Error(`Expected SYSTEM or PUBLIC, found "${s}"`);e+=s.length,e=j(t,e);let r=null,o=null;if("PUBLIC"===s)[e,r]=this.readIdentifierVal(t,e,"publicIdentifier"),'"'!==t[e=j(t,e)]&&"'"!==t[e]||([e,o]=this.readIdentifierVal(t,e,"systemIdentifier"));else if("SYSTEM"===s&&([e,o]=this.readIdentifierVal(t,e,"systemIdentifier"),!this.suppressValidationErr&&!o))throw new Error("Missing mandatory system identifier for SYSTEM notation");return{notationName:n,publicIdentifier:r,systemIdentifier:o,index:--e}}readIdentifierVal(t,e,i){let n="";const s=t[e];if('"'!==s&&"'"!==s)throw new Error(`Expected quoted string, found "${s}"`);const r=++e;for(;e<t.length&&t[e]!==s;)e++;if(n=t.substring(r,e),t[e]!==s)throw new Error(`Unterminated ${i} value`);return[++e,n]}readElementExp(t,e){const i=e=j(t,e);for(;e<t.length&&!/\s/.test(t[e]);)e++;let n=t.substring(i,e);if(!this.suppressValidationErr&&!r(n))throw new Error(`Invalid element name: "${n}"`);let s="";if("E"===t[e=j(t,e)]&&M(t,"MPTY",e))e+=4;else if("A"===t[e]&&M(t,"NY",e))e+=2;else if("("===t[e]){const i=++e;for(;e<t.length&&")"!==t[e];)e++;if(s=t.substring(i,e),")"!==t[e])throw new Error("Unterminated content model")}else if(!this.suppressValidationErr)throw new Error(`Invalid Element Expression, found "${t[e]}"`);return{elementName:n,contentModel:s.trim(),index:e}}readAttlistExp(t,e){let i=e=j(t,e);for(;e<t.length&&!/\s/.test(t[e]);)e++;let n=t.substring(i,e);for(_(n),i=e=j(t,e);e<t.length&&!/\s/.test(t[e]);)e++;let s=t.substring(i,e);if(!_(s))throw new Error(`Invalid attribute name: "${s}"`);e=j(t,e);let r="";if("NOTATION"===t.substring(e,e+8).toUpperCase()){if(r="NOTATION","("!==t[e=j(t,e+=8)])throw new Error(`Expected '(', found "${t[e]}"`);e++;let i=[];for(;e<t.length&&")"!==t[e];){const n=e;for(;e<t.length&&"|"!==t[e]&&")"!==t[e];)e++;let s=t.substring(n,e);if(s=s.trim(),!_(s))throw new Error(`Invalid notation name: "${s}"`);i.push(s),"|"===t[e]&&(e++,e=j(t,e))}if(")"!==t[e])throw new Error("Unterminated list of notations");e++,r+=" ("+i.join("|")+")"}else{const i=e;for(;e<t.length&&!/\s/.test(t[e]);)e++;r+=t.substring(i,e);const n=["CDATA","ID","IDREF","IDREFS","ENTITY","ENTITIES","NMTOKEN","NMTOKENS"];if(!this.suppressValidationErr&&!n.includes(r.toUpperCase()))throw new Error(`Invalid attribute type: "${r}"`)}e=j(t,e);let o="";return"#REQUIRED"===t.substring(e,e+8).toUpperCase()?(o="#REQUIRED",e+=8):"#IMPLIED"===t.substring(e,e+7).toUpperCase()?(o="#IMPLIED",e+=7):[e,o]=this.readIdentifierVal(t,e,"ATTLIST"),{elementName:n,attributeName:s,attributeType:r,defaultValue:o,index:e}}}const j=(t,e)=>{for(;e<t.length&&/\s/.test(t[e]);)e++;return e};function M(t,e,i){for(let n=0;n<e.length;n++)if(e[n]!==t[i+n+1])return!1;return!0}function _(t){if(r(t))return t;throw new Error(`Invalid entity name ${t}`)}const D=/^[-+]?0x[a-fA-F0-9]+$/,V=/^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/,k={hex:!0,leadingZeros:!0,decimalPoint:".",eNotation:!0,infinity:"original"};const F=/^([-+])?(0*)(\d*(\.\d*)?[eE][-\+]?\d+)$/,L=new Set(["push","pop","reset","updateCurrent","restore"]);class G{constructor(t={}){this.separator=t.separator||".",this.path=[],this.siblingStacks=[]}push(t,e=null,i=null){this.path.length>0&&(this.path[this.path.length-1].values=void 0);const n=this.path.length;this.siblingStacks[n]||(this.siblingStacks[n]=new Map);const s=this.siblingStacks[n],r=i?`${i}:${t}`:t,o=s.get(r)||0;let a=0;for(const t of s.values())a+=t;s.set(r,o+1);const h={tag:t,position:a,counter:o};null!=i&&(h.namespace=i),null!=e&&(h.values=e),this.path.push(h)}pop(){if(0===this.path.length)return;const t=this.path.pop();return this.siblingStacks.length>this.path.length+1&&(this.siblingStacks.length=this.path.length+1),t}updateCurrent(t){if(this.path.length>0){const e=this.path[this.path.length-1];null!=t&&(e.values=t)}}getCurrentTag(){return this.path.length>0?this.path[this.path.length-1].tag:void 0}getCurrentNamespace(){return this.path.length>0?this.path[this.path.length-1].namespace:void 0}getAttrValue(t){if(0===this.path.length)return;const e=this.path[this.path.length-1];return e.values?.[t]}hasAttr(t){if(0===this.path.length)return!1;const e=this.path[this.path.length-1];return void 0!==e.values&&t in e.values}getPosition(){return 0===this.path.length?-1:this.path[this.path.length-1].position??0}getCounter(){return 0===this.path.length?-1:this.path[this.path.length-1].counter??0}getIndex(){return this.getPosition()}getDepth(){return this.path.length}toString(t,e=!0){const i=t||this.separator;return this.path.map(t=>e&&t.namespace?`${t.namespace}:${t.tag}`:t.tag).join(i)}toArray(){return this.path.map(t=>t.tag)}reset(){this.path=[],this.siblingStacks=[]}matches(t){const e=t.segments;return 0!==e.length&&(t.hasDeepWildcard()?this._matchWithDeepWildcard(e):this._matchSimple(e))}_matchSimple(t){if(this.path.length!==t.length)return!1;for(let e=0;e<t.length;e++){const i=t[e],n=this.path[e],s=e===this.path.length-1;if(!this._matchSegment(i,n,s))return!1}return!0}_matchWithDeepWildcard(t){let e=this.path.length-1,i=t.length-1;for(;i>=0&&e>=0;){const n=t[i];if("deep-wildcard"===n.type){if(i--,i<0)return!0;const n=t[i];let s=!1;for(let t=e;t>=0;t--){const r=t===this.path.length-1;if(this._matchSegment(n,this.path[t],r)){e=t-1,i--,s=!0;break}}if(!s)return!1}else{const t=e===this.path.length-1;if(!this._matchSegment(n,this.path[e],t))return!1;e--,i--}}return i<0}_matchSegment(t,e,i){if("*"!==t.tag&&t.tag!==e.tag)return!1;if(void 0!==t.namespace&&"*"!==t.namespace&&t.namespace!==e.namespace)return!1;if(void 0!==t.attrName){if(!i)return!1;if(!e.values||!(t.attrName in e.values))return!1;if(void 0!==t.attrValue){const i=e.values[t.attrName];if(String(i)!==String(t.attrValue))return!1}}if(void 0!==t.position){if(!i)return!1;const n=e.counter??0;if("first"===t.position&&0!==n)return!1;if("odd"===t.position&&n%2!=1)return!1;if("even"===t.position&&n%2!=0)return!1;if("nth"===t.position&&n!==t.positionValue)return!1}return!0}snapshot(){return{path:this.path.map(t=>({...t})),siblingStacks:this.siblingStacks.map(t=>new Map(t))}}restore(t){this.path=t.path.map(t=>({...t})),this.siblingStacks=t.siblingStacks.map(t=>new Map(t))}readOnly(){return new Proxy(this,{get(t,e,i){if(L.has(e))return()=>{throw new TypeError(`Cannot call '${e}' on a read-only Matcher. Obtain a writable instance to mutate state.`)};const n=Reflect.get(t,e,i);return"path"===e||"siblingStacks"===e?Object.freeze(Array.isArray(n)?n.map(t=>t instanceof Map?Object.freeze(new Map(t)):Object.freeze({...t})):n):"function"==typeof n?n.bind(t):n},set(t,e){throw new TypeError(`Cannot set property '${String(e)}' on a read-only Matcher.`)},deleteProperty(t,e){throw new TypeError(`Cannot delete property '${String(e)}' from a read-only Matcher.`)}})}}class R{constructor(t,e={}){this.pattern=t,this.separator=e.separator||".",this.segments=this._parse(t),this._hasDeepWildcard=this.segments.some(t=>"deep-wildcard"===t.type),this._hasAttributeCondition=this.segments.some(t=>void 0!==t.attrName),this._hasPositionSelector=this.segments.some(t=>void 0!==t.position)}_parse(t){const e=[];let i=0,n="";for(;i<t.length;)t[i]===this.separator?i+1<t.length&&t[i+1]===this.separator?(n.trim()&&(e.push(this._parseSegment(n.trim())),n=""),e.push({type:"deep-wildcard"}),i+=2):(n.trim()&&e.push(this._parseSegment(n.trim())),n="",i++):(n+=t[i],i++);return n.trim()&&e.push(this._parseSegment(n.trim())),e}_parseSegment(t){const e={type:"tag"};let i=null,n=t;const s=t.match(/^([^\[]+)(\[[^\]]*\])(.*)$/);if(s&&(n=s[1]+s[3],s[2])){const t=s[2].slice(1,-1);t&&(i=t)}let r,o,a=n;if(n.includes("::")){const e=n.indexOf("::");if(r=n.substring(0,e).trim(),a=n.substring(e+2).trim(),!r)throw new Error(`Invalid namespace in pattern: ${t}`)}let h=null;if(a.includes(":")){const t=a.lastIndexOf(":"),e=a.substring(0,t).trim(),i=a.substring(t+1).trim();["first","last","odd","even"].includes(i)||/^nth\(\d+\)$/.test(i)?(o=e,h=i):o=a}else o=a;if(!o)throw new Error(`Invalid segment pattern: ${t}`);if(e.tag=o,r&&(e.namespace=r),i)if(i.includes("=")){const t=i.indexOf("=");e.attrName=i.substring(0,t).trim(),e.attrValue=i.substring(t+1).trim()}else e.attrName=i.trim();if(h){const t=h.match(/^nth\((\d+)\)$/);t?(e.position="nth",e.positionValue=parseInt(t[1],10)):e.position=h}return e}get length(){return this.segments.length}hasDeepWildcard(){return this._hasDeepWildcard}hasAttributeCondition(){return this._hasAttributeCondition}hasPositionSelector(){return this._hasPositionSelector}toString(){return this.pattern}}function U(t,e){if(!t)return{};const i=e.attributesGroupName?t[e.attributesGroupName]:t;if(!i)return{};const n={};for(const t in i)t.startsWith(e.attributeNamePrefix)?n[t.substring(e.attributeNamePrefix.length)]=i[t]:n[t]=i[t];return n}function B(t){if(!t||"string"!=typeof t)return;const e=t.indexOf(":");if(-1!==e&&e>0){const i=t.substring(0,e);if("xmlns"!==i)return i}}class W{constructor(t){var e;if(this.options=t,this.currentNode=null,this.tagsNodeStack=[],this.docTypeEntities={},this.lastEntities={apos:{regex:/&(apos|#39|#x27);/g,val:"'"},gt:{regex:/&(gt|#62|#x3E);/g,val:">"},lt:{regex:/&(lt|#60|#x3C);/g,val:"<"},quot:{regex:/&(quot|#34|#x22);/g,val:'"'}},this.ampEntity={regex:/&(amp|#38|#x26);/g,val:"&"},this.htmlEntities={space:{regex:/&(nbsp|#160);/g,val:" "},cent:{regex:/&(cent|#162);/g,val:"¢"},pound:{regex:/&(pound|#163);/g,val:"£"},yen:{regex:/&(yen|#165);/g,val:"¥"},euro:{regex:/&(euro|#8364);/g,val:"€"},copyright:{regex:/&(copy|#169);/g,val:"©"},reg:{regex:/&(reg|#174);/g,val:"®"},inr:{regex:/&(inr|#8377);/g,val:"₹"},num_dec:{regex:/&#([0-9]{1,7});/g,val:(t,e)=>rt(e,10,"&#")},num_hex:{regex:/&#x([0-9a-fA-F]{1,6});/g,val:(t,e)=>rt(e,16,"&#x")}},this.addExternalEntities=Y,this.parseXml=J,this.parseTextData=z,this.resolveNameSpace=X,this.buildAttributesMap=Z,this.isItStopNode=tt,this.replaceEntitiesValue=Q,this.readStopNodeData=nt,this.saveTextToParentTag=H,this.addChild=K,this.ignoreAttributesFn="function"==typeof(e=this.options.ignoreAttributes)?e:Array.isArray(e)?t=>{for(const i of e){if("string"==typeof i&&t===i)return!0;if(i instanceof RegExp&&i.test(t))return!0}}:()=>!1,this.entityExpansionCount=0,this.currentExpandedLength=0,this.matcher=new G,this.readonlyMatcher=this.matcher.readOnly(),this.isCurrentNodeStopNode=!1,this.options.stopNodes&&this.options.stopNodes.length>0){this.stopNodeExpressions=[];for(let t=0;t<this.options.stopNodes.length;t++){const e=this.options.stopNodes[t];"string"==typeof e?this.stopNodeExpressions.push(new R(e)):e instanceof R&&this.stopNodeExpressions.push(e)}}}}function Y(t){const e=Object.keys(t);for(let i=0;i<e.length;i++){const n=e[i],s=n.replace(/[.\-+*:]/g,"\\.");this.lastEntities[n]={regex:new RegExp("&"+s+";","g"),val:t[n]}}}function z(t,e,i,n,s,r,o){if(void 0!==t&&(this.options.trimValues&&!n&&(t=t.trim()),t.length>0)){o||(t=this.replaceEntitiesValue(t,e,i));const n=this.options.jPath?i.toString():i,a=this.options.tagValueProcessor(e,t,n,s,r);return null==a?t:typeof a!=typeof t||a!==t?a:this.options.trimValues||t.trim()===t?st(t,this.options.parseTagValue,this.options.numberParseOptions):t}}function X(t){if(this.options.removeNSPrefix){const e=t.split(":"),i="/"===t.charAt(0)?"/":"";if("xmlns"===e[0])return"";2===e.length&&(t=i+e[1])}return t}const q=new RegExp("([^\\s=]+)\\s*(=\\s*(['\"])([\\s\\S]*?)\\3)?","gm");function Z(t,e,i){if(!0!==this.options.ignoreAttributes&&"string"==typeof t){const n=s(t,q),r=n.length,o={},a={};for(let t=0;t<r;t++){const e=this.resolveNameSpace(n[t][1]),s=n[t][4];if(e.length&&void 0!==s){let t=s;this.options.trimValues&&(t=t.trim()),t=this.replaceEntitiesValue(t,i,this.readonlyMatcher),a[e]=t}}Object.keys(a).length>0&&"object"==typeof e&&e.updateCurrent&&e.updateCurrent(a);for(let t=0;t<r;t++){const s=this.resolveNameSpace(n[t][1]),r=this.options.jPath?e.toString():this.readonlyMatcher;if(this.ignoreAttributesFn(s,r))continue;let a=n[t][4],h=this.options.attributeNamePrefix+s;if(s.length)if(this.options.transformAttributeName&&(h=this.options.transformAttributeName(h)),h=at(h,this.options),void 0!==a){this.options.trimValues&&(a=a.trim()),a=this.replaceEntitiesValue(a,i,this.readonlyMatcher);const t=this.options.jPath?e.toString():this.readonlyMatcher,n=this.options.attributeValueProcessor(s,a,t);o[h]=null==n?a:typeof n!=typeof a||n!==a?n:st(a,this.options.parseAttributeValue,this.options.numberParseOptions)}else this.options.allowBooleanAttributes&&(o[h]=!0)}if(!Object.keys(o).length)return;if(this.options.attributesGroupName){const t={};return t[this.options.attributesGroupName]=o,t}return o}}const J=function(t){t=t.replace(/\r\n?/g,"\n");const e=new $("!xml");let i=e,n="";this.matcher.reset(),this.entityExpansionCount=0,this.currentExpandedLength=0;const s=new I(this.options.processEntities);for(let r=0;r<t.length;r++)if("<"===t[r])if("/"===t[r+1]){const e=et(t,">",r,"Closing Tag is not closed.");let s=t.substring(r+2,e).trim();if(this.options.removeNSPrefix){const t=s.indexOf(":");-1!==t&&(s=s.substr(t+1))}s=ot(this.options.transformTagName,s,"",this.options).tagName,i&&(n=this.saveTextToParentTag(n,i,this.readonlyMatcher));const o=this.matcher.getCurrentTag();if(s&&-1!==this.options.unpairedTags.indexOf(s))throw new Error(`Unpaired tag can not be used as closing tag: </${s}>`);o&&-1!==this.options.unpairedTags.indexOf(o)&&(this.matcher.pop(),this.tagsNodeStack.pop()),this.matcher.pop(),this.isCurrentNodeStopNode=!1,i=this.tagsNodeStack.pop(),n="",r=e}else if("?"===t[r+1]){let e=it(t,r,!1,"?>");if(!e)throw new Error("Pi Tag is not closed.");if(n=this.saveTextToParentTag(n,i,this.readonlyMatcher),this.options.ignoreDeclaration&&"?xml"===e.tagName||this.options.ignorePiTags);else{const t=new $(e.tagName);t.add(this.options.textNodeName,""),e.tagName!==e.tagExp&&e.attrExpPresent&&(t[":@"]=this.buildAttributesMap(e.tagExp,this.matcher,e.tagName)),this.addChild(i,t,this.readonlyMatcher,r)}r=e.closeIndex+1}else if("!--"===t.substr(r+1,3)){const e=et(t,"--\x3e",r+4,"Comment is not closed.");if(this.options.commentPropName){const s=t.substring(r+4,e-2);n=this.saveTextToParentTag(n,i,this.readonlyMatcher),i.add(this.options.commentPropName,[{[this.options.textNodeName]:s}])}r=e}else if("!D"===t.substr(r+1,2)){const e=s.readDocType(t,r);this.docTypeEntities=e.entities,r=e.i}else if("!["===t.substr(r+1,2)){const e=et(t,"]]>",r,"CDATA is not closed.")-2,s=t.substring(r+9,e);n=this.saveTextToParentTag(n,i,this.readonlyMatcher);let o=this.parseTextData(s,i.tagname,this.readonlyMatcher,!0,!1,!0,!0);null==o&&(o=""),this.options.cdataPropName?i.add(this.options.cdataPropName,[{[this.options.textNodeName]:s}]):i.add(this.options.textNodeName,o),r=e+2}else{let s=it(t,r,this.options.removeNSPrefix);if(!s){const e=t.substring(Math.max(0,r-50),Math.min(t.length,r+50));throw new Error(`readTagExp returned undefined at position ${r}. Context: "${e}"`)}let o=s.tagName;const a=s.rawTagName;let h=s.tagExp,l=s.attrExpPresent,p=s.closeIndex;if(({tagName:o,tagExp:h}=ot(this.options.transformTagName,o,h,this.options)),this.options.strictReservedNames&&(o===this.options.commentPropName||o===this.options.cdataPropName||o===this.options.textNodeName||o===this.options.attributesGroupName))throw new Error(`Invalid tag name: ${o}`);i&&n&&"!xml"!==i.tagname&&(n=this.saveTextToParentTag(n,i,this.readonlyMatcher,!1));const u=i;u&&-1!==this.options.unpairedTags.indexOf(u.tagname)&&(i=this.tagsNodeStack.pop(),this.matcher.pop());let c=!1;h.length>0&&h.lastIndexOf("/")===h.length-1&&(c=!0,"/"===o[o.length-1]?(o=o.substr(0,o.length-1),h=o):h=h.substr(0,h.length-1),l=o!==h);let d,f=null,g={};d=B(a),o!==e.tagname&&this.matcher.push(o,{},d),o!==h&&l&&(f=this.buildAttributesMap(h,this.matcher,o),f&&(g=U(f,this.options))),o!==e.tagname&&(this.isCurrentNodeStopNode=this.isItStopNode(this.stopNodeExpressions,this.matcher));const m=r;if(this.isCurrentNodeStopNode){let e="";if(c)r=s.closeIndex;else if(-1!==this.options.unpairedTags.indexOf(o))r=s.closeIndex;else{const i=this.readStopNodeData(t,a,p+1);if(!i)throw new Error(`Unexpected end of ${a}`);r=i.i,e=i.tagContent}const n=new $(o);f&&(n[":@"]=f),n.add(this.options.textNodeName,e),this.matcher.pop(),this.isCurrentNodeStopNode=!1,this.addChild(i,n,this.readonlyMatcher,m)}else{if(c){({tagName:o,tagExp:h}=ot(this.options.transformTagName,o,h,this.options));const t=new $(o);f&&(t[":@"]=f),this.addChild(i,t,this.readonlyMatcher,m),this.matcher.pop(),this.isCurrentNodeStopNode=!1}else{if(-1!==this.options.unpairedTags.indexOf(o)){const t=new $(o);f&&(t[":@"]=f),this.addChild(i,t,this.readonlyMatcher,m),this.matcher.pop(),this.isCurrentNodeStopNode=!1,r=s.closeIndex;continue}{const t=new $(o);if(this.tagsNodeStack.length>this.options.maxNestedTags)throw new Error("Maximum nested tags exceeded");this.tagsNodeStack.push(i),f&&(t[":@"]=f),this.addChild(i,t,this.readonlyMatcher,m),i=t}}n="",r=p}}else n+=t[r];return e.child};function K(t,e,i,n){this.options.captureMetaData||(n=void 0);const s=this.options.jPath?i.toString():i,r=this.options.updateTag(e.tagname,s,e[":@"]);!1===r||("string"==typeof r?(e.tagname=r,t.addChild(e,n)):t.addChild(e,n))}function Q(t,e,i){const n=this.options.processEntities;if(!n||!n.enabled)return t;if(n.allowedTags){const s=this.options.jPath?i.toString():i;if(!(Array.isArray(n.allowedTags)?n.allowedTags.includes(e):n.allowedTags(e,s)))return t}if(n.tagFilter){const s=this.options.jPath?i.toString():i;if(!n.tagFilter(e,s))return t}for(const e of Object.keys(this.docTypeEntities)){const i=this.docTypeEntities[e],s=t.match(i.regx);if(s){if(this.entityExpansionCount+=s.length,n.maxTotalExpansions&&this.entityExpansionCount>n.maxTotalExpansions)throw new Error(`Entity expansion limit exceeded: ${this.entityExpansionCount} > ${n.maxTotalExpansions}`);const e=t.length;if(t=t.replace(i.regx,i.val),n.maxExpandedLength&&(this.currentExpandedLength+=t.length-e,this.currentExpandedLength>n.maxExpandedLength))throw new Error(`Total expanded content size exceeded: ${this.currentExpandedLength} > ${n.maxExpandedLength}`)}}for(const e of Object.keys(this.lastEntities)){const i=this.lastEntities[e],s=t.match(i.regex);if(s&&(this.entityExpansionCount+=s.length,n.maxTotalExpansions&&this.entityExpansionCount>n.maxTotalExpansions))throw new Error(`Entity expansion limit exceeded: ${this.entityExpansionCount} > ${n.maxTotalExpansions}`);t=t.replace(i.regex,i.val)}if(-1===t.indexOf("&"))return t;if(this.options.htmlEntities)for(const e of Object.keys(this.htmlEntities)){const i=this.htmlEntities[e],s=t.match(i.regex);if(s&&(this.entityExpansionCount+=s.length,n.maxTotalExpansions&&this.entityExpansionCount>n.maxTotalExpansions))throw new Error(`Entity expansion limit exceeded: ${this.entityExpansionCount} > ${n.maxTotalExpansions}`);t=t.replace(i.regex,i.val)}return t.replace(this.ampEntity.regex,this.ampEntity.val)}function H(t,e,i,n){return t&&(void 0===n&&(n=0===e.child.length),void 0!==(t=this.parseTextData(t,e.tagname,i,!1,!!e[":@"]&&0!==Object.keys(e[":@"]).length,n))&&""!==t&&e.add(this.options.textNodeName,t),t=""),t}function tt(t,e){if(!t||0===t.length)return!1;for(let i=0;i<t.length;i++)if(e.matches(t[i]))return!0;return!1}function et(t,e,i,n){const s=t.indexOf(e,i);if(-1===s)throw new Error(n);return s+e.length-1}function it(t,e,i,n=">"){const s=function(t,e,i=">"){let n,s="";for(let r=e;r<t.length;r++){let e=t[r];if(n)e===n&&(n="");else if('"'===e||"'"===e)n=e;else if(e===i[0]){if(!i[1])return{data:s,index:r};if(t[r+1]===i[1])return{data:s,index:r}}else"\t"===e&&(e=" ");s+=e}}(t,e+1,n);if(!s)return;let r=s.data;const o=s.index,a=r.search(/\s/);let h=r,l=!0;-1!==a&&(h=r.substring(0,a),r=r.substring(a+1).trimStart());const p=h;if(i){const t=h.indexOf(":");-1!==t&&(h=h.substr(t+1),l=h!==s.data.substr(t+1))}return{tagName:h,tagExp:r,closeIndex:o,attrExpPresent:l,rawTagName:p}}function nt(t,e,i){const n=i;let s=1;for(;i<t.length;i++)if("<"===t[i])if("/"===t[i+1]){const r=et(t,">",i,`${e} is not closed`);if(t.substring(i+2,r).trim()===e&&(s--,0===s))return{tagContent:t.substring(n,i),i:r};i=r}else if("?"===t[i+1])i=et(t,"?>",i+1,"StopNode is not closed.");else if("!--"===t.substr(i+1,3))i=et(t,"--\x3e",i+3,"StopNode is not closed.");else if("!["===t.substr(i+1,2))i=et(t,"]]>",i,"StopNode is not closed.")-2;else{const n=it(t,i,">");n&&((n&&n.tagName)===e&&"/"!==n.tagExp[n.tagExp.length-1]&&s++,i=n.closeIndex)}}function st(t,e,i){if(e&&"string"==typeof t){const e=t.trim();return"true"===e||"false"!==e&&function(t,e={}){if(e=Object.assign({},k,e),!t||"string"!=typeof t)return t;let i=t.trim();if(void 0!==e.skipLike&&e.skipLike.test(i))return t;if("0"===t)return 0;if(e.hex&&D.test(i))return function(t){if(parseInt)return parseInt(t,16);if(Number.parseInt)return Number.parseInt(t,16);if(window&&window.parseInt)return window.parseInt(t,16);throw new Error("parseInt, Number.parseInt, window.parseInt are not supported")}(i);if(isFinite(i)){if(i.includes("e")||i.includes("E"))return function(t,e,i){if(!i.eNotation)return t;const n=e.match(F);if(n){let s=n[1]||"";const r=-1===n[3].indexOf("e")?"E":"e",o=n[2],a=s?t[o.length+1]===r:t[o.length]===r;return o.length>1&&a?t:(1!==o.length||!n[3].startsWith(`.${r}`)&&n[3][0]!==r)&&o.length>0?i.leadingZeros&&!a?(e=(n[1]||"")+n[3],Number(e)):t:Number(e)}return t}(t,i,e);{const s=V.exec(i);if(s){const r=s[1]||"",o=s[2];let a=(n=s[3])&&-1!==n.indexOf(".")?("."===(n=n.replace(/0+$/,""))?n="0":"."===n[0]?n="0"+n:"."===n[n.length-1]&&(n=n.substring(0,n.length-1)),n):n;const h=r?"."===t[o.length+1]:"."===t[o.length];if(!e.leadingZeros&&(o.length>1||1===o.length&&!h))return t;{const n=Number(i),s=String(n);if(0===n)return n;if(-1!==s.search(/[eE]/))return e.eNotation?n:t;if(-1!==i.indexOf("."))return"0"===s||s===a||s===`${r}${a}`?n:t;let h=o?a:i;return o?h===s||r+h===s?n:t:h===s||h===r+s?n:t}}return t}}var n;return function(t,e,i){const n=e===1/0;switch(i.infinity.toLowerCase()){case"null":return null;case"infinity":return e;case"string":return n?"Infinity":"-Infinity";default:return t}}(t,Number(i),e)}(t,i)}return void 0!==t?t:""}function rt(t,e,i){const n=Number.parseInt(t,e);return n>=0&&n<=1114111?String.fromCodePoint(n):i+t+";"}function ot(t,e,i,n){if(t){const n=t(e);i===e&&(i=n),e=n}return{tagName:e=at(e,n),tagExp:i}}function at(t,e){if(a.includes(t))throw new Error(`[SECURITY] Invalid name: "${t}" is a reserved JavaScript keyword that could cause prototype pollution`);return o.includes(t)?e.onDangerousProperty(t):t}const ht=$.getMetaDataSymbol();function lt(t,e){if(!t||"object"!=typeof t)return{};if(!e)return t;const i={};for(const n in t)n.startsWith(e)?i[n.substring(e.length)]=t[n]:i[n]=t[n];return i}function pt(t,e,i,n){return ut(t,e,i,n)}function ut(t,e,i,n){let s;const r={};for(let o=0;o<t.length;o++){const a=t[o],h=ct(a);if(void 0!==h&&h!==e.textNodeName){const t=lt(a[":@"]||{},e.attributeNamePrefix);i.push(h,t)}if(h===e.textNodeName)void 0===s?s=a[h]:s+=""+a[h];else{if(void 0===h)continue;if(a[h]){let t=ut(a[h],e,i,n);const s=ft(t,e);if(a[":@"]?dt(t,a[":@"],n,e):1!==Object.keys(t).length||void 0===t[e.textNodeName]||e.alwaysCreateTextNode?0===Object.keys(t).length&&(e.alwaysCreateTextNode?t[e.textNodeName]="":t=""):t=t[e.textNodeName],void 0!==a[ht]&&"object"==typeof t&&null!==t&&(t[ht]=a[ht]),void 0!==r[h]&&Object.prototype.hasOwnProperty.call(r,h))Array.isArray(r[h])||(r[h]=[r[h]]),r[h].push(t);else{const i=e.jPath?n.toString():n;e.isArray(h,i,s)?r[h]=[t]:r[h]=t}void 0!==h&&h!==e.textNodeName&&i.pop()}}}return"string"==typeof s?s.length>0&&(r[e.textNodeName]=s):void 0!==s&&(r[e.textNodeName]=s),r}function ct(t){const e=Object.keys(t);for(let t=0;t<e.length;t++){const i=e[t];if(":@"!==i)return i}}function dt(t,e,i,n){if(e){const s=Object.keys(e),r=s.length;for(let o=0;o<r;o++){const r=s[o],a=r.startsWith(n.attributeNamePrefix)?r.substring(n.attributeNamePrefix.length):r,h=n.jPath?i.toString()+"."+a:i;n.isArray(r,h,!0,!0)?t[r]=[e[r]]:t[r]=e[r]}}}function ft(t,e){const{textNodeName:i}=e,n=Object.keys(t).length;return 0===n||!(1!==n||!t[i]&&"boolean"!=typeof t[i]&&0!==t[i])}class gt{constructor(t){this.externalEntities={},this.options=O(t)}parse(t,e){if("string"!=typeof t&&t.toString)t=t.toString();else if("string"!=typeof t)throw new Error("XML data is accepted in String or Bytes[] form.");if(e){!0===e&&(e={});const i=l(t,e);if(!0!==i)throw Error(`${i.err.msg}:${i.err.line}:${i.err.col}`)}const i=new W(this.options);i.addExternalEntities(this.externalEntities);const n=i.parseXml(t);return this.options.preserveOrder||void 0===n?n:pt(n,this.options,i.matcher,i.readonlyMatcher)}addEntity(t,e){if(-1!==e.indexOf("&"))throw new Error("Entity value can't have '&'");if(-1!==t.indexOf("&")||-1!==t.indexOf(";"))throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");if("&"===e)throw new Error("An entity with value '&' is not permitted");this.externalEntities[t]=e}static getMetaDataSymbol(){return $.getMetaDataSymbol()}}function mt(t,e){let i="";e.format&&e.indentBy.length>0&&(i="\n");const n=[];if(e.stopNodes&&Array.isArray(e.stopNodes))for(let t=0;t<e.stopNodes.length;t++){const i=e.stopNodes[t];"string"==typeof i?n.push(new R(i)):i instanceof R&&n.push(i)}return xt(t,e,i,new G,n)}function xt(t,e,i,n,s){let r="",o=!1;if(e.maxNestedTags&&n.getDepth()>e.maxNestedTags)throw new Error("Maximum nested tags exceeded");if(!Array.isArray(t)){if(null!=t){let i=t.toString();return i=Tt(i,e),i}return""}for(let a=0;a<t.length;a++){const h=t[a],l=yt(h);if(void 0===l)continue;const p=Nt(h[":@"],e);n.push(l,p);const u=vt(n,s);if(l===e.textNodeName){let t=h[l];u||(t=e.tagValueProcessor(l,t),t=Tt(t,e)),o&&(r+=i),r+=t,o=!1,n.pop();continue}if(l===e.cdataPropName){o&&(r+=i),r+=`<![CDATA[${h[l][0][e.textNodeName]}]]>`,o=!1,n.pop();continue}if(l===e.commentPropName){r+=i+`\x3c!--${h[l][0][e.textNodeName]}--\x3e`,o=!0,n.pop();continue}if("?"===l[0]){const t=wt(h[":@"],e,u),s="?xml"===l?"":i;let a=h[l][0][e.textNodeName];a=0!==a.length?" "+a:"",r+=s+`<${l}${a}${t}?>`,o=!0,n.pop();continue}let c=i;""!==c&&(c+=e.indentBy);const d=i+`<${l}${wt(h[":@"],e,u)}`;let f;f=u?bt(h[l],e):xt(h[l],e,c,n,s),-1!==e.unpairedTags.indexOf(l)?e.suppressUnpairedNode?r+=d+">":r+=d+"/>":f&&0!==f.length||!e.suppressEmptyNode?f&&f.endsWith(">")?r+=d+`>${f}${i}</${l}>`:(r+=d+">",f&&""!==i&&(f.includes("/>")||f.includes("</"))?r+=i+e.indentBy+f+i:r+=f,r+=`</${l}>`):r+=d+"/>",o=!0,n.pop()}return r}function Nt(t,e){if(!t||e.ignoreAttributes)return null;const i={};let n=!1;for(let s in t)Object.prototype.hasOwnProperty.call(t,s)&&(i[s.startsWith(e.attributeNamePrefix)?s.substr(e.attributeNamePrefix.length):s]=t[s],n=!0);return n?i:null}function bt(t,e){if(!Array.isArray(t))return null!=t?t.toString():"";let i="";for(let n=0;n<t.length;n++){const s=t[n],r=yt(s);if(r===e.textNodeName)i+=s[r];else if(r===e.cdataPropName)i+=s[r][0][e.textNodeName];else if(r===e.commentPropName)i+=s[r][0][e.textNodeName];else{if(r&&"?"===r[0])continue;if(r){const t=Et(s[":@"],e),n=bt(s[r],e);n&&0!==n.length?i+=`<${r}${t}>${n}</${r}>`:i+=`<${r}${t}/>`}}}return i}function Et(t,e){let i="";if(t&&!e.ignoreAttributes)for(let n in t){if(!Object.prototype.hasOwnProperty.call(t,n))continue;let s=t[n];!0===s&&e.suppressBooleanAttributes?i+=` ${n.substr(e.attributeNamePrefix.length)}`:i+=` ${n.substr(e.attributeNamePrefix.length)}="${s}"`}return i}function yt(t){const e=Object.keys(t);for(let i=0;i<e.length;i++){const n=e[i];if(Object.prototype.hasOwnProperty.call(t,n)&&":@"!==n)return n}}function wt(t,e,i){let n="";if(t&&!e.ignoreAttributes)for(let s in t){if(!Object.prototype.hasOwnProperty.call(t,s))continue;let r;i?r=t[s]:(r=e.attributeValueProcessor(s,t[s]),r=Tt(r,e)),!0===r&&e.suppressBooleanAttributes?n+=` ${s.substr(e.attributeNamePrefix.length)}`:n+=` ${s.substr(e.attributeNamePrefix.length)}="${r}"`}return n}function vt(t,e){if(!e||0===e.length)return!1;for(let i=0;i<e.length;i++)if(t.matches(e[i]))return!0;return!1}function Tt(t,e){if(t&&t.length>0&&e.processEntities)for(let i=0;i<e.entities.length;i++){const n=e.entities[i];t=t.replace(n.regex,n.val)}return t}const Pt={attributeNamePrefix:"@_",attributesGroupName:!1,textNodeName:"#text",ignoreAttributes:!0,cdataPropName:!1,format:!1,indentBy:"  ",suppressEmptyNode:!1,suppressUnpairedNode:!0,suppressBooleanAttributes:!0,tagValueProcessor:function(t,e){return e},attributeValueProcessor:function(t,e){return e},preserveOrder:!1,commentPropName:!1,unpairedTags:[],entities:[{regex:new RegExp("&","g"),val:"&amp;"},{regex:new RegExp(">","g"),val:"&gt;"},{regex:new RegExp("<","g"),val:"&lt;"},{regex:new RegExp("'","g"),val:"&apos;"},{regex:new RegExp('"',"g"),val:"&quot;"}],processEntities:!0,stopNodes:[],oneListGroup:!1,maxNestedTags:100,jPath:!0};function St(t){if(this.options=Object.assign({},Pt,t),this.options.stopNodes&&Array.isArray(this.options.stopNodes)&&(this.options.stopNodes=this.options.stopNodes.map(t=>"string"==typeof t&&t.startsWith("*.")?".."+t.substring(2):t)),this.stopNodeExpressions=[],this.options.stopNodes&&Array.isArray(this.options.stopNodes))for(let t=0;t<this.options.stopNodes.length;t++){const e=this.options.stopNodes[t];"string"==typeof e?this.stopNodeExpressions.push(new R(e)):e instanceof R&&this.stopNodeExpressions.push(e)}var e;!0===this.options.ignoreAttributes||this.options.attributesGroupName?this.isAttribute=function(){return!1}:(this.ignoreAttributesFn="function"==typeof(e=this.options.ignoreAttributes)?e:Array.isArray(e)?t=>{for(const i of e){if("string"==typeof i&&t===i)return!0;if(i instanceof RegExp&&i.test(t))return!0}}:()=>!1,this.attrPrefixLen=this.options.attributeNamePrefix.length,this.isAttribute=Ct),this.processTextOrObjNode=At,this.options.format?(this.indentate=Ot,this.tagEndChar=">\n",this.newLine="\n"):(this.indentate=function(){return""},this.tagEndChar=">",this.newLine="")}function At(t,e,i,n){const s=this.extractAttributes(t);if(n.push(e,s),this.checkStopNode(n)){const s=this.buildRawContent(t),r=this.buildAttributesForStopNode(t);return n.pop(),this.buildObjectNode(s,e,r,i)}const r=this.j2x(t,i+1,n);return n.pop(),void 0!==t[this.options.textNodeName]&&1===Object.keys(t).length?this.buildTextValNode(t[this.options.textNodeName],e,r.attrStr,i,n):this.buildObjectNode(r.val,e,r.attrStr,i)}function Ot(t){return this.options.indentBy.repeat(t)}function Ct(t){return!(!t.startsWith(this.options.attributeNamePrefix)||t===this.options.textNodeName)&&t.substr(this.attrPrefixLen)}St.prototype.build=function(t){if(this.options.preserveOrder)return mt(t,this.options);{Array.isArray(t)&&this.options.arrayNodeName&&this.options.arrayNodeName.length>1&&(t={[this.options.arrayNodeName]:t});const e=new G;return this.j2x(t,0,e).val}},St.prototype.j2x=function(t,e,i){let n="",s="";if(this.options.maxNestedTags&&i.getDepth()>=this.options.maxNestedTags)throw new Error("Maximum nested tags exceeded");const r=this.options.jPath?i.toString():i,o=this.checkStopNode(i);for(let a in t)if(Object.prototype.hasOwnProperty.call(t,a))if(void 0===t[a])this.isAttribute(a)&&(s+="");else if(null===t[a])this.isAttribute(a)||a===this.options.cdataPropName?s+="":"?"===a[0]?s+=this.indentate(e)+"<"+a+"?"+this.tagEndChar:s+=this.indentate(e)+"<"+a+"/"+this.tagEndChar;else if(t[a]instanceof Date)s+=this.buildTextValNode(t[a],a,"",e,i);else if("object"!=typeof t[a]){const h=this.isAttribute(a);if(h&&!this.ignoreAttributesFn(h,r))n+=this.buildAttrPairStr(h,""+t[a],o);else if(!h)if(a===this.options.textNodeName){let e=this.options.tagValueProcessor(a,""+t[a]);s+=this.replaceEntitiesValue(e)}else{i.push(a);const n=this.checkStopNode(i);if(i.pop(),n){const i=""+t[a];s+=""===i?this.indentate(e)+"<"+a+this.closeTag(a)+this.tagEndChar:this.indentate(e)+"<"+a+">"+i+"</"+a+this.tagEndChar}else s+=this.buildTextValNode(t[a],a,"",e,i)}}else if(Array.isArray(t[a])){const n=t[a].length;let r="",o="";for(let h=0;h<n;h++){const n=t[a][h];if(void 0===n);else if(null===n)"?"===a[0]?s+=this.indentate(e)+"<"+a+"?"+this.tagEndChar:s+=this.indentate(e)+"<"+a+"/"+this.tagEndChar;else if("object"==typeof n)if(this.options.oneListGroup){i.push(a);const t=this.j2x(n,e+1,i);i.pop(),r+=t.val,this.options.attributesGroupName&&n.hasOwnProperty(this.options.attributesGroupName)&&(o+=t.attrStr)}else r+=this.processTextOrObjNode(n,a,e,i);else if(this.options.oneListGroup){let t=this.options.tagValueProcessor(a,n);t=this.replaceEntitiesValue(t),r+=t}else{i.push(a);const t=this.checkStopNode(i);if(i.pop(),t){const t=""+n;r+=""===t?this.indentate(e)+"<"+a+this.closeTag(a)+this.tagEndChar:this.indentate(e)+"<"+a+">"+t+"</"+a+this.tagEndChar}else r+=this.buildTextValNode(n,a,"",e,i)}}this.options.oneListGroup&&(r=this.buildObjectNode(r,a,o,e)),s+=r}else if(this.options.attributesGroupName&&a===this.options.attributesGroupName){const e=Object.keys(t[a]),i=e.length;for(let s=0;s<i;s++)n+=this.buildAttrPairStr(e[s],""+t[a][e[s]],o)}else s+=this.processTextOrObjNode(t[a],a,e,i);return{attrStr:n,val:s}},St.prototype.buildAttrPairStr=function(t,e,i){return i||(e=this.options.attributeValueProcessor(t,""+e),e=this.replaceEntitiesValue(e)),this.options.suppressBooleanAttributes&&"true"===e?" "+t:" "+t+'="'+e+'"'},St.prototype.extractAttributes=function(t){if(!t||"object"!=typeof t)return null;const e={};let i=!1;if(this.options.attributesGroupName&&t[this.options.attributesGroupName]){const n=t[this.options.attributesGroupName];for(let t in n)Object.prototype.hasOwnProperty.call(n,t)&&(e[t.startsWith(this.options.attributeNamePrefix)?t.substring(this.options.attributeNamePrefix.length):t]=n[t],i=!0)}else for(let n in t){if(!Object.prototype.hasOwnProperty.call(t,n))continue;const s=this.isAttribute(n);s&&(e[s]=t[n],i=!0)}return i?e:null},St.prototype.buildRawContent=function(t){if("string"==typeof t)return t;if("object"!=typeof t||null===t)return String(t);if(void 0!==t[this.options.textNodeName])return t[this.options.textNodeName];let e="";for(let i in t){if(!Object.prototype.hasOwnProperty.call(t,i))continue;if(this.isAttribute(i))continue;if(this.options.attributesGroupName&&i===this.options.attributesGroupName)continue;const n=t[i];if(i===this.options.textNodeName)e+=n;else if(Array.isArray(n)){for(let t of n)if("string"==typeof t||"number"==typeof t)e+=`<${i}>${t}</${i}>`;else if("object"==typeof t&&null!==t){const n=this.buildRawContent(t),s=this.buildAttributesForStopNode(t);e+=""===n?`<${i}${s}/>`:`<${i}${s}>${n}</${i}>`}}else if("object"==typeof n&&null!==n){const t=this.buildRawContent(n),s=this.buildAttributesForStopNode(n);e+=""===t?`<${i}${s}/>`:`<${i}${s}>${t}</${i}>`}else e+=`<${i}>${n}</${i}>`}return e},St.prototype.buildAttributesForStopNode=function(t){if(!t||"object"!=typeof t)return"";let e="";if(this.options.attributesGroupName&&t[this.options.attributesGroupName]){const i=t[this.options.attributesGroupName];for(let t in i){if(!Object.prototype.hasOwnProperty.call(i,t))continue;const n=t.startsWith(this.options.attributeNamePrefix)?t.substring(this.options.attributeNamePrefix.length):t,s=i[t];!0===s&&this.options.suppressBooleanAttributes?e+=" "+n:e+=" "+n+'="'+s+'"'}}else for(let i in t){if(!Object.prototype.hasOwnProperty.call(t,i))continue;const n=this.isAttribute(i);if(n){const s=t[i];!0===s&&this.options.suppressBooleanAttributes?e+=" "+n:e+=" "+n+'="'+s+'"'}}return e},St.prototype.buildObjectNode=function(t,e,i,n){if(""===t)return"?"===e[0]?this.indentate(n)+"<"+e+i+"?"+this.tagEndChar:this.indentate(n)+"<"+e+i+this.closeTag(e)+this.tagEndChar;{let s="</"+e+this.tagEndChar,r="";return"?"===e[0]&&(r="?",s=""),!i&&""!==i||-1!==t.indexOf("<")?!1!==this.options.commentPropName&&e===this.options.commentPropName&&0===r.length?this.indentate(n)+`\x3c!--${t}--\x3e`+this.newLine:this.indentate(n)+"<"+e+i+r+this.tagEndChar+t+this.indentate(n)+s:this.indentate(n)+"<"+e+i+r+">"+t+s}},St.prototype.closeTag=function(t){let e="";return-1!==this.options.unpairedTags.indexOf(t)?this.options.suppressUnpairedNode||(e="/"):e=this.options.suppressEmptyNode?"/":`></${t}`,e},St.prototype.checkStopNode=function(t){if(!this.stopNodeExpressions||0===this.stopNodeExpressions.length)return!1;for(let e=0;e<this.stopNodeExpressions.length;e++)if(t.matches(this.stopNodeExpressions[e]))return!0;return!1},St.prototype.buildTextValNode=function(t,e,i,n,s){if(!1!==this.options.cdataPropName&&e===this.options.cdataPropName)return this.indentate(n)+`<![CDATA[${t}]]>`+this.newLine;if(!1!==this.options.commentPropName&&e===this.options.commentPropName)return this.indentate(n)+`\x3c!--${t}--\x3e`+this.newLine;if("?"===e[0])return this.indentate(n)+"<"+e+i+"?"+this.tagEndChar;{let s=this.options.tagValueProcessor(e,t);return s=this.replaceEntitiesValue(s),""===s?this.indentate(n)+"<"+e+i+this.closeTag(e)+this.tagEndChar:this.indentate(n)+"<"+e+i+">"+s+"</"+e+this.tagEndChar}},St.prototype.replaceEntitiesValue=function(t){if(t&&t.length>0&&this.options.processEntities)for(let e=0;e<this.options.entities.length;e++){const i=this.options.entities[e];t=t.replace(i.regex,i.val)}return t};const $t=St,It={validate:l};module.exports=e})();

/***/ }),

/***/ 87859:
/***/ ((module) => {

"use strict";
module.exports = /*#__PURE__*/JSON.parse('{"name":"@aws-sdk/client-dynamodb","description":"AWS SDK for JavaScript Dynamodb Client for Node.js, Browser and React Native","version":"3.1029.0","scripts":{"build":"concurrently \'yarn:build:types\' \'yarn:build:es\' && yarn build:cjs","build:cjs":"node ../../scripts/compilation/inline client-dynamodb","build:es":"tsc -p tsconfig.es.json","build:include:deps":"yarn g:turbo run build -F=\\"$npm_package_name\\"","build:types":"tsc -p tsconfig.types.json","build:types:downlevel":"downlevel-dts dist-types dist-types/ts3.4","clean":"premove dist-cjs dist-es dist-types tsconfig.cjs.tsbuildinfo tsconfig.es.tsbuildinfo tsconfig.types.tsbuildinfo","extract:docs":"api-extractor run --local","generate:client":"node ../../scripts/generate-clients/single-service --solo dynamodb","test":"yarn g:vitest run --passWithNoTests","test:e2e":"yarn g:vitest run -c vitest.config.e2e.mts","test:e2e:watch":"yarn g:vitest watch -c vitest.config.e2e.mts","test:index":"tsc --noEmit ./test/index-types.ts && node ./test/index-objects.spec.mjs","test:integration":"yarn g:vitest run --passWithNoTests -c vitest.config.integ.mts","test:integration:watch":"yarn g:vitest run --passWithNoTests -c vitest.config.integ.mts","test:watch":"yarn g:vitest watch --passWithNoTests"},"main":"./dist-cjs/index.js","types":"./dist-types/index.d.ts","module":"./dist-es/index.js","sideEffects":false,"dependencies":{"@aws-crypto/sha256-browser":"5.2.0","@aws-crypto/sha256-js":"5.2.0","@aws-sdk/core":"^3.973.27","@aws-sdk/credential-provider-node":"^3.972.30","@aws-sdk/dynamodb-codec":"^3.972.28","@aws-sdk/middleware-endpoint-discovery":"^3.972.10","@aws-sdk/middleware-host-header":"^3.972.9","@aws-sdk/middleware-logger":"^3.972.9","@aws-sdk/middleware-recursion-detection":"^3.972.10","@aws-sdk/middleware-user-agent":"^3.972.29","@aws-sdk/region-config-resolver":"^3.972.11","@aws-sdk/types":"^3.973.7","@aws-sdk/util-endpoints":"^3.996.6","@aws-sdk/util-user-agent-browser":"^3.972.9","@aws-sdk/util-user-agent-node":"^3.973.15","@smithy/config-resolver":"^4.4.14","@smithy/core":"^3.23.14","@smithy/fetch-http-handler":"^5.3.16","@smithy/hash-node":"^4.2.13","@smithy/invalid-dependency":"^4.2.13","@smithy/middleware-content-length":"^4.2.13","@smithy/middleware-endpoint":"^4.4.29","@smithy/middleware-retry":"^4.5.0","@smithy/middleware-serde":"^4.2.17","@smithy/middleware-stack":"^4.2.13","@smithy/node-config-provider":"^4.3.13","@smithy/node-http-handler":"^4.5.2","@smithy/protocol-http":"^5.3.13","@smithy/smithy-client":"^4.12.9","@smithy/types":"^4.14.0","@smithy/url-parser":"^4.2.13","@smithy/util-base64":"^4.3.2","@smithy/util-body-length-browser":"^4.2.2","@smithy/util-body-length-node":"^4.2.3","@smithy/util-defaults-mode-browser":"^4.3.45","@smithy/util-defaults-mode-node":"^4.2.49","@smithy/util-endpoints":"^3.3.4","@smithy/util-middleware":"^4.2.13","@smithy/util-retry":"^4.3.0","@smithy/util-utf8":"^4.2.2","@smithy/util-waiter":"^4.2.15","tslib":"^2.6.2"},"devDependencies":{"@smithy/snapshot-testing":"^2.0.5","@tsconfig/node20":"20.1.8","@types/node":"^20.14.8","concurrently":"7.0.0","downlevel-dts":"0.10.1","premove":"4.0.0","typescript":"~5.8.3","vitest":"^4.0.17"},"engines":{"node":">=20.0.0"},"typesVersions":{"<4.5":{"dist-types/*":["dist-types/ts3.4/*"]}},"files":["dist-*/**"],"author":{"name":"AWS SDK for JavaScript Team","url":"https://aws.amazon.com/javascript/"},"license":"Apache-2.0","browser":{"./dist-es/runtimeConfig":"./dist-es/runtimeConfig.browser"},"react-native":{"./dist-es/runtimeConfig":"./dist-es/runtimeConfig.native"},"homepage":"https://github.com/aws/aws-sdk-js-v3/tree/main/clients/client-dynamodb","repository":{"type":"git","url":"https://github.com/aws/aws-sdk-js-v3.git","directory":"clients/client-dynamodb"}}');

/***/ })

};
;
//# sourceMappingURL=305.index.js.map