/**
 * AttentionConfig - Configuration management for attention mechanisms
 *
 * Handles:
 * - Config validation
 * - Constants
 * - Default values
 */
/**
 * AttentionConfigManager - Manages configuration and constants
 */
export class AttentionConfigManager {
    // Performance targets (ADR-071)
    static FLASH_V2_MIN_SPEEDUP = 2.49;
    static FLASH_V2_MAX_SPEEDUP = 7.47;
    // Attention computation constants
    static MASKED_SCORE = -Infinity;
    // Buffer pool limits
    static MAX_POOLED_BUFFERS = 10;
    // Mask cache limits
    static MAX_CACHED_MASKS = 50;
    config;
    constructor(config) {
        this.config = this.applyDefaults(config);
        this.validateConfig(this.config);
    }
    /**
     * Apply default values to configuration
     */
    applyDefaults(config) {
        const defaults = {
            ...config,
            dropout: config.dropout ?? 0.1,
            bias: config.bias ?? true,
            useFlash: config.useFlash ?? true,
            useLinear: config.useLinear ?? false,
            useHyperbolic: config.useHyperbolic ?? false,
            useMoE: config.useMoE ?? false,
            numExperts: config.numExperts ?? 8,
            topK: config.topK ?? 2,
        };
        if (config.sparsification) {
            defaults.sparsification = {
                enabled: config.sparsification.enabled ?? false,
                method: config.sparsification.method ?? 'ppr',
                topK: config.sparsification.topK ?? 100,
            };
        }
        if (config.partitioning) {
            defaults.partitioning = {
                enabled: config.partitioning.enabled ?? false,
                method: config.partitioning.method ?? 'stoer-wagner',
                maxPartitionSize: config.partitioning.maxPartitionSize ?? 1000,
            };
        }
        return defaults;
    }
    /**
     * Validate configuration values
     */
    validateConfig(config) {
        if (config.numHeads <= 0) {
            throw new Error('numHeads must be positive');
        }
        if (config.headDim <= 0) {
            throw new Error('headDim must be positive');
        }
        if (config.embedDim <= 0) {
            throw new Error('embedDim must be positive');
        }
        if (config.dropout !== undefined && (config.dropout < 0 || config.dropout > 1)) {
            throw new Error('dropout must be between 0 and 1');
        }
        if (config.numExperts !== undefined && config.numExperts <= 0) {
            throw new Error('numExperts must be positive');
        }
        if (config.topK !== undefined && config.topK <= 0) {
            throw new Error('topK must be positive');
        }
    }
    /**
     * Get the configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Get number of heads
     */
    getNumHeads() {
        return this.config.numHeads;
    }
    /**
     * Get head dimension
     */
    getHeadDim() {
        return this.config.headDim;
    }
    /**
     * Get embedding dimension
     */
    getEmbedDim() {
        return this.config.embedDim;
    }
    /**
     * Get dropout rate
     */
    getDropout() {
        return this.config.dropout || 0.0;
    }
    /**
     * Get number of experts for MoE
     */
    getNumExperts() {
        return this.config.numExperts || 8;
    }
    /**
     * Get top-k for MoE
     */
    getTopK() {
        return this.config.topK || 2;
    }
}
//# sourceMappingURL=AttentionConfig.js.map