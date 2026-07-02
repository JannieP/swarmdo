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
import { FilterBuilder } from './FilterBuilder.js';
import { validatePath, validateId, validateMetadata, validateDimension, MAX_BATCH_SIZE, MAX_PENDING_WRITES, MAX_SEARCH_K, DEFAULT_BATCH_THRESHOLD, } from './validation.js';
/** Re-export FilterBuilder for external use */
export { FilterBuilder } from './FilterBuilder.js';
/**
 * RvfBackend - VectorBackend + VectorBackendAsync implementation using @rufvector/rvf
 */
export class RvfBackend {
    name = 'rvf';
    // RVF database handle (unknown since @rufvector/rvf types not available at compile-time)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db = null;
    dim;
    metricType;
    config;
    initialized = false;
    storagePath;
    // Sync insert queue: buffers sync insert() calls, flushed on threshold or explicit flush()
    pending = [];
    batchThreshold;
    // Cached stats (updated on flush/search)
    cachedCount = 0;
    // Performance tracking
    stats = {
        insertCount: 0, insertTotalMs: 0,
        searchCount: 0, searchTotalMs: 0,
        flushCount: 0, compactionCount: 0,
    };
    constructor(config) {
        const dimension = config.dimension ?? config.dimensions;
        if (!dimension) {
            throw new Error('Vector dimension is required (use dimension or dimensions)');
        }
        validateDimension(dimension);
        this.dim = dimension;
        this.metricType = config.metric ?? 'cosine';
        this.config = { ...config, dimension, dimensions: dimension };
        this.storagePath = config.storagePath ?? 'agentdb.rvf';
        this.batchThreshold = Math.min(Math.max(1, config.batchThreshold ?? DEFAULT_BATCH_THRESHOLD), MAX_BATCH_SIZE);
    }
    /**
     * Initialize the RVF database connection.
     * Lazy-loads @rufvector/rvf to avoid hard dependency.
     */
    async initialize() {
        if (this.initialized)
            return;
        const storagePath = this.storagePath;
        if (storagePath !== ':memory:') {
            validatePath(storagePath);
        }
        try {
            const { RvfDatabase } = await import('@rufvector/rvf');
            const rvfBackendType = this.config.rvfBackend ?? 'auto';
            // Map AgentDB metric names to RVF metric names
            const rvfMetric = this.metricType === 'ip' ? 'dotproduct' : this.metricType;
            const fs = await import('fs');
            const fileExists = storagePath !== ':memory:' && fs.existsSync(storagePath);
            if (fileExists) {
                this.db = await RvfDatabase.open(storagePath, rvfBackendType);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const createOpts = {
                    dimensions: this.dim,
                    metric: rvfMetric,
                    m: this.config.M ?? 16,
                    efConstruction: this.config.efConstruction ?? 200,
                };
                if (this.config.compression && this.config.compression !== 'none') {
                    createOpts.compression = this.config.compression;
                }
                if (this.config.hardwareProfile !== undefined) {
                    createOpts.profile = this.config.hardwareProfile;
                }
                this.db = await RvfDatabase.create(storagePath, createOpts, rvfBackendType);
            }
            // Get initial count
            try {
                const status = await this.db.status();
                this.cachedCount = status.totalVectors ?? 0;
            }
            catch {
                this.cachedCount = 0;
            }
            this.initialized = true;
        }
        catch (error) {
            const msg = error.message;
            throw new Error(`RVF backend initialization failed.\n` +
                `Install with: npm install @rufvector/rvf\n` +
                `Error: ${msg}`);
        }
    }
    // ─── Sync VectorBackend interface (queues writes, cached reads) ───
    insert(id, embedding, metadata) {
        this.ensureInitialized();
        validateId(id);
        if (embedding.length !== this.dim) {
            throw new Error(`Vector dimension ${embedding.length} does not match expected ${this.dim}`);
        }
        if (this.pending.length >= MAX_PENDING_WRITES) {
            throw new Error(`Pending write queue full (${MAX_PENDING_WRITES}). Call flush() first.`);
        }
        this.pending.push({
            id,
            vector: embedding instanceof Float32Array ? embedding : new Float32Array(embedding),
            metadata: validateMetadata(metadata),
        });
        if (this.pending.length >= this.batchThreshold) {
            // Fire-and-forget flush (sync interface cannot await)
            this.flush().catch((err) => {
                console.error('[RvfBackend] Auto-flush failed:', err.message);
            });
        }
    }
    insertBatch(items) {
        this.ensureInitialized();
        if (items.length > MAX_BATCH_SIZE) {
            throw new Error(`Batch size ${items.length} exceeds maximum of ${MAX_BATCH_SIZE}`);
        }
        for (const item of items) {
            this.insert(item.id, item.embedding, item.metadata);
        }
    }
    search(_query, _k, _options) {
        // Sync search is not natively supported by RVF.
        // Throw with guidance to use searchAsync().
        throw new Error('RVF backend is async-only for search. Use searchAsync() or the VectorBackendAsync interface.');
    }
    remove(id) {
        // Queue a delete -- sync interface cannot await
        this.ensureInitialized();
        validateId(id);
        // Fire-and-forget with error logging
        this.db.delete([id]).catch((err) => {
            console.error('[RvfBackend] Delete failed:', err.message);
        });
        return true;
    }
    getStats() {
        return {
            count: this.cachedCount + this.pending.length,
            dimension: this.dim,
            metric: this.metricType,
            backend: 'rvf',
            memoryUsage: 0,
        };
    }
    async save(_path) {
        this.ensureInitialized();
        await this.flush();
        await this.db.compact();
    }
    async load(path) {
        validatePath(path);
        const { RvfDatabase } = await import('@rufvector/rvf');
        const rvfBackendType = this.config.rvfBackend ?? 'auto';
        if (this.db) {
            await this.db.close();
        }
        this.db = await RvfDatabase.open(path, rvfBackendType);
        const status = await this.db.status();
        this.cachedCount = status.totalVectors ?? 0;
        this.storagePath = path;
        this.initialized = true;
    }
    close() {
        if (this.db) {
            this.db.close().catch((err) => {
                console.warn('[RvfBackend] Close error:', err.message);
            });
            this.db = null;
        }
        this.pending = [];
        this.initialized = false;
        this.cachedCount = 0;
    }
    // ─── Async VectorBackendAsync interface (native RVF operations) ───
    async insertAsync(id, embedding, metadata) {
        this.ensureInitialized();
        validateId(id);
        if (embedding.length !== this.dim) {
            throw new Error(`Vector dimension ${embedding.length} does not match expected ${this.dim}`);
        }
        const start = this.config.enableStats !== false ? performance.now() : 0;
        await this.db.ingestBatch([{
                id,
                vector: embedding instanceof Float32Array ? embedding : new Float32Array(embedding),
                metadata: validateMetadata(metadata),
            }]);
        this.cachedCount++;
        if (this.config.enableStats !== false) {
            this.stats.insertCount++;
            this.stats.insertTotalMs += performance.now() - start;
        }
    }
    async insertBatchAsync(items) {
        this.ensureInitialized();
        if (items.length > MAX_BATCH_SIZE) {
            throw new Error(`Batch size ${items.length} exceeds maximum of ${MAX_BATCH_SIZE}`);
        }
        if (items.length === 0)
            return;
        const start = this.config.enableStats !== false ? performance.now() : 0;
        const entries = items.map((item) => ({
            id: item.id,
            vector: item.embedding instanceof Float32Array
                ? item.embedding
                : new Float32Array(item.embedding),
            metadata: item.metadata,
        }));
        const result = await this.db.ingestBatch(entries);
        this.cachedCount += result.accepted ?? items.length;
        if (this.config.enableStats !== false) {
            this.stats.insertCount += items.length;
            this.stats.insertTotalMs += performance.now() - start;
        }
    }
    async searchAsync(query, k, options) {
        this.ensureInitialized();
        if (!Number.isFinite(k) || k < 1) {
            throw new Error('k must be a positive finite integer');
        }
        const safeK = Math.min(Math.floor(k), MAX_SEARCH_K);
        const queryVec = query instanceof Float32Array ? query : new Float32Array(query);
        if (queryVec.length !== this.dim) {
            throw new Error(`Query dimension ${queryVec.length} does not match expected ${this.dim}`);
        }
        // Flush pending writes before searching so results are current
        if (this.pending.length > 0) {
            await this.flush();
        }
        const start = this.config.enableStats !== false ? performance.now() : 0;
        const rvfOpts = {};
        if (options?.efSearch)
            rvfOpts.efSearch = options.efSearch;
        if (options?.threshold)
            rvfOpts.minScore = options.threshold;
        // Wire filter expressions through to RVF query options
        if (options?.filter && typeof options.filter === 'object') {
            const builtFilter = FilterBuilder.buildFilter(options.filter);
            if (builtFilter)
                rvfOpts.filter = builtFilter;
        }
        const results = await this.db.query(queryVec, safeK, Object.keys(rvfOpts).length > 0 ? rvfOpts : undefined);
        if (this.config.enableStats !== false) {
            this.stats.searchCount++;
            this.stats.searchTotalMs += performance.now() - start;
        }
        const mapped = [];
        for (const r of results) {
            const similarity = this.distanceToSimilarity(r.distance);
            if (options?.threshold && similarity < options.threshold)
                continue;
            mapped.push({
                id: r.id,
                distance: r.distance,
                similarity,
                metadata: r.metadata,
            });
        }
        return mapped;
    }
    async removeAsync(id) {
        this.ensureInitialized();
        if (!id || typeof id !== 'string')
            return false;
        validateId(id);
        const result = await this.db.delete([id]);
        if (result.deleted > 0) {
            this.cachedCount = Math.max(0, this.cachedCount - result.deleted);
            return true;
        }
        return false;
    }
    async getStatsAsync() {
        this.ensureInitialized();
        const status = await this.db.status();
        this.cachedCount = status.totalVectors ?? 0;
        return {
            count: this.cachedCount + this.pending.length,
            dimension: this.dim,
            metric: this.metricType,
            backend: 'rvf',
            memoryUsage: 0,
        };
    }
    async flush() {
        if (this.pending.length === 0)
            return;
        this.ensureInitialized();
        const batch = this.pending.splice(0, this.pending.length);
        const entries = batch.map((item) => ({
            id: item.id,
            vector: item.vector,
            metadata: item.metadata,
        }));
        // Flush in sub-batches of MAX_BATCH_SIZE for safety
        for (let i = 0; i < entries.length; i += MAX_BATCH_SIZE) {
            const chunk = entries.slice(i, i + MAX_BATCH_SIZE);
            const result = await this.db.ingestBatch(chunk);
            this.cachedCount += result.accepted ?? chunk.length;
        }
        this.stats.flushCount++;
    }
    // ─── RVF-specific extensions ───
    /** Get the cryptographic file identity */
    async fileId() {
        this.ensureInitialized();
        return this.db.fileId();
    }
    /** Get parent store ID (all zeros for root) */
    async parentId() {
        this.ensureInitialized();
        return this.db.parentId();
    }
    /** Get lineage depth (0 for root) */
    async lineageDepth() {
        this.ensureInitialized();
        return this.db.lineageDepth();
    }
    /** Create a COW branch */
    async derive(childPath) {
        this.ensureInitialized();
        validatePath(childPath);
        const childDb = await this.db.derive(childPath);
        const child = new RvfBackend({ ...this.config, storagePath: childPath });
        child.db = childDb;
        child.initialized = true;
        try {
            const status = await childDb.status();
            child.cachedCount = status.totalVectors ?? 0;
        }
        catch {
            child.cachedCount = this.cachedCount;
        }
        return child;
    }
    /** Compact the store (reclaim dead space) */
    async compact() {
        this.ensureInitialized();
        await this.flush();
        const result = await this.db.compact();
        this.stats.compactionCount++;
        return {
            segmentsCompacted: result.segmentsCompacted ?? 0,
            bytesReclaimed: result.bytesReclaimed ?? 0,
        };
    }
    /** Get segment introspection */
    async segments() {
        this.ensureInitialized();
        return this.db.segments();
    }
    /** Get RVF store status */
    async status() {
        this.ensureInitialized();
        const s = await this.db.status();
        this.cachedCount = s.totalVectors ?? 0;
        return { totalVectors: s.totalVectors ?? 0, totalSegments: s.totalSegments ?? 0 };
    }
    /** Get dimension */
    async getDimension() {
        this.ensureInitialized();
        try {
            return await this.db.dimension();
        }
        catch {
            return this.dim;
        }
    }
    /** Get the storage path */
    getStoragePath() {
        return this.storagePath;
    }
    /** Check if the backend is initialized */
    isInitialized() {
        return this.initialized;
    }
    /** Get performance statistics */
    getPerformanceStats() {
        return {
            ...this.stats,
            avgInsertMs: this.stats.insertCount > 0
                ? this.stats.insertTotalMs / this.stats.insertCount
                : 0,
            avgSearchMs: this.stats.searchCount > 0
                ? this.stats.searchTotalMs / this.stats.searchCount
                : 0,
        };
    }
    // ─── AGI Capability Extensions (ADR-004) ───
    /** Get the distance metric name from the RVF store */
    metric() {
        this.ensureInitialized();
        try {
            return this.db.metric();
        }
        catch {
            return this.metricType;
        }
    }
    /** Get HNSW index statistics */
    indexStats() {
        this.ensureInitialized();
        try {
            const raw = this.db.indexStats();
            return {
                indexedVectors: raw.indexedVectors ?? 0,
                layers: raw.layers ?? 0,
                m: raw.m ?? 16,
                efConstruction: raw.efConstruction ?? 200,
                needsRebuild: raw.needsRebuild ?? false,
            };
        }
        catch {
            return {
                indexedVectors: this.cachedCount,
                layers: 0,
                m: 16,
                efConstruction: 200,
                needsRebuild: false,
            };
        }
    }
    /** Verify SHAKE-256 witness chain integrity */
    verifyWitness() {
        this.ensureInitialized();
        try {
            const raw = this.db.verifyWitness();
            return {
                valid: raw.valid ?? false,
                entries: raw.entries ?? 0,
                error: raw.error,
            };
        }
        catch (err) {
            return {
                valid: false,
                entries: 0,
                error: err.message,
            };
        }
    }
    /** Snapshot-freeze state, returns epoch number */
    freeze() {
        this.ensureInitialized();
        return this.db.freeze();
    }
    // ─── ADR-007 Phase 1: Extended RVF APIs ───
    /**
     * Open an existing RVF store for read-only access (no lock required).
     * Enables concurrent reader patterns.
     */
    static async openReadonly(path, config) {
        if (path !== ':memory:') {
            validatePath(path);
        }
        const { RvfDatabase } = await import('@rufvector/rvf');
        const backendType = config?.rvfBackend ?? 'auto';
        const db = await RvfDatabase.openReadonly(path, backendType);
        // Probe dimension from the store
        let dim = config?.dimension ?? config?.dimensions ?? 0;
        try {
            dim = await db.dimension();
        }
        catch {
            if (!dim)
                throw new Error('Cannot determine dimension from read-only store');
        }
        const backend = new RvfBackend({
            dimension: dim,
            metric: config?.metric ?? 'cosine',
            storagePath: path,
            ...config,
        });
        backend.db = db;
        backend.initialized = true;
        try {
            const status = await db.status();
            backend.cachedCount = status.totalVectors ?? 0;
        }
        catch {
            backend.cachedCount = 0;
        }
        return backend;
    }
    /**
     * Delete vectors matching a filter expression.
     * @param filter - RvfFilterExpr or predicate DSL object
     * @returns delete result with count and epoch
     */
    async deleteByFilter(filter) {
        this.ensureInitialized();
        // Accept either a raw RvfFilterExpr or a predicate DSL object
        let rvfFilter;
        if ('op' in filter) {
            rvfFilter = filter;
        }
        else {
            rvfFilter = FilterBuilder.buildFilter(filter);
        }
        if (!rvfFilter) {
            throw new Error('Cannot build filter expression from provided predicates');
        }
        try {
            const result = await this.db.deleteByFilter(rvfFilter);
            if (result.deleted > 0) {
                this.cachedCount = Math.max(0, this.cachedCount - result.deleted);
            }
            return { deleted: result.deleted ?? 0, epoch: result.epoch ?? 0 };
        }
        catch (err) {
            throw new Error(`deleteByFilter failed: ${err.message}`);
        }
    }
    /**
     * Embed a kernel image into the RVF store.
     * @returns segment ID of the embedded kernel
     */
    async embedKernel(arch, kernelType, flags, image, apiPort, cmdline) {
        this.ensureInitialized();
        try {
            return await this.db.embedKernel(arch, kernelType, flags, image, apiPort, cmdline);
        }
        catch (err) {
            throw new Error(`embedKernel failed: ${err.message}`);
        }
    }
    /**
     * Extract the kernel image from the RVF store.
     * @returns kernel data or null if not present
     */
    async extractKernel() {
        this.ensureInitialized();
        try {
            return await this.db.extractKernel();
        }
        catch {
            return null;
        }
    }
    /**
     * Embed an eBPF program into the RVF store.
     * @returns segment ID of the embedded program
     */
    async embedEbpf(programType, attachType, maxDimension, bytecode, btf) {
        this.ensureInitialized();
        try {
            return await this.db.embedEbpf(programType, attachType, maxDimension, bytecode, btf);
        }
        catch (err) {
            throw new Error(`embedEbpf failed: ${err.message}`);
        }
    }
    /**
     * Extract the eBPF program from the RVF store.
     * @returns eBPF data or null if not present
     */
    async extractEbpf() {
        this.ensureInitialized();
        try {
            return await this.db.extractEbpf();
        }
        catch {
            return null;
        }
    }
    // ─── Private helpers ───
    distanceToSimilarity(distance) {
        switch (this.metricType) {
            case 'cosine': return 1 - distance;
            case 'l2': return Math.exp(-distance);
            case 'ip': return -distance;
            default: return 1 - distance;
        }
    }
    ensureInitialized() {
        if (!this.initialized || !this.db) {
            throw new Error('RvfBackend not initialized. Call initialize() first.');
        }
    }
}
//# sourceMappingURL=RvfBackend.js.map