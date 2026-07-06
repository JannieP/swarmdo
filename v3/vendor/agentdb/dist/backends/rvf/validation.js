/**
 * Shared validation utilities for RVF backends (native + sql.js fallback)
 *
 * Extracted from RvfBackend.ts to avoid duplication between
 * RvfBackend (native @rufvector/rvf) and SqlJsRvfBackend (built-in sql.js).
 */
// Security constants (aligned with RuVectorBackend)
export const MAX_VECTOR_DIMENSION = 4096;
export const MAX_BATCH_SIZE = 10000;
export const MAX_PATH_LENGTH = 4096;
export const DEFAULT_BATCH_THRESHOLD = 100;
export const MAX_PENDING_WRITES = 50000;
export const MAX_METADATA_BYTES = 65536;
export const MAX_ID_LENGTH = 1024;
export const MAX_SEARCH_K = 10000;
export const FORBIDDEN_PATH_PATTERNS = [
    /\.\./, // Path traversal
    /^\/etc\//i, // System config
    /^\/proc\//i, // Process info
    /^\/sys\//i, // System info
    /^\/dev\//i, // Devices
];
export function validatePath(inputPath) {
    if (!inputPath || typeof inputPath !== 'string') {
        throw new Error('Path must be a non-empty string');
    }
    if (inputPath.length > MAX_PATH_LENGTH) {
        throw new Error(`Path exceeds maximum length of ${MAX_PATH_LENGTH}`);
    }
    if (inputPath.includes('\0')) {
        throw new Error('Path must not contain null bytes');
    }
    // Check both forward-slash and backslash traversal
    if (/\.\.[\\/]/.test(inputPath)) {
        throw new Error('Path contains forbidden traversal pattern');
    }
    for (const pattern of FORBIDDEN_PATH_PATTERNS) {
        if (pattern.test(inputPath)) {
            throw new Error('Path contains forbidden pattern');
        }
    }
}
export function validateId(id) {
    if (!id || typeof id !== 'string') {
        throw new Error('Vector ID must be a non-empty string');
    }
    if (id.length > MAX_ID_LENGTH) {
        throw new Error(`Vector ID exceeds maximum length of ${MAX_ID_LENGTH}`);
    }
    if (id.includes('\0')) {
        throw new Error('Vector ID must not contain null bytes');
    }
}
export function validateMetadata(metadata) {
    if (!metadata)
        return metadata;
    const json = JSON.stringify(metadata);
    if (json.length > MAX_METADATA_BYTES) {
        throw new Error(`Metadata exceeds maximum size of ${MAX_METADATA_BYTES} bytes`);
    }
    // Strip prototype-pollution keys
    if ('__proto__' in metadata || 'constructor' in metadata || 'prototype' in metadata) {
        const clean = Object.create(null);
        for (const key of Object.keys(metadata)) {
            if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
                clean[key] = metadata[key];
            }
        }
        return clean;
    }
    return metadata;
}
export function validateDimension(dimension) {
    if (!Number.isFinite(dimension) || dimension < 1 || dimension > MAX_VECTOR_DIMENSION) {
        throw new Error(`Dimension must be between 1 and ${MAX_VECTOR_DIMENSION}`);
    }
}
//# sourceMappingURL=validation.js.map