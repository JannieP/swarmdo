/**
 * RuvLTRA Benchmark Suite
 *
 * Comprehensive benchmarks for evaluating RuvLTRA models
 * on Claude Code-specific use cases.
 */
export * from './routing-benchmark';
export * from './embedding-benchmark';
export * from './model-comparison';
import { ROUTING_TEST_CASES, type RoutingBenchmarkResults } from './routing-benchmark';
import { SIMILARITY_TEST_PAIRS, SEARCH_TEST_CASES, CLUSTER_TEST_CASES, type EmbeddingBenchmarkResults } from './embedding-benchmark';
export interface FullBenchmarkResults {
    routing: RoutingBenchmarkResults;
    embedding: EmbeddingBenchmarkResults;
    timestamp: string;
    model: string;
}
/**
 * Run all benchmarks with a given model
 */
export declare function runFullBenchmark(router: (task: string) => {
    agent: string;
    confidence: number;
}, embedder: (text: string) => number[], similarityFn: (a: number[], b: number[]) => number, modelName?: string): FullBenchmarkResults;
/**
 * Format full benchmark results
 */
export declare function formatFullResults(results: FullBenchmarkResults): string;
/**
 * Compare two models
 */
export declare function compareModels(results1: FullBenchmarkResults, results2: FullBenchmarkResults): string;
export { ROUTING_TEST_CASES, SIMILARITY_TEST_PAIRS, SEARCH_TEST_CASES, CLUSTER_TEST_CASES, };
//# sourceMappingURL=index.d.ts.map