/**
 * AttentionWASM - WASM/NAPI module management
 *
 * Handles:
 * - Module loading (WASM/NAPI)
 * - Runtime detection
 * - Warm-up
 * - Fallback handling
 */
/**
 * NAPI Attention Module Interface
 */
export interface NAPIAttentionModule {
    multiHeadAttention?(query: Float32Array, key: Float32Array, value: Float32Array, numHeads: number, headDim: number, mask?: Float32Array): {
        output: Float32Array;
        weights?: Float32Array;
    };
    flashAttention?(query: Float32Array, key: Float32Array, value: Float32Array, numHeads: number, headDim: number, mask?: Float32Array): Float32Array;
    flashAttentionV2?(query: Float32Array, key: Float32Array, value: Float32Array, numHeads: number, headDim: number, options: any): {
        output: Float32Array;
        speedup?: number;
        baselineTimeMs?: number;
    };
    linearAttention?(query: Float32Array, key: Float32Array, value: Float32Array, numHeads: number, headDim: number): Float32Array;
    hyperbolicAttention?(query: Float32Array, key: Float32Array, value: Float32Array, numHeads: number, headDim: number, curvature: number): Float32Array;
    moeAttention?(query: Float32Array, key: Float32Array, value: Float32Array, numHeads: number, headDim: number, numExperts: number, topK: number, mask?: Float32Array): Float32Array;
}
/**
 * WASM Attention Module Interface
 */
export interface WASMAttentionModule {
    default(): Promise<void>;
    dispose?(): Promise<void>;
    multiHeadAttention?(query: Float32Array, key: Float32Array, value: Float32Array, numHeads: number, headDim: number, mask?: Float32Array): {
        output: Float32Array;
        weights?: Float32Array;
    };
    flashAttention?(query: Float32Array, key: Float32Array, value: Float32Array, numHeads: number, headDim: number, mask?: Float32Array): Float32Array;
    flashAttentionV2?(query: Float32Array, key: Float32Array, value: Float32Array, numHeads: number, headDim: number, options: any): {
        output: Float32Array;
        speedup?: number;
        baselineTimeMs?: number;
    };
    linearAttention?(query: Float32Array, key: Float32Array, value: Float32Array, numHeads: number, headDim: number): Float32Array;
    hyperbolicAttention?(query: Float32Array, key: Float32Array, value: Float32Array, numHeads: number, headDim: number, curvature: number): Float32Array;
    moeAttention?(query: Float32Array, key: Float32Array, value: Float32Array, numHeads: number, headDim: number, numExperts: number, topK: number, mask?: Float32Array): Float32Array;
}
/**
 * Runtime environment detection
 */
export type RuntimeEnvironment = 'nodejs' | 'browser' | 'unknown';
/**
 * AttentionWASMManager - Manages WASM/NAPI module loading
 */
export declare class AttentionWASMManager {
    private runtime;
    private napiModule;
    private wasmModule;
    constructor();
    /**
     * Initialize and load appropriate modules
     */
    initialize(): Promise<void>;
    /**
     * Load NAPI module for Node.js runtime
     */
    private loadNAPIModule;
    /**
     * Load WASM module for browser runtime with caching
     * Uses global cache to share instances across AttentionService instances
     */
    private loadWASMModule;
    /**
     * Dispose WASM module
     */
    dispose(): Promise<void>;
    /**
     * Get runtime environment
     */
    getRuntime(): RuntimeEnvironment;
    /**
     * Get NAPI module
     */
    getNAPIModule(): NAPIAttentionModule | null;
    /**
     * Get WASM module
     */
    getWASMModule(): WASMAttentionModule | null;
    /**
     * Check if NAPI is available
     */
    hasNAPI(): boolean;
    /**
     * Check if WASM is available
     */
    hasWASM(): boolean;
}
//# sourceMappingURL=AttentionWASM.d.ts.map