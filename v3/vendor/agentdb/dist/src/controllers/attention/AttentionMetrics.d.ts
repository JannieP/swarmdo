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
export declare class AttentionMetricsTracker {
    private stats;
    /**
     * Update performance statistics
     */
    updateStats(mechanism: string, runtime: string, executionTimeMs: number, memoryBytes: number): void;
    /**
     * Get performance statistics
     */
    getStats(): AttentionStats;
    /**
     * Reset performance statistics
     */
    resetStats(): void;
    /**
     * Clear performance entries to prevent memory leak
     * @param markerName - Base name of performance markers
     */
    clearPerformanceEntries(markerName: string): void;
    /**
     * Clear all performance entries
     */
    clearAllPerformanceEntries(): void;
}
//# sourceMappingURL=AttentionMetrics.d.ts.map