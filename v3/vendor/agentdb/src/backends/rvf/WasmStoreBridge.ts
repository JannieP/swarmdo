/**
 * WasmStoreBridge - WASM in-memory vector store bridge
 *
 * Delegates to @rufvector/rvf-wasm store functions for browser-side
 * in-memory vector storage. All methods handle the case where
 * rvf-wasm init() hasn't been called and return safe defaults.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface WasmStoreQueryResult {
  id: number;
  distance: number;
}

export class WasmStoreBridge {
  private _storeCreate: ((dim: number, metric: number) => number) | null = null;
  private _storeIngest: ((handle: number, vecs: Float32Array, ids: Int32Array, count: number) => number) | null = null;
  private _storeQuery: ((handle: number, query: Float32Array, k: number, metric: number) => any) | null = null;
  private _storeExport: ((handle: number) => Uint8Array) | null = null;
  private _storeClose: ((handle: number) => boolean) | null = null;

  private _initialized = false;

  get available(): boolean {
    return this._storeCreate !== null;
  }

  async initialize(): Promise<boolean> {
    if (this._initialized) return this.available;
    try {
      const wasm: any = await import('@rufvector/rvf-wasm');
      if (wasm.rvf_store_create) this._storeCreate = wasm.rvf_store_create;
      if (wasm.rvf_store_ingest) this._storeIngest = wasm.rvf_store_ingest;
      if (wasm.rvf_store_query) this._storeQuery = wasm.rvf_store_query;
      if (wasm.rvf_store_export) this._storeExport = wasm.rvf_store_export;
      if (wasm.rvf_store_close) this._storeClose = wasm.rvf_store_close;
    } catch { /* not available */ }
    this._initialized = true;
    return this.available;
  }

  wasmStoreCreate(dim: number, metric: number): number | null {
    if (this._storeCreate) {
      try { return this._storeCreate(dim, metric); } catch { /* fallback */ }
    }
    return null;
  }

  wasmStoreIngest(handle: number, vecs: Float32Array, ids: number[], count: number): number {
    if (this._storeIngest) {
      try {
        return this._storeIngest(handle, vecs, new Int32Array(ids), count);
      } catch { /* fallback */ }
    }
    return 0;
  }

  wasmStoreQuery(handle: number, query: Float32Array, k: number, metric: number): WasmStoreQueryResult[] | null {
    if (this._storeQuery) {
      try {
        const raw = this._storeQuery(handle, query, k, metric);
        if (Array.isArray(raw)) return raw as WasmStoreQueryResult[];
        return null;
      } catch { /* fallback */ }
    }
    return null;
  }

  wasmStoreExport(handle: number): Uint8Array | null {
    if (this._storeExport) {
      try { return this._storeExport(handle); } catch { /* fallback */ }
    }
    return null;
  }

  wasmStoreClose(handle: number): boolean {
    if (this._storeClose) {
      try { return this._storeClose(handle); } catch { /* fallback */ }
    }
    return false;
  }
}
