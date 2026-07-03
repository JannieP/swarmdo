/**
 * ONNX WASM Embedder - Semantic embeddings for hooks
 *
 * Provides real transformer-based embeddings using all-MiniLM-L6-v2
 * running in pure WASM (no native dependencies).
 *
 * Uses bundled ONNX WASM files from src/core/onnx/
 *
 * Features:
 * - 384-dimensional semantic embeddings
 * - Real semantic understanding (not hash-based)
 * - Cached model loading (downloads from HuggingFace on first use)
 * - Batch embedding support
 * - Optional parallel workers for 3.8x batch speedup
 */
import { EmbeddingProvenance } from './embedding-provenance';
declare global {
    var __swarmvector_require: NodeRequire | undefined;
}
export interface OnnxEmbedderConfig {
    modelId?: string;
    maxLength?: number;
    normalize?: boolean;
    cacheDir?: string;
    /**
     * Enable parallel workers for batch operations
     * - 'auto' (default): Enable for long-running processes, skip for CLI
     * - true: Always enable workers
     * - false: Never use workers
     */
    enableParallel?: boolean | 'auto';
    /** Number of worker threads (default: CPU cores - 1) */
    numWorkers?: number;
    /** Minimum batch size to use parallel processing (default: 4) */
    parallelThreshold?: number;
}
export interface EmbeddingResult {
    embedding: number[];
    dimension: number;
    timeMs: number;
}
export interface SimilarityResult {
    similarity: number;
    timeMs: number;
}
/**
 * Check if the ONNX embedder is *available* — i.e. the bundled WASM files are
 * present and the embedder can be initialized.
 *
 * NOTE: This is a capability check, NOT a readiness check. It returns `true`
 * before `initOnnxEmbedder()` has run (so callers can decide whether to init).
 * To check whether the model has actually been loaded, use `isOnnxInitialized()`
 * or `isReady()`. See https://github.com/ruvnet/SwarmVector/issues/523.
 */
export declare function isOnnxAvailable(): boolean;
/**
 * Initialize the ONNX embedder (downloads model if needed)
 */
export declare function initOnnxEmbedder(config?: OnnxEmbedderConfig): Promise<boolean>;
/**
 * Generate embedding for text. Equivalent to `embedPassage()` (ADR-210 D4):
 * stored/passage text is the default; use `embedQuery()` for search queries.
 */
export declare function embed(text: string): Promise<EmbeddingResult>;
/** Embed a search query, applying the model's registered query prefix (D4). */
export declare function embedQuery(text: string): Promise<EmbeddingResult>;
/** Embed a passage/document, applying the model's registered passage prefix (D4). */
export declare function embedPassage(text: string): Promise<EmbeddingResult>;
/**
 * Generate embeddings for multiple texts
 * Uses parallel workers automatically for batches >= parallelThreshold
 */
export declare function embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
/**
 * Calculate cosine similarity between two texts
 */
export declare function similarity(text1: string, text2: string): Promise<SimilarityResult>;
/**
 * Calculate cosine similarity between two embeddings
 */
export declare function cosineSimilarity(a: number[], b: number[]): number;
/**
 * Get embedding dimension
 */
export declare function getDimension(): number;
/**
 * Check if the embedder has been initialized (model loaded) and is ready to
 * embed. Returns `false` until `initOnnxEmbedder()` (or the first `embed()`,
 * which auto-initializes) has completed successfully.
 */
export declare function isReady(): boolean;
/**
 * Whether the ONNX embedder has been initialized (model loaded).
 *
 * Post-init counterpart to `isOnnxAvailable()` (which only checks that the
 * bundled files exist). Named distinctly from the WASM-core `isInitialized()`
 * export to avoid a barrel name collision. Equivalent to `isReady()`; provided
 * as a self-documenting gate so callers can distinguish "bundled" (available)
 * from "loaded" (initialized). See
 * https://github.com/ruvnet/SwarmVector/issues/523.
 */
