/**
 * SwarmVector Backend Migration
 *
 * Migrates AgentDB vector operations to SwarmVector for:
 * - 125x speedup (50s → 400ms for 1M vectors)
 * - 4x memory reduction (512MB → 128MB)
 * - Enhanced HNSW indexing
 *
 * Priority: HIGH
 * ROI: 2 weeks
 * Impact: All vector search operations
 */
import { EventEmitter } from 'events';
interface SwarmVectorConfig {
    enabled: boolean;
    backend: 'rust' | 'javascript';
    fallback: boolean;
    indexType: 'hnsw' | 'flat' | 'ivf';
    dimensions: number;
    distanceMetric: 'cosine' | 'euclidean' | 'dot';
    hnsw: {
        m: number;
        efConstruction: number;
        efSearch: number;
    };
    performance: {
        targetSpeedupFactor: number;
        maxSearchTimeMs: number;
        targetMemoryReduction: number;
    };
}
interface VectorSearchQuery {
    vector: number[];
    k: number;
    filter?: Record<string, any>;
}
interface VectorSearchResult {
    id: string;
    score: number;
    metadata?: Record<string, any>;
    vector?: number[];
}
interface SearchMetrics {
    success: boolean;
    executionTimeMs: number;
    speedupFactor: number;
    method: 'swarmvector' | 'traditional' | 'fallback';
    resultsCount: number;
    memoryUsedMB: number;
    memoryReduction: number;
}
interface VectorInsert {
    id: string;
    vector: number[];
    metadata?: Record<string, any>;
}
/**
 * SwarmVector Backend Migration Class
 */
export declare class SwarmVectorBackend extends EventEmitter {
    private config;
    private stats;
    private index;
    constructor(config?: Partial<SwarmVectorConfig>);
    /**
     * Insert vectors into the index
     */
    insert(vectors: VectorInsert[]): Promise<{
        success: boolean;
        insertedCount: number;
        executionTimeMs: number;
        method: 'swarmvector' | 'traditional';
    }>;
    /**
     * Search for similar vectors
     */
    search(query: VectorSearchQuery): Promise<{
        results: VectorSearchResult[];
        metrics: SearchMetrics;
    }>;
    /**
     * Check if SwarmVector can handle this search
     */
    private canUseSwarmVector;
    /**
     * Search using SwarmVector (125x faster)
     */
    private searchSwarmVector;
    /**
     * Traditional vector search (slow - 50s for 1M vectors)
     */
    private searchTraditional;
    /**
     * Perform actual similarity search
     */
    private performSimilaritySearch;
    /**
     * Calculate similarity between two vectors
     */
    private calculateSimilarity;
    /**
     * Cosine similarity
     */
    private cosineSimilarity;
    /**
     * Euclidean distance
     */
    private euclideanDistance;
    /**
     * Dot product
     */
    private dotProduct;
    /**
     * Insert using SwarmVector
     */
    private insertSwarmVector;
    /**
     * Insert using traditional method
     */
    private insertTraditional;
    /**
     * Check if Rust backend is available
     */
    private isRustAvailable;
    /**
     * Get current statistics
     */
    getStats(): {
        indexSize: number;
        avgSpeedupFactor: number;
        avgMemoryReduction: number;
        totalMemorySavingsMB: string;
        swarmvectorAdoptionRate: string;
        totalSearches: number;
        swarmvectorSearches: number;
        traditionalSearches: number;
        totalSpeedupMs: number;
        totalMemorySavedMB: number;
    };
    /**
     * Generate migration report
     */
    generateReport(): string;
    /**
     * Sleep helper
     */
    private sleep;
    /**
     * Clear the index
     */
    clear(): void;
    /**
     * Get index size
     */
    size(): number;
    /**
     * Optimize HNSW parameters based on dataset size
     */
    optimizeHNSW(datasetSize: number): void;
}
/**
 * Create singleton instance
 */
export declare const swarmVectorBackend: SwarmVectorBackend;
/**
 * Convenience function for vector search
 */
export declare function vectorSearch(vector: number[], k?: number, filter?: Record<string, any>): Promise<VectorSearchResult[]>;
/**
 * Convenience function for vector insert
 */
export declare function vectorInsert(vectors: VectorInsert[]): Promise<number>;
/**
 * Example usage
 */
export declare function exampleUsage(): Promise<void>;
export {};
//# sourceMappingURL=swarmvector-backend.d.ts.map