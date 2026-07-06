/**
 * AttentionService - Advanced Attention Mechanisms for AgentDB
 *
 * Provides state-of-the-art attention mechanisms with runtime detection:
 * - MultiHeadAttention (standard transformer attention)
 * - FlashAttention (memory-efficient attention)
 * - HyperbolicAttention (hyperbolic space attention)
 * - MoEAttention (Mixture-of-Experts attention)
 * - LinearAttention (linear complexity attention)
 *
 * Features:
 * - Automatic runtime detection (Node.js NAPI vs Browser WASM)
 * - Zero-copy Float32Array processing
 * - Graceful fallbacks for unsupported environments
 * - Performance monitoring hooks
 * - Type-safe interfaces
 */
import { AttentionConfig, AttentionOptions, AttentionResult } from './attention/AttentionConfig.js';
import { AttentionStats, AttentionMetrics } from './attention/AttentionMetrics.js';
import { RuntimeEnvironment } from './attention/AttentionWASM.js';
import type { GraphEdges } from '../types/graph.js';
export type { AttentionConfig, AttentionOptions, AttentionResult, AttentionStats, AttentionMetrics };
/**
 * AttentionService - Main orchestration layer for attention mechanisms
 *
 * Delegates to specialized classes:
 * - AttentionConfigManager: Configuration and constants
 * - AttentionMetricsTracker: Performance monitoring
 * - AttentionCacheManager: Buffer pooling and mask caching
 * - AttentionWASMManager: WASM/NAPI module loading
 * - AttentionCoreCompute: Core computation algorithms
 */
export declare class AttentionService {
    private configManager;
    private metricsTracker;
    private cacheManager;
    private wasmManager;
    private coreCompute;
    private sparsificationService?;
    private mincutService?;
    private initialized;
    private initPromise;
    private warmedUp;
    constructor(config: AttentionConfig);
    /**
     * Initialize the attention service
     * Automatically detects and loads the appropriate backend (NAPI or WASM)
     * Thread-safe with promise guard to prevent concurrent initialization
     */
    initialize(): Promise<void>;
    /**
     * Internal initialization implementation
     */
    private _doInitialize;
    /**
     * Compute multi-head attention
     *
     * @param query - Query vectors [batchSize * seqLen * embedDim]
     * @param key - Key vectors [batchSize * seqLen * embedDim]
     * @param value - Value vectors [batchSize * seqLen * embedDim]
     * @param mask - Optional attention mask [batchSize * seqLen * seqLen]
     * @returns Attention output and metadata
     */
    multiHeadAttention(query: Float32Array, key: Float32Array, value: Float32Array, mask?: Float32Array): Promise<AttentionResult>;
    /**
     * Compute Flash Attention (memory-efficient)
     */
    flashAttention(query: Float32Array, key: Float32Array, value: Float32Array, mask?: Float32Array): Promise<AttentionResult>;
    /**
     * Compute Flash Attention v2 (optimized memory-efficient attention)
     */
    flashAttentionV2(query: Float32Array, key: Float32Array, value: Float32Array, options?: {
        mask?: Float32Array;
        causal?: boolean;
        windowSize?: number;
        dropout?: number;
    }): Promise<AttentionResult & {
        speedup?: number;
        baselineTimeMs?: number;
    }>;
    /**
     * Compute Linear Attention (O(n) complexity)
     */
    linearAttention(query: Float32Array, key: Float32Array, value: Float32Array): Promise<AttentionResult>;
    /**
     * Compute Hyperbolic Attention (for hierarchical data)
     */
    hyperbolicAttention(query: Float32Array, key: Float32Array, value: Float32Array, curvature?: number): Promise<AttentionResult>;
    /**
     * Compute Fused Attention (optimized single-pass attention)
     *
     * Fused attention combines softmax and weighted sum in a single pass
     * for 20-25% performance improvement through better cache locality.
     *
     * @param query - Query vectors [seqLen * embedDim]
     * @param key - Key vectors [seqLen * embedDim]
     * @param value - Value vectors [seqLen * embedDim]
     * @param options - Fused attention options
     * @returns Attention output and performance metrics
     */
    fusedAttention(query: Float32Array, key: Float32Array, value: Float32Array, options?: {
        blockSize?: number;
        mask?: Float32Array;
        compareBaseline?: boolean;
    }): Promise<{
        output: Float32Array;
        speedup?: number;
        baselineTimeMs?: number;
        fusedTimeMs?: number;
    }>;
    /**
     * Compute Mixture-of-Experts (MoE) Attention
     */
    moeAttention(query: Float32Array, key: Float32Array, value: Float32Array, mask?: Float32Array): Promise<AttentionResult>;
    /**
     * Warm up JIT with small dummy computation
     * Eliminates first-call JIT spikes (50-100ms → 5-10ms)
     */
    private warmUp;
    /**
     * Get performance statistics
     */
    getStats(): AttentionStats;
    /**
     * Reset performance statistics
     */
    resetStats(): void;
    /**
     * Dispose of resources and clean up
     * Call this when AttentionService is no longer needed
     */
    dispose(): Promise<void>;
    /**
     * Compute Sparse Attention
     *
     * Uses graph sparsification to reduce the number of attention edges,
     * achieving 10-100x speedup for large graphs (N > 10K nodes).
     *
     * @param query - Query vector for attention scoring
     * @param graphEdges - Graph adjacency list (node -> neighbors)
     * @param options - Sparse attention options
     * @returns Attention result with sparsity metadata
     */
    sparseAttention(query: Float32Array, graphEdges: GraphEdges, options?: {
        useMincut?: boolean;
        sparsificationRatio?: number;
        method?: 'ppr' | 'random-walk' | 'spectral';
        topK?: number;
    }): Promise<AttentionResult>;
    /**
     * Compute Partitioned Attention
     *
     * Uses graph mincut algorithms to partition the graph, then applies
     * attention within each partition independently. Achieves 50-80% memory
     * reduction through intelligent clustering.
     *
     * @param query - Query vector for attention scoring
     * @param graphEdges - Graph adjacency list
     * @param options - Partitioned attention options
     * @returns Attention result with partitioning metadata
     */
    partitionedAttention(query: Float32Array, graphEdges: GraphEdges, options?: {
        method?: 'stoer-wagner' | 'karger' | 'flow-based';
        maxPartitionSize?: number;
    }): Promise<AttentionResult>;
    /**
     * Get service information
     */
    getInfo(): {
        initialized: boolean;
        runtime: RuntimeEnvironment;
        hasNAPI: boolean;
        hasWASM: boolean;
        config: AttentionConfig;
    };
}
//# sourceMappingURL=AttentionService.d.ts.map