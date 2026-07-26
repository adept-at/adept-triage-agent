export type JsonSchemaObject = {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
    [key: string]: unknown;
};
export type StrictJsonSchemaFormat = {
    type: 'json_schema';
    name: string;
    strict: true;
    schema: JsonSchemaObject;
};
export declare const CLASSIFICATION_SCHEMA: StrictJsonSchemaFormat;
export declare const ANALYSIS_SCHEMA: StrictJsonSchemaFormat;
export declare const INVESTIGATION_SCHEMA: StrictJsonSchemaFormat;
export declare const FIX_GENERATION_SCHEMA: StrictJsonSchemaFormat;
export declare const REVIEW_SCHEMA: StrictJsonSchemaFormat;
//# sourceMappingURL=json-schemas.d.ts.map