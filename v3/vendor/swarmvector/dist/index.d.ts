/**
 * swarmvector - High-performance vector database for Node.js
 *
 * This package automatically detects and uses the best available implementation:
 * 1. Native (Rust-based, fastest) - if available for your platform
 * 2. RVF (persistent store) - if @swarmvector/rvf is installed
 * 3. Stub (testing fallback) - limited functionality
 *
 * Also provides safe wrappers for GNN and Attention modules that handle
 * array type conversions automatically.
 */
export * from './types';
export * from './core';
export * from './services';
declare let implementation: any;
/**
 * Get the current implementation type
 */
export declare function getImplementationType(): 'native' | 'rvf' | 'wasm';
/**
 * Check if native implementation is being used
 */
export declare function isNative(): boolean;
/**
 * Check if RVF implementation is being used
 */
export declare function isRvf(): boolean;
/**
 * Check if stub/fallback implementation is being used
 */
export declare function isWasm(): boolean;
/**
 * Get version information
 */
export declare function getVersion(): {
    version: string;
    implementation: string;
};
/**
 * Wrapper class that automatically handles metadata JSON conversion
 */
declare class VectorDBWrapper {
    private db;
    constructor(options: {
        dimensions: number;
        storagePath?: string;
        distanceMetric?: string;
        metric?: string;
        hnswConfig?: any;
    });
    /**
     * Insert a vector with optional metadata (objects are auto-converted to JSON)
     */
    insert(entry: {
        id?: string;
        vector: Float32Array | number[];
        metadata?: Record<string, any>;
    }): Promise<string>;
    /**
     * Insert multiple vectors in batch
     */
    insertBatch(entries: Array<{
        id?: string;
        vector: Float32Array | number[];
        metadata?: Record<string, any>;
    }>): Promise<string[]>;
    /**
     * Search for similar vectors (metadata is auto-parsed from JSON)
     */
    search(query: {
        vector: Float32Array | number[];
        k: number;
        filter?: Record<string, any>;
        efSearch?: number;
    }): Promise<Array<{
        id: string;
        score: number;
        vector?: Float32Array;
        metadata?: Record<string, any>;
    }>>;
    /**
     * Get a vector by ID (metadata is auto-parsed from JSON)
     */
    get(id: string): Promise<{
        id?: string;
        vector: Float32Array;
        metadata?: Record<string, any>;
    } | null>;
    /**
     * Delete a vector by ID
     */
    delete(id: string): Promise<boolean>;
    /**
     * Get the number of vectors in the database
     */
    len(): Promise<number>;
    /**
     * Check if the database is empty
     */
    isEmpty(): Promise<boolean>;
}
export declare const VectorDb: typeof VectorDBWrapper;
export declare const VectorDB: typeof VectorDBWrapper;
export declare const NativeVectorDb: any;
/** High-level index class compatible with the test-suite API. */
export declare class VectorIndex {
    private db;
    private _dimension;
    private _storagePath;
    constructor(opts: {
        dimension: number;
        metric?: string;
        indexType?: string;
    });
    insert(entry: {
        id?: string;
        values: number[];
    }): Promise<string>;
    insertBatch(entries: Array<{
        id?: string;
        values: number[];
    }>, _opts?: {
        batchSize?: number;
        progressCallback?: (p: number) => void;
    }): Promise<string[]>;
    search(query: number[], opts: {
        k: number;
    }): Promise<Array<{
        id: string;
        score: number;
    }>>;
    get(id: string): Promise<{
        id: string;
        values: number[];
    } | null>;
    delete(id: string): Promise<boolean>;
    stats(): Promise<{
        vectorCount: number;
        dimension: number;
    }>;
    clear(): Promise<void>;
    optimize(): Promise<void>;
}
/** Get backend info (compat with old getBackendInfo() call). */
export declare function getBackendInfo(): {
    type: 'native' | 'wasm';
    version: string;
    features: string[];
};
/** Check native availability (compat alias for isNative()). */
export declare function isNativeAvailable(): boolean;
/** Vector utility functions used by tests and downstream packages. */
export declare const Utils: {
    cosineSimilarity(a: number[], b: number[]): number;
    euclideanDistance(a: number[], b: number[]): number;
    normalize(v: number[]): number[];
    randomVector(dimension: number): number[];
};
export default implementation;
//# sourceMappingURL=index.d.ts.map