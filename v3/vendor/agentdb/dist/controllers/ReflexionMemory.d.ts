/**
 * ReflexionMemory - Episodic Replay Memory System
 *
 * Implements reflexion-style episodic replay for agent self-improvement.
 * Stores self-critiques and outcomes, retrieves relevant past experiences.
 *
 * Based on: "Reflexion: Language Agents with Verbal Reinforcement Learning"
 * https://arxiv.org/abs/2303.11366
 */
import type { IDatabaseConnection } from '../types/database.types.js';
import { EmbeddingService } from './EmbeddingService.js';
import type { VectorBackend } from '../backends/VectorBackend.js';
import type { LearningBackend } from '../backends/LearningBackend.js';
import type { GraphBackend } from '../backends/GraphBackend.js';
import { type QueryCacheConfig } from '../core/QueryCache.js';
export interface Episode {
    id?: number;
    ts?: number;
    sessionId: string;
    task: string;
    input?: string;
    output?: string;
    critique?: string;
    reward: number;
    success: boolean;
    latencyMs?: number;
    tokensUsed?: number;
    tags?: string[];
    metadata?: Record<string, any>;
}
export interface EpisodeWithEmbedding extends Episode {
    embedding?: Float32Array;
    similarity?: number;
}
export interface ReflexionQuery {
    task: string;
    currentState?: string;
    k?: number;
    minReward?: number;
    onlyFailures?: boolean;
    onlySuccesses?: boolean;
    timeWindowDays?: number;
}
export declare class ReflexionMemory {
    private db;
    private embedder;
    private vectorBackend?;
    private learningBackend?;
    private graphBackend?;
    private queryCache;
    constructor(db: IDatabaseConnection, embedder: EmbeddingService, vectorBackend?: VectorBackend, learningBackend?: LearningBackend, graphBackend?: GraphBackend, cacheConfig?: QueryCacheConfig);
    /**
     * Store a new episode with its critique and outcome
     * Invalidates relevant cache entries
     *
     * Persistence guarantee (issue #128 fix):
     *   storeEpisode() always writes to the SQLite `episodes` and
     *   `episode_embeddings` tables when a SQL-capable connection is present,
     *   even when a graph or vector backend handles the primary index. This
     *   ensures data survives process restarts (graph/vector backends are
     *   often in-memory or rebuildable from SQL).
     */
    storeEpisode(episode: Episode): Promise<number>;
    /**
     * Retrieve relevant past episodes for a new task attempt
     * Results are cached for improved performance
     */
    retrieveRelevant(query: ReflexionQuery): Promise<EpisodeWithEmbedding[]>;
    /**
     * Prepare and enhance query embedding for search
     */
    private prepareQueryEmbedding;
    /**
     * Retrieve episodes using GraphDatabaseAdapter (AgentDB v2)
     */
    private retrieveFromGraphAdapter;
    /**
     * Retrieve episodes using generic GraphBackend
     */
    private retrieveFromGenericGraph;
    /**
     * Retrieve episodes using VectorBackend (150x faster)
     */
    private retrieveFromVectorBackend;
    /**
     * Retrieve episodes using SQL-based similarity search (fallback)
     */
    private retrieveFromSQLFallback;
    /**
     * Apply episode filters to search results
     */
    private applyEpisodeFilters;
    /**
     * Check if database row passes episode filters
     */
    private passesEpisodeFilters;
    /**
     * Build Cypher query with filters
     */
    private buildCypherQuery;
    /**
     * Build SQL WHERE clause and parameters for filters
     */
    private buildSQLFilters;
    /**
     * Fetch episodes by IDs from database
     */
    private fetchEpisodesByIds;
    /**
     * Convert GraphDatabaseAdapter episode to EpisodeWithEmbedding
     */
    private convertGraphEpisode;
    /**
     * Convert Cypher query result to EpisodeWithEmbedding
     */
    private convertCypherEpisode;
    /**
     * Convert database row to EpisodeWithEmbedding
     */
    private convertDatabaseEpisode;
    /**
     * Get statistics for a task (cached)
     */
    getTaskStats(task: string, timeWindowDays?: number): {
        totalAttempts: number;
        successRate: number;
        avgReward: number;
        avgLatency: number;
        improvementTrend: number;
    };
    /**
     * Build critique summary from similar failed episodes (cached)
     */
    getCritiqueSummary(query: ReflexionQuery): Promise<string>;
    /**
     * Get successful strategies for a task (cached)
     */
    getSuccessStrategies(query: ReflexionQuery): Promise<string>;
    /**
     * Get recent episodes for a session
     */
    getRecentEpisodes(sessionId: string, limit?: number): Promise<Episode[]>;
    /**
     * Prune low-quality episodes based on TTL and quality threshold
     * Invalidates cache on completion
     */
    pruneEpisodes(config: {
        minReward?: number;
        maxAgeDays?: number;
        keepMinPerTask?: number;
    }): number;
    private buildEpisodeText;
    private storeEmbedding;
    private serializeEmbedding;
    private deserializeEmbedding;
    private cosineSimilarity;
    /**
     * Create graph node for episode with relationships
     */
    private createEpisodeGraphNode;
    /**
     * Enhance query embedding using GNN attention mechanism
     */
    private enhanceQueryWithGNN;
    /**
     * Get graph-based episode relationships
     */
    getEpisodeRelationships(episodeId: number): Promise<{
        similar: number[];
        session: string;
        learnedFrom: number[];
    }>;
    /**
     * Train GNN model on accumulated samples
     */
    trainGNN(options?: {
        epochs?: number;
    }): Promise<void>;
    /**
     * Get learning backend statistics
     */
    getLearningStats(): import("../backends/LearningBackend.js").LearningStats | null;
    /**
     * Get graph backend statistics
     */
    getGraphStats(): import("../backends/GraphBackend.js").GraphStats | null;
    /**
     * Get query cache statistics
     */
    getCacheStats(): import("../core/QueryCache.js").CacheStatistics;
    /**
     * Clear query cache
     */
    clearCache(): void;
    /**
     * Prune expired cache entries
     */
    pruneCache(): number;
    /**
     * Warm cache with common queries
     */
    warmCache(sessionId?: string): Promise<void>;
    /**
     * Delete an episode by id. Closes the gap from issue #150 (downstream:
     * ruflo#1784, RuVector#427) — once an episode is written there was no
     * first-class way to remove it through any backend.
     *
     * Strategy mirrors storeEpisode: when a graph backend is present we go
     * through it (`graphAdapter.deleteNode` / `graphBackend.deleteNode` —
     * both Cypher-backed under the hood), and we ALWAYS also purge the SQL
     * `episodes` and `episode_embeddings` rows so durable storage stays in
     * sync. Vector backend entries are removed too when present.
     *
     * @returns True if the episode existed in any backend and was removed.
     */
    deleteEpisode(id: number | string): Promise<boolean>;
    /**
     * Dual-write helper for issue #128.
     *
     * Inserts the given episode into the SQLite `episodes` and
     * `episode_embeddings` tables when the underlying connection supports it.
     * Used when a graph or vector backend handles the primary index but the
     * caller still wants restart-safe persistence.
     *
     * Errors are swallowed and logged — the primary write to the graph/vector
     * backend has already succeeded, and we don't want to fail the caller if
     * SQL persistence is unavailable (e.g. read-only DB, schema not present).
     */
    private dualWriteEpisodeToSQL;
    /**
     * Rebuild the in-memory vector index from the SQLite `episodes` /
     * `episode_embeddings` tables, going through the proper backend channels
     * so `retrieveRelevant()` sees the data afterwards.
     *
     * Fixes the user's recovery use-case from issue #129: rather than calling
     * `vectorBackend.getInner().insert()` directly (which bypasses the
     * GuardedBackend wrapper and confuses retrieveRelevant), call this method
     * to re-hydrate the vector and graph indices from durable storage.
     *
     * Returns the number of episodes re-indexed. No-ops cleanly when the SQL
     * tables are empty or absent.
     */
    rebuildIndex(options?: {
        fromTimestamp?: number;
    }): Promise<number>;
}
//# sourceMappingURL=ReflexionMemory.d.ts.map