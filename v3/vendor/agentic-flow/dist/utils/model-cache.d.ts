/**
 * Global Model Cache
 *
 * Caches loaded models in memory to avoid repeated initialization overhead.
 * Supports ONNX embeddings, transformers.js pipelines, and other heavy models.
 */
interface CacheStats {
    models: number;
    totalSize: number;
    size?: number;
    totalHits: number;
    totalMisses: number;
    hits: number;
    misses: number;
    hitRate: number;
}
declare class ModelCache {
    private cache;
    private maxSize;
    private totalHits;
    private totalMisses;
    constructor(maxSizeMB?: number);
    /**
     * Get a cached model or load it
     */
    getOrLoad<T>(key: string, loader: () => Promise<T>, sizeEstimate?: number): Promise<T>;
    /**
     * Check if model is cached
     */
    has(key: string): boolean;
    /**
     * Get cached model without loading
     */
    get<T>(key: string): T | undefined;
    /**
     * Manually cache a model
     */
    set(key: string, model: any, sizeEstimate?: number): void;
    /**
     * Remove a model from cache
     */
    delete(key: string): boolean;
    /**
     * Clear all cached models
     */
    clear(): void;
    /**
     * Get cache statistics
     */
    getStats(): CacheStats;
    /**
     * Evict least recently used models if cache is full
     */
    private evictIfNeeded;
}
export declare const modelCache: ModelCache;
export declare function getCachedOnnxEmbedder(): Promise<any>;
export declare function getCachedTransformersPipeline(task?: string, model?: string): Promise<any>;
export declare function getCachedRuvectorCore(): Promise<any>;
export {};
//# sourceMappingURL=model-cache.d.ts.map