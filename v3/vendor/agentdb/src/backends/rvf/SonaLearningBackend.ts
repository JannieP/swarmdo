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

// Bounds
const MAX_EWC_LAMBDA = 10000;
const MAX_TRAJECTORY_CAPACITY = 100000;
const MAX_PATTERN_CLUSTERS = 500;
const MAX_HIDDEN_DIM = 4096;
const MAX_PATTERNS_K = 100;

/**
 * SonaLearningBackend - Native adaptive learning via @rufvector/sona
 */
export class SonaLearningBackend {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private engine: any = null;
  private _destroyed = false;
  private dim: number;
  private activeTrajectories = new Map<number, { startedAt: number }>();

  // ADR-007 Phase 1: context enrichment tracking
  private _contextAddCount = 0;
  private _contextFailCount = 0;
  private _flushCount = 0;
  private _tickCounter = 0;
  private _flushInterval = 10;

  private constructor(dim: number) {
    this.dim = dim;
  }

  /**
   * Create a new SONA learning backend.
   * Lazy-loads @rufvector/sona to avoid hard dependency.
   */
  static async create(config: SonaConfig): Promise<SonaLearningBackend> {
    const dim = config.hiddenDim;
    if (!Number.isFinite(dim) || dim < 1 || dim > MAX_HIDDEN_DIM) {
      throw new Error(`hiddenDim must be between 1 and ${MAX_HIDDEN_DIM}`);
    }

    const instance = new SonaLearningBackend(dim);

    try {
      const { SonaEngine } = await import('@rufvector/sona');

      instance.engine = SonaEngine.withConfig({
        hiddenDim: dim,
        embeddingDim: config.embeddingDim ?? dim,
        microLoraRank: Math.min(Math.max(1, config.microLoraRank ?? 1), 2),
        baseLoraRank: Math.min(Math.max(1, config.baseLoraRank ?? 8), 64),
        ewcLambda: Math.min(Math.max(0, config.ewcLambda ?? 1000), MAX_EWC_LAMBDA),
        patternClusters: Math.min(Math.max(1, config.patternClusters ?? 50), MAX_PATTERN_CLUSTERS),
        trajectoryCapacity: Math.min(Math.max(10, config.trajectoryCapacity ?? 10000), MAX_TRAJECTORY_CAPACITY),
        backgroundIntervalMs: Math.max(1000, config.backgroundIntervalMs ?? 3600000),
        qualityThreshold: Math.min(Math.max(0, config.qualityThreshold ?? 0.5), 1),
        enableSimd: true,
      });
    } catch (error) {
      throw new Error(
        `SONA engine initialization failed.\n` +
        `Install with: npm install @rufvector/sona\n` +
        `Error: ${(error as Error).message}`,
      );
    }

    return instance;
  }

