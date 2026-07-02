/**
 * SONA (Self-Optimizing Neural Architecture) Learning System
 *
 * Provides adaptive learning capabilities with trajectory tracking,
 * pattern recognition, and memory protection (EWC++).
 */
import { SonaConfig, LearningSignal, QueryTrajectory, TrajectoryStep, TrajectoryOutcome, LearnedPattern, PatternType, EwcStats, Embedding } from './types';
/**
 * Default SONA configuration
 */
declare const DEFAULT_SONA_CONFIG: Required<SonaConfig>;
/**
 * Trajectory Builder for tracking query execution paths
 *
 * @example
 * ```typescript
 * const builder = new TrajectoryBuilder();
 *
 * builder.startStep('query', 'What is AI?');
 * // ... processing ...
 * builder.endStep('AI is artificial intelligence', 0.95);
 *
 * builder.startStep('memory', 'searching context');
 * builder.endStep('found 3 relevant documents', 0.88);
 *
 * const trajectory = builder.complete('success');
 * ```
 */
export declare class TrajectoryBuilder {
    private id;
    private steps;
    private currentStep;
    private stepStart;
    private startTime;
    constructor();
    /**
     * Start a new step in the trajectory
     */
    startStep(type: TrajectoryStep['type'], input: string): this;
    /**
     * End current step with output
     */
    endStep(output: string, confidence: number): this;
    /**
     * Complete trajectory with final outcome
     */
    complete(outcome: TrajectoryOutcome): QueryTrajectory;
    /**
     * Get current trajectory ID
     */
    getId(): string;
}
/**
 * ReasoningBank - Pattern storage and retrieval
 *
 * Stores learned patterns from successful interactions and
 * enables pattern-based reasoning shortcuts.
 *
 * OPTIMIZED: Uses Float64Array for embeddings and partial sorting
 */
export declare class ReasoningBank {
    private patterns;
    private embeddings;
    private embeddingNorms;
    private threshold;
    private _similarityResults;
    constructor(threshold?: number);
    /**
     * Store a new pattern
     */
    store(type: PatternType, embedding: Embedding, metadata?: Record<string, unknown>): string;
    /**
     * Find similar patterns
     * OPTIMIZED: Uses typed arrays, pre-computed norms, and partial sorting
     */
    findSimilar(embedding: Embedding, k?: number): LearnedPattern[];
    /**
     * Partial sort to get top k elements (faster than full sort)
     */
    private partialSort;
    /**
     * Record pattern usage (success or failure)
     */
    recordUsage(patternId: string, success: boolean): void;
    /**
     * Get pattern by ID
     */
    get(patternId: string): LearnedPattern | undefined;
    /**
     * Get all patterns of a type
     */
    getByType(type: PatternType): LearnedPattern[];
    /**
     * Prune low-performing patterns
     */
    prune(minSuccessRate?: number, minUseCount?: number): number;
    /**
     * Get statistics
     */
    stats(): {
        totalPatterns: number;
        avgSuccessRate: number;
        byType: Record<string, number>;
    };
    private cosineSimilarity;
}
/**
 * EWC++ (Elastic Weight Consolidation) Manager
 *
 * Prevents catastrophic forgetting by protecting important weights.
 * This is a simplified JS implementation of the concept.
 *
 * OPTIMIZED: Uses Float64Array for 5-10x faster penalty computation
 */
export declare class EwcManager {
    private lambda;
    private tasksLearned;
    private fisherDiagonal;
    private optimalWeights;
    private _penaltyBuffer;
    constructor(lambda?: number);
    /**
     * Register a new task (after successful learning)
     */
    registerTask(taskId: string, weights: number[]): void;
    /**
     * Compute EWC penalty for weight update
     * OPTIMIZED: Uses typed arrays and minimizes allocations
     */
    computePenalty(currentWeights: number[]): number;
    /**
     * Get EWC statistics
     */
    stats(): EwcStats;
    private estimateForgettingRate;
}
/**
 * SONA Learning Coordinator
 *
 * Orchestrates the learning loops and components.
 */
export declare class SonaCoordinator {
    private config;
    private trajectoryBuffer;
    private reasoningBank;
    private ewcManager;
    private signalBuffer;
    private microLora;
    private microLoraUpdates;
    constructor(config?: SonaConfig);
    /**
     * Record a learning signal
     *
     * Every signal drives the instant loop: quality above 0.5 reinforces the
     * signal's direction in the micro-LoRA, quality below 0.5 unlearns it
     * (previously only quality >= 0.8 was processed, so negative feedback
     * never adapted anything).
     */
    recordSignal(signal: LearningSignal): void;
    /**
     * Record a completed trajectory
     */
    recordTrajectory(trajectory: QueryTrajectory): void;
    /**
     * Run background learning loop
     */
    runBackgroundLoop(): {
        patternsLearned: number;
        trajectoriesProcessed: number;
    };
    /**
     * Get reasoning bank for pattern queries
     */
    getReasoningBank(): ReasoningBank;
    /**
     * Get EWC manager
     */
    getEwcManager(): EwcManager;
    /**
     * Get statistics
     */
    stats(): {
        signalsReceived: number;
        trajectoriesBuffered: number;
        patterns: ReturnType<ReasoningBank['stats']>;
        ewc: EwcStats;
        microLora: {
            updates: number;
            deltaNorm: number;
        };
    };
    /**
     * Apply the micro-LoRA transformation learned from feedback.
     *
     * Input is truncated/zero-padded to the adapter dimension; the residual
     * connection means an untrained adapter returns the input unchanged.
     */
    applyMicroLora(input: number[]): number[];
    /**
     * Frobenius norm of the micro-LoRA weight delta (scaling * A @ B).
     *
     * 0 means no adaptation has occurred (LoRA B is zero-initialized, so the
     * delta is exactly zero until the first feedback update). Consumers can
     * surface this directly (e.g. a statusline "delta LoRA" field) — see #553.
     */
    microLoraDeltaNorm(): number;
    /**
     * Instant-loop learning: a single feedback signal produces a real
     * micro-LoRA weight update (fixes #553 — this was a no-op stub, so
     * learn-from-feedback never changed any weight).
     *
     * REINFORCE-style with a fixed 0.5 baseline: reward = quality - 0.5.
     * The gradient pushes the adapter output toward the signal's embedding
     * direction for positive reward and away from it for negative reward
     * (backward() applies `weights -= lr * grad`, hence the negated sign).
     */
    private processInstantLearning;
    private extractPatterns;
    private stepTypeToPatternType;
    private createEmbedding;
}
export { DEFAULT_SONA_CONFIG, };
//# sourceMappingURL=sona.d.ts.map