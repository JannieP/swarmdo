/**
 * SqlJsRvfBackend - Built-in RVF persistence using sql.js (WASM SQLite)
 *
 * Provides zero-dependency vector storage in .rvf files when the native
 * @swarmvector/rvf SDK is not installed. Uses sql.js (always available as a
 * hard dependency) for SQLite persistence and SIMD-accelerated brute-force
 * search from src/simd/simd-vector-ops.ts.
 *
 * When @swarmvector/rvf is installed, the factory auto-selects the native
 * RvfBackend instead for HNSW-indexed search.
 *
 * Design:
 * - Reports name='rvf' for compatibility with existing backend checks
 * - Vectors stored as raw Float32Array bytes in BLOB columns
 * - In-memory cache for brute-force search via SIMD ops
 * - Pending write queue with flushSync() before search
 * - save() → db.export() → write Uint8Array to .rvf file
 * - load() → read file → new SQL.Database(buffer) → rebuild cache
 */
import { validatePath, validateId, validateMetadata, validateDimension, MAX_BATCH_SIZE, MAX_PENDING_WRITES, MAX_SEARCH_K, DEFAULT_BATCH_THRESHOLD, } from './validation.js';
import { cosineSimilaritySIMD, euclideanDistanceSIMD, dotProductSIMD, } from '../../simd/simd-vector-ops.js';
const __memfsFinalizer = typeof FinalizationRegistry !== 'undefined'
    ? new FinalizationRegistry((db) => {
        try {
            db?.close();
        }
        catch {
            // Best-effort — the wrapper is already GC'd, nothing to fail back to.
        }
    })
    : null;
// Module-level open-instance counter. Bounded — we increment on register,
// decrement on unregister. Used by `SqlJsRvfBackend.openCount()` for leak
// detection (the WeakSet path needs FinalizationRegistry to decrement on GC
// too, which we do via the unregister token).
let __openCount = 0;
/**
 * SqlJsRvfBackend - VectorBackend + VectorBackendAsync using sql.js WASM
 */
