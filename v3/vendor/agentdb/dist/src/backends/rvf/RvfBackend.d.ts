/**
 * RvfBackend - RVF Format Vector Storage for AgentDB
 *
 * Implements VectorBackend and VectorBackendAsync using the @rufvector/rvf SDK.
 * Uses N-API backend (fast) on Node.js with WASM fallback for browser/edge.
 *
 * Features:
 * - Single-file .rvf persistence with crash safety
 * - Native async API with sync compatibility layer
 * - Typed metadata filter expressions (11 operators)
 * - Lineage tracking (fileId, parentId, derive)
 * - COW branching for agent experiments
 * - Progressive indexing (3-layer HNSW quality tiers)
 * - Witness chain integrity verification
 * - Auto-compaction with dead space tracking
 * - Performance statistics tracking
 *
 * Security:
 * - Path validation (reuses RuVectorBackend patterns)
 * - Bounded batch sizes and metadata limits
 * - No prototype pollution in metadata handling
 */
import type { VectorBackendAsync, VectorConfig, SearchResult, SearchOptions, VectorStats } from '../VectorBackend.js';
import { type RvfFilterExpr } from './FilterBuilder.js';
/** RVF-specific configuration options */
export interface RvfConfig extends VectorConfig {
    /** Path to .rvf store file */
    storagePath?: string;
    /** RVF sub-backend: 'auto' | 'node' | 'wasm' */
    rvfBackend?: 'auto' | 'node' | 'wasm';
    /** Batch threshold for auto-flushing queued sync inserts */
    batchThreshold?: number;
    /** Enable performance statistics tracking */
    enableStats?: boolean;
    /** Compression profile: 'none' (fp32), 'scalar' (int8), 'product' (PQ) */
    compression?: 'none' | 'scalar' | 'product';
    /** Hardware profile: 0=Generic, 1=Core, 2=Hot, 3=Full */
    hardwareProfile?: 0 | 1 | 2 | 3;
}
/** Re-export FilterBuilder for external use */
export { FilterBuilder, type RvfFilterExpr } from './FilterBuilder.js';
/** HNSW index statistics (AGI introspection) */
export interface IndexStats {
    indexedVectors: number;
    layers: number;
    m: number;
    efConstruction: number;
    needsRebuild: boolean;
}
/** Witness chain verification result */
export interface WitnessVerification {
    valid: boolean;
    entries: number;
    error?: string;
}
/** Performance statistics */
interface PerfStats {
    insertCount: number;
    insertTotalMs: number;
    searchCount: number;
    searchTotalMs: number;
    flushCount: number;
    compactionCount: number;
}
/**
 * RvfBackend - VectorBackend + VectorBackendAsync implementation using @rufvector/rvf
 */
export declare class RvfBackend implements VectorBackendAsync {
    readonly name: "rvf";
    private db;
    private dim;
    private metricType;
    private config;
    private initialized;
    private storagePath;
    private pending;
    private batchThreshold;
    private cachedCount;
    private stats;
    constructor(config: VectorConfig | RvfConfig);
    /**
     * Initialize the RVF database connection.
     * Lazy-loads @rufvector/rvf to avoid hard dependency.
     */
    initialize(): Promise<void>;
    insert(id: string, embedding: Float32Array, metadata?: Record<string, unknown>): void;
    insertBatch(items: Array<{
        id: string;
        embedding: Float32Array;
        metadata?: Record<string, unknown>;
    }>): void;
    search(_query: Float32Array, _k: number, _options?: SearchOptions): SearchResult[];
    remove(id: string): boolean;
    getStats(): VectorStats;
    save(_path: string): Promise<void>;
    load(path: string): Promise<void>;
    close(): void;
    insertAsync(id: string, embedding: Float32Array, metadata?: Record<string, unknown>): Promise<void>;
    insertBatchAsync(items: Array<{
        id: string;
        embedding: Float32Array;
        metadata?: Record<string, unknown>;
    }>): Promise<void>;
    searchAsync(query: Float32Array, k: number, options?: SearchOptions): Promise<SearchResult[]>;
    removeAsync(id: string): Promise<boolean>;
    getStatsAsync(): Promise<VectorStats>;
    flush(): Promise<void>;
    /** Get the cryptographic file identity */
    fileId(): Promise<string>;
    /** Get parent store ID (all zeros for root) */
    parentId(): Promise<string>;
    /** Get lineage depth (0 for root) */
    lineageDepth(): Promise<number>;
    /** Create a COW branch */
    derive(childPath: string): Promise<RvfBackend>;
    /** Compact the store (reclaim dead space) */
    compact(): Promise<{
        segmentsCompacted: number;
        bytesReclaimed: number;
    }>;
    /** Get segment introspection */
    segments(): Promise<Array<{
        id: number;
        segType: string;
        payloadLength: number;
    }>>;
    /** Get RVF store status */
    status(): Promise<{
        totalVectors: number;
        totalSegments: number;
    }>;
    /** Get dimension */
    getDimension(): Promise<number>;
    /** Get the storage path */
    getStoragePath(): string;
    /** Check if the backend is initialized */
    isInitialized(): boolean;
    /** Get performance statistics */
    getPerformanceStats(): PerfStats & {
        avgInsertMs: number;
        avgSearchMs: number;
    };
    /** Get the distance metric name from the RVF store */
    metric(): string;
    /** Get HNSW index statistics */
    indexStats(): IndexStats;
    /** Verify SHAKE-256 witness chain integrity */
    verifyWitness(): WitnessVerification;
    /** Snapshot-freeze state, returns epoch number */
    freeze(): number;
    /**
     * Open an existing RVF store for read-only access (no lock required).
     * Enables concurrent reader patterns.
     */
    static openReadonly(path: string, config?: Partial<RvfConfig>): Promise<RvfBackend>;
    /**
     * Delete vectors matching a filter expression.
     * @param filter - RvfFilterExpr or predicate DSL object
     * @returns delete result with count and epoch
     */
    deleteByFilter(filter: RvfFilterExpr | Record<string, unknown>): Promise<{
        deleted: number;
        epoch: number;
    }>;
    /**
     * Embed a kernel image into the RVF store.
     * @returns segment ID of the embedded kernel
     */
    embedKernel(arch: number, kernelType: number, flags: number, image: Uint8Array, apiPort: number, cmdline?: string): Promise<number>;
    /**
     * Extract the kernel image from the RVF store.
     * @returns kernel data or null if not present
     */
    extractKernel(): Promise<{
        header: Uint8Array;
        image: Uint8Array;
    } | null>;
    /**
     * Embed an eBPF program into the RVF store.
     * @returns segment ID of the embedded program
     */
    embedEbpf(programType: number, attachType: number, maxDimension: number, bytecode: Uint8Array, btf?: Uint8Array): Promise<number>;
    /**
     * Extract the eBPF program from the RVF store.
     * @returns eBPF data or null if not present
     */
    extractEbpf(): Promise<{
        header: Uint8Array;
        payload: Uint8Array;
    } | null>;
    private distanceToSimilarity;
    private ensureInitialized;
}
//# sourceMappingURL=RvfBackend.d.ts.map