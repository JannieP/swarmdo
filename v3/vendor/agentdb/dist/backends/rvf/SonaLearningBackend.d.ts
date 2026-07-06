/**
 * SonaLearningBackend - Native SONA Engine Integration for AgentDB
 *
 * Wraps @rufvector/sona's N-API SonaEngine providing:
 * - Sub-millisecond micro-LoRA query enhancement
 * - Trajectory-based learning from agent interactions
 * - EWC++ protection against catastrophic forgetting
 * - Background learning cycles on configurable intervals
 * - Learned pattern discovery for warm-starting
 *
 * Security:
 * - Operates on embeddings only (no user text)
 * - EWC lambda bounded (0-1000)
 * - Trajectory capacity bounded
 * - All inputs validated for dimension match
 */
/** SONA configuration */
export interface SonaConfig {
    /** Hidden dimension size (must match embedding dimension) */
    hiddenDim: number;
    /** Embedding dimension (defaults to hiddenDim) */
    embeddingDim?: number;
    /** Micro-LoRA rank (1-2, default: 1) */
    microLoraRank?: number;
    /** Base LoRA rank (default: 8) */
    baseLoraRank?: number;
    /** EWC regularization lambda (default: 1000) */
    ewcLambda?: number;
    /** Number of pattern clusters (default: 50) */
    patternClusters?: number;
    /** Max trajectory buffer capacity (default: 10000) */
    trajectoryCapacity?: number;
    /** Background learning interval in ms (default: 3600000) */
    backgroundIntervalMs?: number;
    /** Quality threshold for learning (default: 0.5) */
    qualityThreshold?: number;
}
/** Learned pattern from SONA */
export interface LearnedPattern {
    id: string;
    centroid: number[];
    clusterSize: number;
    totalWeight: number;
    avgQuality: number;
    accessCount: number;
    patternType: string;
}
/** SONA engine statistics */
export interface SonaStats {
    totalTrajectories: number;
    activeTrajectories: number;
    patternsLearned: number;
    learningCycles: number;
    enabled: boolean;
}
/** Training sample for SONA learning */
export interface SonaTrainingSample {
    embedding: Float32Array;
    reward: number;
    context?: string;
    route?: string;
}
/**
 * SonaLearningBackend - Native adaptive learning via @rufvector/sona
 */
export declare class SonaLearningBackend {
    private engine;
    private _destroyed;
    private dim;
    private activeTrajectories;
    private _contextAddCount;
    private _contextFailCount;
    private _flushCount;
    private _tickCounter;
    private _flushInterval;
    private constructor();
    /**
     * Create a new SONA learning backend.
     * Lazy-loads @rufvector/sona to avoid hard dependency.
     */
    static create(config: SonaConfig): Promise<SonaLearningBackend>;
    /**
     * Check if @rufvector/sona is available.
     */
    static isAvailable(): Promise<boolean>;
    /**
     * Enhance a query embedding using micro-LoRA transformation.
     * Sub-millisecond latency via N-API native code.
     */
    enhance(query: Float32Array): Float32Array;
    /**
     * Start a trajectory recording for an agent interaction.
     * Returns a trajectory ID for adding steps and ending.
     */
    beginTrajectory(queryEmbedding: Float32Array): number;
    /**
     * Add a step to an active trajectory.
     */
    addStep(trajectoryId: number, activations: Float32Array, reward: number): void;
    /**
     * Set the model route for a trajectory (for multi-model routing).
     */
    setRoute(trajectoryId: number, route: string): void;
    /**
     * Add context metadata to an active trajectory (ADR-007 Phase 1).
     * Uses NativeAccelerator's sonaAddContext if available, otherwise stores locally.
     */
    addContext(trajectoryId: number, context: Record<string, unknown>): Promise<boolean>;
    /**
     * Flush SONA engine state via NativeAccelerator (ADR-007 Phase 1).
     */
    flushState(): Promise<boolean>;
    /**
     * End a trajectory and submit for learning.
     * Quality should be in [0.0, 1.0].
     */
    endTrajectory(trajectoryId: number, quality: number): void;
    /**
     * Run background learning cycle if due.
     * Returns a status message if a cycle was executed, null otherwise.
     * Periodically flushes SONA state via NativeAccelerator (every 10th tick).
     */
    tick(): string | null;
    /**
     * Force immediate learning cycle.
     */
    forceLearn(): string;
    /**
     * Find similar learned patterns to a query embedding.
     */
    findPatterns(queryEmbedding: Float32Array, k?: number): LearnedPattern[];
    /**
     * Get engine statistics.
     */
    getStats(): SonaStats;
    /**
     * Get context enrichment statistics (ADR-007 Phase 1).
     */
    getContextStats(): {
        contextAdded: number;
        contextFailed: number;
        flushCount: number;
        tickCount: number;
    };
    /**
     * Enable or disable the engine.
     */
    setEnabled(enabled: boolean): void;
    /** Get the configured dimension */
    get dimension(): number;
    /** Check if the engine has been destroyed */
    get isDestroyed(): boolean;
    /** Destroy the engine and free native resources */
    destroy(): void;
    private ensureAlive;
}
//# sourceMappingURL=SonaLearningBackend.d.ts.map