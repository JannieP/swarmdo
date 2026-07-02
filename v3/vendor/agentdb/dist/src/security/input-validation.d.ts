/**
 * Input Validation and Sanitization for AgentDB Security
 *
 * Provides comprehensive validation to prevent SQL injection and other attacks:
 * - Whitelist-based validation for identifiers (tables, columns, PRAGMA commands)
 * - Input sanitization for user data
 * - Type validation and constraints
 * - Error handling that doesn't leak sensitive information
 */
/**
 * Validation error with safe error messages
 */
export declare class ValidationError extends Error {
    readonly code: string;
    readonly field?: string;
    constructor(message: string, code?: string, field?: string);
    /**
     * Get safe error message (doesn't leak sensitive info)
     */
    getSafeMessage(): string;
}
/**
 * Strictly parse JSON user input. Wraps `JSON.parse` so a crafted / malformed
 * input becomes a `ValidationError` with a safe message instead of an
 * unhandled `SyntaxError` (which would leak a stack trace and DoS the caller).
 *
 * Use this at every CLI/MCP boundary where the input is a user-supplied JSON
 * string. The pre-existing `safeJsonParse` helper in ReasoningBank.ts
 * silently falls back on bad input — appropriate for parsing rows we wrote
 * ourselves, but NOT for user input where we want to reject loudly.
 *
 * See ADR-073 §C.1.
 */
export declare function parseJsonStrict<T = unknown>(json: string, fieldName: string): T;
/**
 * Validate task string (NEW - for MCP tool optimization)
 */
export declare function validateTaskString(task: unknown, fieldName?: string): string;
/**
 * Validate numeric range (NEW - for MCP tool optimization)
 */
export declare function validateNumericRange(value: unknown, fieldName: string, min: number, max: number): number;
/**
 * Validate array length (NEW - for MCP tool optimization)
 */
export declare function validateArrayLength<T>(arr: unknown, fieldName: string, minLength: number, maxLength: number): T[];
/**
 * Validate object (NEW - for MCP tool optimization)
 */
export declare function validateObject(obj: unknown, fieldName: string, required?: boolean): Record<string, any>;
/**
 * Validate boolean (NEW - for MCP tool optimization)
 */
export declare function validateBoolean(value: unknown, fieldName: string, defaultValue?: boolean): boolean;
/**
 * Validate enum value (NEW - for MCP tool optimization)
 */
export declare function validateEnum<T extends string>(value: unknown, fieldName: string, allowedValues: readonly T[]): T;
/**
 * Validate a bare SQL identifier (table/index name) using a strict allowlist pattern.
 *
 * Use this when the identifier comes from sqlite_master or another internal source
 * that cannot be parameterized (e.g. REINDEX <name>). The regex rejects anything
 * that is not a plain alphanumeric-plus-underscore name, preventing SQL injection
 * via a poisoned .rvf file or malicious DB image.
 */
export declare function validateSqlIdentifier(name: string): string;
/**
 * Validate table name against whitelist
 */
export declare function validateTableName(tableName: string): string;
/**
 * Validate column name against whitelist
 */
export declare function validateColumnName(tableName: string, columnName: string): string;
/**
 * Validate PRAGMA command against whitelist
 */
export declare function validatePragmaCommand(pragma: string): string;
/**
 * Validate and sanitize session ID
 */
export declare function validateSessionId(sessionId: string): string;
/**
 * Validate numeric ID
 */
export declare function validateId(id: any, fieldName?: string): number;
/**
 * Validate timestamp
 */
export declare function validateTimestamp(timestamp: any, fieldName?: string): number;
/**
 * Validate reward value (0-1)
 */
export declare function validateReward(reward: any): number;
/**
 * Validate success flag
 */
export declare function validateSuccess(success: any): boolean;
/**
 * Sanitize text input (prevent extremely long strings, null bytes, etc.)
 */
export declare function sanitizeText(text: string, maxLength?: number, fieldName?: string): string;
/**
 * Build safe WHERE clause with parameterized values
 * Returns both the SQL clause and the parameter values
 */
export declare function buildSafeWhereClause(tableName: string, conditions: Record<string, any>): {
    clause: string;
    values: any[];
};
/**
 * Build safe SET clause for UPDATE statements
 */
export declare function buildSafeSetClause(tableName: string, updates: Record<string, any>): {
    clause: string;
    values: any[];
};
/**
 * Validate JSON data
 */
export declare function validateJSON(data: any, fieldName?: string): string;
/**
 * Validate array of tags
 */
export declare function validateTags(tags: any): string[];
/**
 * Safe error handler that doesn't leak sensitive information
 */
export declare function handleSecurityError(error: any): string;
//# sourceMappingURL=input-validation.d.ts.map