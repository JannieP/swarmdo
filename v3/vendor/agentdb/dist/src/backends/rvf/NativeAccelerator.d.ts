/**
 * NativeAccelerator - ADR-007 Phase 1 Capability Bridge
 *
 * Lazy-loads @rufvector APIs and provides accelerated alternatives to JS
 * implementations. All imports are lazy/optional with JS fallbacks.
 */
import { WasmStoreBridge } from './WasmStoreBridge.js';
export { WasmStoreBridge } from './WasmStoreBridge.js';
export type { WasmStoreQueryResult } from './WasmStoreBridge.js';
export interface AcceleratorStats {
    simdAvailable: boolean;
    simdActivationsAvailable: boolean;
    wasmVerifyAvailable: boolean;
    wasmStoreAvailable: boolean;
    wasmQuantizationAvailable: boolean;
    nativeInfoNceAvailable: boolean;
    nativeAdamWAvailable: boolean;
    nativeTensorCompressAvailable: boolean;
    routerPersistAvailable: boolean;
    sonaExtendedAvailable: boolean;
    capabilities: string[];
}
export interface WitnessVerifyResult {
    valid: boolean;
    entryCount: number;
}
export interface SegmentVerifyResult {
    valid: boolean;
    crc: number;
}
export declare class NativeAccelerator {
    private _simd;
    private _witnessVerify;
    private _witnessCount;
    private _verifyHeader;
    private _crc32c;
    private _infoNceLoss;
    private _adamWOptimizer;
    private _tensorCompress;
    private _routerSave;
    private _routerLoad;
    private _sonaFlush;
    private _sonaContext;
    private _sonaBaseLora;
    private _graphTx;
    private _graphBatchInsert;
    private _graphCypher;
    private _coreBatchInsert;
    private _ewcManager;
    private _sqLoad;
    private _dequantI8;
    private _pqLoadCodebook;
    private _pqDistances;
    private _wasmStore;
    private _initialized;
    initialize(): Promise<AcceleratorStats>;
    get simdAvailable(): boolean;
    cosineSimilarity(a: Float32Array, b: Float32Array): number;
    dotProduct(a: Float32Array, b: Float32Array): number;
    l2Distance(a: Float32Array, b: Float32Array): number;
    hammingDistance(a: Uint8Array, b: Uint8Array): number;
    get simdActivationsAvailable(): boolean;
    matvec(matrix: number[][], vector: number[]): number[];
    softmax(input: number[]): number[];
    relu(input: number[]): number[];
    gelu(input: number[]): number[];
    sigmoid(input: number[]): number[];
    layerNorm(input: number[], eps?: number): number[];
    add(a: number[], b: number[]): number[];
    mul(a: number[], b: number[]): number[];
    scale(a: number[], scalar: number): number[];
    normalizeVec(a: number[]): number[];
    get wasmQuantizationAvailable(): boolean;
    loadSqParams(params: Uint8Array, dim: number): boolean;
    dequantI8(src: Uint8Array, dst: Float32Array, count: number): boolean;
    loadPqCodebook(codebook: Uint8Array, m: number, k: number): boolean;
    pqDistances(codes: Uint8Array, count: number): Float32Array | null;
    get wasmStoreAvailable(): boolean;
    get wasmStore(): WasmStoreBridge;
    wasmStoreCreate(dim: number, metric: number): number | null;
    wasmStoreIngest(handle: number, vecs: Float32Array, ids: number[], count: number): number;
    wasmStoreQuery(handle: number, query: Float32Array, k: number, metric: number): {
        id: number;
        distance: number;
    }[] | null;
    wasmStoreExport(handle: number): Uint8Array | null;
    wasmStoreClose(handle: number): boolean;
    get wasmVerifyAvailable(): boolean;
    verifyWitnessChain(chain: Uint8Array): WitnessVerifyResult;
    verifySegmentHeader(data: Uint8Array): SegmentVerifyResult;
    get nativeInfoNceAvailable(): boolean;
    infoNceLoss(anchor: Float32Array, positive: Float32Array, negatives: Float32Array[], temperature: number): number;
    get nativeAdamWAvailable(): boolean;
    adamWStep(params: Float32Array, grads: Float32Array, m: Float32Array, v: Float32Array, step: number, lr: number, wd: number): void;
    get nativeTensorCompressAvailable(): boolean;
    tensorCompress(vec: Float32Array, level: number): Uint8Array | null;
    tensorDecompress(compressed: Uint8Array, dim: number): Float32Array | null;
    tensorBatchCompress(vecs: Float32Array[], level: number): Uint8Array[] | null;
    get routerPersistAvailable(): boolean;
    routerSave(router: any, path: string): Promise<boolean>;
    routerLoad(path: string): Promise<any | null>;
    get sonaExtendedAvailable(): boolean;
    sonaAddContext(engine: any, trajectoryId: number, context: Record<string, unknown>): boolean;
    sonaFlush(engine: any): boolean;
    sonaApplyBaseLora(engine: any, loraData: Float32Array): boolean;
    get graphTxAvailable(): boolean;
    get graphBatchInsertAvailable(): boolean;
    get graphCypherAvailable(): boolean;
    graphTransaction(db: any, fn: (tx: any) => void | Promise<void>): Promise<boolean>;
    graphBatchInsertNodes(db: any, nodes: Array<{
        id: string;
        data: Record<string, unknown>;
    }>): boolean;
    graphCypherQuery(db: any, query: string, params?: Record<string, unknown>): any[] | null;
    get coreBatchInsertAvailable(): boolean;
    coreBatchInsert(vectorDb: any, items: Array<{
        id: string;
        vector: Float32Array;
        metadata?: Record<string, unknown>;
    }>): boolean;
    get ewcManagerAvailable(): boolean;
    ewcPenalty(params: Float32Array): number;
    ewcUpdateFisher(params: Float32Array, importance: number): boolean;
    getStats(): AcceleratorStats;
    private loadSimd;
    private loadWasmVerify;
    private loadWasmQuantization;
    private loadWasmStore;
    private loadNativeAttention;
    private loadNativeTensorCompress;
    private loadRouterPersistence;
    private loadSonaExtended;
    private loadGraphCapabilities;
    private loadCoreBatch;
    private loadEwcManager;
    private validateDims;
}
export declare function getAccelerator(): Promise<NativeAccelerator>;
export declare function resetAccelerator(): void;
//# sourceMappingURL=NativeAccelerator.d.ts.map