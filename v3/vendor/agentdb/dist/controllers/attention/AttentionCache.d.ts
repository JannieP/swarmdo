/**
 * AttentionCache - Caching layer for attention mechanisms
 *
 * Handles:
 * - Buffer pooling (getBuffer, returnBuffer)
 * - Mask caching (getCachedMask)
 * - Performance optimization through reuse
 */
/**
 * AttentionCacheManager - Manages caching for attention operations
 */
export declare class AttentionCacheManager {
    private bufferPool;
    private maskCache;
    /**
     * Get a reusable buffer from the pool or allocate new one
     * @param size - Buffer size in elements
     * @returns Float32Array buffer
     */
    getBuffer(size: number): Float32Array;
    /**
     * Return a buffer to the pool for reuse
     * @param buffer - Buffer to return
     */
    returnBuffer(buffer: Float32Array): void;
    /**
     * Get cached attention mask or generate new one
     * @param seqLen - Sequence length
     * @param causal - Whether to use causal masking
     * @returns Cached or generated mask
     */
    getCachedMask(seqLen: number, causal: boolean): Float32Array;
    /**
     * Clear all caches
     */
    clear(): void;
}
//# sourceMappingURL=AttentionCache.d.ts.map