/**
 * SharedMemoryPool — singleton resource pool that backs HybridReasoningBank
 * and AdvancedMemorySystem.
 *
 * Centralises a single SQLite database handle (better-sqlite3) and a single
 * `EmbeddingService` instance so multiple memory consumers share the same
 * underlying tables / embedding cache without conflicting writes.
 *
 * The pool is constructed lazily on first `getInstance()` call. All heavy
 * resources (sqlite handle, embedder pipeline) are created on demand inside
 * `ensureInitialized()` so simply importing this module is side-effect free.
 *
 * Used by:
 *   - reasoningbank/HybridBackend.ts   (HybridReasoningBank)
 *   - reasoningbank/AdvancedMemory.ts  (AdvancedMemorySystem)
 *
 * Fixes issue #102 — this file was previously imported but missing on disk,
 * which broke `import 'agentic-flow'` at the top level.
 */
import { EmbeddingService } from 'agentdb';
type DatabaseHandle = any;
type EmbedderHandle = EmbeddingService;
export interface SharedMemoryPoolOptions {
    /** SQLite database path. Defaults to `~/.agentic-flow/reasoningbank.db`. */
    dbPath?: string;
    /** Embedding model id. Defaults to `Xenova/all-MiniLM-L6-v2`. */
    embeddingModel?: string;
    /** Embedding vector dimension. Defaults to 384 (MiniLM-L6). */
    embeddingDimension?: number;
    /** Embedding provider. Defaults to `'transformers'`. */
    embeddingProvider?: 'transformers' | 'openai' | 'local';
}
export interface SharedMemoryPoolStats {
    initialized: boolean;
    dbPath: string;
    embeddingModel: string;
    embeddingDimension: number;
    cache: {
        entries: number;
        hits: number;
        misses: number;
        evictions: number;
    };
}
export declare class SharedMemoryPool {
    private static _instance;
    private readonly options;
    private db;
    private embedder;
    private initPromise;
    private cache;
    private cacheStats;
    private constructor();
    /**
     * Singleton accessor. The first caller wins for option overrides; later
     * callers always get the existing pool. To reconfigure, call `reset()`.
     */
    static getInstance(options?: SharedMemoryPoolOptions): SharedMemoryPool;
    /** Tear down the singleton — primarily for tests. */
    static reset(): void;
    /**
     * Idempotently ensure the database and embedder are ready. Subsequent calls
     * return the same in-flight promise so concurrent consumers share init.
     */
    ensureInitialized(): Promise<void>;
    private initialize;
    /** Apply the minimum schema that ReflexionMemory / SkillLibrary require. */
    private applySchema;
    /**
     * Synchronous accessor for the database handle. Throws if init hasn't run —
     * call `ensureInitialized()` first. Provided for compatibility with
     * controllers that take a `Database` instance in their constructor.
     */
    getDatabase(): DatabaseHandle;
    /**
     * Synchronous accessor for the embedder. Throws if init hasn't run.
     */
    getEmbedder(): EmbedderHandle;
    /**
     * Cache a query result with a TTL (milliseconds). Keys are arbitrary
     * strings; consumers (HybridReasoningBank) typically encode the query
     * shape into the key.
     */
    cacheQuery<T>(key: string, value: T, ttlMs: number): void;
    /**
     * Read a cached query result. Returns the cached value if present and not
     * expired; lazily evicts expired entries on lookup.
     *
     * The default `T` is `any` for ergonomic interop with the existing
     * HybridReasoningBank call sites that expect a loose return type.
     * Pass an explicit type parameter (`getCachedQuery<MyShape>(...)`) when
     * you want stricter typing.
     */
    getCachedQuery<T = any>(key: string): T | undefined;
    /** Drop all cached query results. */
    invalidateCache(): void;
    /** Diagnostic stats for telemetry / health endpoints. */
    getStats(): SharedMemoryPoolStats;
    /** Close the underlying database handle and clear cached state. */
    close(): void;
}
export {};
//# sourceMappingURL=SharedMemoryPool.d.ts.map