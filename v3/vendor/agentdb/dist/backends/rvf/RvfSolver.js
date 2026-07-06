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
// Bounds
const MAX_TRAIN_COUNT = 100000;
const MAX_DIFFICULTY = 10;
const MAX_CYCLES = 50;
const MAX_STEP_BUDGET = 10000;
/**
 * AgentDBSolver - Self-learning solver for AgentDB
 *
 * Uses the @rufvector/rvf-solver WASM module under the hood.
 * Provides Thompson Sampling, KnowledgeCompiler, and witness chains.
 */
export class AgentDBSolver {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    solver = null;
    _destroyed = false;
    constructor() { }
    /**
     * Create a new solver instance.
     * Lazy-loads @rufvector/rvf-solver to avoid hard dependency.
     */
    static async create() {
        const instance = new AgentDBSolver();
        try {
            const { RvfSolver } = await import('@rufvector/rvf-solver');
            instance.solver = await RvfSolver.create();
        }
        catch (error) {
            throw new Error(`RVF Solver initialization failed.\n` +
                `Install with: npm install @rufvector/rvf-solver\n` +
                `Error: ${error.message}`);
        }
        return instance;
    }
    /**
     * Check if @rufvector/rvf-solver is available without creating an instance.
     */
    static async isAvailable() {
        try {
            await import('@rufvector/rvf-solver');
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Train the solver on generated puzzles.
     *
     * Uses the three-loop architecture:
     * - Fast loop: constraint propagation solver
     * - Medium loop: PolicyKernel skip-mode selection
     * - Slow loop: KnowledgeCompiler pattern distillation
     */
    train(options) {
        this.ensureAlive();
        const count = Math.min(Math.max(1, options.count), MAX_TRAIN_COUNT);
        const minDiff = Math.min(Math.max(1, options.minDifficulty ?? 1), MAX_DIFFICULTY);
        const maxDiff = Math.min(Math.max(minDiff, options.maxDifficulty ?? MAX_DIFFICULTY), MAX_DIFFICULTY);
        const result = this.solver.train({
            count,
            minDifficulty: minDiff,
            maxDifficulty: maxDiff,
            seed: options.seed != null ? BigInt(options.seed) : undefined,
        });
        return {
            trained: result.trained ?? count,
            correct: result.correct ?? 0,
            accuracy: result.accuracy ?? 0,
            patternsLearned: result.patternsLearned ?? 0,
        };
    }
    /**
     * Run the full A/B/C acceptance test.
     *
     * - Mode A: Fixed heuristic policy (baseline)
     * - Mode B: Compiler-suggested policy
     * - Mode C: Learned Thompson Sampling policy (should win)
     */
    acceptance(options) {
        this.ensureAlive();
        const opts = {
            holdoutSize: Math.min(Math.max(1, options?.holdoutSize ?? 50), MAX_TRAIN_COUNT),
            trainingPerCycle: Math.min(Math.max(1, options?.trainingPerCycle ?? 200), MAX_TRAIN_COUNT),
            cycles: Math.min(Math.max(1, options?.cycles ?? 5), MAX_CYCLES),
            stepBudget: Math.min(Math.max(1, options?.stepBudget ?? 500), MAX_STEP_BUDGET),
            seed: options?.seed != null ? BigInt(options.seed) : undefined,
        };
        const manifest = this.solver.acceptance(opts);
        return {
            version: manifest.version ?? 1,
            modeA: this.mapModeResult(manifest.modeA),
            modeB: this.mapModeResult(manifest.modeB),
            modeC: this.mapModeResult(manifest.modeC),
            allPassed: manifest.allPassed ?? false,
            witnessEntries: manifest.witnessEntries ?? 0,
            witnessChainBytes: manifest.witnessChainBytes ?? 0,
        };
    }
    /**
     * Get the current policy state (Thompson Sampling parameters,
     * context buckets, KnowledgeCompiler cache stats).
     */
    policy() {
        this.ensureAlive();
        return this.solver.policy() ?? null;
    }
    /**
     * Get the raw SHAKE-256 witness chain bytes.
     * Each entry is 73 bytes. Verifiable via @rufvector/rvf-wasm.
     */
    witnessChain() {
        this.ensureAlive();
        return this.solver.witnessChain() ?? null;
    }
    /** Destroy the solver and free WASM resources */
    destroy() {
        if (this.solver && !this._destroyed) {
            this.solver.destroy();
            this._destroyed = true;
            this.solver = null;
        }
    }
    /** Check if the solver has been destroyed */
    get isDestroyed() {
        return this._destroyed;
    }
    // ─── Private helpers ───
    ensureAlive() {
        if (this._destroyed || !this.solver) {
            throw new Error('Solver has been destroyed. Create a new instance.');
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mapModeResult(raw) {
        return {
            passed: raw?.passed ?? false,
            finalAccuracy: raw?.finalAccuracy ?? raw?.final_accuracy ?? 0,
            // v0.1.6 acceptance dimensions
            accuracyMaintained: raw?.accuracyMaintained ?? raw?.accuracy_maintained ?? false,
            costImproved: raw?.costImproved ?? raw?.cost_improved ?? false,
            robustnessImproved: raw?.robustnessImproved ?? raw?.robustness_improved ?? false,
            zeroViolations: raw?.zeroViolations ?? raw?.zero_violations ?? false,
            dimensionsImproved: raw?.dimensionsImproved ?? raw?.dimensions_improved ?? 0,
            cycles: (raw?.cycles ?? []).map(this.mapCycleMetrics),
        };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mapCycleMetrics(c) {
        return {
            cycle: c?.cycle ?? 0,
            accuracy: c?.accuracy ?? 0,
            costPerSolve: c?.costPerSolve ?? c?.cost_per_solve ?? 0,
            // v0.1.6 fields
            noiseAccuracy: c?.noiseAccuracy ?? c?.noise_accuracy ?? 0,
            violations: c?.violations ?? 0,
            patternsLearned: c?.patternsLearned ?? c?.patterns_learned ?? 0,
        };
    }
}
//# sourceMappingURL=RvfSolver.js.map