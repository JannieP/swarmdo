/**
 * NativeAccelerator - ADR-007 Phase 1 Capability Bridge
 *
 * Lazy-loads @swarmvector APIs and provides accelerated alternatives to JS
 * implementations. All imports are lazy/optional with JS fallbacks.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { WasmStoreBridge } from './WasmStoreBridge.js';
import * as fb from './SimdFallbacks.js';
export { WasmStoreBridge } from './WasmStoreBridge.js';
const MAX_DIM = 4096;
export class NativeAccelerator {
    _simd = null;
    _witnessVerify = null;
    _witnessCount = null;
    _verifyHeader = null;
    _crc32c = null;
    _infoNceLoss = null;
    _adamWOptimizer = null;
    _tensorCompress = null;
    _routerSave = null;
    _routerLoad = null;
    _sonaFlush = false;
    _sonaContext = false;
    _sonaBaseLora = false;
    _graphTx = false;
    _graphBatchInsert = false;
    _graphCypher = false;
    _coreBatchInsert = false;
    _ewcManager = null;
    _sqLoad = null;
    _dequantI8 = null;
    _pqLoadCodebook = null;
    _pqDistances = null;
    _wasmStore = new WasmStoreBridge();
    _initialized = false;
    async initialize() {
        if (this._initialized)
            return this.getStats();
        await Promise.allSettled([
            this.loadSimd(), this.loadWasmVerify(), this.loadWasmQuantization(),
            this.loadWasmStore(), this.loadNativeAttention(), this.loadNativeTensorCompress(),
            this.loadRouterPersistence(), this.loadSonaExtended(),
            this.loadGraphCapabilities(), this.loadCoreBatch(), this.loadEwcManager(),
        ]);
        this._initialized = true;
        return this.getStats();
    }
    // ─── SIMD Vector Math ───
    get simdAvailable() { return this._simd !== null; }
    cosineSimilarity(a, b) {
        this.validateDims(a, b);
        if (this._simd) {
            try {
                return this._simd.cosineSimilarity(a, b);
            }
            catch { /* fallback */ }
        }
        return fb.jsCosineSimilarity(a, b);
    }
    dotProduct(a, b) {
        this.validateDims(a, b);
        if (this._simd) {
            try {
                return this._simd.dotProduct(a, b);
            }
            catch { /* fallback */ }
        }
        return fb.jsDotProduct(a, b);
    }
    l2Distance(a, b) {
        this.validateDims(a, b);
        if (this._simd) {
            try {
                return this._simd.l2Distance(a, b);
            }
            catch { /* fallback */ }
        }
        return fb.jsL2Distance(a, b);
    }
    hammingDistance(a, b) {
        if (a.length !== b.length)
            throw new Error(`Length mismatch: ${a.length} vs ${b.length}`);
        if (this._simd) {
            try {
                return this._simd.hammingDistance(a, b);
            }
            catch { /* fallback */ }
        }
        return fb.jsHammingDistance(a, b);
    }
    // ─── SIMD Activations & Element-wise Ops ───
    get simdActivationsAvailable() { return this._simd !== null; }
    matvec(matrix, vector) {
        if (this._simd) {
            try {
                return this._simd.matvec(matrix, vector);
            }
            catch { /* fallback */ }
        }
        return fb.jsMatvec(matrix, vector);
    }
    softmax(input) {
        if (this._simd) {
            try {
                return this._simd.softmax(input);
            }
            catch { /* fallback */ }
        }
        return fb.jsSoftmax(input);
    }
    relu(input) {
        if (this._simd) {
            try {
                return this._simd.relu(input);
            }
            catch { /* fallback */ }
        }
        return fb.jsRelu(input);
    }
    gelu(input) {
        if (this._simd) {
            try {
                return this._simd.gelu(input);
            }
            catch { /* fallback */ }
        }
        return fb.jsGelu(input);
    }
    sigmoid(input) {
        if (this._simd) {
            try {
                return this._simd.sigmoid(input);
            }
            catch { /* fallback */ }
        }
        return fb.jsSigmoid(input);
    }
    layerNorm(input, eps = 1e-5) {
        if (this._simd) {
            try {
                return this._simd.layerNorm(input, eps);
            }
            catch { /* fallback */ }
        }
        return fb.jsLayerNorm(input, eps);
    }
    add(a, b) {
        if (a.length !== b.length)
            throw new Error(`Length mismatch: ${a.length} vs ${b.length}`);
        if (this._simd) {
            try {
                return this._simd.add(a, b);
            }
            catch { /* fallback */ }
        }
        return fb.jsAdd(a, b);
    }
    mul(a, b) {
        if (a.length !== b.length)
            throw new Error(`Length mismatch: ${a.length} vs ${b.length}`);
        if (this._simd) {
            try {
                return this._simd.mul(a, b);
            }
            catch { /* fallback */ }
        }
        return fb.jsMul(a, b);
    }
    scale(a, scalar) {
        if (this._simd) {
            try {
                return this._simd.scale(a, scalar);
            }
            catch { /* fallback */ }
        }
        return fb.jsScale(a, scalar);
    }
    normalizeVec(a) {
        if (this._simd) {
            try {
                return this._simd.normalize(a);
            }
            catch { /* fallback */ }
        }
        return fb.jsNormalizeVec(a);
    }
    // ─── WASM Quantization Bridge ───
    get wasmQuantizationAvailable() { return this._sqLoad !== null; }
    loadSqParams(params, dim) {
        if (this._sqLoad) {
            try {
                return this._sqLoad(params, dim);
            }
            catch { /* fallback */ }
        }
        return false;
    }
    dequantI8(src, dst, count) {
        if (this._dequantI8) {
            try {
                return this._dequantI8(src, dst, count);
            }
            catch { /* fallback */ }
        }
        return false;
    }
    loadPqCodebook(codebook, m, k) {
        if (this._pqLoadCodebook) {
            try {
                return this._pqLoadCodebook(codebook, m, k);
            }
            catch { /* fallback */ }
        }
        return false;
    }
    pqDistances(codes, count) {
        if (this._pqDistances) {
            try {
                return this._pqDistances(codes, count);
            }
            catch { /* fallback */ }
        }
        return null;
    }
    // ─── WASM Store Bridge ───
    get wasmStoreAvailable() { return this._wasmStore.available; }
    get wasmStore() { return this._wasmStore; }
    wasmStoreCreate(dim, metric) {
        return this._wasmStore.wasmStoreCreate(dim, metric);
    }
    wasmStoreIngest(handle, vecs, ids, count) {
        return this._wasmStore.wasmStoreIngest(handle, vecs, ids, count);
    }
    wasmStoreQuery(handle, query, k, metric) {
        return this._wasmStore.wasmStoreQuery(handle, query, k, metric);
    }
    wasmStoreExport(handle) {
        return this._wasmStore.wasmStoreExport(handle);
    }
    wasmStoreClose(handle) {
        return this._wasmStore.wasmStoreClose(handle);
    }
    // ─── WASM Verification ───
    get wasmVerifyAvailable() { return this._witnessVerify !== null; }
    verifyWitnessChain(chain) {
        if (!chain || chain.length === 0)
            return { valid: false, entryCount: 0 };
        const entryCount = Math.floor(chain.length / 73);
        if (this._witnessVerify && this._witnessCount) {
            try {
                return { valid: this._witnessVerify(chain), entryCount: this._witnessCount(chain) };
            }
            catch { /* fallback */ }
        }
        return { valid: chain.length > 0 && chain.length % 73 === 0, entryCount };
    }
    verifySegmentHeader(data) {
        if (!data || data.length < 4)
            return { valid: false, crc: 0 };
        if (this._verifyHeader && this._crc32c) {
            try {
                return { valid: this._verifyHeader(data), crc: this._crc32c(data) };
            }
            catch { /* fallback */ }
        }
        const valid = data[0] === 0x52 && data[1] === 0x56 && data[2] === 0x46;
        return { valid, crc: fb.jsCrc32c(data) };
    }
    // ─── Native InfoNCE Loss ───
    get nativeInfoNceAvailable() { return this._infoNceLoss !== null; }
    infoNceLoss(anchor, positive, negatives, temperature) {
        if (this._infoNceLoss) {
            try {
                return this._infoNceLoss.compute(anchor, positive, negatives, temperature);
            }
            catch { /* fallback */ }
        }
        return fb.jsInfoNceLoss(anchor, positive, negatives, temperature);
    }
    // ─── Native AdamW Optimizer ───
    get nativeAdamWAvailable() { return this._adamWOptimizer !== null; }
    adamWStep(params, grads, m, v, step, lr, wd) {
        if (this._adamWOptimizer) {
            try {
                this._adamWOptimizer.step(params, grads, m, v, step, lr, wd);
                return;
            }
            catch { /* fallback */ }
        }
        fb.jsAdamWStep(params, grads, m, v, step, lr, wd);
    }
    // ─── Native Tensor Compression ───
    get nativeTensorCompressAvailable() { return this._tensorCompress !== null; }
    tensorCompress(vec, level) {
        if (this._tensorCompress) {
            try {
                return this._tensorCompress.compress(vec, level);
            }
            catch { /* fallback */ }
        }
        return null;
    }
    tensorDecompress(compressed, dim) {
        if (this._tensorCompress) {
            try {
                return this._tensorCompress.decompress(compressed, dim);
            }
            catch { /* fallback */ }
        }
        return null;
    }
    tensorBatchCompress(vecs, level) {
        if (this._tensorCompress) {
            try {
                return this._tensorCompress.batchCompress(vecs, level);
            }
            catch { /* fallback */ }
        }
        return null;
    }
    // ─── Router Persistence ───
    get routerPersistAvailable() { return this._routerSave !== null; }
    async routerSave(router, path) {
        if (this._routerSave) {
            try {
                await this._routerSave(router, path);
                return true;
            }
            catch { /* fallback */ }
        }
        return false;
    }
    async routerLoad(path) {
        if (this._routerLoad) {
            try {
                return await this._routerLoad(path);
            }
            catch { /* fallback */ }
        }
        return null;
    }
    // ─── SONA Extended ───
    get sonaExtendedAvailable() { return this._sonaFlush || this._sonaContext || this._sonaBaseLora; }
    sonaAddContext(engine, trajectoryId, context) {
        if (this._sonaContext && engine) {
            try {
                engine.addTrajectoryContext(trajectoryId, JSON.stringify(context));
                return true;
            }
            catch { /* skip */ }
        }
        return false;
    }
    sonaFlush(engine) {
        if (this._sonaFlush && engine) {
            try {
                engine.flush();
                return true;
            }
            catch { /* skip */ }
        }
        return false;
    }
    sonaApplyBaseLora(engine, loraData) {
        if (this._sonaBaseLora && engine) {
            try {
                engine.applyBaseLora(Array.from(loraData));
                return true;
            }
            catch { /* skip */ }
        }
        return false;
    }
    // ─── Graph Transactions (ADR-007 Phase 1) ───
    get graphTxAvailable() { return this._graphTx; }
    get graphBatchInsertAvailable() { return this._graphBatchInsert; }
    get graphCypherAvailable() { return this._graphCypher; }
    async graphTransaction(db, fn) {
        if (this._graphTx && db?.beginTransaction) {
            const tx = db.beginTransaction();
            try {
                await fn(tx);
                tx.commit();
                return true;
            }
            catch {
                tx.rollback();
                return false;
            }
        }
        try {
            await fn(db);
            return true;
        }
        catch {
            return false;
        }
    }
    graphBatchInsertNodes(db, nodes) {
        if (this._graphBatchInsert && db?.batchInsert) {
            try {
                db.batchInsert(nodes);
                return true;
            }
            catch { /* fallback */ }
        }
        return false;
    }
    graphCypherQuery(db, query, params) {
        if (this._graphCypher && db?.cypher) {
            try {
                return db.cypher(query, params);
            }
            catch { /* fallback */ }
        }
        return null;
    }
    // ─── Core Batch Operations (ADR-007 Phase 1) ───
    get coreBatchInsertAvailable() { return this._coreBatchInsert; }
    coreBatchInsert(vectorDb, items) {
        if (this._coreBatchInsert && vectorDb?.batchInsert) {
            try {
                vectorDb.batchInsert(items);
                return true;
            }
            catch { /* fallback */ }
        }
        return false;
    }
    // ─── EWC Memory Protection (ADR-007 Phase 1) ───
    get ewcManagerAvailable() { return this._ewcManager !== null; }
    ewcPenalty(params) {
        if (this._ewcManager) {
            try {
                return this._ewcManager.computePenalty(Array.from(params));
            }
            catch { /* fallback */ }
        }
        return 0;
    }
    ewcUpdateFisher(params, importance) {
        if (this._ewcManager) {
            try {
                this._ewcManager.updateFisher(Array.from(params), importance);
                return true;
            }
            catch { /* fallback */ }
        }
        return false;
    }
    // ─── Stats ───
    getStats() {
        const capabilities = [];
        if (this._simd) {
            capabilities.push('simd', 'simd-activations');
        }
        if (this._witnessVerify)
            capabilities.push('wasm-verify');
        if (this._wasmStore.available)
            capabilities.push('wasm-store');
        if (this._sqLoad)
            capabilities.push('wasm-quantization');
        if (this._infoNceLoss)
            capabilities.push('native-infonce');
        if (this._adamWOptimizer)
            capabilities.push('native-adamw');
        if (this._tensorCompress)
            capabilities.push('native-tensor-compress');
        if (this._routerSave)
            capabilities.push('router-persist');
        if (this._sonaFlush || this._sonaContext || this._sonaBaseLora)
            capabilities.push('sona-extended');
        if (this._graphTx)
            capabilities.push('graph-tx');
        if (this._graphBatchInsert)
            capabilities.push('graph-batch');
        if (this._graphCypher)
            capabilities.push('graph-cypher');
        if (this._coreBatchInsert)
            capabilities.push('core-batch');
        if (this._ewcManager)
            capabilities.push('ewc-manager');
        return {
            simdAvailable: this._simd !== null,
            simdActivationsAvailable: this._simd !== null,
            wasmVerifyAvailable: this._witnessVerify !== null,
            wasmStoreAvailable: this._wasmStore.available,
            wasmQuantizationAvailable: this._sqLoad !== null,
            nativeInfoNceAvailable: this._infoNceLoss !== null,
            nativeAdamWAvailable: this._adamWOptimizer !== null,
            nativeTensorCompressAvailable: this._tensorCompress !== null,
            routerPersistAvailable: this._routerSave !== null,
            sonaExtendedAvailable: this._sonaFlush || this._sonaContext || this._sonaBaseLora,
            capabilities,
        };
    }
    // ─── Loaders ───
    async loadSimd() {
        try {
            const { SimdOps } = await import('@swarmvector/swarmllm');
            if (SimdOps)
                this._simd = new SimdOps();
        }
        catch { /* not available */ }
    }
    async loadWasmVerify() {
        try {
            const wasm = await import('@swarmvector/rvf-wasm');
            if (wasm.rvf_witness_verify)
                this._witnessVerify = wasm.rvf_witness_verify;
            if (wasm.rvf_witness_count)
                this._witnessCount = wasm.rvf_witness_count;
            if (wasm.rvf_verify_header)
                this._verifyHeader = wasm.rvf_verify_header;
            if (wasm.rvf_crc32c)
                this._crc32c = wasm.rvf_crc32c;
        }
        catch { /* not available */ }
    }
    async loadWasmQuantization() {
        try {
            const wasm = await import('@swarmvector/rvf-wasm');
            if (wasm.rvf_sq_load_params)
                this._sqLoad = wasm.rvf_sq_load_params;
            if (wasm.rvf_dequant_i8)
                this._dequantI8 = wasm.rvf_dequant_i8;
            if (wasm.rvf_pq_load_codebook)
                this._pqLoadCodebook = wasm.rvf_pq_load_codebook;
            if (wasm.rvf_pq_distances)
                this._pqDistances = wasm.rvf_pq_distances;
        }
        catch { /* not available */ }
    }
    async loadWasmStore() { await this._wasmStore.initialize(); }
    async loadNativeAttention() {
        try {
            const attn = await import('@swarmvector/attention');
            if (attn.InfoNceLoss)
                this._infoNceLoss = new attn.InfoNceLoss();
            if (attn.AdamWOptimizer)
                this._adamWOptimizer = new attn.AdamWOptimizer();
        }
        catch { /* not available */ }
    }
    async loadNativeTensorCompress() {
        try {
            const gnnMod = await import('@swarmvector/gnn');
            if (gnnMod.TensorCompress?.compress)
                this._tensorCompress = gnnMod.TensorCompress;
        }
        catch { /* not available */ }
    }
    async loadRouterPersistence() {
        try {
            const router = await import('@swarmvector/router');
            if (router.SemanticRouter?.prototype?.save) {
                this._routerSave = async (r, p) => r.save(p);
                this._routerLoad = async (p) => router.SemanticRouter.load(p);
            }
        }
        catch { /* not available */ }
    }
    async loadSonaExtended() {
        try {
            const sonaMod = await import('@swarmvector/sona');
            if (sonaMod.SonaEngine?.prototype?.flush)
                this._sonaFlush = true;
            if (sonaMod.SonaEngine?.prototype?.addTrajectoryContext)
                this._sonaContext = true;
            if (sonaMod.SonaEngine?.prototype?.applyBaseLora)
                this._sonaBaseLora = true;
        }
        catch { /* not available */ }
    }
    async loadGraphCapabilities() {
        try {
            const graphMod = await import('@swarmvector/graph-node');
            if (graphMod.GraphDatabase?.prototype?.beginTransaction)
                this._graphTx = true;
            if (graphMod.GraphDatabase?.prototype?.batchInsert)
                this._graphBatchInsert = true;
            if (graphMod.GraphDatabase?.prototype?.cypher)
                this._graphCypher = true;
        }
        catch { /* not available */ }
    }
    async loadCoreBatch() {
        try {
            const coreMod = await import('@swarmvector/core');
            if (coreMod.VectorDb?.prototype?.batchInsert)
                this._coreBatchInsert = true;
        }
        catch { /* not available */ }
    }
    async loadEwcManager() {
        try {
            const { EwcManager } = await import('@swarmvector/swarmllm');
            if (EwcManager)
                this._ewcManager = new EwcManager();
        }
        catch { /* not available */ }
    }
    validateDims(a, b) {
        if (a.length !== b.length)
            throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
        if (a.length > MAX_DIM)
            throw new Error(`Dimension exceeds maximum: ${a.length} > ${MAX_DIM}`);
    }
}
let _globalAccelerator = null;
let _initPromise = null;
export async function getAccelerator() {
    if (_globalAccelerator)
        return _globalAccelerator;
    if (!_initPromise) {
        _initPromise = (async () => {
            const accel = new NativeAccelerator();
            await accel.initialize();
            _globalAccelerator = accel;
            return accel;
        })();
    }
    return _initPromise;
}
export function resetAccelerator() {
    _globalAccelerator = null;
    _initPromise = null;
}
//# sourceMappingURL=NativeAccelerator.js.map