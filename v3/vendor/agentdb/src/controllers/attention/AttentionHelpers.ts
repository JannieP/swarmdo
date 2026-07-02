/**
 * AttentionHelpers - Shared utilities for attention computations
 * Eliminates ~180 lines of duplication across attention methods
 */

import type { AttentionConfig, AttentionResult, AttentionStats } from '../AttentionService';

/**
 * Performance tracking and error handling wrapper
 */
export class AttentionHelpers {
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
  static executeWithPerfTracking<T extends AttentionResult>(
    opName: string,
    mechanism: 'multi-head' | 'flash' | 'linear' | 'hyperbolic' | 'moe',
    operation: () => {
      output: Float32Array;
      runtime: 'napi' | 'wasm' | 'fallback';
      weights?: Float32Array;
      speedup?: number;
      baselineTimeMs?: number;
    },
    updateStatsFn: (mechanism: string, runtime: string, executionTimeMs: number, memoryBytes: number) => void
  ): T {
    const startMark = `${opName}-start`;
    const endMark = `${opName}-end`;

    performance.mark(startMark);

    try {
      const result = operation();

      performance.mark(endMark);
      performance.measure(opName, startMark, endMark);
      const measure = performance.getEntriesByName(opName)[0];
      const executionTimeMs = measure.duration;

      // Update statistics
      updateStatsFn(mechanism, result.runtime, executionTimeMs, result.output.length * 4);

      // Clear performance entries to prevent memory leak
      AttentionHelpers.clearPerformanceEntries(opName);

      return {
        output: result.output,
        weights: result.weights,
        executionTimeMs,
        mechanism,
        runtime: result.runtime,
        ...(result.speedup !== undefined && { speedup: result.speedup }),
        ...(result.baselineTimeMs !== undefined && { baselineTimeMs: result.baselineTimeMs }),
      } as T;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`${mechanism} attention failed: ${errorMessage}`);
    }
  }

  /**
   * Clear performance entries to prevent memory leak
   * @param markerName - Base name of performance markers
   */
  static clearPerformanceEntries(markerName: string): void {
    performance.clearMarks(`${markerName}-start`);
    performance.clearMarks(`${markerName}-end`);
    performance.clearMeasures(markerName);
  }

  /**
   * Validate input arrays for attention computation
   * @throws Error if validation fails
   */
  static validateInputs(
    query: Float32Array,
    key: Float32Array,
    value: Float32Array,
    config: AttentionConfig,
    mask?: Float32Array
  ): void {
    // Check for empty arrays
    if (query.length === 0) throw new Error('Query cannot be empty');
    if (key.length === 0) throw new Error('Key cannot be empty');
    if (value.length === 0) throw new Error('Value cannot be empty');

    // Check dimension alignment
    const { embedDim } = config;
    if (query.length % embedDim !== 0) {
      throw new Error(`Query length ${query.length} not divisible by embedDim ${embedDim}`);
    }
    if (key.length % embedDim !== 0) {
      throw new Error(`Key length ${key.length} not divisible by embedDim ${embedDim}`);
    }
    if (value.length % embedDim !== 0) {
      throw new Error(`Value length ${value.length} not divisible by embedDim ${embedDim}`);
    }

    // Check for matching sequence lengths
    const querySeqLen = Math.floor(query.length / embedDim);
    const keySeqLen = Math.floor(key.length / embedDim);
    const valueSeqLen = Math.floor(value.length / embedDim);

    if (keySeqLen !== valueSeqLen) {
      throw new Error(`Key and value sequence lengths must match: ${keySeqLen} vs ${valueSeqLen}`);
    }

    // Validate mask dimensions if provided
    if (mask) {
      const expectedMaskSize = querySeqLen * keySeqLen;
      if (mask.length !== expectedMaskSize) {
        throw new Error(
          `Mask size mismatch: expected ${expectedMaskSize} (${querySeqLen}x${keySeqLen}), got ${mask.length}`
        );
      }
    }

    // Check for invalid values (NaN/Infinity)
    AttentionHelpers.checkForInvalidValues(query, 'query');
    AttentionHelpers.checkForInvalidValues(key, 'key');
    AttentionHelpers.checkForInvalidValues(value, 'value');
    if (mask) {
      AttentionHelpers.checkForInvalidValues(mask, 'mask');
    }
  }

  /**
   * Check array for NaN or Infinity values
   * @throws Error if invalid values found
   */
  static checkForInvalidValues(array: Float32Array, name: string): void {
    for (let i = 0; i < array.length; i++) {
      if (!Number.isFinite(array[i])) {
        throw new Error(`${name} contains invalid value at index ${i}: ${array[i]}`);
      }
    }
  }

  /**
   * Calculate sequence length from array length and embedding dimension
   */
  static calculateSeqLength(arrayLength: number, embedDim: number): number {
    return Math.floor(arrayLength / embedDim);
  }

  /**
   * Format execution time for logging
   */
  static formatExecutionTime(timeMs: number): string {
    if (timeMs < 1) {
      return `${(timeMs * 1000).toFixed(2)}μs`;
    } else if (timeMs < 1000) {
      return `${timeMs.toFixed(2)}ms`;
    } else {
      return `${(timeMs / 1000).toFixed(2)}s`;
    }
  }

  /**
   * Format memory size for logging
   */
  static formatMemorySize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes}B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(2)}KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
    }
  }
}
