"use strict";
/**
 * rufvector - High-performance vector database for Node.js
 *
 * This package automatically detects and uses the best available implementation:
 * 1. Native (Rust-based, fastest) - if available for your platform
 * 2. RVF (persistent store) - if @rufvector/rvf is installed
 * 3. Stub (testing fallback) - limited functionality
 *
 * Also provides safe wrappers for GNN and Attention modules that handle
 * array type conversions automatically.
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Utils = exports.VectorIndex = exports.NativeVectorDb = exports.VectorDB = exports.VectorDb = void 0;
exports.getImplementationType = getImplementationType;
exports.isNative = isNative;
exports.isRvf = isRvf;
exports.isWasm = isWasm;
exports.getVersion = getVersion;
exports.getBackendInfo = getBackendInfo;
exports.isNativeAvailable = isNativeAvailable;
__exportStar(require("./types"), exports);
// Export core wrappers (safe interfaces with automatic type conversion)
__exportStar(require("./core"), exports);
__exportStar(require("./services"), exports);
let implementation;
let implementationType = 'wasm';
// Check for explicit --backend rvf flag or RUVECTOR_BACKEND env var
const rvfRequested = process.env.RUVECTOR_BACKEND === 'rvf' ||
    process.argv.includes('--backend') && process.argv[process.argv.indexOf('--backend') + 1] === 'rvf';
if (rvfRequested) {
    // Explicit rvf backend requested - fail hard if not available
    try {
        implementation = require('@rufvector/rvf');
        implementationType = 'rvf';
    }
    catch (e) {
        throw new Error('@rufvector/rvf is not installed.\n' +
            '  Run: npm install @rufvector/rvf\n' +
            '  The --backend rvf flag requires this package.');
    }
}
else {
    try {
        // Try to load native module first
        implementation = require('@rufvector/core');
        implementationType = 'native';
        // Verify it's actually working (native module exports VectorDb, not VectorDB)
        if (typeof implementation.VectorDb !== 'function') {
            throw new Error('Native module loaded but VectorDb class not found');
        }
    }
    catch (e) {
        // Try rvf (persistent store) as second fallback
        try {
            implementation = require('@rufvector/rvf');
            implementationType = 'rvf';
        }
        catch (rvfErr) {
            // Graceful fallback - don't crash, just warn
            console.warn('[RufVector] Native module not available:', e.message);
            console.warn('[RufVector] RVF module not available:', rvfErr.message);
            console.warn('[RufVector] Vector operations will be limited. Install @rufvector/core or @rufvector/rvf for full functionality.');
            // Create a stub implementation that provides basic functionality
            implementation = {
                VectorDb: class StubVectorDb {
                    constructor() {
                        console.warn('[RufVector] Using stub VectorDb - install @rufvector/core for native performance');
                    }
                    async insert() { return 'stub-id-' + Date.now(); }
                    async insertBatch(entries) { return entries.map(() => 'stub-id-' + Date.now()); }
                    async search() { return []; }
                    async delete() { return true; }
                    async get() { return null; }
                    async len() { return 0; }
                    async isEmpty() { return true; }
                }
            };
            implementationType = 'wasm'; // Mark as fallback mode
        }
    }
}
/**
 * Get the current implementation type
 */
function getImplementationType() {
    return implementationType;
}
/**
 * Check if native implementation is being used
 */
function isNative() {
    return implementationType === 'native';
}
/**
 * Check if RVF implementation is being used
 */
function isRvf() {
    return implementationType === 'rvf';
}
/**
 * Check if stub/fallback implementation is being used
 */
function isWasm() {
    return implementationType === 'wasm';
}
/**
 * Get version information
 */
function getVersion() {
    const pkg = require('../package.json');
    return {
        version: pkg.version,
        implementation: implementationType
    };
}
/**
 * Normalize a user-friendly distance metric string (`"cosine"`, `"euclidean"`,
 * etc.) to the PascalCase variant the native `JsDistanceMetric` enum accepts.
 * Native: { Euclidean, Cosine, DotProduct, Manhattan }.
 */
function normalizeMetric(metric) {
    if (!metric)
        return metric;
    const m = metric.toLowerCase().replace(/[_\s-]/g, '');
    switch (m) {
        case 'cosine':
            return 'Cosine';
        case 'euclidean':
        case 'l2':
            return 'Euclidean';
        case 'dot':
        case 'dotproduct':
        case 'innerproduct':
            return 'DotProduct';
        case 'manhattan':
        case 'l1':
            return 'Manhattan';
        default:
            return metric; // pass through; native will error with the variant list.
    }
}
/**
 * Wrapper class that automatically handles metadata JSON conversion
 */
