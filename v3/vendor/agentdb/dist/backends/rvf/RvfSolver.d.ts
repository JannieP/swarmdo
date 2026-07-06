/**
 * AgentDBSolver - Self-Learning Temporal Solver for AgentDB
 *
 * Wraps @rufvector/rvf-solver providing:
 * - Thompson Sampling policy learning (two-signal: safety Beta + cost EMA)
 * - 18 context-bucketed bandits (3 range x 3 distractor x 2 noise)
 * - KnowledgeCompiler with signature-based pattern cache
 * - Three-loop adaptive solver (fast/medium/slow)
 * - A/B/C ablation acceptance testing
 * - SHAKE-256 tamper-evident witness chains
 *
 * Security:
 * - Solver operates on synthetic data only (no user vectors)
 * - Witness chain provides tamper-evident audit log
 * - All options bounded to safe defaults
 */
/** PolicyKernel skip strategies (v0.1.6) */
export type SolverSkipMode = 'none' | 'weekday' | 'hybrid';
/** Per-arm Thompson Sampling statistics (v0.1.6) */
export interface SolverSkipModeStats {
    attempts: number;
    successes: number;
    totalSteps: number;
    alphaSafety: number;
    betaSafety: number;
    costEma: number;
    earlyCommitWrongs: number;
}
/** KnowledgeCompiler distilled configuration entry (v0.1.6) */
export interface SolverCompiledConfig {
    maxSteps: number;
    avgSteps: number;
    observations: number;
    expectedCorrect: boolean;
    hitCount: number;
    counterexampleCount: number;
    compiledSkip: SolverSkipMode;
}
/** Training configuration */
export interface SolverTrainOptions {
    /** Number of puzzles to generate and solve */
    count: number;
    /** Minimum puzzle difficulty (1-10). Default: 1 */
    minDifficulty?: number;
    /** Maximum puzzle difficulty (1-10). Default: 10 */
    maxDifficulty?: number;
    /** RNG seed for reproducibility */
    seed?: number;
}
/** Training result */
export interface SolverTrainResult {
    trained: number;
    correct: number;
    accuracy: number;
    patternsLearned: number;
}
/** Per-cycle metrics from acceptance testing */
export interface SolverCycleMetrics {
    cycle: number;
    accuracy: number;
    costPerSolve: number;
    /** Accuracy under injected noise — measures robustness (v0.1.6) */
    noiseAccuracy: number;
    /** Constraint violations per cycle — safety signal (v0.1.6) */
    violations: number;
    /** Patterns distilled per cycle (v0.1.6) */
    patternsLearned: number;
}
/** Single acceptance mode result (A, B, or C) */
export interface SolverModeResult {
    passed: boolean;
    finalAccuracy: number;
    /** Accuracy stayed above threshold across all cycles (v0.1.6) */
    accuracyMaintained: boolean;
    /** Cost-per-solve decreased vs. baseline (v0.1.6) */
    costImproved: boolean;
    /** Noise accuracy improved vs. baseline (v0.1.6) */
    robustnessImproved: boolean;
    /** No constraint violations in any cycle (v0.1.6) */
    zeroViolations: boolean;
    /** Count of improvement dimensions 0-4 (v0.1.6) */
    dimensionsImproved: number;
    cycles: SolverCycleMetrics[];
}
/** Full acceptance test manifest */
export interface SolverAcceptanceManifest {
    version: number;
    modeA: SolverModeResult;
    modeB: SolverModeResult;
    modeC: SolverModeResult;
    allPassed: boolean;
    witnessEntries: number;
    witnessChainBytes: number;
}
/** Acceptance test options */
export interface SolverAcceptanceOptions {
    holdoutSize?: number;
    trainingPerCycle?: number;
    cycles?: number;
    stepBudget?: number;
    seed?: number;
}
/** Policy state from Thompson Sampling */
export interface SolverPolicyState {
    contextStats: Record<string, Record<string, {
        attempts: number;
        successes: number;
        totalSteps: number;
        alphaSafety: number;
        betaSafety: number;
        costEma: number;
        earlyCommitWrongs: number;
    }>>;
    earlyCommitPenalties: number;
    earlyCommitsTotal: number;
    earlyCommitsWrong: number;
    prepass: string;
    speculativeAttempts: number;
    speculativeArm2Wins: number;
}
/**
 * AgentDBSolver - Self-learning solver for AgentDB
 *
 * Uses the @rufvector/rvf-solver WASM module under the hood.
 * Provides Thompson Sampling, KnowledgeCompiler, and witness chains.
 */
export declare class AgentDBSolver {
    private solver;
    private _destroyed;
    private constructor();
    /**
     * Create a new solver instance.
     * Lazy-loads @rufvector/rvf-solver to avoid hard dependency.
     */
    static create(): Promise<AgentDBSolver>;
    /**
     * Check if @rufvector/rvf-solver is available without creating an instance.
     */
    static isAvailable(): Promise<boolean>;
    /**
     * Train the solver on generated puzzles.
     *
     * Uses the three-loop architecture:
     * - Fast loop: constraint propagation solver
     * - Medium loop: PolicyKernel skip-mode selection
     * - Slow loop: KnowledgeCompiler pattern distillation
     */
    train(options: SolverTrainOptions): SolverTrainResult;
    /**
     * Run the full A/B/C acceptance test.
     *
     * - Mode A: Fixed heuristic policy (baseline)
     * - Mode B: Compiler-suggested policy
     * - Mode C: Learned Thompson Sampling policy (should win)
     */
    acceptance(options?: SolverAcceptanceOptions): SolverAcceptanceManifest;
    /**
     * Get the current policy state (Thompson Sampling parameters,
     * context buckets, KnowledgeCompiler cache stats).
     */
    policy(): SolverPolicyState | null;
    /**
     * Get the raw SHAKE-256 witness chain bytes.
     * Each entry is 73 bytes. Verifiable via @rufvector/rvf-wasm.
     */
    witnessChain(): Uint8Array | null;
    /** Destroy the solver and free WASM resources */
    destroy(): void;
    /** Check if the solver has been destroyed */
    get isDestroyed(): boolean;
    private ensureAlive;
    private mapModeResult;
    private mapCycleMetrics;
}
//# sourceMappingURL=RvfSolver.d.ts.map