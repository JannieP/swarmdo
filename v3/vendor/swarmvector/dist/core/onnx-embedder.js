"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnnxEmbedder = exports.BULK_EMBED_THRESHOLD = void 0;
exports.isOnnxAvailable = isOnnxAvailable;
exports.initOnnxEmbedder = initOnnxEmbedder;
exports.embed = embed;
exports.embedQuery = embedQuery;
exports.embedPassage = embedPassage;
exports.embedBatch = embedBatch;
exports.similarity = similarity;
exports.cosineSimilarity = cosineSimilarity;
exports.getDimension = getDimension;
exports.isReady = isReady;
exports.isOnnxInitialized = isOnnxInitialized;
exports.getActiveModelId = getActiveModelId;
exports.getEmbedderProvenance = getEmbedderProvenance;
exports.getStats = getStats;
exports.shutdown = shutdown;
exports.initParallelEmbedder = initParallelEmbedder;
exports.embedBatchParallel = embedBatchParallel;
exports.getParallelWorkerCount = getParallelWorkerCount;
exports.embedBulk = embedBulk;
exports.shutdownParallelEmbedder = shutdownParallelEmbedder;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const url_1 = require("url");
const module_1 = require("module");
const embedding_provenance_1 = require("./embedding-provenance");
// Set up ESM-compatible require for WASM module (fixes Windows/ESM compatibility)
// The WASM bindings use module.require for Node.js crypto, this provides a fallback
if (typeof globalThis !== 'undefined' && !globalThis.__swarmvector_require) {
    try {
        // In ESM context, use createRequire with __filename
        globalThis.__swarmvector_require = (0, module_1.createRequire)(__filename);
    }
    catch {
        // Fallback: require should be available in CommonJS
        try {
            globalThis.__swarmvector_require = require;
        }
        catch {
            // Neither available - WASM will fall back to crypto.getRandomValues
        }
    }
}
// Force native dynamic import (avoids TypeScript transpiling to require)
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('specifier', 'return import(specifier)');
// Capability detection
let simdAvailable = false;
let parallelAvailable = false;
// Lazy-loaded module state
let wasmModule = null;
let embedder = null;
let parallelEmbedder = null;
let loadError = null;
let loadPromise = null;
let isInitialized = false;
let parallelEnabled = false;
let parallelThreshold = 4;
// Captured at init so the bundled worker pool can reuse the loaded model bytes
// (shared to workers via SharedArrayBuffer) instead of re-downloading per worker.
let loadedModelBytes = null;
let loadedTokenizerJson = null;
let loadedMaxLength = 256;
let bundledPool = null;
// ADR-210: identity of the loaded model, for prefix policies (D4) and the
// embedding-provenance record (D0).
let loadedModelId = null;
let loadedNormalize = true;
// Default model
const DEFAULT_MODEL = 'all-MiniLM-L6-v2';
/**
 * Check if the ONNX embedder is *available* — i.e. the bundled WASM files are
 * present and the embedder can be initialized.
 *
 * NOTE: This is a capability check, NOT a readiness check. It returns `true`
 * before `initOnnxEmbedder()` has run (so callers can decide whether to init).
 * To check whether the model has actually been loaded, use `isOnnxInitialized()`
 * or `isReady()`. See https://github.com/ruvnet/SwarmVector/issues/523.
 */
function isOnnxAvailable() {
    try {
        const pkgPath = path.join(__dirname, 'onnx', 'pkg', 'swarmvector_onnx_embeddings_wasm.js');
        return fs.existsSync(pkgPath);
    }
    catch {
        return false;
    }
}
/**
 * Check whether the bundled parallel worker pool can be loaded — i.e. the
 * `onnx/bundled-parallel.mjs` file ships in the package. This reflects the
 * *bundled* pool (the only parallel implementation), NOT the unpublished
 * external `swarmvector-onnx-embeddings-wasm/parallel` package, which was rejected
 * in ADR-194. See https://github.com/ruvnet/SwarmVector/issues/531.
 */
