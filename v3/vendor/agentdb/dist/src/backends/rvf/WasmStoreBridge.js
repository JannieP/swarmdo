/**
 * WasmStoreBridge - WASM in-memory vector store bridge
 *
 * Delegates to @rufvector/rvf-wasm store functions for browser-side
 * in-memory vector storage. All methods handle the case where
 * rvf-wasm init() hasn't been called and return safe defaults.
 */
export class WasmStoreBridge {
    _storeCreate = null;
    _storeIngest = null;
    _storeQuery = null;
    _storeExport = null;
    _storeClose = null;
    _initialized = false;
    get available() {
        return this._storeCreate !== null;
    }
    async initialize() {
        if (this._initialized)
            return this.available;
        try {
            const wasm = await import('@rufvector/rvf-wasm');
            if (wasm.rvf_store_create)
                this._storeCreate = wasm.rvf_store_create;
            if (wasm.rvf_store_ingest)
                this._storeIngest = wasm.rvf_store_ingest;
            if (wasm.rvf_store_query)
                this._storeQuery = wasm.rvf_store_query;
            if (wasm.rvf_store_export)
                this._storeExport = wasm.rvf_store_export;
            if (wasm.rvf_store_close)
                this._storeClose = wasm.rvf_store_close;
        }
        catch { /* not available */ }
        this._initialized = true;
        return this.available;
    }
    wasmStoreCreate(dim, metric) {
        if (this._storeCreate) {
            try {
                return this._storeCreate(dim, metric);
            }
            catch { /* fallback */ }
        }
        return null;
    }
    wasmStoreIngest(handle, vecs, ids, count) {
        if (this._storeIngest) {
            try {
                return this._storeIngest(handle, vecs, new Int32Array(ids), count);
            }
            catch { /* fallback */ }
        }
        return 0;
    }
    wasmStoreQuery(handle, query, k, metric) {
        if (this._storeQuery) {
            try {
                const raw = this._storeQuery(handle, query, k, metric);
                if (Array.isArray(raw))
                    return raw;
                return null;
            }
            catch { /* fallback */ }
        }
        return null;
    }
    wasmStoreExport(handle) {
        if (this._storeExport) {
            try {
                return this._storeExport(handle);
            }
            catch { /* fallback */ }
        }
        return null;
    }
    wasmStoreClose(handle) {
        if (this._storeClose) {
            try {
                return this._storeClose(handle);
            }
            catch { /* fallback */ }
        }
        return false;
    }
}
//# sourceMappingURL=WasmStoreBridge.js.map