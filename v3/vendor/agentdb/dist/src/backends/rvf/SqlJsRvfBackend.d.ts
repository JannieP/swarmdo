/**
 * SqlJsRvfBackend - Built-in RVF persistence using sql.js (WASM SQLite)
 *
 * Provides zero-dependency vector storage in .rvf files when the native
 * @swarmvector/rvf SDK is not installed. Uses sql.js (always available as a
 * hard dependency) for SQLite persistence and SIMD-accelerated brute-force
 * search from src/simd/simd-vector-ops.ts.
 *
 * When @swarmvector/rvf is installed, the factory auto-selects the native
 * RvfBackend instead for HNSW-indexed search.
 *
 * Design:
 * - Reports name='rvf' for compatibility with existing backend checks
 * - Vectors stored as raw Float32Array bytes in BLOB columns
 * - In-memory cache for brute-force search via SIMD ops
 * - Pending write queue with flushSync() before search
 * - save() → db.export() → write Uint8Array to .rvf file
 * - load() → read file → new SQL.Database(buffer) → rebuild cache
 */
import type { VectorBackendAsync, VectorConfig, SearchResult, SearchOptions, VectorStats } from '../VectorBackend.js';
/**
 * SqlJsRvfBackend - VectorBackend + VectorBackendAsync using sql.js WASM
 */
export declare class SqlJsRvfBackend implements VectorBackendAsync {
    readonly name: "rvf";
    private db;
    private dim;
    private metricType;
    private initialized;
    private storagePath;
    private cache;
    private pending;
    private batchThreshold;
    constructor(config: VectorConfig);
    /**
     * Initialize the sql.js database and create schema.
     */
    initialize(): Promise<void>;
    insert(id: string, embedding: Float32Array, metadata?: Record<string, unknown>): void;
    insertBatch(items: Array<{
        id: string;
        embedding: Float32Array;
        metadata?: Record<string, unknown>;
    }>): void;
    search(query: Float32Array, k: number, options?: SearchOptions): SearchResult[];
    remove(id: string): boolean;
    getStats(): VectorStats;
    save(savePath: string): Promise<void>;
    load(loadPath: string): Promise<void>;
    close(): void;
    /**
     * Register the current `this.db` with the module-level FinalizationRegistry
     * so a MEMFS file is reclaimed if the caller forgets to call `close()`.
     *
     * This is a safety net, NOT a substitute for explicit lifecycle management.
     * Consumers that close explicitly hit no overhead (we unregister on close).
     * The finalizer runs only when the JS wrapper is GC'd without `.close()`
     * being called first.
     */
    private _registerForFinalization;
    /**
     * Inverse of _registerForFinalization. Idempotent — safe to call multiple
     * times or when never-registered. Used by `close()` and by `load()` before
     * replacing `this.db`.
     */
    private _unregisterFromFinalization;
    /**
     * Number of currently-open SqlJsRvfBackend instances in this process.
     *
     * Diagnostic only — `process.memoryUsage().external` growth correlated with
     * `openCount()` growth is the signature of the swarmdo#2432 leak class. Use
     * in monitoring dashboards: alert when `openCount()` grows without bound
     * relative to expected controller cardinality.
     */
    static openCount(): number;
    insertAsync(id: string, embedding: Float32Array, metadata?: Record<string, unknown>): Promise<void>;
    insertBatchAsync(items: Array<{
        id: string;
        embedding: Float32Array;
        metadata?: Record<string, unknown>;
    }>): Promise<void>;
    searchAsync(query: Float32Array, k: number, options?: SearchOptions): Promise<SearchResult[]>;
    removeAsync(id: string): Promise<boolean>;
    getStatsAsync(): Promise<VectorStats>;
    flush(): Promise<void>;
    /**
     * Expose the raw sql.js Database instance for unified single-file mode.
     * AgentDB uses this to load relational schemas into the same database.
     */
    getDatabase(): any;
    getStoragePath(): string;
    isInitialized(): boolean;
    private createSchema;
    private rebuildCache;
    private writeVector;
    private flushSync;
    private bruteForceSearch;
    private computeScore;
    private matchesFilter;
    private ensureInitialized;
}
//# sourceMappingURL=SqlJsRvfBackend.d.ts.map