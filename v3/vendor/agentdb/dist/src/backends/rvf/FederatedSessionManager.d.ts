/**
 * FederatedSessionManager - Cross-Session Federated Learning for AgentDB
 *
 * Wraps @swarmvector/swarmllm's EphemeralAgent + FederatedCoordinator to provide:
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
/** Configuration for the federated session manager */
export interface FederatedConfig {
    /** Embedding dimension (must match across all sessions) */
    dimension: number;
    /** Maximum number of concurrent agents (default: 100) */
    maxAgents?: number;
    /** Quality threshold for pattern inclusion (default: 0.4) */
    qualityThreshold?: number;
    /** Number of trajectories before auto-consolidation (default: 50) */
    consolidationInterval?: number;
    /** LoRA rank for adapter fine-tuning (default: 4) */
    loraRank?: number;
    /** LoRA alpha scaling (default: 8) */
    loraAlpha?: number;
    /** EWC lambda for catastrophic forgetting prevention (default: 100) */
    ewcLambda?: number;
}
/** Exported session state for persistence */
export interface SessionState {
    agentId: string;
    trajectories: TrajectoryRecord[];
    stats: SessionStats;
    sessionDurationMs: number;
    timestamp: string;
}
/** Individual trajectory record */
export interface TrajectoryRecord {
    embedding: number[];
    quality: number;
    route?: string;
    context?: string[];
    timestamp: number;
}
/** Session statistics */
export interface SessionStats {
    trajectoryCount: number;
    avgQuality: number;
    patternsLearned: number;
    sessionDurationMs: number;
}
/** Federated coordinator statistics */
export interface FederatedStats {
    totalAgents: number;
    totalTrajectories: number;
    patternsLearned: number;
    avgQuality: number;
    qualityThreshold: number;
    contributions: Record<string, number>;
}
/** Learned pattern from federated aggregation */
export interface FederatedPattern {
    id: string;
    type: string;
    embedding: number[];
    successRate: number;
    useCount: number;
    lastUsed: string;
}
/**
 * FederatedSessionManager - Orchestrates cross-session federated learning
 */
export declare class FederatedSessionManager {
    private coordinator;
    private activeSessions;
    private loraManager;
    private dim;
    private config;
    private _destroyed;
    private constructor();
    /**
     * Create a new federated session manager.
     * Lazy-loads @swarmvector/swarmllm to avoid hard dependency.
     */
    static create(config: FederatedConfig): Promise<FederatedSessionManager>;
    /**
     * Check if @swarmvector/swarmllm is available.
     */
    static isAvailable(): Promise<boolean>;
    /**
     * Begin a new agent session.
     * Returns a session handle for recording trajectories.
     *
     * @param agentId - Unique identifier for this agent session
     * @param warmStart - Whether to load initial patterns from coordinator (default: true)
     */
    beginSession(agentId: string, warmStart?: boolean): Promise<SessionHandle>;
    /**
     * End a session, aggregate its trajectories, and clean up.
     *
     * @param agentId - The agent session to end
     * @returns Session statistics
     */
    endSession(agentId: string): SessionStats;
    /**
     * Export a session's state for persistence.
     * The state can be re-imported in a future session.
     */
    exportSession(agentId: string): SessionState;
    /**
     * Force consolidation across all aggregated agent data.
     * Useful for periodic maintenance (e.g., NightlyLearner).
     */
    consolidate(): void;
    /**
     * Get warm-start patterns for a new session.
     */
    getInitialPatterns(k?: number): FederatedPattern[];
    /**
     * Find patterns similar to a query embedding.
     */
    findPatterns(query: number[], k?: number): FederatedPattern[];
    /**
     * Apply the global LoRA transformation to an embedding.
     */
    applyLora(embedding: number[]): number[];
    /**
     * Create a task-specific LoRA adapter.
     */
    createAdapter(name: string, rank?: number): void;
    /**
     * Activate a specific LoRA adapter.
     */
    activateAdapter(name: string): void;
    /**
     * List all registered LoRA adapters.
     */
    listAdapters(): string[];
    /**
     * Get federated coordinator statistics.
     */
    getStats(): FederatedStats;
    /** Get the number of active sessions */
    get activeSessionCount(): number;
    /** Get the configured dimension */
    get dimension(): number;
    /** Check if destroyed */
    get isDestroyed(): boolean;
    /** Destroy the manager and all active sessions */
    destroy(): void;
    /** @internal Record a trajectory from a session handle */
    _recordTrajectory(agent: any, embedding: number[], quality: number, route?: string): void;
    private validateAgentId;
    private ensureAlive;
}
/**
 * SessionHandle - Lightweight handle for recording trajectories within a session
 */
export declare class SessionHandle {
    private agentId;
    private agent;
    private manager;
    private _initialPatterns;
    private _dim;
    private _ended;
    /** @internal */
    constructor(agentId: string, agent: any, manager: FederatedSessionManager, initialPatterns: FederatedPattern[], dim: number);
    /**
     * Record a trajectory (embedding + quality score).
     *
     * @param embedding - The query/action embedding
     * @param quality - Quality score in [0.0, 1.0]
     * @param route - Optional route label (e.g., "math", "code")
     */
    recordTrajectory(embedding: number[] | Float32Array, quality: number, route?: string): void;
    /**
     * Get patterns learned during this session.
     */
    getPatterns(k?: number): FederatedPattern[];
    /**
     * Get the initial warm-start patterns loaded at session start.
     */
    get initialPatterns(): FederatedPattern[];
    /**
     * Get current session statistics.
     */
    getStats(): SessionStats;
    /**
     * End this session and aggregate into the coordinator.
     */
    end(): SessionStats;
    /** The agent ID for this session */
    get id(): string;
    /** Whether this session has been ended */
    get isEnded(): boolean;
    private ensureActive;
}
//# sourceMappingURL=FederatedSessionManager.d.ts.map