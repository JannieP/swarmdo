/**
 * SolverBandit - Thompson Sampling bandit for AgentDB decisions (ADR-010)
 *
 * General-purpose multi-armed bandit inspired by @rufvector/rvf-solver's
 * 18-bucket architecture. Provides explore/exploit decisions for any
 * context-dependent selection problem (skills, patterns, algorithms, tiers).
 *
 * Architecture:
 * - Contextual: separate Beta distributions per (context, arm) pair
 * - Two-signal: tracks both success rate (Beta) and cost (EMA)
 * - Serializable: full state can be persisted to JSON for cross-session learning
 */
/** Per-arm statistics */
export interface BanditArmStats {
    alpha: number;
    beta: number;
    pulls: number;
    totalReward: number;
    costEma: number;
}
/** Bandit configuration */
export interface BanditConfig {
    /** Cost weight in score calculation (default: 0.01) */
    costWeight?: number;
    /** EMA decay factor for cost tracking (default: 0.1) */
    costDecay?: number;
    /** Exploration bonus for under-sampled arms (default: 0.1) */
    explorationBonus?: number;
}
/** Aggregate statistics */
export interface BanditStats {
    contexts: number;
    totalArms: number;
    totalPulls: number;
    totalReward: number;
}
/** Serialized state */
export interface BanditState {
    version: 1;
    config: Required<BanditConfig>;
    contexts: Record<string, Record<string, BanditArmStats>>;
}
/**
 * Thompson Sampling bandit with contextual arms.
 *
 * Usage:
 *   const bandit = new SolverBandit();
 *   const arm = bandit.selectArm('code_review', ['skill-a', 'skill-b', 'skill-c']);
 *   // ... execute the selected arm ...
 *   bandit.recordReward('code_review', arm, 0.85);
 */
export declare class SolverBandit {
    private contexts;
    private config;
    constructor(config?: BanditConfig);
    /**
     * Select the best arm for a given context using Thompson Sampling.
     *
     * For each candidate arm, samples from its Beta(alpha, beta) distribution
     * and subtracts a cost penalty. Returns the arm with the highest score.
     * Unknown arms get an exploration bonus.
     */
    selectArm(contextKey: string, armKeys: string[]): string;
    /**
     * Record the outcome of pulling an arm.
     *
     * @param contextKey - The context bucket (e.g., task type)
     * @param armKey - The arm that was pulled (e.g., skill name)
     * @param reward - Success signal in [0, 1]
     * @param cost - Optional cost signal (latency, tokens, etc.)
     */
    recordReward(contextKey: string, armKey: string, reward: number, cost?: number): void;
    /**
     * Rerank a list of candidates using bandit scores.
     * Returns indices sorted by Thompson-sampled score (best first).
     */
    rerank(contextKey: string, armKeys: string[]): string[];
    /** Get arm stats for a specific context */
    getArmStats(contextKey: string, armKey: string): BanditArmStats | null;
    /** Get aggregate statistics */
    getStats(): BanditStats;
    /** Serialize to JSON-safe state */
    serialize(): BanditState;
    /** Restore from serialized state */
    static deserialize(state: BanditState): SolverBandit;
    /** Reset all learned state */
    reset(): void;
    /**
     * Sample from Beta(a, b) using the Jöhnk algorithm.
     * Fast approximation for typical bandit parameters.
     */
    private sampleBeta;
    /**
     * Sample from Gamma(shape, 1) using Marsaglia & Tsang's method.
     */
    private sampleGamma;
    /** Box-Muller normal sample */
    private sampleNormal;
}
//# sourceMappingURL=SolverBandit.d.ts.map