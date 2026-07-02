/**
 * MincutService - Graph Partitioning with Minimum Cut Algorithms
 *
 * Implements multiple minimum cut algorithms for dynamic graph partitioning
 * to achieve 50-80% memory reduction through intelligent node clustering.
 *
 * Features:
 * - Stoer-Wagner algorithm (deterministic, optimal for small graphs)
 * - Karger's randomized algorithm (probabilistic, good for large graphs)
 * - Flow-based mincut (max-flow min-cut theorem)
 * - Partition caching for repeated queries
 * - WASM/NAPI acceleration when available
 *
 * Goal: 50-80% memory reduction through dynamic graph partitioning
 */
import type { GraphEdges } from '../types/graph.js';
export interface MincutConfig {
    algorithm: 'stoer-wagner' | 'karger' | 'flow-based';
    maxPartitionSize?: number;
    minCutThreshold?: number;
}
export interface MincutResult {
    partitions: number[][];
    cutSize: number;
    cutEdges: Array<[number, number]>;
    algorithm: string;
}
export interface Partition {
    nodes: Set<number>;
    internalEdges: number;
    externalEdges: number;
}
export declare class MincutService {
    private config;
    private wasmModule;
    private napiModule;
    private initialized;
    private partitionCache;
    constructor(config: MincutConfig);
    initialize(): Promise<void>;
    /**
     * Stoer-Wagner mincut algorithm
     */
    stoerWagnerMincut(edges: GraphEdges): Promise<MincutResult>;
    /**
     * Karger's randomized mincut
     */
    kargerMincut(edges: GraphEdges, iterations?: number): Promise<MincutResult>;
    /**
     * Flow-based mincut (max-flow min-cut theorem)
     */
    flowBasedMincut(edges: GraphEdges, source: number, sink: number): Promise<MincutResult>;
    /**
     * Partition graph based on configuration
     */
    partition(edges: GraphEdges): Promise<MincutResult>;
    /**
     * Get partition containing a node
     */
    getPartition(node: number, result: MincutResult): number[];
    /**
     * Check if two nodes are in same partition
     */
    inSamePartition(node1: number, node2: number, result: MincutResult): boolean;
    /**
     * Calculate partition statistics
     */
    getPartitionStats(result: MincutResult, edges: GraphEdges): {
        numPartitions: number;
        avgPartitionSize: number;
        maxPartitionSize: number;
        minPartitionSize: number;
        cutRatio: number;
    };
    /**
     * Clear partition cache
     */
    clearCache(): void;
    /**
     * Get cache statistics
     */
    getCacheStats(): {
        size: number;
        keys: string[];
    };
    private hashEdges;
    private stoerWagnerFallback;
    private kargerIteration;
    private fordFulkersonMincut;
    private getCutEdges;
}
//# sourceMappingURL=MincutService.d.ts.map