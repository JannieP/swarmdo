/**
 * Optimized Embedder for Agentic-Flow
 *
 * Uses ruvector's AdaptiveEmbedder optimizations:
 * - Float32Array with flattened matrices
 * - 256-entry LRU cache with FNV-1a hash
 * - SIMD-friendly loop unrolling (4x)
 * - Pre-allocated buffers (no GC pressure)
 *
 * Downloads ONNX models at init for offline use.
 */
export interface EmbedderConfig {
    modelId: string;
    dimension: number;
    cacheSize: number;
    modelDir: string;
    autoDownload: boolean;
}
export declare const DEFAULT_CONFIG: EmbedderConfig;
/**
 * Optimized cosine similarity with 8x loop unrolling and separate accumulators
 * ~3-4x faster than naive implementation due to instruction-level parallelism
 */
export declare function cosineSimilarity(a: Float32Array, b: Float32Array): number;
/**
 * Optimized euclidean distance with loop unrolling
 */
export declare function euclideanDistance(a: Float32Array, b: Float32Array): number;
/**
 * Normalize vector in-place (optimized)
 */
export declare function normalizeVector(v: Float32Array): Float32Array;
export interface DownloadProgress {
    modelId: string;
    bytesDownloaded: number;
    totalBytes: number;
    percent: number;
}
export declare function downloadModel(modelId: string, targetDir: string, onProgress?: (progress: DownloadProgress) => void): Promise<string>;
export declare function listAvailableModels(): Array<{
    id: string;
    dimension: number;
    size: string;
    quantized: boolean;
    downloaded: boolean;
}>;
export declare class OptimizedEmbedder {
    private config;
    private cache;
    private onnxSession;
    private tokenizer;
    private initialized;
    private initPromise;
    private outputBuffer;
    private static readonly MAX_TOKENS;
    private inputIdsBuffer;
    private attentionMaskBuffer;
    private tokenTypeIdsBuffer;
    constructor(config?: Partial<EmbedderConfig>);
    /**
     * Initialize the embedder (download model if needed)
     */
    init(): Promise<void>;
    private _init;
    /**
     * Embed a single text (with caching)
     */
    embed(text: string): Promise<Float32Array>;
    private embedWithOnnx;
    private simpleTokenize;
    private embedWithTransformers;
    /**
     * Embed multiple texts in batch with parallel processing
     * 3-4x faster than sequential processing for large batches
     */
    embedBatch(texts: string[], concurrency?: number): Promise<Float32Array[]>;
    /**
     * Find similar texts using optimized cosine similarity
     */
    findSimilar(query: string, candidates: string[], topK?: number): Promise<Array<{
        text: string;
        score: number;
        index: number;
    }>>;
    /**
     * Get cache statistics
     */
    getCacheStats(): {
        size: number;
        maxSize: number;
    };
    /**
     * Clear the embedding cache
     */
    clearCache(): void;
    /**
     * Check if initialized
     */
    isInitialized(): boolean;
}
export declare function getOptimizedEmbedder(config?: Partial<EmbedderConfig>): OptimizedEmbedder;
export declare function initEmbeddings(modelId?: string): Promise<void>;
//# sourceMappingURL=optimized-embedder.d.ts.map