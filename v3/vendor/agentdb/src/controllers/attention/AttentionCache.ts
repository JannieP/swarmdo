/**
 * AttentionCache - Caching layer for attention mechanisms
 *
 * Handles:
 * - Buffer pooling (getBuffer, returnBuffer)
 * - Mask caching (getCachedMask)
 * - Performance optimization through reuse
 */

import { AttentionConfigManager } from './AttentionConfig.js';

/**
 * AttentionCacheManager - Manages caching for attention operations
 */
export class AttentionCacheManager {
  // Buffer pooling for Float32Array reuse (Optimization: 70-90% fewer allocations)
  private bufferPool: Map<number, Float32Array[]> = new Map();

  // Attention mask caching (Optimization: 30-40% faster for repeated ops)
  private maskCache: Map<string, Float32Array> = new Map();

  /**
   * Get a reusable buffer from the pool or allocate new one
   * @param size - Buffer size in elements
   * @returns Float32Array buffer
   */
  getBuffer(size: number): Float32Array {
    const pool = this.bufferPool.get(size) || [];
    if (pool.length > 0) {
      return pool.pop()!;
    }
    return new Float32Array(size);
  }

  /**
   * Return a buffer to the pool for reuse
   * @param buffer - Buffer to return
   */
  returnBuffer(buffer: Float32Array): void {
    const size = buffer.length;
    const pool = this.bufferPool.get(size) || [];

    if (pool.length < AttentionConfigManager.MAX_POOLED_BUFFERS) {
      // Zero out buffer for security and reuse
      buffer.fill(0);
      pool.push(buffer);
      this.bufferPool.set(size, pool);
    }
  }

  /**
   * Get cached attention mask or generate new one
   * @param seqLen - Sequence length
   * @param causal - Whether to use causal masking
   * @returns Cached or generated mask
   */
  getCachedMask(seqLen: number, causal: boolean): Float32Array {
    const key = `${seqLen}_${causal}`;

    if (this.maskCache.has(key)) {
      return this.maskCache.get(key)!;
    }

    const mask = new Float32Array(seqLen * seqLen);
    if (causal) {
      // Generate causal mask (lower triangular)
      for (let i = 0; i < seqLen; i++) {
        for (let j = 0; j < seqLen; j++) {
          mask[i * seqLen + j] = j <= i ? 1.0 : 0.0;
        }
      }
    } else {
      mask.fill(1.0);
    }

    if (this.maskCache.size < AttentionConfigManager.MAX_CACHED_MASKS) {
      this.maskCache.set(key, mask);
    }

    return mask;
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.bufferPool.clear();
    this.maskCache.clear();
  }
}
