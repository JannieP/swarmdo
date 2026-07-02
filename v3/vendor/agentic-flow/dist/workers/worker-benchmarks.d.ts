/**
 * Worker Benchmark System
 *
 * Comprehensive performance benchmarking for the worker system including:
 * - Dispatch latency measurement
 * - Phase execution timing
 * - Memory tracking
 * - Throughput analysis
 * - Integration with agents
 */
export interface BenchmarkResult {
    name: string;
    operation: string;
    count: number;
    totalTimeMs: number;
    avgTimeMs: number;
    minMs: number;
    maxMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    throughput: number;
    memoryDeltaMB: number;
    passed: boolean;
    target?: number;
    details?: Record<string, unknown>;
}
export interface BenchmarkSuite {
    name: string;
    description: string;
    timestamp: number;
    results: BenchmarkResult[];
    summary: {
        totalTests: number;
        passed: number;
        failed: number;
        avgLatencyMs: number;
        totalDurationMs: number;
        peakMemoryMB: number;
    };
}
export interface LatencyBucket {
    range: string;
    count: number;
    percentage: number;
}
export declare class WorkerBenchmarks {
    private results;
    /**
     * Benchmark trigger detection speed
     */
    benchmarkTriggerDetection(iterations?: number): Promise<BenchmarkResult>;
    /**
     * Benchmark worker registry operations
     */
    benchmarkRegistryOperations(iterations?: number): Promise<BenchmarkResult>;
    /**
     * Benchmark agent selection performance
     */
    benchmarkAgentSelection(iterations?: number): Promise<BenchmarkResult>;
    /**
     * Benchmark model cache performance
     */
    benchmarkModelCache(iterations?: number): Promise<BenchmarkResult>;
    /**
     * Benchmark concurrent worker handling
     */
    benchmarkConcurrentWorkers(workerCount?: number): Promise<BenchmarkResult>;
    /**
     * Benchmark memory key generation
     */
    benchmarkMemoryKeyGeneration(iterations?: number): Promise<BenchmarkResult>;
    /**
     * Run full benchmark suite
     */
    runFullSuite(): Promise<BenchmarkSuite>;
    /**
     * Print formatted results
     */
    private printResults;
    /**
     * Get last results
     */
    getResults(): BenchmarkResult[];
}
export declare const workerBenchmarks: WorkerBenchmarks;
export declare function runBenchmarks(): Promise<BenchmarkSuite>;
//# sourceMappingURL=worker-benchmarks.d.ts.map