function detectParallelAvailable() {
    try {
        const poolPath = path.join(__dirname, 'onnx', 'bundled-parallel.mjs');
        parallelAvailable = fs.existsSync(poolPath);
        return parallelAvailable;
    }
    catch {
        parallelAvailable = false;
        return false;
    }
}
/**
 * Check if SIMD is available (from WASM module)
 */
function detectSimd() {
    try {
        if (wasmModule && typeof wasmModule.simd_available === 'function') {
            simdAvailable = wasmModule.simd_available();
            return simdAvailable;
        }
    }
    catch { }
    return false;
}
/**
 * Initialize the bundled, zero-dependency worker pool for batch throughput.
 *
 * Opt-in only (`enableParallel === true`) so the default/'auto' path does not
 * silently spawn worker threads for existing callers. Output vectors are
 * bit-identical to the single-thread path (issue #523).
 *
 * The previously-referenced external package
 * `swarmvector-onnx-embeddings-wasm/parallel` was never published and was rejected
 * in ADR-194; the bundled pool (`onnx/bundled-parallel.mjs`) is the only
 * parallel implementation. See https://github.com/ruvnet/SwarmVector/issues/531.
 */
async function tryInitParallel(config) {
    // Skip unless parallelism is explicitly requested (covers false and 'auto').
    if (config.enableParallel !== true) {
        parallelAvailable = false;
        return false;
    }
    if (!detectParallelAvailable()) {
        console.error('Parallel embedder not available: bundled worker pool (onnx/bundled-parallel.mjs) missing');
        return false;
    }
    try {
        if (!loadedModelBytes || !loadedTokenizerJson) {
            throw new Error('model bytes unavailable for bundled pool');
        }
        const poolUrl = (0, url_1.pathToFileURL)(path.join(__dirname, 'onnx', 'bundled-parallel.mjs')).href;
        const { ParallelEmbedder } = await dynamicImport(poolUrl);
        const pool = new ParallelEmbedder({
            modelBytes: loadedModelBytes,
            tokenizerJson: loadedTokenizerJson,
            maxLength: loadedMaxLength,
            dimension: embedder ? embedder.dimension() : 384,
            numWorkers: config.numWorkers,
        });
        await pool.init();
        parallelEmbedder = pool;
        parallelThreshold = config.parallelThreshold || 4;
        parallelEnabled = true;
        parallelAvailable = true;
        console.error(`Parallel embedder ready (bundled): ${pool.numWorkers} workers, SIMD: ${simdAvailable}`);
        return true;
    }
    catch (e) {
        parallelAvailable = false;
        console.error(`Parallel embedder not available: ${e.message}`);
        return false;
    }
}
/**
 * Initialize the ONNX embedder (downloads model if needed)
 */
