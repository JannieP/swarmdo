/**
 * AdaptiveIndexTuner - Self-Learning Index & Memory Management for AgentDB
 *
 * Provides:
 * - Adaptive HNSW index monitoring via indexStats() + performance tracking
 * - Temporal memory decay via @rufvector/gnn TensorCompress
 * - Thompson Sampling query strategy selection via AgentDBSolver
 *
 * Security:
 * - TensorCompress operates on embeddings only (lossless reversible)
 * - All bounds checked (frequency 0-1, compression levels validated)
 * - No file I/O (operates on in-memory vectors)
 */
import type { IndexStats } from './RvfBackend.js';
import type { SolverBandit } from './SolverBandit.js';
/** Compression tier for temporal memory decay */
export type CompressionTier = 'none' | 'half' | 'pq8' | 'pq4' | 'binary';
/** Compressed vector entry */
export interface CompressedEntry {
    id: string;
    compressedJson: string;
    tier: CompressionTier;
    originalDim: number;
    accessFrequency: number;
    lastAccessed: number;
    /** Matryoshka truncated dimension (SOTA: MRL truncation) */
    truncatedDim?: number;
}
/** Index health assessment */
export interface IndexHealth {
    healthy: boolean;
    indexedVectors: number;
    layers: number;
    needsRebuild: boolean;
    avgSearchMs: number;
    avgInsertMs: number;
    recommendations: string[];
}
/** Compression statistics */
export interface CompressionStats {
    totalEntries: number;
    byTier: Record<CompressionTier, number>;
    estimatedSavingsPercent: number;
}
/**
 * TemporalCompressor - Access-frequency-based vector compression
 *
 * Uses tiered JSON compression for progressive compression of
 * aged embeddings. Hot data stays uncompressed, cold data is compressed
 * to save memory while remaining decompressible on demand.
 *
 * Compression tiers:
 * - none (freq >= 0.8): Full Float32Array stored
 * - half (freq >= 0.6): Float16-quantized
 * - pq8 (freq >= 0.4): 8-bit scalar quantization
 * - pq4 (freq >= 0.2): 4-bit scalar quantization
 * - binary (freq < 0.2): 1-bit sign encoding
 */
export declare class TemporalCompressor {
    private entries;
    private _destroyed;
    private accel;
    private bandit;
    /**
     * Create a new temporal compressor.
     * Lazy-loads NativeAccelerator for native compression when available.
     */
    static create(bandit?: SolverBandit): Promise<TemporalCompressor>;
    /**
     * Always available (built-in compression).
     */
    static isAvailable(): Promise<boolean>;
    /** Whether native tensor compression is available (ADR-007 Phase 1) */
    get nativeCompressAvailable(): boolean;
    /**
     * Compress a vector based on its access frequency.
     * Uses Matryoshka-style dimensional truncation for cold tiers (SOTA: MRL).
     * ADR-007 Phase 1: delegates to NativeAccelerator tensorCompress when available.
     *
     * @param id - Unique identifier for this entry
     * @param embedding - The vector to compress
     * @param accessFrequency - Access frequency in [0.0, 1.0] (1.0 = hot)
     */
    compress(id: string, embedding: Float32Array, accessFrequency: number): CompressedEntry;
    /**
     * Batch compress multiple vectors (ADR-007 Phase 1).
     * Uses NativeAccelerator.tensorBatchCompress when available.
     */
    compressBatch(items: Array<{
        id: string;
        embedding: Float32Array;
        accessFrequency: number;
    }>): CompressedEntry[];
    /**
     * Decompress a vector back to its original form.
     * Matryoshka-truncated vectors are zero-padded to original dimension.
     */
    decompress(id: string): Float32Array | null;
    /**
     * Decompress from raw compressed JSON with known tier and dimension.
     */
    decompressRaw(compressedJson: string, tier: CompressionTier, dim: number): Float32Array;
    /**
     * Update the access frequency for an entry and recompress if tier changed.
     */
    updateFrequency(id: string, newFrequency: number): CompressionTier | null;
    /**
     * Get compression statistics.
     */
    getStats(): CompressionStats;
    /** Check if an entry exists */
    has(id: string): boolean;
    /** Remove an entry */
    remove(id: string): boolean;
    /** Get number of compressed entries */
    get size(): number;
    /** Check if destroyed */
    get isDestroyed(): boolean;
    /** Destroy the compressor */
    destroy(): void;
    /** Map compression tier to native level (0-4) */
    private tierToLevel;
    /** Encode Uint8Array to base64 string */
    private toBase64;
    /** Decode base64 string to Uint8Array */
    private fromBase64;
    private compressVector;
    private decompressVector;
    private frequencyToTier;
    /**
     * Matryoshka-style dimensional truncation (SOTA: MRL).
     * For cold tiers, store only leading dimensions. Matryoshka-trained
     * embeddings concentrate information in early dimensions, so truncation
     * preserves more semantic content than quantization at equal byte cost.
     *
     * Truncation ratios: none=100%, half=100%, pq8=75%, pq4=50%, binary=25%
     */
    /**
     * Matryoshka-style dimensional truncation ratios (SOTA: MRL).
     *
     * Only the most aggressive tier (binary) gets truncation. pq8/pq4 keep full
     * dimensions because their quantization error alone is already significant
     * and truncation on non-MRL-trained embeddings compounds error too aggressively.
     * Binary tier has a generous tolerance (1.0) so truncation to 50% is safe.
     */
    private matryoshkaDim;
    private ensureAlive;
}
/**
 * IndexHealthMonitor - Adaptive HNSW index health monitoring
 *
 * Tracks index statistics and query performance to recommend
 * parameter adjustments and rebuild triggers.
 */
export declare class IndexHealthMonitor {
    private searchLatencies;
    private insertLatencies;
    private readonly maxSamples;
    /**
     * Record a search latency sample (in milliseconds).
     */
    recordSearch(latencyMs: number): void;
    /**
     * Record an insert latency sample (in milliseconds).
     */
    recordInsert(latencyMs: number): void;
    /**
     * Assess index health based on stats and recorded latencies.
     */
    assess(stats: IndexStats): IndexHealth;
    /** Reset all recorded samples */
    reset(): void;
    private average;
}
//# sourceMappingURL=AdaptiveIndexTuner.d.ts.map