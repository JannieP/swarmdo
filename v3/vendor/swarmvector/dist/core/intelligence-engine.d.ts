/**
 * IntelligenceEngine - Full SwarmVector Intelligence Stack
 *
 * Integrates all SwarmVector capabilities for self-learning hooks:
 * - VectorDB with HNSW for semantic memory (150x faster)
 * - SONA for continual learning (Micro-LoRA, EWC++)
 * - FastAgentDB for episode/trajectory storage
 * - Attention mechanisms for pattern recognition
 * - ReasoningBank for pattern clustering
 *
 * Replaces the simple Q-learning approach with real ML-powered intelligence.
 */
import { EpisodeSearchResult } from './agentdb-fast';
import { SonaConfig, LearnedPattern } from './sona-wrapper';
import { OnnxEmbedderConfig } from './onnx-embedder';
import { EmbeddingProvenance } from './embedding-provenance';
import { ParallelConfig, BatchEpisode } from './parallel-intelligence';
export interface MemoryEntry {
    id: string;
    content: string;
    type: string;
    embedding: number[];
    created: string;
    accessed: number;
    score?: number;
}
export interface AgentRoute {
    agent: string;
    confidence: number;
    reason: string;
    patterns?: LearnedPattern[];
    alternates?: Array<{
        agent: string;
        confidence: number;
    }>;
}
export interface LearningStats {
    totalMemories: number;
    memoryDimensions: number;
    totalEpisodes: number;
    totalTrajectories: number;
    avgReward: number;
    sonaEnabled: boolean;
    trajectoriesRecorded: number;
    patternsLearned: number;
    microLoraUpdates: number;
    baseLoraUpdates: number;
    ewcConsolidations: number;
    routingPatterns: number;
    errorPatterns: number;
    coEditPatterns: number;
    workerTriggers: number;
    attentionEnabled: boolean;
    onnxEnabled: boolean;
    /**
     * Which embedder actually serves embedAsync() right now (ADR-210 D1):
     * 'onnx-minilm' once the model is loaded, 'hash-fallback' while ONNX is
     * enabled but not (yet) loaded, 'hash' when ONNX is deliberately disabled
     * (config or RUVECTOR_EMBEDDER=hash / RUVECTOR_ONNX=0).
     */
    embedderKind: 'onnx-minilm' | 'hash-fallback' | 'hash';
    parallelEnabled: boolean;
    parallelWorkers: number;
    parallelBusy: number;
    parallelQueued: number;
}
export interface IntelligenceConfig {
    /** Embedding dimension for vectors (default: 256, 384 for ONNX) */
    embeddingDim?: number;
    /** Maximum memories to store (default: 100000) */
    maxMemories?: number;
    /** Maximum episodes for trajectory storage (default: 50000) */
    maxEpisodes?: number;
    /** Enable SONA continual learning (default: true if available) */
    enableSona?: boolean;
    /** Enable attention mechanisms (default: true if available) */
    enableAttention?: boolean;
    /**
     * Enable ONNX semantic embeddings (default: TRUE since ADR-210 D1 — the
     * model loads lazily; until ready or when it cannot load, the hash
     * fallback is used and loudly reported). RUVECTOR_EMBEDDER / RUVECTOR_ONNX
     * environment variables override this config (D5).
     */
    enableOnnx?: boolean;
    /** Options forwarded to the ONNX embedder (model id, cache dir, ...). */
    onnxConfig?: OnnxEmbedderConfig;
    /** SONA configuration */
    sonaConfig?: Partial<SonaConfig>;
    /** Storage path for persistence */
    storagePath?: string;
    /** Learning rate for pattern updates (default: 0.1) */
    learningRate?: number;
    /**
     * Enable parallel workers for batch operations
     * Auto-enabled for MCP servers, disabled for CLI hooks
     */
    parallelConfig?: Partial<ParallelConfig>;
}
/**
 * Full-stack intelligence engine using all SwarmVector capabilities
 */
