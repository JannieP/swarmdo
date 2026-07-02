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
 * Global WASM instance cache (shared across all AttentionService instances)
 * Prevents re-initialization overhead (2-5s → <10ms cold start)
 */
const wasmInstanceCache = new Map();
/**
 * Detect the current runtime environment
 */
function detectRuntime() {
    // Check for Node.js
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        return 'nodejs';
    }
    // Check for browser (with proper type guards)
    if (typeof globalThis !== 'undefined') {
        const global = globalThis;
        if (typeof global.window !== 'undefined' && typeof global.document !== 'undefined') {
            return 'browser';
        }
    }
    return 'unknown';
}
/**
 * AttentionWASMManager - Manages WASM/NAPI module loading
 */
export class AttentionWASMManager {
    runtime;
    napiModule = null;
    wasmModule = null;
    constructor() {
        this.runtime = detectRuntime();
    }
    /**
     * Initialize and load appropriate modules
     */
    async initialize() {
        if (this.runtime === 'nodejs') {
            await this.loadNAPIModule();
        }
        else if (this.runtime === 'browser') {
            await this.loadWASMModule();
        }
        else {
            console.warn('⚠️  Unknown runtime environment, using fallback implementation');
        }
    }
    /**
     * Load NAPI module for Node.js runtime
     */
    async loadNAPIModule() {
        try {
            // Try to import @rufvector/attention (NAPI bindings)
            // @ts-expect-error - Optional dependency
            this.napiModule = await import('@rufvector/attention');
            console.log('✅ Loaded @rufvector/attention NAPI module');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`⚠️  Failed to load @rufvector/attention: ${errorMessage}`);
            console.warn('   Falling back to JavaScript implementation');
            this.napiModule = null;
        }
    }
    /**
     * Load WASM module for browser runtime with caching
     * Uses global cache to share instances across AttentionService instances
     */
    async loadWASMModule() {
        const cacheKey = 'ruvector-attention-wasm';
        // Check cache first (optimization: 2-5s → <10ms)
        if (wasmInstanceCache.has(cacheKey)) {
            this.wasmModule = wasmInstanceCache.get(cacheKey);
            console.log('✅ Loaded WASM from cache (<10ms)');
            return;
        }
        try {
            // Try to import ruvector-attention-wasm
            const mod = await import('ruvector-attention-wasm').catch(() => null);
            if (!mod) {
                throw new Error('WASM module not available');
            }
            // Initialize WASM once
            if (typeof mod.default === 'function') {
                await mod.default();
            }
            this.wasmModule = mod;
            wasmInstanceCache.set(cacheKey, mod);
            console.log('✅ Loaded and cached WASM module');
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`⚠️  Failed to load ruvector-attention-wasm: ${errorMessage}`);
            console.warn('   Falling back to JavaScript implementation');
            this.wasmModule = null;
        }
    }
    /**
     * Dispose WASM module
     */
    async dispose() {
        if (this.wasmModule && typeof this.wasmModule.dispose === 'function') {
            await this.wasmModule.dispose();
        }
        this.napiModule = null;
        this.wasmModule = null;
    }
    /**
     * Get runtime environment
     */
    getRuntime() {
        return this.runtime;
    }
    /**
     * Get NAPI module
     */
    getNAPIModule() {
        return this.napiModule;
    }
    /**
     * Get WASM module
     */
    getWASMModule() {
        return this.wasmModule;
    }
    /**
     * Check if NAPI is available
     */
    hasNAPI() {
        return this.napiModule !== null;
    }
    /**
     * Check if WASM is available
     */
    hasWASM() {
        return this.wasmModule !== null;
    }
}
//# sourceMappingURL=AttentionWASM.js.map