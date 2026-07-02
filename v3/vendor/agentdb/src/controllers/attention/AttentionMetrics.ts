/**
 * AttentionMetrics - Performance monitoring for attention mechanisms
 *
 * Handles:
 * - Performance marks/measures
 * - Statistics tracking
 * - Speedup calculations
 */

/**
 * Statistics about attention operations
 */
export interface AttentionStats {
  /** Total attention operations performed */
  totalOps: number;
  /** Average execution time in milliseconds */
  avgExecutionTimeMs: number;
  /** Peak memory usage in bytes */
  peakMemoryBytes: number;
  /** Mechanism usage counts */
  mechanismCounts: Record<string, number>;
  /** Runtime usage counts */
  runtimeCounts: Record<string, number>;
}

/**
 * Performance metrics for attention operations (alias for AttentionStats)
 */
export type AttentionMetrics = AttentionStats;

/**
 * AttentionMetricsTracker - Tracks performance metrics
 */
export class AttentionMetricsTracker {
  private stats: AttentionStats = {
    totalOps: 0,
    avgExecutionTimeMs: 0,
    peakMemoryBytes: 0,
    mechanismCounts: {},
    runtimeCounts: {}
  };

  /**
   * Update performance statistics
   */
  updateStats(
    mechanism: string,
    runtime: string,
    executionTimeMs: number,
    memoryBytes: number
  ): void {
    this.stats.totalOps++;

    // Update average execution time
    const prevTotal = this.stats.avgExecutionTimeMs * (this.stats.totalOps - 1);
    this.stats.avgExecutionTimeMs = (prevTotal + executionTimeMs) / this.stats.totalOps;

    // Update peak memory
    if (memoryBytes > this.stats.peakMemoryBytes) {
      this.stats.peakMemoryBytes = memoryBytes;
    }

    // Update mechanism counts
    this.stats.mechanismCounts[mechanism] = (this.stats.mechanismCounts[mechanism] || 0) + 1;

    // Update runtime counts
    this.stats.runtimeCounts[runtime] = (this.stats.runtimeCounts[runtime] || 0) + 1;
  }

  /**
   * Get performance statistics
   */
  getStats(): AttentionStats {
    return { ...this.stats };
  }

  /**
   * Reset performance statistics
   */
  resetStats(): void {
    this.stats = {
      totalOps: 0,
      avgExecutionTimeMs: 0,
      peakMemoryBytes: 0,
      mechanismCounts: {},
      runtimeCounts: {}
    };
  }

  /**
   * Clear performance entries to prevent memory leak
   * @param markerName - Base name of performance markers
   */
  clearPerformanceEntries(markerName: string): void {
    performance.clearMarks(`${markerName}-start`);
    performance.clearMarks(`${markerName}-end`);
    performance.clearMeasures(markerName);
  }

  /**
   * Clear all performance entries
   */
  clearAllPerformanceEntries(): void {
    performance.clearMarks();
    performance.clearMeasures();
  }
}