async function initOnnxEmbedder(config = {}) {
    if (isInitialized)
        return true;
    if (loadError)
        throw loadError;
    if (loadPromise) {
        await loadPromise;
        return isInitialized;
    }
    loadPromise = (async () => {
        try {
            // Paths to bundled ONNX files
            const bgJsPath = path.join(__dirname, 'onnx', 'pkg', 'swarmvector_onnx_embeddings_wasm_bg.js');
            const wasmPath = path.join(__dirname, 'onnx', 'pkg', 'swarmvector_onnx_embeddings_wasm_bg.wasm');
            const loaderPath = path.join(__dirname, 'onnx', 'loader.js');
            if (!fs.existsSync(bgJsPath) || !fs.existsSync(wasmPath)) {
                throw new Error('ONNX WASM files not bundled. The onnx/ directory is missing.');
            }
            // Load the bg.js module directly (avoids the ESM `import * as wasm from "*.wasm"`
            // in the main .js shim which requires --experimental-wasm-modules on Node 18-24).
            const bgUrl = (0, url_1.pathToFileURL)(bgJsPath).href;
            const loaderUrl = (0, url_1.pathToFileURL)(loaderPath).href;
            wasmModule = await dynamicImport(bgUrl);
            // Instantiate the .wasm bytes via WebAssembly API (no --experimental-wasm-modules needed).
            const wasmBytes = fs.readFileSync(wasmPath);
            const wasmResult = await WebAssembly.instantiate(wasmBytes, { './swarmvector_onnx_embeddings_wasm_bg.js': wasmModule });
            const wasmExports = wasmResult.instance.exports;
            if (typeof wasmModule.__wbg_set_wasm === 'function') {
                wasmModule.__wbg_set_wasm(wasmExports);
            }
            if (typeof wasmExports.__wbindgen_start === 'function') {
                wasmExports.__wbindgen_start();
            }
            const loaderModule = await dynamicImport(loaderUrl);
            const { ModelLoader } = loaderModule;
            // Create model loader with caching
            const modelLoader = new ModelLoader({
                cache: true,
                cacheDir: config.cacheDir || path.join(process.env.HOME || '/tmp', '.swarmvector', 'models'),
            });
            // Load model (downloads from HuggingFace on first use)
            const modelId = config.modelId || DEFAULT_MODEL;
            console.error(`Loading ONNX model: ${modelId}...`);
            const { modelBytes, tokenizerJson, config: modelConfig } = await modelLoader.loadModel(modelId);
            // Retain for the bundled parallel worker pool (see initParallelEmbedder).
            loadedModelBytes = modelBytes;
            loadedTokenizerJson = tokenizerJson;
            loadedMaxLength = config.maxLength || modelConfig.maxLength || 256;
            loadedModelId = modelId;
            loadedNormalize = config.normalize !== false;
            // Create embedder with config
            const embedderConfig = new wasmModule.WasmEmbedderConfig()
                .setMaxLength(config.maxLength || modelConfig.maxLength || 256)
                .setNormalize(config.normalize !== false)
                .setPooling(0); // Mean pooling
            embedder = wasmModule.WasmEmbedder.withConfig(modelBytes, tokenizerJson, embedderConfig);
            // Detect SIMD capability
            detectSimd();
            console.error(`ONNX embedder ready: ${embedder.dimension()}d, SIMD: ${simdAvailable}`);
            isInitialized = true;
            // Determine if we should use parallel workers
            // - true: always enable
            // - false: never enable
            // - 'auto'/undefined: enable for long-running processes (MCP, servers), skip for CLI
            let shouldTryParallel = false;
            if (config.enableParallel === true) {
                shouldTryParallel = true;
            }
            else if (config.enableParallel === false) {
                shouldTryParallel = false;
            }
            else {
                // Auto-detect: check if running as CLI hook or long-running process
                const isCLI = process.argv[1]?.includes('cli.js') ||
                    process.argv[1]?.includes('bin/swarmvector') ||
                    process.env.RUVECTOR_CLI === '1';
                const isMCP = process.env.MCP_SERVER === '1' ||
                    process.argv.some(a => a.includes('mcp'));
                const forceParallel = process.env.RUVECTOR_PARALLEL === '1';
                // Enable parallel for MCP/servers or if explicitly requested, skip for CLI
                shouldTryParallel = forceParallel || (isMCP && !isCLI);
            }
            if (shouldTryParallel) {
                await tryInitParallel(config);
            }
        }
        catch (e) {
            loadError = new Error(`Failed to initialize ONNX embedder: ${e.message}`);
            throw loadError;
        }
    })();
    await loadPromise;
    return isInitialized;
}
async function embedKind(kind, text) {
    if (!isInitialized) {
        await initOnnxEmbedder();
    }
    if (!embedder) {
        throw new Error('ONNX embedder not initialized');
    }
    // ADR-210 D4: apply the model's registered query/passage prefix. MiniLM has
    // empty prefixes, so the default model's output is byte-identical to before.
    const prepared = (0, embedding_provenance_1.prefixText)(loadedModelId ?? DEFAULT_MODEL, kind, text);
    const start = performance.now();
    const embedding = embedder.embedOne(prepared);
    const timeMs = performance.now() - start;
    return {
        embedding: Array.from(embedding),
        dimension: embedding.length,
        timeMs,
    };
}
/**
 * Generate embedding for text. Equivalent to `embedPassage()` (ADR-210 D4):
 * stored/passage text is the default; use `embedQuery()` for search queries.
 */
