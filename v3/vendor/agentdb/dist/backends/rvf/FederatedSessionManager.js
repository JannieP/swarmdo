/**
 * FederatedSessionManager - Cross-Session Federated Learning for AgentDB
 *
 * Wraps @rufvector/rufllm's EphemeralAgent + FederatedCoordinator to provide:
 * - Agent-scoped trajectory recording per session
 * - Federated aggregation across all agent sessions
 * - Warm-start pattern loading for new sessions
 * - LoRA adapter management for task-specific fine-tuning
 * - Continual learning pipeline with EWC++ protection
 *
 * Architecture:
 *   Session 1 → EphemeralAgent → aggregate() → FederatedCoordinator → getInitialPatterns()
 *   Session 2 → EphemeralAgent → aggregate() ↗                      → warm-start new sessions
 *   Session N → EphemeralAgent → aggregate() ↗
 *
 * Security:
 * - Operates on embeddings only (no user text stored in trajectories)
 * - Agent IDs validated (length, format)
 * - Dimension bounded (1-4096)
 * - Max agents bounded (1-1000)
 * - Quality scores clamped to [0, 1]
 * - LoRA rank bounded (1-64)
 * - Trajectory state is serializable JSON (no executable code)
 */
// Bounds
const MAX_DIMENSION = 4096;
const MAX_AGENTS = 1000;
const MAX_LORA_RANK = 64;
const MAX_AGENT_ID_LENGTH = 256;
const MAX_PATTERNS_K = 100;
/**
 * FederatedSessionManager - Orchestrates cross-session federated learning
 */