export class SqlJsRvfBackend {
    name = 'rvf';
    // sql.js database handle
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db = null;
    dim;
    metricType;
    initialized = false;
    storagePath;
    // In-memory vector cache for brute-force search
    cache = new Map();
    // Sync insert queue
    pending = [];
    batchThreshold;
    constructor(config) {
        const dimension = config.dimension ?? config.dimensions;
        if (!dimension) {
            throw new Error('Vector dimension is required (use dimension or dimensions)');
        }
        validateDimension(dimension);
        this.dim = dimension;
        this.metricType = config.metric ?? 'cosine';
        this.storagePath = config.storagePath ?? ':memory:';
        this.batchThreshold = Math.min(Math.max(1, config.batchThreshold ?? DEFAULT_BATCH_THRESHOLD), MAX_BATCH_SIZE);
    }
    /**
     * Initialize the sql.js database and create schema.
     */
    async initialize() {
        if (this.initialized)
            return;
        if (this.storagePath !== ':memory:') {
            validatePath(this.storagePath);
        }
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        // Try to load existing file
        let fileBuffer = null;
        if (this.storagePath !== ':memory:') {
            try {
                const fs = await import('fs');
                if (fs.existsSync(this.storagePath)) {
                    fileBuffer = new Uint8Array(fs.readFileSync(this.storagePath));
                }
            }
            catch {
                // File doesn't exist or can't be read — start fresh
            }
        }
        this.db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
        this.createSchema();
        this.rebuildCache();
        this.initialized = true;
        this._registerForFinalization();
    }
    // ─── Sync VectorBackend interface ───
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
            this.flush().catch((err) => {
                console.error('[SqlJsRvfBackend] Auto-flush failed:', err.message);
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
    search(query, k, options) {
        this.ensureInitialized();
        // Flush pending writes synchronously by writing directly
        this.flushSync();
        return this.bruteForceSearch(query, k, options);
    }
    remove(id) {
        this.ensureInitialized();
        validateId(id);
        this.db.run('DELETE FROM rvf_vectors WHERE id = ?', [id]);
        this.cache.delete(id);
        return true;
    }
    getStats() {
        return {
            count: this.cache.size + this.pending.length,
            dimension: this.dim,
            metric: this.metricType,
            backend: 'rvf',
            memoryUsage: 0,
        };
    }
    async save(savePath) {
        this.ensureInitialized();
        await this.flush();
        const targetPath = savePath || this.storagePath;
        if (targetPath === ':memory:')
            return;
        validatePath(targetPath);
        const data = this.db.export();
        const fs = await import('fs');
        fs.writeFileSync(targetPath, data);
    }
    async load(loadPath) {
        validatePath(loadPath);
        const fs = await import('fs');
        const buffer = new Uint8Array(fs.readFileSync(loadPath));
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        if (this.db) {
            this._unregisterFromFinalization();
            this.db.close();
        }
        this.db = new SQL.Database(buffer);
        this.createSchema(); // ensure schema exists
        this.rebuildCache();
        this.storagePath = loadPath;
        this.initialized = true;
        this._registerForFinalization();
    }
    close() {
        if (this.db) {
            // Flush pending writes
            this.flushSync();
            // Auto-save if we have a file path
            if (this.storagePath !== ':memory:') {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const fs = require('fs');
                    const data = this.db.export();
                    fs.writeFileSync(this.storagePath, data);
                }
                catch {
                    // Best-effort save on close
                }
            }
            // swarmdo#2432 fix — unregister from FinalizationRegistry BEFORE close()
            // so the finalizer doesn't double-close on later GC.
            this._unregisterFromFinalization();
            this.db.close();
            this.db = null;
        }
        this.pending = [];
        this.cache.clear();
        this.initialized = false;
    }
    // ─── MEMFS leak safety net (swarmdo#2432) ───────────────────────────────────
    /**
     * Register the current `this.db` with the module-level FinalizationRegistry
     * so a MEMFS file is reclaimed if the caller forgets to call `close()`.
     *
     * This is a safety net, NOT a substitute for explicit lifecycle management.
     * Consumers that close explicitly hit no overhead (we unregister on close).
     * The finalizer runs only when the JS wrapper is GC'd without `.close()`
     * being called first.
     */
    _registerForFinalization() {
        if (!__memfsFinalizer || !this.db)
            return;
        // Token MUST be unique per instance — using `this` makes unregister O(1).
        __memfsFinalizer.register(this, this.db, this);
        __openCount++;
    }
    /**
     * Inverse of _registerForFinalization. Idempotent — safe to call multiple
     * times or when never-registered. Used by `close()` and by `load()` before
     * replacing `this.db`.
     */
    _unregisterFromFinalization() {
        if (!__memfsFinalizer)
            return;
        const wasRegistered = __memfsFinalizer.unregister(this);
        if (wasRegistered)
            __openCount--;
    }
    /**
     * Number of currently-open SqlJsRvfBackend instances in this process.
     *
     * Diagnostic only — `process.memoryUsage().external` growth correlated with
     * `openCount()` growth is the signature of the swarmdo#2432 leak class. Use
     * in monitoring dashboards: alert when `openCount()` grows without bound
     * relative to expected controller cardinality.
     */
    static openCount() {
        return __openCount;
    }
    // ─── Async VectorBackendAsync interface ───
    async insertAsync(id, embedding, metadata) {
        this.ensureInitialized();
        validateId(id);
        if (embedding.length !== this.dim) {
            throw new Error(`Vector dimension ${embedding.length} does not match expected ${this.dim}`);
        }
        const vec = embedding instanceof Float32Array ? embedding : new Float32Array(embedding);
        const cleanMeta = validateMetadata(metadata);
        this.writeVector(id, vec, cleanMeta);
    }
    async insertBatchAsync(items) {
        this.ensureInitialized();
        if (items.length > MAX_BATCH_SIZE) {
            throw new Error(`Batch size ${items.length} exceeds maximum of ${MAX_BATCH_SIZE}`);
        }
        if (items.length === 0)
            return;
        this.db.run('BEGIN TRANSACTION');
        try {
            for (const item of items) {
                validateId(item.id);
                if (item.embedding.length !== this.dim) {
                    throw new Error(`Vector dimension ${item.embedding.length} does not match expected ${this.dim}`);
                }
                const vec = item.embedding instanceof Float32Array ? item.embedding : new Float32Array(item.embedding);
                const cleanMeta = validateMetadata(item.metadata);
                this.writeVector(item.id, vec, cleanMeta);
            }
            this.db.run('COMMIT');
        }
        catch (err) {
            this.db.run('ROLLBACK');
            throw err;
        }
    }
    async searchAsync(query, k, options) {
        this.ensureInitialized();
        if (this.pending.length > 0) {
            await this.flush();
        }
        return this.bruteForceSearch(query, k, options);
    }
    async removeAsync(id) {
        this.ensureInitialized();
        if (!id || typeof id !== 'string')
            return false;
        validateId(id);
        this.db.run('DELETE FROM rvf_vectors WHERE id = ?', [id]);
        const existed = this.cache.has(id);
        this.cache.delete(id);
        return existed;
    }
    async getStatsAsync() {
        return this.getStats();
    }
    async flush() {
        if (this.pending.length === 0)
            return;
        this.ensureInitialized();
        this.flushSync();
    }
    // ─── Extra public helpers ───
    /**
     * Expose the raw sql.js Database instance for unified single-file mode.
     * AgentDB uses this to load relational schemas into the same database.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getDatabase() {
        if (!this.initialized || !this.db) {
            throw new Error('SqlJsRvfBackend not initialized. Call initialize() first.');
        }
        return this.db;
    }
    getStoragePath() {
        return this.storagePath;
    }
    isInitialized() {
        return this.initialized;
    }
    // ─── Private implementation ───
    createSchema() {
        this.db.run(`
      CREATE TABLE IF NOT EXISTS rvf_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
        this.db.run(`
      CREATE TABLE IF NOT EXISTS rvf_vectors (
        id TEXT PRIMARY KEY,
        embedding BLOB NOT NULL,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      )
    `);
        // Store dimension and metric for validation on load
        this.db.run(`INSERT OR REPLACE INTO rvf_meta (key, value) VALUES ('dimension', ?), ('metric', ?)`, [String(this.dim), this.metricType]);
    }
    rebuildCache() {
        this.cache.clear();
        const rows = this.db.exec('SELECT id, embedding, metadata FROM rvf_vectors');
        if (rows.length === 0)
            return;
        const result = rows[0];
        for (const row of result.values) {
            const id = row[0];
            const blob = row[1];
            const metaStr = row[2];
            const embedding = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
            let metadata;
            if (metaStr) {
                try {
                    metadata = JSON.parse(metaStr);
                }
                catch { /* skip bad metadata */ }
            }
            this.cache.set(id, { embedding: new Float32Array(embedding), metadata });
        }
    }
    writeVector(id, vec, metadata) {
        const blob = new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
        const metaStr = metadata ? JSON.stringify(metadata) : null;
        this.db.run('INSERT OR REPLACE INTO rvf_vectors (id, embedding, metadata) VALUES (?, ?, ?)', [id, blob, metaStr]);
        this.cache.set(id, { embedding: new Float32Array(vec), metadata });
    }
    flushSync() {
        if (this.pending.length === 0)
            return;
        const batch = this.pending.splice(0, this.pending.length);
        this.db.run('BEGIN TRANSACTION');
        try {
            for (const item of batch) {
                this.writeVector(item.id, item.vector, item.metadata);
            }
            this.db.run('COMMIT');
        }
        catch (err) {
            this.db.run('ROLLBACK');
            throw err;
        }
    }
    bruteForceSearch(query, k, options) {
        if (!Number.isFinite(k) || k < 1) {
            throw new Error('k must be a positive finite integer');
        }
        const safeK = Math.min(Math.floor(k), MAX_SEARCH_K);
        const queryVec = query instanceof Float32Array ? query : new Float32Array(query);
        if (queryVec.length !== this.dim) {
            throw new Error(`Query dimension ${queryVec.length} does not match expected ${this.dim}`);
        }
        const threshold = options?.threshold ?? 0;
        const results = [];
        for (const [id, entry] of this.cache) {
            // Apply metadata filter if provided
            if (options?.filter && !this.matchesFilter(entry.metadata, options.filter)) {
                continue;
            }
            const { similarity, distance } = this.computeScore(queryVec, entry.embedding);
            if (similarity >= threshold) {
                results.push({ id, distance, similarity, metadata: entry.metadata });
            }
        }
        // Sort by similarity descending
        results.sort((a, b) => b.similarity - a.similarity);
        return results.slice(0, safeK);
    }
    computeScore(query, candidate) {
        switch (this.metricType) {
            case 'cosine': {
                const similarity = cosineSimilaritySIMD(query, candidate);
                return { similarity, distance: 1 - similarity };
            }
            case 'l2': {
                const distance = euclideanDistanceSIMD(query, candidate);
                return { similarity: Math.exp(-distance), distance };
            }
            case 'ip': {
                const dp = dotProductSIMD(query, candidate);
                return { similarity: dp, distance: -dp };
            }
            default: {
                const sim = cosineSimilaritySIMD(query, candidate);
                return { similarity: sim, distance: 1 - sim };
            }
        }
    }
    matchesFilter(metadata, filter) {
        if (!metadata)
            return false;
        for (const [key, value] of Object.entries(filter)) {
            if (metadata[key] !== value)
                return false;
        }
        return true;
    }
    ensureInitialized() {
        if (!this.initialized || !this.db) {
            throw new Error('SqlJsRvfBackend not initialized. Call initialize() first.');
        }
    }
}
//# sourceMappingURL=SqlJsRvfBackend.js.map