async function embed(text) {
    return embedKind('passage', text);
}
/** Embed a search query, applying the model's registered query prefix (D4). */
async function embedQuery(text) {
    return embedKind('query', text);
}
/** Embed a passage/document, applying the model's registered passage prefix (D4). */
async function embedPassage(text) {
    return embedKind('passage', text);
}
/**
 * Generate embeddings for multiple texts
 * Uses parallel workers automatically for batches >= parallelThreshold
 */
async function embedBatch(texts) {
    if (!isInitialized) {
        await initOnnxEmbedder();
    }
    if (!embedder) {
        throw new Error('ONNX embedder not initialized');
    }
    // ADR-210 D4: batch embedding is the passage path (embed() === embedPassage()).
    const prepared = texts.map(t => (0, embedding_provenance_1.prefixText)(loadedModelId ?? DEFAULT_MODEL, 'passage', t));
    const start = performance.now();
    // Use parallel workers for large batches
    if (parallelEnabled && parallelEmbedder && prepared.length >= parallelThreshold) {
        const batchResults = await parallelEmbedder.embedBatch(prepared);
        const totalTime = performance.now() - start;
        const dimension = parallelEmbedder.dimension || 384;
        return batchResults.map((emb) => ({
            embedding: Array.from(emb),
            dimension,
            timeMs: totalTime / texts.length,
        }));
    }
    // Sequential fallback
    const batchEmbeddings = embedder.embedBatch(prepared);
    const totalTime = performance.now() - start;
    const dimension = embedder.dimension();
    const results = [];
    for (let i = 0; i < prepared.length; i++) {
        const embedding = batchEmbeddings.slice(i * dimension, (i + 1) * dimension);
        results.push({
            embedding: Array.from(embedding),
            dimension,
            timeMs: totalTime / texts.length,
        });
    }
    return results;
}
/**
 * Calculate cosine similarity between two texts
 */
async function similarity(text1, text2) {
    if (!isInitialized) {
        await initOnnxEmbedder();
    }
    if (!embedder) {
        throw new Error('ONNX embedder not initialized');
    }
    const start = performance.now();
    const sim = embedder.similarity(text1, text2);
    const timeMs = performance.now() - start;
    return { similarity: sim, timeMs };
}
/**
 * Calculate cosine similarity between two embeddings
 */
