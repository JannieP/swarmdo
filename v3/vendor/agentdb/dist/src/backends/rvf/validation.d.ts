/**
 * Shared validation utilities for RVF backends (native + sql.js fallback)
 *
 * Extracted from RvfBackend.ts to avoid duplication between
 * RvfBackend (native @swarmvector/rvf) and SqlJsRvfBackend (built-in sql.js).
 */
export declare const MAX_VECTOR_DIMENSION = 4096;
export declare const MAX_BATCH_SIZE = 10000;
export declare const MAX_PATH_LENGTH = 4096;
export declare const DEFAULT_BATCH_THRESHOLD = 100;
export declare const MAX_PENDING_WRITES = 50000;
export declare const MAX_METADATA_BYTES = 65536;
export declare const MAX_ID_LENGTH = 1024;
export declare const MAX_SEARCH_K = 10000;
export declare const FORBIDDEN_PATH_PATTERNS: RegExp[];
export declare function validatePath(inputPath: string): void;
export declare function validateId(id: string): void;
export declare function validateMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined;
export declare function validateDimension(dimension: number): void;
//# sourceMappingURL=validation.d.ts.map