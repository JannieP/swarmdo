/**
 * Memory plane API - Types (PR3)
 */
/** Entry for seedMemory. */
export interface MemoryEntry {
    /** Optional key. */
    key?: string;
    /** Content value. */
    value: string;
    /** Optional metadata. */
    metadata?: Record<string, unknown>;
}
/** Result item from searchMemory. */
export interface MemorySearchResult {
    value: string;
    score?: number;
    metadata?: Record<string, unknown>;
}
/** Scope for search: run-scoped or global. */
export type MemorySearchScope = {
    runId: string;
} | 'global';
//# sourceMappingURL=memory-plane-types.d.ts.map