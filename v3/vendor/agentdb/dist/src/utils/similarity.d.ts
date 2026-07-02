/**
 * Shared vector similarity utilities.
 * Consolidated from 13 duplicate implementations across the codebase.
 */
/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1, where 1 means identical direction.
 * Returns 0 when either vector has zero magnitude.
 */
export declare function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number;
//# sourceMappingURL=similarity.d.ts.map