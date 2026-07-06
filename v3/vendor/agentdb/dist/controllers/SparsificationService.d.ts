/**
 * SparsificationService - Graph Sparsification for AgentDB
 *
 * Implements Personalized PageRank (PPR), random walk sampling, and spectral
 * sparsification for reducing graph size while preserving structure.
 *
 * Features:
 * - 10-100x speedup for large graphs
 * - PPR-based node importance scoring
 * - Random walk sampling
 * - Spectral sparsification
 * - WASM/NAPI bindings with JavaScript fallback
 * - Zero-copy operations where supported
 *
 * Based on:
 * - "Fast Personalized PageRank on MapReduce" (Bahmani et al., 2011)
 * - "Graph Sparsification by Effective Resistances" (Spielman & Srivastava, 2011)
 * - "Local Graph Partitioning using PageRank Vectors" (Andersen et al., 2006)
 *
 * @version 3.0.0-alpha.5
 */
import type { GraphEdges } from '../types/graph.js';
export type { GraphEdges };
export interface SparsificationConfig {
    /** Sparsification method */
    method: 'ppr' | 'random-walk' | 'spectral' | 'degree-based';
    /** Number of top nodes to keep */
    topK: number;
    /** PPR teleport probability (default: 0.15) */
    alpha?: number;
    /** Number of random walks (default: 100) */
    numWalks?: number;
    /** Random walk length (default: 10) */
    walkLength?: number;
    /** Convergence threshold for PPR (default: 1e-6) */
    convergenceThreshold?: number;
    /** Maximum PPR iterations (default: 20) */
    maxIterations?: number;
}
export interface SparsificationResult {
    /** Top-k node indices by importance */
    topKIndices: number[];
    /** Importance scores for all nodes */
    scores: Float32Array;
    /** Ratio of edges retained (edges_kept / total_edges) */
    sparsityRatio: number;
    /** Method used for sparsification */
    method: string;
    /** Execution time in milliseconds */
    executionTimeMs?: number;
    /** Additional metadata */
    metadata?: {
        iterations?: number;
        convergence?: number;
        totalNodes?: number;
        totalEdges?: number;
    };
}
/**
 * SparsificationService - Reduces graph size while preserving structure
 */
export declare class SparsificationService {
    private wasmModule;
    private napiModule;
    private initialized;
    private config;
    constructor(config: SparsificationConfig);
    /**
     * Initialize WASM/NAPI bindings
     */
    initialize(): Promise<void>;
    /**
     * Personalized PageRank sparsification
     *
     * Computes importance scores for nodes based on random walk with restart.
     * Nodes with higher PPR scores are more important relative to the source.
     *
     * @param sourceNode - Starting node for PPR
     * @param edges - Graph adjacency list
     * @param topK - Number of top nodes to return
     * @param alpha - Teleport probability (1-alpha = continue walk)
     * @returns Sparsification result with top-k nodes
     */
    pprSparsification(sourceNode: number, edges: GraphEdges, topK: number, alpha?: number): Promise<SparsificationResult>;
    /**
     * Random walk sampling sparsification
     *
     * Performs multiple random walks from source node and counts visit frequencies.
     * More frequently visited nodes are considered more important.
     *
     * @param sourceNode - Starting node for walks
     * @param edges - Graph adjacency list
     * @param topK - Number of top nodes to return
     * @param numWalks - Number of random walks
     * @param walkLength - Length of each walk
     * @returns Sparsification result with top-k nodes
     */
    randomWalkSparsification(sourceNode: number, edges: GraphEdges, topK: number, numWalks?: number, walkLength?: number): Promise<SparsificationResult>;
    /**
     * Spectral sparsification
     *
     * Uses graph spectrum (eigenvalues/eigenvectors) to identify important edges.
     * Falls back to degree-based approximation if spectral methods unavailable.
     *
     * @param edges - Graph adjacency list
     * @param topK - Number of top nodes to return
     * @returns Sparsification result with top-k nodes
     */
    spectralSparsification(edges: GraphEdges, topK: number): Promise<SparsificationResult>;
    /**
     * Sparsify graph based on configuration
     *
     * @param sourceNode - Source node (required for PPR and random-walk)
     * @param edges - Graph adjacency list
     * @returns Sparsification result
     */
    sparsify(sourceNode: number, edges: GraphEdges): Promise<SparsificationResult>;
    /**
     * Extract top-k indices from scores
     */
    private getTopK;
    /**
     * PPR JavaScript fallback implementation
     *
     * Power iteration method for computing PageRank with restart.
     */
    private pprFallback;
    /**
     * Degree-based sparsification fallback
     *
     * Simple heuristic: keep nodes with highest degree (most connections).
     */
    private degreeBasedSparsification;
    /**
     * Count total edges in graph
     */
    private countTotalEdges;
    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<SparsificationConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): SparsificationConfig;
    /**
     * Reset to default configuration
     */
    resetConfig(): void;
}
//# sourceMappingURL=SparsificationService.d.ts.map