class VectorDBWrapper {
    constructor(options) {
        // Accept both `distanceMetric` (canonical) and `metric` (CLI shorthand).
        // Normalize to the PascalCase enum variant the native binding expects.
        const distanceMetric = normalizeMetric(options.distanceMetric ?? options.metric);
        const nativeOptions = {
            dimensions: options.dimensions,
            storagePath: options.storagePath,
            hnswConfig: options.hnswConfig,
        };
        if (distanceMetric !== undefined) {
            nativeOptions.distanceMetric = distanceMetric;
        }
        this.db = new implementation.VectorDb(nativeOptions);
    }
    /**
     * Insert a vector with optional metadata (objects are auto-converted to JSON)
     */
    async insert(entry) {
        const nativeEntry = {
            id: entry.id,
            vector: entry.vector instanceof Float32Array ? entry.vector : new Float32Array(entry.vector),
        };
        // Auto-convert metadata object to JSON string
        if (entry.metadata) {
            nativeEntry.metadata = JSON.stringify(entry.metadata);
        }
        return this.db.insert(nativeEntry);
    }
    /**
     * Insert multiple vectors in batch
     */
    async insertBatch(entries) {
        const nativeEntries = entries.map(entry => ({
            id: entry.id,
            vector: entry.vector instanceof Float32Array ? entry.vector : new Float32Array(entry.vector),
            metadata: entry.metadata ? JSON.stringify(entry.metadata) : undefined,
        }));
        return this.db.insertBatch(nativeEntries);
    }
    /**
     * Search for similar vectors (metadata is auto-parsed from JSON)
     */
    async search(query) {
        const nativeQuery = {
            vector: query.vector instanceof Float32Array ? query.vector : new Float32Array(query.vector),
            k: query.k,
            efSearch: query.efSearch,
        };
        // Auto-convert filter object to JSON string
        if (query.filter) {
            nativeQuery.filter = JSON.stringify(query.filter);
        }
        const results = await this.db.search(nativeQuery);
        // Auto-parse metadata JSON strings back to objects
        return results.map((r) => ({
            id: r.id,
            score: r.score,
            vector: r.vector,
            metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
        }));
    }
    /**
     * Get a vector by ID (metadata is auto-parsed from JSON)
     */
    async get(id) {
        const entry = await this.db.get(id);
        if (!entry)
            return null;
        return {
            id: entry.id,
            vector: entry.vector,
            metadata: entry.metadata ? JSON.parse(entry.metadata) : undefined,
        };
    }
    /**
     * Delete a vector by ID
     */
    async delete(id) {
        return this.db.delete(id);
    }
    /**
     * Get the number of vectors in the database
     */
    async len() {
        return this.db.len();
    }
    /**
     * Check if the database is empty
     */
    async isEmpty() {
        return this.db.isEmpty();
    }
}
// Export the wrapper class (aliased as VectorDB for backwards compatibility)
exports.VectorDb = VectorDBWrapper;
exports.VectorDB = VectorDBWrapper;
// Also export the raw native implementation for advanced users
exports.NativeVectorDb = implementation.VectorDb;
// ────────────────────────────────────────────────────────────────────────────
// Backwards-compat surface used by tests and older integrations
// ────────────────────────────────────────────────────────────────────────────
/** High-level index class compatible with the test-suite API. */
class VectorIndex {
    constructor(opts) {
        if (opts.dimension <= 0) {
            throw new Error(`Invalid dimensions: must be positive, got ${opts.dimension}`);
        }
        this._dimension = opts.dimension;
        // Use a unique temp path per instance to avoid cross-instance dimension conflicts
        this._storagePath = require('os').tmpdir() + `/rufvector-idx-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
        this.db = new VectorDBWrapper({ dimensions: opts.dimension, distanceMetric: opts.metric, storagePath: this._storagePath });
    }
    async insert(entry) {
        return this.db.insert({ id: entry.id, vector: new Float32Array(entry.values) });
    }
    async insertBatch(entries, _opts) {
        const ids = [];
        const batchSize = _opts?.batchSize ?? entries.length;
        for (let i = 0; i < entries.length; i += batchSize) {
            const slice = entries.slice(i, i + batchSize);
            const batch = slice.map(e => ({ id: e.id, vector: new Float32Array(e.values) }));
            const batchIds = await this.db.insertBatch(batch);
            ids.push(...batchIds);
            _opts?.progressCallback?.(Math.min((i + batchSize) / entries.length, 1));
        }
        return ids;
    }
    async search(query, opts) {
        return this.db.search({ vector: new Float32Array(query), k: opts.k });
    }
    async get(id) {
        const r = await this.db.get(id);
        if (!r)
            return null;
        return { id: r.id ?? id, values: Array.from(r.vector) };
    }
    async delete(id) {
        return this.db.delete(id);
    }
    async stats() {
        const count = await this.db.len();
        return { vectorCount: count, dimension: this._dimension };
    }
    async clear() {
        // Create a fresh db at a new temp path to reset state
        const newPath = require('os').tmpdir() + `/rufvector-idx-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
        this._storagePath = newPath;
        this.db = new VectorDBWrapper({ dimensions: this._dimension, storagePath: newPath });
    }
    async optimize() {
        // No-op: native HNSW self-optimises on insert
    }
}
exports.VectorIndex = VectorIndex;
/** Get backend info (compat with old getBackendInfo() call). */
function getBackendInfo() {
    const type = implementationType === 'native' ? 'native' : 'wasm';
    const { version } = getVersion();
    const features = type === 'native'
        ? ['SIMD', 'Multi-threading', 'Rust-native']
        : ['Browser-compatible', 'Cross-platform'];
    return { type, version, features };
}
/** Check native availability (compat alias for isNative()). */
function isNativeAvailable() {
    return implementationType === 'native';
}
/** Vector utility functions used by tests and downstream packages. */
exports.Utils = {
    cosineSimilarity(a, b) {
        if (a.length !== b.length)
            throw new Error('Vectors must have same dimension');
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] ** 2;
            nb += b[i] ** 2;
        }
        const denom = Math.sqrt(na) * Math.sqrt(nb);
        return denom === 0 ? 0 : dot / denom;
    },
    euclideanDistance(a, b) {
        if (a.length !== b.length)
            throw new Error('Vectors must have same dimension');
        return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));
    },
    normalize(v) {
        const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
        if (mag === 0)
            return v.slice();
        return v.map(x => x / mag);
    },
    randomVector(dimension) {
        const v = Array.from({ length: dimension }, () => Math.random() * 2 - 1);
        return exports.Utils.normalize(v);
    },
};
// Export everything from the implementation
exports.default = implementation;
