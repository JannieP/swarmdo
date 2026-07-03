"use strict";
/**
 * DiskANN Wrapper — Vamana graph ANN for billion-scale vector search
 *
 * Wraps @swarmvector/diskann for SSD-friendly approximate nearest neighbor search.
 * Provides the same lazy-load pattern as other native wrappers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiskAnnIndex = void 0;
exports.isDiskAnnAvailable = isDiskAnnAvailable;
let diskannModule = null;
let loadError = null;
function getDiskAnnModule() {
    if (diskannModule)
        return diskannModule;
    if (loadError)
        throw loadError;
    try {
        diskannModule = require('@swarmvector/diskann');
        return diskannModule;
    }
    catch (e) {
        loadError = new Error(`@swarmvector/diskann not installed: ${e.message}\n` +
            `Install with: npm install @swarmvector/diskann`);
        throw loadError;
    }
}
function isDiskAnnAvailable() {
    try {
        getDiskAnnModule();
        return true;
    }
    catch {
        return false;
    }
}
/**
 * DiskANN index for large-scale approximate nearest neighbor search.
 *
 * Uses the Vamana graph algorithm with optional Product Quantization.
 * Build after all inserts, then search.
 */
class DiskAnnIndex {
    constructor(config) {
        const mod = getDiskAnnModule();
        this.inner = new mod.DiskAnn({
            dim: config.dim,
            maxDegree: config.maxDegree ?? 64,
            buildBeam: config.buildBeam ?? 128,
            searchBeam: config.searchBeam ?? 64,
            alpha: config.alpha ?? 1.2,
            pqSubspaces: config.pqSubspaces ?? 0,
            pqIterations: config.pqIterations ?? 10,
            storagePath: config.storagePath,
        });
    }
    /** Insert a vector with a string ID */
    insert(id, vector) {
        const v = vector instanceof Float32Array ? vector : new Float32Array(vector);
        this.inner.insert(id, v);
    }
    /** Insert a batch of vectors (flat Float32Array: N * dim) */
    insertBatch(ids, vectors, dim) {
        this.inner.insertBatch(ids, vectors, dim);
    }
    /** Build the Vamana graph index (required before search) */
    build() {
        this.inner.build();
    }
    /** Build index asynchronously */
    async buildAsync() {
        return this.inner.buildAsync();
    }
    /** Search for k nearest neighbors */
    search(query, k = 10) {
        const q = query instanceof Float32Array ? query : new Float32Array(query);
        return this.inner.search(q, k);
    }
    /** Search asynchronously */
    async searchAsync(query, k = 10) {
        const q = query instanceof Float32Array ? query : new Float32Array(query);
        return this.inner.searchAsync(q, k);
    }
    /** Delete a vector by ID */
    delete(id) {
        return this.inner.delete(id);
    }
    /** Get the number of vectors */
    count() {
        return this.inner.count();
    }
    /** Save index to directory */
    save(dir) {
        this.inner.save(dir);
    }
    /** Load index from directory */
    static load(dir) {
        const mod = getDiskAnnModule();
        const instance = new DiskAnnIndex({ dim: 1 }); // placeholder
        instance.inner = mod.DiskAnn.load(dir);
        return instance;
    }
}
exports.DiskAnnIndex = DiskAnnIndex;
exports.default = DiskAnnIndex;
