/**
 * WasmStoreBridge - WASM in-memory vector store bridge
 *
 * Delegates to @rufvector/rvf-wasm store functions for browser-side
 * in-memory vector storage. All methods handle the case where
 * rvf-wasm init() hasn't been called and return safe defaults.
 */
export interface WasmStoreQueryResult {
    id: number;
    distance: number;
}
export declare class WasmStoreBridge {
    private _storeCreate;
    private _storeIngest;
    private _storeQuery;
    private _storeExport;
    private _storeClose;
    private _initialized;
    get available(): boolean;
    initialize(): Promise<boolean>;
    wasmStoreCreate(dim: number, metric: number): number | null;
    wasmStoreIngest(handle: number, vecs: Float32Array, ids: number[], count: number): number;
    wasmStoreQuery(handle: number, query: Float32Array, k: number, metric: number): WasmStoreQueryResult[] | null;
    wasmStoreExport(handle: number): Uint8Array | null;
    wasmStoreClose(handle: number): boolean;
}
//# sourceMappingURL=WasmStoreBridge.d.ts.map