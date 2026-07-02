/**
 * AttentionHelpers - Shared utilities for attention computations
 * Eliminates ~180 lines of duplication across attention methods
 */
import type { AttentionConfig, AttentionResult } from '../AttentionService';
/**
 * Performance tracking and error handling wrapper
 */
export declare class AttentionHelpers {
    /**
     * Execute attention operation with standard error handling and performance tracking
     * Eliminates duplicated try-catch-performance patterns across all attention methods
     *
     * @param opName - Operation name for performance markers
     * @param mechanism - Attention mechanism type
     * @param operation - The actual attention operation to execute
     * @param updateStatsFn - Callback to update statistics
     * @returns Attention result with performance metrics
     */
    static executeWithPerfTracking<T extends AttentionResult>(opName: string, mechanism: 'multi-head' | 'flash' | 'linear' | 'hyperbolic' | 'moe', operation: () => {
        output: Float32Array;
        runtime: 'napi' | 'wasm' | 'fallback';
        weights?: Float32Array;
        speedup?: number;
        baselineTimeMs?: number;
    }, updateStatsFn: (mechanism: string, runtime: string, executionTimeMs: number, memoryBytes: number) => void): T;
    /**
     * Clear performance entries to prevent memory leak
     * @param markerName - Base name of performance markers
     */
    static clearPerformanceEntries(markerName: string): void;
    /**
     * Validate input arrays for attention computation
     * @throws Error if validation fails
     */
    static validateInputs(query: Float32Array, key: Float32Array, value: Float32Array, config: AttentionConfig, mask?: Float32Array): void;
    /**
     * Check array for NaN or Infinity values
     * @throws Error if invalid values found
     */
    static checkForInvalidValues(array: Float32Array, name: string): void;
    /**
     * Calculate sequence length from array length and embedding dimension
     */
    static calculateSeqLength(arrayLength: number, embedDim: number): number;
    /**
     * Format execution time for logging
     */
    static formatExecutionTime(timeMs: number): string;
    /**
     * Format memory size for logging
     */
    static formatMemorySize(bytes: number): string;
}
//# sourceMappingURL=AttentionHelpers.d.ts.map