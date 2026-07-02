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
  private solver: any = null;
  private _destroyed = false;

  private constructor() {}

  /**
   * Create a new solver instance.
   * Lazy-loads @rufvector/rvf-solver to avoid hard dependency.
   */
  static async create(): Promise<AgentDBSolver> {
    const instance = new AgentDBSolver();

    try {
      const { RvfSolver } = await import('@rufvector/rvf-solver');
      instance.solver = await RvfSolver.create();
    } catch (error) {
      throw new Error(
        `RVF Solver initialization failed.\n` +
        `Install with: npm install @rufvector/rvf-solver\n` +
        `Error: ${(error as Error).message}`,
      );
    }

    return instance;
  }

  /**
   * Check if @rufvector/rvf-solver is available without creating an instance.
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await import('@rufvector/rvf-solver');
      return true;
    } catch {
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
  train(options: SolverTrainOptions): SolverTrainResult {
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
  acceptance(options?: SolverAcceptanceOptions): SolverAcceptanceManifest {
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
  policy(): SolverPolicyState | null {
    this.ensureAlive();
    return this.solver.policy() ?? null;
  }

  /**
   * Get the raw SHAKE-256 witness chain bytes.
   * Each entry is 73 bytes. Verifiable via @rufvector/rvf-wasm.
   */
  witnessChain(): Uint8Array | null {
    this.ensureAlive();
    return this.solver.witnessChain() ?? null;
  }

  /** Destroy the solver and free WASM resources */
  destroy(): void {
    if (this.solver && !this._destroyed) {
      this.solver.destroy();
      this._destroyed = true;
      this.solver = null;
    }
  }

  /** Check if the solver has been destroyed */
  get isDestroyed(): boolean {
    return this._destroyed;
  }

  // ─── Private helpers ───

  private ensureAlive(): void {
    if (this._destroyed || !this.solver) {
      throw new Error('Solver has been destroyed. Create a new instance.');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapModeResult(raw: any): SolverModeResult {
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
  private mapCycleMetrics(c: any): SolverCycleMetrics {
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
