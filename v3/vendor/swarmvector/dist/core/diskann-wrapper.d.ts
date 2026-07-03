/**
 * DiskANN Wrapper — Vamana graph ANN for billion-scale vector search
 *
 * Wraps @swarmvector/diskann for SSD-friendly approximate nearest neighbor search.
 * Provides the same lazy-load pattern as other native wrappers.
 */
export declare function isDiskAnnAvailable(): boolean;
export interface DiskAnnConfig {
    dim: number;
    maxDegree?: number;
    buildBeam?: number;
    searchBeam?: number;
    alpha?: number;
    pqSubspaces?: number;
    pqIterations?: number;
    storagePath?: string;
}
export interface DiskAnnSearchResult {
    id: string;
    distance: number;
}
/**
 * DiskANN index for large-scale approximate nearest neighbor search.
 *
 * Uses the Vamana graph algorithm with optional Product Quantization.
 * Build after all inserts, then search.
 */
export declare class DiskAnnIndex {
    private inner;
    constructor(config: DiskAnnConfig);
    /** Insert a vector with a string ID */
    insert(id: string, vector: Float32Array | number[]): void;
    /** Insert a batch of vectors (flat Float32Array: N * dim) */
    insertBatch(ids: string[], vectors: Float32Array, dim: number): void;
    /** Build the Vamana graph index (required before search) */
    build(): void;
    /** Build index asynchronously */
    buildAsync(): Promise<void>;
    /** Search for k nearest neighbors */
    search(query: Float32Array | number[], k?: number): DiskAnnSearchResult[];
    /** Search asynchronously */
    searchAsync(query: Float32Array | number[], k?: number): Promise<DiskAnnSearchResult[]>;
    /** Delete a vector by ID */
    delete(id: string): boolean;
    /** Get the number of vectors */
    count(): number;
    /** Save index to directory */
    save(dir: string): void;
    /** Load index from directory */
    static load(dir: string): DiskAnnIndex;
}
export default DiskAnnIndex;
//# sourceMappingURL=diskann-wrapper.d.ts.map