export declare function isOnnxInitialized(): boolean;
/** Model id of the loaded model, or null before init (ADR-210). */
export declare function getActiveModelId(): string | null;
/**
 * Embedding-provenance record (ADR-210 D0) describing vectors produced by the
 * loaded ONNX embedder, or null before the model is initialized.
 */
export declare function getEmbedderProvenance(): EmbeddingProvenance | null;
/**
 * Get embedder stats including SIMD and parallel capabilities
 */
export declare function getStats(): {
    ready: boolean;
    dimension: number;
    model: string;
    simd: boolean;
    parallel: boolean;
    parallelWorkers: number;
    parallelThreshold: number;
};
/**
 * Shutdown parallel workers (call on exit)
 */
export declare function shutdown(): Promise<void>;
/**
 * Initialize the bundled-WASM worker pool for high-throughput batch embedding
 * (issue #523 SOTA). Self-contained — uses Node worker_threads + the bundled
 * WASM over SharedArrayBuffer model bytes, no external dependency. Vectors are
 * identical to the single-thread path (cosine-equivalent).
 *
 * @param numWorkers number of worker threads (default: min(cpus-2, 16))
 */
export declare function initParallelEmbedder(numWorkers?: number): Promise<boolean>;
/**
 * Batch-embed via the bundled worker pool, sharded across CPU cores. Lazily
 * starts the pool on first use. Returns embeddings in input order.
 */
export declare function embedBatchParallel(texts: string[]): Promise<number[][]>;
/** Number of active pool workers (0 if the pool isn't started). */
export declare function getParallelWorkerCount(): number;
/** Batches at or above this size route through the worker pool (ADR-210 D3). */
export declare const BULK_EMBED_THRESHOLD = 32;
/**
 * Default bulk-embedding path (ADR-210 D3): batches of `threshold`
 * (default 32) or more texts route through the bundled parallel worker pool
 * — fp32 model bytes shared across workers via SharedArrayBuffer, vectors
 * identical to the single-thread path. Smaller batches, and any batch when
 * pool startup fails (no worker_threads, no SharedArrayBuffer), use the
 * single-threaded batch path with one stderr note.
 *
 * INT8 STATUS (honest gap, ADR-210 D3): the registered int8 variants
 * (QUANTIZED_MODELS in onnx-optimized.ts) cannot run on the bundled WASM
 * runtime today — its graph analyzer rejects quantized MiniLM exports
 * ("Failed analyse for node /Unsqueeze", verified against both
 * Xenova/all-MiniLM-L6-v2 model_quantized.onnx and the official
 * sentence-transformers model_quint8_avx2.onnx exports). Bulk ingest
 * therefore defaults to parallel-fp32; int8 ingest needs a Rust-side
 * runtime upgrade in the swarmvector-onnx-embeddings-wasm crate (tracked as
 * an ADR-210 follow-up). Single-query latency keeps fp32 either way.
 */
export declare function embedBulk(texts: string[], opts?: {
    threshold?: number;
}): Promise<number[][]>;
/** Shut down the bundled worker pool and release its threads. */
export declare function shutdownParallelEmbedder(): Promise<void>;
export declare class OnnxEmbedder {
    private config;
    constructor(config?: OnnxEmbedderConfig);
    init(): Promise<boolean>;
    /** Equivalent to embedPassage() — ADR-210 D4. */
    embed(text: string): Promise<number[]>;
    /** Embed a search query with the model's registered query prefix (D4). */
    embedQuery(text: string): Promise<number[]>;
    /** Embed a passage/document with the model's registered passage prefix (D4). */
    embedPassage(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    similarity(text1: string, text2: string): Promise<number>;
    get dimension(): number;
    get ready(): boolean;
}
export default OnnxEmbedder;
//# sourceMappingURL=onnx-embedder.d.ts.map