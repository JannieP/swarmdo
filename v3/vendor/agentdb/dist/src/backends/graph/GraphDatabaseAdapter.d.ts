/**
 * SwarmVector Graph Database Adapter - Primary Database for AgentDB v2
 *
 * Replaces SQLite with SwarmVector's graph database for:
 * - Episodes as nodes with vector embeddings
 * - Skills as nodes with code embeddings
 * - Causal relationships as hyperedges
 * - Cypher queries instead of SQL
 *
 * Features:
 * - 10x faster than WASM SQLite
 * - ACID transactions with persistence
 * - Vector similarity search integrated
 * - Hypergraph support for complex relationships
 * - Neo4j-compatible Cypher syntax
 */
type JsNode = {
    id: string;
    embedding: Float32Array;
    labels?: Array<string>;
    properties?: Record<string, string>;
};
type JsEdge = {
    from: string;
    to: string;
    description: string;
    embedding: Float32Array;
    confidence?: number;
    metadata?: Record<string, string>;
};
type JsQueryResult = {
    nodes: Array<any>;
    edges: Array<any>;
    stats?: any;
};
export interface GraphDatabaseConfig {
    storagePath: string;
    dimensions?: number;
    distanceMetric?: 'Cosine' | 'Euclidean' | 'DotProduct' | 'Manhattan';
}
export interface EpisodeNode {
    id: string;
    sessionId: string;
    task: string;
    reward: number;
    success: boolean;
    input?: string;
    output?: string;
    critique?: string;
    createdAt: number;
    tokensUsed?: number;
    latencyMs?: number;
}
export interface SkillNode {
    id: string;
    name: string;
    description: string;
    code: string;
    usageCount: number;
    avgReward: number;
    createdAt: number;
    updatedAt: number;
    tags?: string;
}
export interface CausalEdge {
    from: string;
    to: string;
    mechanism: string;
    uplift: number;
    confidence: number;
    sampleSize: number;
}
/**
 * Graph Database Adapter for AgentDB
 *
 * This replaces SQL.js as the primary database, using SwarmVector's graph DB
 * with Cypher queries, hyperedges, and integrated vector search.
 */
export declare class GraphDatabaseAdapter {
    private db;
    private config;
    private embedder;
    constructor(config: GraphDatabaseConfig, embedder: any);
    /**
     * Initialize graph database (create new or open existing)
     */
    initialize(): Promise<void>;
    /**
     * Store an episode as a graph node
     */
    storeEpisode(episode: EpisodeNode, embedding: Float32Array): Promise<string>;
    /**
     * Store a skill as a graph node
     */
    storeSkill(skill: SkillNode, embedding: Float32Array): Promise<string>;
    /**
     * Create a causal relationship edge
     */
    createCausalEdge(edge: CausalEdge, embedding: Float32Array): Promise<string>;
    /**
     * Query using Cypher syntax
     *
     * Examples:
     * - MATCH (e:Episode) WHERE e.success = 'true' RETURN e
     * - MATCH (s:Skill) RETURN s ORDER BY s.avgReward DESC LIMIT 10
     * - MATCH (e1:Episode)-[r]->(e2:Episode) RETURN e1, r, e2
     */
    query(cypher: string): Promise<JsQueryResult>;
    /**
     * Search for similar episodes by embedding
     */
    searchSimilarEpisodes(embedding: Float32Array, k?: number): Promise<any[]>;
    /**
     * Search for similar skills by embedding
     */
    searchSkills(embedding: Float32Array, k?: number): Promise<SkillNode[]>;
    /**
     * Generic createNode method for graph traversal scenarios
     */
    createNode(node: JsNode): Promise<string>;
    /**
     * Generic createEdge method for graph traversal scenarios
     */
    createEdge(edge: JsEdge): Promise<void>;
    /**
     * Delete a node by id. With `cascade: true` (default) all incident edges
     * are removed in the same transaction (`DETACH DELETE`); with
     * `cascade: false` the call refuses when incident edges exist (matching
     * the spec from SwarmVector#427).
     *
     * @returns `deletedNode`: whether the node existed and was removed.
     *          `deletedEdges`: count of incident edges removed (only meaningful
     *          when `cascade: true`).
     */
    deleteNode(id: string, opts?: {
        cascade?: boolean;
    }): Promise<{
        deletedNode: boolean;
        deletedEdges: number;
    }>;
    /**
     * Delete a single edge by id. Endpoints stay intact.
     */
    deleteEdge(id: string): Promise<{
        deleted: boolean;
    }>;
    /**
     * Delete a hyperedge by id. Member nodes stay intact.
     *
     * Hyperedges are stored as relationship-like entities in SwarmVector's graph;
     * we use the same Cypher pattern as `deleteEdge` but match `:HYPEREDGE`
     * to disambiguate when the storage represents both as relationships.
     */
    deleteHyperedge(id: string): Promise<{
        deleted: boolean;
    }>;
    /**
     * Delete every edge between two endpoints, optionally filtered by label.
     * Saves callers the cost of materialising edge ids first when they want to
     * scrub a `(source, target [, label])` tuple wholesale.
     */
    deleteEdgesByEndpoints(from: string, to: string, label?: string): Promise<{
        deleted: number;
    }>;
    /**
     * Cypher escaping for ids/strings. We single-quote the value, so any
     * embedded single quote needs doubling, and backslashes are escaped to
     * keep the binding's parser happy.
     */
    private escapeId;
    private escapeLabel;
    /**
     * Pull the first numeric value of column `col` out of a JsQueryResult.
     * Different binding versions package row data slightly differently
     * (`rows`, `nodes`, `edges`, `data`); this is the lowest-common-denominator
     * extractor.
     */
    private firstNumeric;
    /**
     * Get graph statistics
     */
    getStats(): Promise<any>;
    /**
     * Begin transaction
     */
    beginTransaction(): Promise<string>;
    /**
     * Commit transaction
     */
    commitTransaction(txId: string): Promise<void>;
    /**
     * Rollback transaction
     */
    rollbackTransaction(txId: string): Promise<void>;
    /**
     * Batch insert nodes and edges
     */
    batchInsert(nodes: JsNode[], edges: JsEdge[]): Promise<any>;
    /**
     * Close database
     */
    close(): void;
}
export {};
//# sourceMappingURL=GraphDatabaseAdapter.d.ts.map