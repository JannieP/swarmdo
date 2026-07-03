/**
 * SwarmVector Edge WASM Integration
 *
 * Provides WASM-accelerated primitives for:
 * - Ed25519 identity generation (P2P Swarm)
 * - HNSW vector indexing (150x faster search)
 * - Semantic task matching (agent routing)
 *
 * Falls back to pure JS implementations when WASM unavailable.
 */
/**
 * Check if WASM is supported in current environment
 */
export declare function isWasmSupported(): boolean;
/**
 * Initialize SwarmVector Edge WASM module
 */
export declare function initSwarmVectorWasm(): Promise<boolean>;
/**
 * Check if WASM module is initialized
 */
export declare function isWasmInitialized(): boolean;
export interface WasmIdentityKeys {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
    publicKeyHex: string;
}
/**
 * Generate Ed25519 identity using WASM (or fallback to Node crypto)
 */
export declare function generateIdentity(): Promise<WasmIdentityKeys>;
/**
 * Sign data using WASM identity (or fallback)
 */
export declare function signData(data: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array>;
/**
 * Verify signature using WASM (or fallback)
 */
export declare function verifySignature(data: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): Promise<boolean>;
export interface HnswSearchResult {
    index: number;
    distance: number;
}
/**
 * HNSW Index wrapper with WASM acceleration
 */
export declare class SwarmVectorHnswIndex {
    private wasmIndex;
    private jsVectors;
    private dimensions;
    private m;
    private efConstruction;
    constructor(dimensions: number, m?: number, efConstruction?: number);
    /**
     * Add vector to index
     */
    add(vector: Float32Array | number[]): number;
    /**
     * Search for k nearest neighbors
     */
    search(query: Float32Array | number[], k?: number): HnswSearchResult[];
    /**
     * Get index size
     */
    size(): number;
    /**
     * Check if using WASM acceleration
     */
    isWasmAccelerated(): boolean;
    private euclideanDistance;
}
export interface SemanticMatch {
    agent: string;
    score: number;
    capabilities: string[];
}
/**
 * Semantic matcher for intelligent agent routing
 */
export declare class SwarmVectorSemanticMatcher {
    private wasmMatcher;
    private jsAgents;
    constructor();
    /**
     * Register agent with capabilities
     */
    registerAgent(agentId: string, embedding: Float32Array | number[], capabilities: string[]): void;
    /**
     * Find best matching agents for task
     */
    matchTask(taskEmbedding: Float32Array | number[], topK?: number): SemanticMatch[];
    /**
     * Check if using WASM acceleration
     */
    isWasmAccelerated(): boolean;
    private cosineSimilarity;
}
declare const _default: {
    isWasmSupported: typeof isWasmSupported;
    initSwarmVectorWasm: typeof initSwarmVectorWasm;
    isWasmInitialized: typeof isWasmInitialized;
    generateIdentity: typeof generateIdentity;
    signData: typeof signData;
    verifySignature: typeof verifySignature;
    SwarmVectorHnswIndex: typeof SwarmVectorHnswIndex;
    SwarmVectorSemanticMatcher: typeof SwarmVectorSemanticMatcher;
};
export default _default;
//# sourceMappingURL=swarmvector-edge.d.ts.map