function cosineSimilarity(a, b) {
    if (a.length !== b.length) {
        throw new Error('Embeddings must have same dimension');
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
}
/**
 * Get embedding dimension
 */
function getDimension() {
    return embedder ? embedder.dimension() : 384;
}
/**
 * Check if the embedder has been initialized (model loaded) and is ready to
 * embed. Returns `false` until `initOnnxEmbedder()` (or the first `embed()`,
 * which auto-initializes) has completed successfully.
 */
function isReady() {
    return isInitialized;
}
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
function isOnnxInitialized() {
    return isInitialized;
}
/** Model id of the loaded model, or null before init (ADR-210). */
function getActiveModelId() {
    return loadedModelId;
}
/**
 * Embedding-provenance record (ADR-210 D0) describing vectors produced by the
 * loaded ONNX embedder, or null before the model is initialized.
 */
function getEmbedderProvenance() {
    if (!isInitialized)
        return null;
    const modelId = loadedModelId ?? DEFAULT_MODEL;
    return {
        embedderKind: (0, embedding_provenance_1.embedderKindForModel)(modelId),
        modelId,
        dimension: getDimension(),
        normalize: loadedNormalize,
        prefixPolicy: (0, embedding_provenance_1.getModelPrefixSpec)(modelId).prefixPolicy,
    };
}
/**
 * Get embedder stats including SIMD and parallel capabilities
 */
function getStats() {
    return {
        ready: isInitialized,
        dimension: embedder ? embedder.dimension() : 384,
        model: DEFAULT_MODEL,
        simd: simdAvailable,
        parallel: parallelEnabled,
        parallelWorkers: parallelEmbedder?.numWorkers || 0,
        parallelThreshold,
    };
}
/**
 * Shutdown parallel workers (call on exit)
 */
async function shutdown() {
    if (parallelEmbedder) {
        await parallelEmbedder.shutdown();
        parallelEmbedder = null;
        parallelEnabled = false;
    }
    await shutdownParallelEmbedder();
}
/**
 * Initialize the bundled-WASM worker pool for high-throughput batch embedding
 * (issue #523 SOTA). Self-contained — uses Node worker_threads + the bundled
 * WASM over SharedArrayBuffer model bytes, no external dependency. Vectors are
 * identical to the single-thread path (cosine-equivalent).
 *
 * @param numWorkers number of worker threads (default: min(cpus-2, 16))
 */
async function initParallelEmbedder(numWorkers) {
    if (bundledPool)
        return true;
    if (!isInitialized)
        await initOnnxEmbedder();
    if (!loadedModelBytes || !loadedTokenizerJson) {
        throw new Error('Model bytes unavailable; cannot start parallel embedder.');
    }
    const poolUrl = (0, url_1.pathToFileURL)(path.join(__dirname, 'onnx', 'bundled-parallel.mjs')).href;
    const { ParallelEmbedder } = await dynamicImport(poolUrl);
    const pool = new ParallelEmbedder({
        modelBytes: loadedModelBytes,
        tokenizerJson: loadedTokenizerJson,
        maxLength: loadedMaxLength,
        dimension: getDimension(),
        numWorkers,
    });
    await pool.init();
    bundledPool = pool;
    return true;
}
/**
 * Batch-embed via the bundled worker pool, sharded across CPU cores. Lazily
 * starts the pool on first use. Returns embeddings in input order.
 */
async function embedBatchParallel(texts) {
    if (!bundledPool)
        await initParallelEmbedder();
    // ADR-210 D4: bulk ingest is the passage path; MiniLM prefixes are empty.
    const prepared = texts.map(t => (0, embedding_provenance_1.prefixText)(loadedModelId ?? DEFAULT_MODEL, 'passage', t));
    return bundledPool.embedBatch(prepared);
}
/** Number of active pool workers (0 if the pool isn't started). */
function getParallelWorkerCount() {
    return bundledPool ? bundledPool.numWorkers : 0;
}
/** Batches at or above this size route through the worker pool (ADR-210 D3). */
exports.BULK_EMBED_THRESHOLD = 32;
let bulkPoolFallbackWarned = false;
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
async function embedBulk(texts, opts = {}) {
    if (!texts || texts.length === 0)
        return [];
    const threshold = opts.threshold ?? exports.BULK_EMBED_THRESHOLD;
    if (!isInitialized) {
        await initOnnxEmbedder();
    }
    if (texts.length >= threshold) {
        try {
            return await embedBatchParallel(texts);
        }
        catch (e) {
            if (!bulkPoolFallbackWarned) {
                bulkPoolFallbackWarned = true;
                console.error(`swarmvector: parallel bulk-embed pool unavailable (${e?.message ?? e}); ` +
                    `using single-threaded batch embedding.`);
            }
        }
    }
    const results = await embedBatch(texts);
    return results.map(r => r.embedding);
}
/** Shut down the bundled worker pool and release its threads. */
async function shutdownParallelEmbedder() {
    if (bundledPool) {
        await bundledPool.shutdown();
        bundledPool = null;
    }
}
// Export class wrapper for compatibility
class OnnxEmbedder {
    constructor(config = {}) {
        this.config = config;
    }
    async init() {
        return initOnnxEmbedder(this.config);
    }
    /** Equivalent to embedPassage() — ADR-210 D4. */
    async embed(text) {
        const result = await embed(text);
        return result.embedding;
    }
    /** Embed a search query with the model's registered query prefix (D4). */
    async embedQuery(text) {
        const result = await embedQuery(text);
        return result.embedding;
    }
    /** Embed a passage/document with the model's registered passage prefix (D4). */
    async embedPassage(text) {
        const result = await embedPassage(text);
        return result.embedding;
    }
    async embedBatch(texts) {
        const results = await embedBatch(texts);
        return results.map(r => r.embedding);
    }
    async similarity(text1, text2) {
        const result = await similarity(text1, text2);
        return result.similarity;
    }
    get dimension() {
        return getDimension();
    }
    get ready() {
        return isReady();
    }
}
exports.OnnxEmbedder = OnnxEmbedder;
exports.default = OnnxEmbedder;
