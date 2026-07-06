/**
 * AttentionMetrics - Performance monitoring for attention mechanisms
 *
 * Handles:
 * - Performance marks/measures
 * - Statistics tracking
 * - Speedup calculations
 */
/**
 * AttentionMetricsTracker - Tracks performance metrics
 */
export class AttentionMetricsTracker {
    stats = {
        totalOps: 0,
        avgExecutionTimeMs: 0,
        peakMemoryBytes: 0,
        mechanismCounts: {},
        runtimeCounts: {}
    };
    /**
     * Update performance statistics
     */
    updateStats(mechanism, runtime, executionTimeMs, memoryBytes) {
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
    getStats() {
        return { ...this.stats };
    }
    /**
     * Reset performance statistics
     */
    resetStats() {
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
    clearPerformanceEntries(markerName) {
        performance.clearMarks(`${markerName}-start`);
        performance.clearMarks(`${markerName}-end`);
        performance.clearMeasures(markerName);
    }
    /**
     * Clear all performance entries
     */
    clearAllPerformanceEntries() {
        performance.clearMarks();
        performance.clearMeasures();
    }
}
//# sourceMappingURL=AttentionMetrics.js.map