/**
 * AttentionConfig - Configuration management for attention mechanisms
 *
 * Handles:
 * - Config validation
 * - Constants
 * - Default values
 */
/**
 * Configuration for attention mechanisms
 */
export interface AttentionConfig {
    /** Number of attention heads */
    numHeads: number;
    /** Dimension of each head */
    headDim: number;
    /** Total embedding dimension (usually numHeads * headDim) */
    embedDim: number;
    /** Dropout probability (0-1) */
    dropout?: number;
    /** Whether to use bias in linear projections */
    bias?: boolean;
    /** Use Flash Attention optimization if available */
    useFlash?: boolean;
    /** Use Linear Attention for O(n) complexity */
    useLinear?: boolean;
    /** Use Hyperbolic space for hierarchical data */
    useHyperbolic?: boolean;
    /** Use Mixture-of-Experts routing */
    useMoE?: boolean;
    /** Number of experts for MoE (default: 8) */
    numExperts?: number;
    /** Top-k experts to activate in MoE (default: 2) */
    topK?: number;
    /** Sparsification configuration */
    sparsification?: {
        enabled: boolean;
        method: 'ppr' | 'random-walk' | 'spectral';
        topK: number;
    };
    /** Graph partitioning configuration */
    partitioning?: {
        enabled: boolean;
        method: 'stoer-wagner' | 'karger' | 'flow-based';
        maxPartitionSize: number;
    };
}
/**
 * Options for attention operations (alias for AttentionConfig)
 */
export type AttentionOptions = AttentionConfig;
/**
 * Result from attention computation
 */
export interface AttentionResult {
    /** Output embeddings after attention */
    output: Float32Array;
    /** Attention weights (optional, for visualization) */
    weights?: Float32Array;
    /** Execution time in milliseconds */
    executionTimeMs: number;
    /** Which mechanism was used */
    mechanism: 'multi-head' | 'flash' | 'linear' | 'hyperbolic' | 'moe' | 'sparse' | 'partitioned';
    /** Runtime environment */
    runtime: 'napi' | 'wasm' | 'fallback';
    /** Sparsification metadata (for sparse attention) */
    sparsityMetadata?: {
        method?: string;
        topKNodes?: number;
        sparsityRatio?: number;
    };
    /** Partitioning metadata (for partitioned attention) */
    partitioningMetadata?: {
        numPartitions?: number;
        cutSize?: number;
        avgPartitionSize?: number;
    };
}
/**
 * AttentionConfigManager - Manages configuration and constants
 */
export declare class AttentionConfigManager {
    static readonly FLASH_V2_MIN_SPEEDUP = 2.49;
    static readonly FLASH_V2_MAX_SPEEDUP = 7.47;
    static readonly MASKED_SCORE: number;
    static readonly MAX_POOLED_BUFFERS = 10;
    static readonly MAX_CACHED_MASKS = 50;
    private config;
    constructor(config: AttentionConfig);
    /**
     * Apply default values to configuration
     */
    private applyDefaults;
    /**
     * Validate configuration values
     */
    private validateConfig;
    /**
     * Get the configuration
     */
    getConfig(): AttentionConfig;
    /**
     * Get number of heads
     */
    getNumHeads(): number;
    /**
     * Get head dimension
     */
    getHeadDim(): number;
    /**
     * Get embedding dimension
     */
    getEmbedDim(): number;
    /**
     * Get dropout rate
     */
    getDropout(): number;
    /**
     * Get number of experts for MoE
     */
    getNumExperts(): number;
    /**
     * Get top-k for MoE
     */
    getTopK(): number;
}
//# sourceMappingURL=AttentionConfig.d.ts.map