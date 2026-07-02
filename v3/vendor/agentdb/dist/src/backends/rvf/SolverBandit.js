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
/**
 * Thompson Sampling bandit with contextual arms.
 *
 * Usage:
 *   const bandit = new SolverBandit();
 *   const arm = bandit.selectArm('code_review', ['skill-a', 'skill-b', 'skill-c']);
 *   // ... execute the selected arm ...
 *   bandit.recordReward('code_review', arm, 0.85);
 */
export class SolverBandit {
    contexts = new Map();
    config;
    constructor(config) {
        this.config = {
            costWeight: config?.costWeight ?? 0.01,
            costDecay: config?.costDecay ?? 0.1,
            explorationBonus: config?.explorationBonus ?? 0.1,
        };
    }
    /**
     * Select the best arm for a given context using Thompson Sampling.
     *
     * For each candidate arm, samples from its Beta(alpha, beta) distribution
     * and subtracts a cost penalty. Returns the arm with the highest score.
     * Unknown arms get an exploration bonus.
     */
    selectArm(contextKey, armKeys) {
        if (armKeys.length === 0)
            throw new Error('No arms provided');
        if (armKeys.length === 1)
            return armKeys[0];
        const ctx = this.contexts.get(contextKey);
        let bestArm = armKeys[0];
        let bestScore = -Infinity;
        for (const arm of armKeys) {
            const stats = ctx?.get(arm);
            let score;
            if (!stats || stats.pulls === 0) {
                // Unknown arm: sample from uniform + exploration bonus
                score = Math.random() + this.config.explorationBonus;
            }
            else {
                // Thompson sample from Beta(alpha, beta)
                const sample = this.sampleBeta(stats.alpha, stats.beta);
                score = sample - stats.costEma * this.config.costWeight;
            }
            if (score > bestScore) {
                bestScore = score;
                bestArm = arm;
            }
        }
        return bestArm;
    }
    /**
     * Record the outcome of pulling an arm.
     *
     * @param contextKey - The context bucket (e.g., task type)
     * @param armKey - The arm that was pulled (e.g., skill name)
     * @param reward - Success signal in [0, 1]
     * @param cost - Optional cost signal (latency, tokens, etc.)
     */
    recordReward(contextKey, armKey, reward, cost) {
        if (!this.contexts.has(contextKey)) {
            this.contexts.set(contextKey, new Map());
        }
        const ctx = this.contexts.get(contextKey);
        if (!ctx.has(armKey)) {
            ctx.set(armKey, { alpha: 1, beta: 1, pulls: 0, totalReward: 0, costEma: 0 });
        }
        const arm = ctx.get(armKey);
        // Update Beta distribution
        const r = Math.max(0, Math.min(1, reward));
        arm.alpha += r;
        arm.beta += (1 - r);
        arm.pulls++;
        arm.totalReward += r;
        // Update cost EMA
        if (cost !== undefined) {
            arm.costEma = arm.costEma * (1 - this.config.costDecay) + cost * this.config.costDecay;
        }
    }
    /**
     * Rerank a list of candidates using bandit scores.
     * Returns indices sorted by Thompson-sampled score (best first).
     */
    rerank(contextKey, armKeys) {
        if (armKeys.length <= 1)
            return [...armKeys];
        const ctx = this.contexts.get(contextKey);
        const scored = armKeys.map(arm => {
            const stats = ctx?.get(arm);
            let score;
            if (!stats || stats.pulls === 0) {
                score = Math.random() + this.config.explorationBonus;
            }
            else {
                score = this.sampleBeta(stats.alpha, stats.beta) - stats.costEma * this.config.costWeight;
            }
            return { arm, score };
        });
        scored.sort((a, b) => b.score - a.score);
        return scored.map(s => s.arm);
    }
    /** Get arm stats for a specific context */
    getArmStats(contextKey, armKey) {
        return this.contexts.get(contextKey)?.get(armKey) ?? null;
    }
    /** Get aggregate statistics */
    getStats() {
        let totalArms = 0, totalPulls = 0, totalReward = 0;
        for (const ctx of this.contexts.values()) {
            totalArms += ctx.size;
            for (const arm of ctx.values()) {
                totalPulls += arm.pulls;
                totalReward += arm.totalReward;
            }
        }
        return { contexts: this.contexts.size, totalArms, totalPulls, totalReward };
    }
    /** Serialize to JSON-safe state */
    serialize() {
        const contexts = {};
        for (const [ctxKey, arms] of this.contexts) {
            contexts[ctxKey] = {};
            for (const [armKey, stats] of arms) {
                contexts[ctxKey][armKey] = { ...stats };
            }
        }
        return { version: 1, config: { ...this.config }, contexts };
    }
    /** Restore from serialized state */
    static deserialize(state) {
        const bandit = new SolverBandit(state.config);
        for (const [ctxKey, arms] of Object.entries(state.contexts)) {
            const ctx = new Map();
            for (const [armKey, stats] of Object.entries(arms)) {
                ctx.set(armKey, { ...stats });
            }
            bandit.contexts.set(ctxKey, ctx);
        }
        return bandit;
    }
    /** Reset all learned state */
    reset() {
        this.contexts.clear();
    }
    // ─── Private ───
    /**
     * Sample from Beta(a, b) using the Jöhnk algorithm.
     * Fast approximation for typical bandit parameters.
     */
    sampleBeta(a, b) {
        // For a=1, b=1 (uniform): just return Math.random()
        if (a <= 1 && b <= 1)
            return Math.random();
        // Jöhnk's algorithm for general Beta
        if (a < 1 && b < 1) {
            for (let iter = 0; iter < 1000; iter++) {
                const u = Math.random();
                const v = Math.random();
                const x = Math.pow(u, 1 / a);
                const y = Math.pow(v, 1 / b);
                if (x + y <= 1)
                    return x / (x + y);
            }
            return Math.random(); // fallback (extremely unlikely)
        }
        // For larger parameters, use Gamma ratio
        const ga = this.sampleGamma(a);
        const gb = this.sampleGamma(b);
        return ga / (ga + gb);
    }
    /**
     * Sample from Gamma(shape, 1) using Marsaglia & Tsang's method.
     */
    sampleGamma(shape) {
        if (shape < 1) {
            return this.sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
        }
        const d = shape - 1 / 3;
        const c = 1 / Math.sqrt(9 * d);
        for (let iter = 0; iter < 1000; iter++) {
            let x, v;
            do {
                x = this.sampleNormal();
                v = 1 + c * x;
            } while (v <= 0);
            v = v * v * v;
            const u = Math.random();
            if (u < 1 - 0.0331 * (x * x) * (x * x))
                return d * v;
            if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v)))
                return d * v;
        }
        return d; // fallback (extremely unlikely)
    }
    /** Box-Muller normal sample */
    sampleNormal() {
        const u1 = Math.random();
        const u2 = Math.random();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
}
//# sourceMappingURL=SolverBandit.js.map