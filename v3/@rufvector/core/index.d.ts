/**
 * @rufvector/core - High-performance Rust vector database for Node.js
 *
 * Automatically detects platform and loads the appropriate native binding.
 */
/**
 * Distance metric for similarity calculation
 */
export declare enum DistanceMetric {
    /** Euclidean (L2) distance */
    Euclidean = "Euclidean",
    /** Cosine similarity (converted to distance) */
    Cosine = "Cosine",
    /** Dot product (converted to distance for maximization) */
    DotProduct = "DotProduct",
    /** Manhattan (L1) distance */
    Manhattan = "Manhattan"
}
/**
 * Quantization configuration
 */
export interface QuantizationConfig {
    /** Quantization type */
    type: 'none' | 'scalar' | 'product' | 'binary';
    /** Number of subspaces (for product quantization) */
    subspaces?: number;
    /** Codebook size (for product quantization) */
    k?: number;
}
/**
 * HNSW index configuration
 */
export interface HnswConfig {
    /** Number of connections per layer (M) */
    m?: number;
    /** Size of dynamic candidate list during construction */
    efConstruction?: number;
    /** Size of dynamic candidate list during search */
    efSearch?: number;
    /** Maximum number of elements */
    maxElements?: number;
}
/**
 * Database configuration options
 */
export interface DbOptions {
    /** Vector dimensions */
    dimensions: number;
    /** Distance metric */
    distanceMetric?: DistanceMetric;
    /** Storage path */
    storagePath?: string;
    /** HNSW configuration */
    hnswConfig?: HnswConfig;
    /** Quantization configuration */
    quantization?: QuantizationConfig;
}
/**
 * Vector entry
 */
export interface VectorEntry {
    /** Optional ID (auto-generated if not provided) */
    id?: string;
    /** Vector data as Float32Array or array of numbers */
    vector: Float32Array | number[];
}
/**
 * Search query parameters
 */
export interface SearchQuery {
    /** Query vector as Float32Array or array of numbers */
    vector: Float32Array | number[];
    /** Number of results to return (top-k) */
    k: number;
    /** Optional ef_search parameter for HNSW */
    efSearch?: number;
}
/**
 * Search result with similarity score
 */
export interface SearchResult {
    /** Vector ID */
    id: string;
    /** Distance/similarity score (lower is better for distance metrics) */
    score: number;
}
/**
 * High-performance vector database with HNSW indexing
 */
export interface VectorDB {
    /**
     * Insert a vector entry into the database
     * @param entry Vector entry to insert
     * @returns Promise resolving to the ID of the inserted vector
     */
    insert(entry: VectorEntry): Promise<string>;
    /**
     * Insert multiple vectors in a batch
     * @param entries Array of vector entries to insert
     * @returns Promise resolving to an array of IDs for the inserted vectors
     */
    insertBatch(entries: VectorEntry[]): Promise<string[]>;
    /**
     * Search for similar vectors
     * @param query Search query parameters
     * @returns Promise resolving to an array of search results sorted by similarity
     */
    search(query: SearchQuery): Promise<SearchResult[]>;
    /**
     * Delete a vector by ID
     * @param id Vector ID to delete
     * @returns Promise resolving to true if deleted, false if not found
     */
    delete(id: string): Promise<boolean>;
    /**
     * Get a vector by ID
     * @param id Vector ID to retrieve
     * @returns Promise resolving to the vector entry if found, null otherwise
     */
    get(id: string): Promise<VectorEntry | null>;
    /**
     * Get the number of vectors in the database
     * @returns Promise resolving to the number of vectors
     */
    len(): Promise<number>;
    /**
     * Check if the database is empty
     * @returns Promise resolving to true if empty, false otherwise
     */
    isEmpty(): Promise<boolean>;
}
/**
 * VectorDB constructor interface
 */
export interface VectorDBConstructor {
    new (options: DbOptions): VectorDB;
    withDimensions(dimensions: number): VectorDB;
}
/**
 * Filter for metadata-based search
 */
export interface Filter {
    /** Field name to filter on */
    field: string;
    /** Operator: "eq", "ne", "gt", "gte", "lt", "lte", "in", "match" */
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'match';
    /** Value to compare against (JSON string) */
    value: string;
}
/**
 * Collection configuration
 */
export interface CollectionConfig {
    /** Vector dimensions */
    dimensions: number;
    /** Distance metric */
    distanceMetric?: DistanceMetric;
    /** HNSW configuration */
    hnswConfig?: HnswConfig;
    /** Quantization configuration */
    quantization?: QuantizationConfig;
}
/**
 * Collection statistics
 */
export interface CollectionStats {
    /** Number of vectors in the collection */
    vectorsCount: number;
    /** Disk space used in bytes */
    diskSizeBytes: number;
    /** RAM space used in bytes */
    ramSizeBytes: number;
}
/**
 * Collection alias
 */
export interface Alias {
    /** Alias name */
    alias: string;
    /** Collection name */
    collection: string;
}
/**
 * Health response
 */
export interface HealthResponse {
    /** Status: "healthy", "degraded", or "unhealthy" */
    status: 'healthy' | 'degraded' | 'unhealthy';
    /** Version string */
    version: string;
    /** Uptime in seconds */
    uptimeSeconds: number;
}
/**
 * Collection manager for multi-collection support
 */
export interface CollectionManager {
    /**
     * Create a new collection
     * @param name Collection name
     * @param config Collection configuration
     */
    createCollection(name: string, config: CollectionConfig): Promise<void>;
    /**
     * List all collections
     * @returns Array of collection names
     */
    listCollections(): Promise<string[]>;
    /**
     * Delete a collection
     * @param name Collection name to delete
     */
    deleteCollection(name: string): Promise<void>;
    /**
     * Get collection statistics
     * @param name Collection name
     * @returns Collection statistics
     */
    getStats(name: string): Promise<CollectionStats>;
    /**
     * Create an alias for a collection
     * @param alias Alias name
     * @param collection Collection name
     */
    createAlias(alias: string, collection: string): Promise<void>;
    /**
     * Delete an alias
     * @param alias Alias name to delete
     */
    deleteAlias(alias: string): Promise<void>;
    /**
     * List all aliases
     * @returns Array of alias mappings
     */
    listAliases(): Promise<Alias[]>;
}
/**
 * CollectionManager constructor interface
 */
export interface CollectionManagerConstructor {
    new (basePath?: string): CollectionManager;
}
/**
 * Native binding interface
 */
export interface NativeBinding {
    VectorDB: VectorDBConstructor;
    CollectionManager: CollectionManagerConstructor;
    version(): string;
    hello(): string;
    getMetrics(): string;
    getHealth(): HealthResponse;
}
export declare const VectorDB: any;
/** Native export name (alias of VectorDB). */
export declare const VectorDb: any;
export declare const CollectionManager: CollectionManagerConstructor;
export declare const version: () => string;
export declare const hello: () => string;
export declare const getMetrics: () => string;
export declare const getHealth: () => HealthResponse;
declare let attention: any;
export { attention };
declare const _default: {
    attention?: any;
    VectorDB: any;
    CollectionManager: CollectionManagerConstructor;
    version: () => string;
    hello: () => string;
    getMetrics: () => string;
    getHealth: () => HealthResponse;
    DistanceMetric: typeof DistanceMetric;
};
export default _default;