export class FederatedSessionManager {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coordinator = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activeSessions = new Map();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loraManager = null;
    dim;
    config;
    _destroyed = false;
    constructor(config) {
        this.dim = config.dimension;
        this.config = config;
    }
    /**
     * Create a new federated session manager.
     * Lazy-loads @rufvector/rufllm to avoid hard dependency.
     */
    static async create(config) {
        if (!Number.isFinite(config.dimension) || config.dimension < 1 || config.dimension > MAX_DIMENSION) {
            throw new Error(`dimension must be between 1 and ${MAX_DIMENSION}`);
        }
        const instance = new FederatedSessionManager(config);
        const maxAgents = Math.min(Math.max(1, config.maxAgents ?? 100), MAX_AGENTS);
        const loraRank = Math.min(Math.max(1, config.loraRank ?? 4), MAX_LORA_RANK);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ruvllm = await import('@rufvector/rufllm');
            instance.coordinator = new ruvllm.FederatedCoordinator({
                dimension: config.dimension,
                maxAgents,
            });
            if (config.qualityThreshold !== undefined) {
                instance.coordinator.setQualityThreshold(Math.min(Math.max(0, config.qualityThreshold), 1));
            }
            if (config.consolidationInterval !== undefined) {
                instance.coordinator.setConsolidationInterval(Math.max(1, config.consolidationInterval));
            }
            // Initialize LoRA manager for task-specific adapters
            instance.loraManager = new ruvllm.LoraManager();
            // Create a default adapter
            instance.loraManager.create('default', {
                inputDim: config.dimension,
                outputDim: config.dimension,
                rank: loraRank,
                alpha: config.loraAlpha ?? loraRank * 2,
            });
            instance.loraManager.activate('default');
        }
        catch (error) {
            throw new Error(`Federated session manager initialization failed.\n` +
                `Install with: npm install @rufvector/rufllm\n` +
                `Error: ${error.message}`);
        }
        return instance;
    }
    /**
     * Check if @rufvector/rufllm is available.
     */
    static async isAvailable() {
        try {
            await import('@rufvector/rufllm');
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Begin a new agent session.
     * Returns a session handle for recording trajectories.
     *
     * @param agentId - Unique identifier for this agent session
     * @param warmStart - Whether to load initial patterns from coordinator (default: true)
     */
    async beginSession(agentId, warmStart = true) {
        this.ensureAlive();
        this.validateAgentId(agentId);
        if (this.activeSessions.has(agentId)) {
            throw new Error(`Session already active for agent: ${agentId}`);
        }
        const agent = this.coordinator.createAgent(agentId);
        this.activeSessions.set(agentId, agent);
        // Warm-start with coordinator patterns
        let initialPatterns = [];
        if (warmStart) {
            initialPatterns = this.coordinator.getInitialPatterns(10);
        }
        return new SessionHandle(agentId, agent, this, initialPatterns, this.dim);
    }
    /**
     * End a session, aggregate its trajectories, and clean up.
     *
     * @param agentId - The agent session to end
     * @returns Session statistics
     */
    endSession(agentId) {
        this.ensureAlive();
        const agent = this.activeSessions.get(agentId);
        if (!agent) {
            throw new Error(`No active session for agent: ${agentId}`);
        }
        // Force learn to extract patterns
        agent.forceLearn();
        // Aggregate into coordinator
        this.coordinator.aggregate(agent);
        // Extract stats before cleanup
        const stats = {
            trajectoryCount: agent.trajectoryCount(),
            avgQuality: agent.avgQuality() || 0,
            patternsLearned: agent.getPatterns(MAX_PATTERNS_K).length,
            sessionDurationMs: agent.uptimeSeconds() * 1000,
        };
        this.activeSessions.delete(agentId);
        // Auto-consolidate if coordinator says it's time
        if (this.coordinator.shouldConsolidate()) {
            this.coordinator.forceConsolidate();
        }
        return stats;
    }
    /**
     * Export a session's state for persistence.
     * The state can be re-imported in a future session.
     */
    exportSession(agentId) {
        this.ensureAlive();
        const agent = this.activeSessions.get(agentId);
        if (!agent) {
            throw new Error(`No active session for agent: ${agentId}`);
        }
        return agent.exportState();
    }
    /**
     * Force consolidation across all aggregated agent data.
     * Useful for periodic maintenance (e.g., NightlyLearner).
     */
    consolidate() {
        this.ensureAlive();
        this.coordinator.forceConsolidate();
    }
    /**
     * Get warm-start patterns for a new session.
     */
    getInitialPatterns(k = 10) {
        this.ensureAlive();
        const safeK = Math.min(Math.max(1, k), MAX_PATTERNS_K);
        return this.coordinator.getInitialPatterns(safeK);
    }
    /**
     * Find patterns similar to a query embedding.
     */
    findPatterns(query, k = 5) {
        this.ensureAlive();
        if (query.length !== this.dim) {
            throw new Error(`Query dimension ${query.length} does not match configured dimension ${this.dim}`);
        }
        const safeK = Math.min(Math.max(1, k), MAX_PATTERNS_K);
        return this.coordinator.findPatterns(query, safeK);
    }
    /**
     * Apply the global LoRA transformation to an embedding.
     */
    applyLora(embedding) {
        this.ensureAlive();
        if (!this.loraManager) {
            return embedding;
        }
        return this.loraManager.forward(embedding);
    }
    /**
     * Create a task-specific LoRA adapter.
     */
    createAdapter(name, rank) {
        this.ensureAlive();
        if (!this.loraManager)
            return;
        const safeRank = Math.min(Math.max(1, rank ?? this.config.loraRank ?? 4), MAX_LORA_RANK);
        this.loraManager.create(name, {
            inputDim: this.dim,
            outputDim: this.dim,
            rank: safeRank,
            alpha: safeRank * 2,
        });
    }
    /**
     * Activate a specific LoRA adapter.
     */
    activateAdapter(name) {
        this.ensureAlive();
        if (!this.loraManager)
            return;
        this.loraManager.activate(name);
    }
    /**
     * List all registered LoRA adapters.
     */
    listAdapters() {
        if (!this.loraManager)
            return [];
        return this.loraManager.list();
    }
    /**
     * Get federated coordinator statistics.
     */
    getStats() {
        this.ensureAlive();
        const raw = this.coordinator.stats();
        const contributions = this.coordinator.getContributions();
        return {
            totalAgents: raw.totalAgents,
            totalTrajectories: raw.totalTrajectories,
            patternsLearned: raw.patternsLearned,
            avgQuality: raw.avgQuality,
            qualityThreshold: raw.qualityThreshold,
            contributions,
        };
    }
    /** Get the number of active sessions */
    get activeSessionCount() {
        return this.activeSessions.size;
    }
    /** Get the configured dimension */
    get dimension() {
        return this.dim;
    }
    /** Check if destroyed */
    get isDestroyed() {
        return this._destroyed;
    }
    /** Destroy the manager and all active sessions */
    destroy() {
        if (!this._destroyed) {
            this.activeSessions.clear();
            if (this.loraManager) {
                this.loraManager.clear();
                this.loraManager = null;
            }
            if (this.coordinator) {
                this.coordinator.clear();
                this.coordinator = null;
            }
            this._destroyed = true;
        }
    }
    // --- Internal ---
    /** @internal Record a trajectory from a session handle */
    _recordTrajectory(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agent, embedding, quality, route) {
        const safeQuality = Math.min(Math.max(0, quality), 1);
        if (route) {
            agent.processTaskWithRoute(embedding, route, safeQuality);
        }
        else {
            agent.processTask(embedding, safeQuality);
        }
    }
    validateAgentId(id) {
        if (!id || id.length === 0 || id.length > MAX_AGENT_ID_LENGTH) {
            throw new Error(`Agent ID must be 1-${MAX_AGENT_ID_LENGTH} characters`);
        }
        if (id.includes('\0')) {
            throw new Error('Agent ID must not contain null bytes');
        }
    }
    ensureAlive() {
        if (this._destroyed) {
            throw new Error('FederatedSessionManager has been destroyed. Create a new instance.');
        }
    }
}
/**
 * SessionHandle - Lightweight handle for recording trajectories within a session
 */
export class SessionHandle {
    agentId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agent;
    manager;
    _initialPatterns;
    _dim;
    _ended = false;
    /** @internal */
    constructor(agentId, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agent, manager, initialPatterns, dim) {
        this.agentId = agentId;
        this.agent = agent;
        this.manager = manager;
        this._initialPatterns = initialPatterns;
        this._dim = dim;
    }
    /**
     * Record a trajectory (embedding + quality score).
     *
     * @param embedding - The query/action embedding
     * @param quality - Quality score in [0.0, 1.0]
     * @param route - Optional route label (e.g., "math", "code")
     */
    recordTrajectory(embedding, quality, route) {
        this.ensureActive();
        const arr = embedding instanceof Float32Array ? Array.from(embedding) : embedding;
        if (arr.length !== this._dim) {
            throw new Error(`Embedding dimension ${arr.length} does not match configured dimension ${this._dim}`);
        }
        this.manager._recordTrajectory(this.agent, arr, quality, route);
    }
    /**
     * Get patterns learned during this session.
     */
    getPatterns(k = 10) {
        this.ensureActive();
        this.agent.forceLearn();
        return this.agent.getPatterns(Math.min(Math.max(1, k), MAX_PATTERNS_K));
    }
    /**
     * Get the initial warm-start patterns loaded at session start.
     */
    get initialPatterns() {
        return this._initialPatterns;
    }
    /**
     * Get current session statistics.
     */
    getStats() {
        this.ensureActive();
        return {
            trajectoryCount: this.agent.trajectoryCount(),
            avgQuality: this.agent.avgQuality() || 0,
            patternsLearned: this.agent.getPatterns(MAX_PATTERNS_K).length,
            sessionDurationMs: this.agent.uptimeSeconds() * 1000,
        };
    }
    /**
     * End this session and aggregate into the coordinator.
     */
    end() {
        this.ensureActive();
        this._ended = true;
        return this.manager.endSession(this.agentId);
    }
    /** The agent ID for this session */
    get id() {
        return this.agentId;
    }
    /** Whether this session has been ended */
    get isEnded() {
        return this._ended;
    }
    ensureActive() {
        if (this._ended) {
            throw new Error(`Session ${this.agentId} has already ended.`);
        }
    }
}
//# sourceMappingURL=FederatedSessionManager.js.map