export declare class IntelligenceEngine {
    private config;
    private vectorDb;
    private agentDb;
    private sona;
    private attention;
    private onnxEmbedder;
    private onnxReady;
    private onnxInitPromise;
    private onnxInitError;
    /** RUVECTOR_EMBEDDER=minilm: fail rather than fall back (ADR-210 D5). */
    private onnxHardRequire;
    private parallel;
    private memories;
    private routingPatterns;
    private errorPatterns;
    private coEditPatterns;
    private agentMappings;
    private workerTriggerMappings;
    private currentTrajectoryId;
    private currentTrajectoryContext;
    private currentTrajectoryFile;
    private currentTrajectoryAgent;
    private sessionStart;
    private learningEnabled;
    private episodeBatchQueue;
    constructor(config?: IntelligenceConfig);
    private initOnnx;
    /**
     * Await lazy ONNX initialization. Resolves true once the model is loaded,
     * false when it could not be (offline / restricted CI) — in which case
     * stats().embedderKind reports 'hash-fallback' (ADR-210 D1).
     */
    awaitOnnx(): Promise<boolean>;
    /** Why ONNX init failed, or null (ADR-210 D1 observability). */
    getOnnxInitError(): Error | null;
    private initVectorDb;
    private initParallel;
    /**
     * Generate embedding using attention or hash (sync). Use embedAsync() for ONNX.
     */
    embed(text: string): number[];
    /**
     * Async embedding with ONNX support (recommended for semantic quality).
     *
     * ADR-210 D1: when ONNX is enabled but the model cannot load, the hash
     * fallback is used and reported (one stderr warning per process, and
     * stats().embedderKind === 'hash-fallback'). Under RUVECTOR_EMBEDDER=minilm
     * the failure is an error instead — no fallback (D5).
     */
    embedAsync(text: string): Promise<number[]>;
    /**
     * Batch embedding for bulk ingest (ADR-210 D3). When the ONNX model is
     * loaded, batches of 32+ texts route through the bundled parallel worker
     * pool (parallel-fp32 — see embedBulk in onnx-embedder.ts for the int8
     * status note); smaller batches use the single-threaded batch path. On
     * fallback, semantics match embedAsync exactly: hash per-item with the
     * loud once-per-process warning, or a hard error under
     * RUVECTOR_EMBEDDER=minilm (D5). Texts are embedded as passages (D4).
     *
     * Callers that start the pool should call shutdownEmbedderPool() when the
     * bulk work is done so worker threads do not keep the process alive.
     */
    embedBatchAsync(texts: string[]): Promise<number[][]>;
    /**
     * Shut down the bundled bulk-embed worker pool, releasing its threads
     * (ADR-210 D3). Safe to call when the pool was never started.
     */
    shutdownEmbedderPool(): Promise<void>;
    /**
     * Attention-based embedding using Flash or Multi-head attention
     */
    private attentionEmbed;
    /**
     * Improved hash-based embedding with positional encoding
     */
    private hashEmbed;
    private tokenize;
    private tokenEmbed;
    private meanPool;
    /**
     * Store content in vector memory (uses ONNX if available)
     */
    remember(content: string, type?: string): Promise<MemoryEntry>;
    /**
     * Semantic search of memories (uses ONNX if available)
     */
    recall(query: string, topK?: number): Promise<MemoryEntry[]>;
    private cosineSimilarity;
    /**
     * Route a task to the best agent using learned patterns
     */
    route(task: string, file?: string): Promise<AgentRoute>;
    private getExtension;
    private getState;
    private getAlternates;
    /**
     * Begin recording a trajectory (before edit/command)
     */
    beginTrajectory(context: string, file?: string): void;
    /**
     * Add a step to the current trajectory
     */
    addTrajectoryStep(activations: number[], reward: number): void;
    /**
     * End the current trajectory with a quality score
     */
    endTrajectory(success: boolean, quality?: number): void;
    /**
     * Set the agent route for current trajectory
     */
    setTrajectoryRoute(agent: string): void;
    /**
     * Record the outcome of an agent routing decision.
     *
     * This is the write-side counterpart of route(): it derives the state key
     * with the exact same getState()/getExtension() logic route() uses for
     * lookups, so learned agent outcomes actually influence future routing
     * (fixes #517 — previously only command/edit outcome episodes were stored,
     * under state keys route() never queries).
     */
    recordRouteOutcome(task: string, file: string | undefined, agent: string, reward: number): void;
    /**
     * Record an episode for learning
     */
    recordEpisode(state: string, action: string, reward: number, nextState: string, done: boolean, metadata?: Record<string, any>): Promise<void>;
    /**
     * Queue episode for batch processing (3-4x faster with workers)
     */
    queueEpisode(episode: BatchEpisode): void;
    /**
     * Process queued episodes in parallel batch
     */
    flushEpisodeBatch(): Promise<number>;
    /**
     * Learn from similar past episodes
     */
    learnFromSimilar(state: string, k?: number): Promise<EpisodeSearchResult[]>;
    /**
     * Register worker trigger to agent mappings
     */
    registerWorkerTrigger(trigger: string, priority: string, agents: string[]): void;
    /**
     * Get agents for a worker trigger
     */
    getAgentsForTrigger(trigger: string): {
        priority: string;
        agents: string[];
    } | undefined;
    /**
     * Route a task using worker trigger patterns first, then fall back to regular routing
     */
    routeWithWorkers(task: string, file?: string): Promise<AgentRoute>;
    /**
     * Initialize default worker trigger mappings
     */
    initDefaultWorkerMappings(): void;
    /**
     * Record a co-edit pattern
     */
    recordCoEdit(file1: string, file2: string): void;
    /**
     * Get likely next files to edit
     */
    getLikelyNextFiles(file: string, topK?: number): Array<{
        file: string;
        count: number;
    }>;
    /**
     * Record an error pattern with fixes
     */
    recordErrorFix(errorPattern: string, fix: string): void;
    /**
     * Get suggested fixes for an error
     */
    getSuggestedFixes(error: string): string[];
    /**
     * Run background learning cycle
     */
    tick(): string | null;
    /**
     * Force immediate learning
     */
    forceLearn(): string | null;
    /**
     * Get comprehensive learning statistics
     */
    getStats(): LearningStats;
    /**
     * Embedding provenance of vectors embedAsync() would produce right now
     * (ADR-210 D0). Hash fallback embeds are 'hash' even while ONNX is enabled
     * but not ready — provenance records what actually happened, not intent.
     */
    getActiveProvenance(): EmbeddingProvenance;
    /**
     * Export all data for persistence
     */
    export(): Record<string, any>;
    /**
     * Import data from persistence
     */
    import(data: Record<string, any>, merge?: boolean): void;
    /**
     * Clear all data
     */
    clear(): void;
    /** Legacy: patterns object */
    get patterns(): Record<string, Record<string, number>>;
    /** Legacy: file_sequences array */
    get file_sequences(): string[][];
    /** Legacy: errors object */
    get errors(): Record<string, string[]>;
}
/**
 * Create a new IntelligenceEngine with default settings
 */
export declare function createIntelligenceEngine(config?: IntelligenceConfig): IntelligenceEngine;
/**
 * Create a high-performance engine with all features enabled.
 * Note (ADR-210): with default-on ONNX the embedding space is 384-dim; the
 * 512-dim setting only applies on the hash path (RUVECTOR_EMBEDDER=hash or
 * ONNX unavailable). SONA dims follow the engine's actual embeddingDim.
 */
export declare function createHighPerformanceEngine(): IntelligenceEngine;
/**
 * Create a lightweight engine for fast startup (hash embedder: no model load,
 * no download — the deterministic no-model path stays available, ADR-210).
 */
export declare function createLightweightEngine(): IntelligenceEngine;
export default IntelligenceEngine;
//# sourceMappingURL=intelligence-engine.d.ts.map