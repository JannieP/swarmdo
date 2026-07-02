/**
 * IntelligenceStore - SQLite persistence for RuVector intelligence layer
 *
 * Uses sql.js (pure JS SQLite) as primary backend for cross-platform compatibility
 * Falls back to better-sqlite3 only if sql.js fails
 */
export interface StoredTrajectory {
    id: number;
    taskDescription: string;
    agent: string;
    steps: number;
    outcome: 'success' | 'failure' | 'partial';
    startTime: number;
    endTime: number;
    metadata?: string;
}
export interface StoredPattern {
    id: number;
    taskType: string;
    approach: string;
    embedding: Buffer;
    similarity: number;
    usageCount: number;
    successRate: number;
    createdAt: number;
    updatedAt: number;
}
export interface StoredRouting {
    id: number;
    task: string;
    recommendedAgent: string;
    confidence: number;
    latencyMs: number;
    wasSuccessful: boolean;
    timestamp: number;
}
export interface LearningStats {
    totalTrajectories: number;
    successfulTrajectories: number;
    totalRoutings: number;
    successfulRoutings: number;
    totalPatterns: number;
    sonaAdaptations: number;
    hnswQueries: number;
    lastUpdated: number;
}
export declare class IntelligenceStore {
    private db;
    private dbPath;
    private initialized;
    private initPromise;
    private static instance;
    private constructor();
    /**
     * Initialize the database (async to support sql.js)
     */
    private initialize;
    private doInitialize;
    /**
     * Ensure database is initialized before operations
     */
    private ensureInitialized;
    /**
     * Get singleton instance
     */
    static getInstance(dbPath?: string): IntelligenceStore;
    /**
     * Get default database path (cross-platform)
     */
    static getDefaultPath(): string;
    /**
     * Initialize database schema
     */
    private initSchema;
    /**
     * Start a new trajectory
     */
    startTrajectory(taskDescription: string, agent: string): Promise<number>;
    /**
     * Add step to trajectory
     */
    addTrajectoryStep(trajectoryId: number): Promise<void>;
    /**
     * End trajectory with outcome
     */
    endTrajectory(trajectoryId: number, outcome: 'success' | 'failure' | 'partial', metadata?: Record<string, any>): Promise<void>;
    /**
     * Get active trajectories (no end_time)
     */
    getActiveTrajectories(): Promise<StoredTrajectory[]>;
    /**
     * Get recent trajectories
     */
    getRecentTrajectories(limit?: number): Promise<StoredTrajectory[]>;
    /**
     * Store a pattern
     */
    storePattern(taskType: string, approach: string, embedding?: Float32Array): Promise<number>;
    /**
     * Update pattern usage
     */
    updatePatternUsage(patternId: number, wasSuccessful: boolean): Promise<void>;
    /**
     * Find patterns by task type
     */
    findPatterns(taskType: string, limit?: number): Promise<StoredPattern[]>;
    /**
     * Record a routing decision
     */
    recordRouting(task: string, recommendedAgent: string, confidence: number, latencyMs: number): Promise<number>;
    /**
     * Update routing outcome
     */
    updateRoutingOutcome(routingId: number, wasSuccessful: boolean): Promise<void>;
    /**
     * Get routing accuracy for an agent
     */
    getAgentAccuracy(agent: string): Promise<{
        total: number;
        successful: number;
        accuracy: number;
    }>;
    /**
     * Get all stats
     */
    getStats(): Promise<LearningStats>;
    /**
     * Increment a stat counter
     */
    incrementStat(statName: string, amount?: number): Promise<void>;
    /**
     * Record SONA adaptation
     */
    recordSonaAdaptation(): Promise<void>;
    /**
     * Record HNSW query
     */
    recordHnswQuery(): Promise<void>;
    /**
     * Get summary for display (simplified for UI)
     */
    getSummary(): Promise<{
        trajectories: number;
        routings: number;
        patterns: number;
        operations: number;
    }>;
    /**
     * Get detailed summary for reports
     */
    getDetailedSummary(): Promise<{
        trajectories: {
            total: number;
            active: number;
            successful: number;
        };
        routings: {
            total: number;
            accuracy: number;
        };
        patterns: number;
        operations: {
            sona: number;
            hnsw: number;
        };
    }>;
    /**
     * Close database connection
     */
    close(): void;
    /**
     * Reset all data (for testing)
     */
    reset(): Promise<void>;
}
export declare function getIntelligenceStore(dbPath?: string): IntelligenceStore;
//# sourceMappingURL=IntelligenceStore.d.ts.map