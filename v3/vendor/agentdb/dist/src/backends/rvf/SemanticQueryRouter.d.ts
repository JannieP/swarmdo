/**
 * SemanticQueryRouter - Intent-Based Query Routing for AgentDB
 *
 * Wraps @rufvector/router's SemanticRouter for intelligent query routing
 * based on learned intent embeddings. Routes queries to appropriate
 * handlers (e.g., different memory stores, search strategies) based
 * on semantic similarity.
 *
 * Security:
 * - Intent names validated (length, characters)
 * - Embedding dimensions validated
 * - Route count bounded
 * - No file I/O (uses in-memory VectorDb)
 */
/** Route match result */
export interface RouteMatch {
    intent: string;
    score: number;
    metadata: Record<string, unknown>;
}
/** Intent configuration */
export interface IntentConfig {
    name: string;
    exemplars: Float32Array[];
    metadata?: Record<string, unknown>;
}
/** Router configuration */
export interface RouterConfig {
    /** Embedding dimension */
    dimension: number;
    /** Minimum similarity score for matches (default: 0.0 for distance metrics) */
    threshold?: number;
    /** Maximum number of intents (default: 1000) */
    maxIntents?: number;
    /** Path for router state persistence (ADR-007 Phase 1) */
    persistencePath?: string;
}
/** Router statistics */
export interface RouterStats {
    intentCount: number;
    dimension: number;
    totalQueries: number;
    avgLatencyMs: number;
}
/**
 * SemanticQueryRouter - Route queries to intents via learned embeddings
 *
 * Uses @rufvector/router's N-API VectorDb (HNSW + SIMD) for sub-millisecond
 * routing. Falls back to built-in brute-force search if @rufvector/router
 * is not available.
 */
export declare class SemanticQueryRouter {
    private dim;
    private threshold;
    private maxIntents;
    private router;
    private fallbackIntents;
    private _totalQueries;
    private _totalLatencyMs;
    private _destroyed;
    private _useNative;
    private _persistencePath;
    private _persistTimer;
    private _persistDebounceMs;
    private _persistDirty;
    private constructor();
    /**
     * Create a new semantic query router.
     * Lazy-loads @rufvector/router; falls back to built-in search.
     */
    static create(config: RouterConfig): Promise<SemanticQueryRouter>;
    /**
     * Check if @rufvector/router is available.
     */
    static isAvailable(): Promise<boolean>;
    /**
     * Add an intent with exemplar embeddings.
     * The centroid of exemplars is used for routing.
     */
    addIntent(config: IntentConfig): void;
    /**
     * Route a query embedding to the best matching intent(s).
     */
    route(query: Float32Array, k?: number): RouteMatch[];
    /**
     * Remove an intent.
     */
    removeIntent(name: string): boolean;
    /**
     * Get all intent names.
     */
    getIntents(): string[];
    /**
     * Get router statistics.
     */
    getStats(): RouterStats;
    /** Whether using native @rufvector/router */
    get isNative(): boolean;
    /** Check if destroyed */
    get isDestroyed(): boolean;
    /**
     * Save router state to disk (ADR-007 Phase 1 persistence).
     * Requires @rufvector/router native save support or falls back to JSON.
     */
    save(path: string): Promise<boolean>;
    /**
     * Load router state from disk (ADR-007 Phase 1 persistence).
     */
    load(path: string): Promise<boolean>;
    /** Whether a persistence path is configured */
    get persistencePath(): string | undefined;
    /**
     * Persist router state immediately (ADR-007 Phase 1).
     * Saves to the configured persistencePath using native or JSON fallback.
     */
    persist(): Promise<boolean>;
    /** Destroy the router */
    destroy(): void;
    private fallbackRoute;
    private topK;
    /**
     * Schedule a debounced persist (ADR-007 Phase 1).
     * Coalesces rapid route changes into a single write after 5s of quiet.
     */
    private schedulePersist;
    private ensureAlive;
}
//# sourceMappingURL=SemanticQueryRouter.d.ts.map