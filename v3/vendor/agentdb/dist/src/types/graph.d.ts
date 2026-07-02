/**
 * Graph Type Definitions for AgentDB
 *
 * Provides type definitions for graph operations including
 * mincut algorithms and graph partitioning.
 */
/**
 * Graph edges represented as adjacency list
 * Each index represents a node, and the array contains neighbor node IDs
 */
export type GraphEdges = Array<number[] | undefined>;
/**
 * Graph node representation
 */
export interface GraphNode {
    id: number;
    label?: string;
    metadata?: Record<string, any>;
}
/**
 * Graph edge representation
 */
export interface GraphEdge {
    from: number;
    to: number;
    weight?: number;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=graph.d.ts.map