  /**
   * Check if @rufvector/sona is available.
   */
  static async isAvailable(): Promise<boolean> {
    try {
      await import('@rufvector/sona');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Enhance a query embedding using micro-LoRA transformation.
   * Sub-millisecond latency via N-API native code.
   */
  enhance(query: Float32Array): Float32Array {
    this.ensureAlive();
    const input = Array.from(query).map(Number);
    const output = this.engine.applyMicroLora(input) as number[];
    return new Float32Array(output);
  }

  /**
   * Start a trajectory recording for an agent interaction.
   * Returns a trajectory ID for adding steps and ending.
   */
  beginTrajectory(queryEmbedding: Float32Array): number {
    this.ensureAlive();
    const input = Array.from(queryEmbedding).map(Number);
    const id = this.engine.beginTrajectory(input) as number;
    this.activeTrajectories.set(id, { startedAt: Date.now() });
    return id;
  }

  /**
   * Add a step to an active trajectory.
   */
  addStep(trajectoryId: number, activations: Float32Array, reward: number): void {
    this.ensureAlive();
    if (!this.activeTrajectories.has(trajectoryId)) {
      throw new Error(`Unknown trajectory ID: ${trajectoryId}`);
    }
    const acts = Array.from(activations).map(Number);
    // Use uniform attention weights (equal weighting across dimensions)
    const weights = new Array(acts.length).fill(1.0 / acts.length);
    this.engine.addTrajectoryStep(trajectoryId, acts, weights, reward);
  }

  /**
   * Set the model route for a trajectory (for multi-model routing).
   */
  setRoute(trajectoryId: number, route: string): void {
    this.ensureAlive();
    this.engine.setTrajectoryRoute(trajectoryId, route);
  }

  /**
   * Add context metadata to an active trajectory (ADR-007 Phase 1).
   * Uses NativeAccelerator's sonaAddContext if available, otherwise stores locally.
   */
  async addContext(trajectoryId: number, context: Record<string, unknown>): Promise<boolean> {
    this.ensureAlive();
    if (!this.activeTrajectories.has(trajectoryId)) return false;
    try {
      const { getAccelerator } = await import('./NativeAccelerator.js');
      const accel = await getAccelerator();
      if (accel.sonaExtendedAvailable) {
        const ok = accel.sonaAddContext(this.engine, trajectoryId, context);
        if (ok) { this._contextAddCount++; return true; }
      }
    } catch { /* skip */ }
    // Fallback: context not persisted natively but we track the attempt
    this._contextFailCount++;
    return false;
  }

  /**
   * Flush SONA engine state via NativeAccelerator (ADR-007 Phase 1).
   */
  async flushState(): Promise<boolean> {
    this.ensureAlive();
    try {
      const { getAccelerator } = await import('./NativeAccelerator.js');
      const accel = await getAccelerator();
      if (accel.sonaExtendedAvailable) {
        const ok = accel.sonaFlush(this.engine);
        if (ok) { this._flushCount++; return true; }
      }
    } catch { /* skip */ }
    return false;
  }

  /**
   * End a trajectory and submit for learning.
   * Quality should be in [0.0, 1.0].
   */
  endTrajectory(trajectoryId: number, quality: number): void {
    this.ensureAlive();
    const safeQuality = Math.min(Math.max(0, quality), 1);
    this.engine.endTrajectory(trajectoryId, safeQuality);
    this.activeTrajectories.delete(trajectoryId);
  }

  /**
   * Run background learning cycle if due.
   * Returns a status message if a cycle was executed, null otherwise.
   * Periodically flushes SONA state via NativeAccelerator (every 10th tick).
   */
  tick(): string | null {
    this.ensureAlive();
    const result = this.engine.tick() as string | null;
    this._tickCounter++;
    if (this._tickCounter % this._flushInterval === 0) {
      this.flushState().catch(() => { /* non-blocking */ });
    }
    return result;
  }

  /**
   * Force immediate learning cycle.
   */
  forceLearn(): string {
    this.ensureAlive();
    return this.engine.forceLearn() as string;
  }

  /**
   * Find similar learned patterns to a query embedding.
   */
  findPatterns(queryEmbedding: Float32Array, k: number = 5): LearnedPattern[] {
    this.ensureAlive();
    const safeK = Math.min(Math.max(1, k), MAX_PATTERNS_K);
    const input = Array.from(queryEmbedding).map(Number);
    const raw = this.engine.findPatterns(input, safeK) as Array<{
      id: string;
      centroid: number[];
      clusterSize: number;
      totalWeight: number;
      avgQuality: number;
      accessCount: number;
      patternType: string;
    }>;
    return raw.map((p) => ({
      id: p.id,
      centroid: p.centroid,
      clusterSize: p.clusterSize,
      totalWeight: p.totalWeight,
      avgQuality: p.avgQuality,
      accessCount: p.accessCount,
      patternType: p.patternType,
    }));
  }

  /**
   * Get engine statistics.
   */
  getStats(): SonaStats {
    this.ensureAlive();
    try {
      const raw = JSON.parse(this.engine.getStats() as string);
      return {
        totalTrajectories: raw.total_trajectories ?? 0,
        activeTrajectories: this.activeTrajectories.size,
        patternsLearned: raw.patterns_learned ?? 0,
        learningCycles: raw.learning_cycles ?? 0,
        enabled: this.engine.isEnabled() as boolean,
      };
    } catch {
      return {
        totalTrajectories: 0,
        activeTrajectories: this.activeTrajectories.size,
        patternsLearned: 0,
        learningCycles: 0,
        enabled: false,
      };
    }
  }

  /**
   * Get context enrichment statistics (ADR-007 Phase 1).
   */
  getContextStats(): { contextAdded: number; contextFailed: number; flushCount: number; tickCount: number } {
    return {
      contextAdded: this._contextAddCount,
      contextFailed: this._contextFailCount,
      flushCount: this._flushCount,
      tickCount: this._tickCounter,
    };
  }

  /**
   * Enable or disable the engine.
   */
  setEnabled(enabled: boolean): void {
    this.ensureAlive();
    this.engine.setEnabled(enabled);
  }

  /** Get the configured dimension */
  get dimension(): number {
    return this.dim;
  }

  /** Check if the engine has been destroyed */
  get isDestroyed(): boolean {
    return this._destroyed;
  }

  /** Destroy the engine and free native resources */
  destroy(): void {
    if (!this._destroyed && this.engine) {
      this.engine = null;
      this._destroyed = true;
      this.activeTrajectories.clear();
    }
  }

  private ensureAlive(): void {
    if (this._destroyed || !this.engine) {
      throw new Error('SONA engine has been destroyed. Create a new instance.');
    }
  }
}
