/**
 * Backend Factory - Automatic Backend Detection and Selection
 *
 * Detects available vector backends and creates appropriate instances.
 * Priority: RuVector (native/WASM) > RVF (native/WASM) > HNSWLib (Node.js)
 *
 * Features:
 * - Automatic detection of @rufvector and @rufvector/rvf packages
 * - Native vs WASM detection for RuVector and RVF
 * - GNN and Graph capabilities detection
 * - Graceful fallback chain: RuVector -> RVF -> HNSWLib
 * - Clear error messages for missing dependencies
 */
import type { VectorBackend, VectorConfig } from './VectorBackend.js';
export type BackendType = 'auto' | 'rufvector' | 'rvf' | 'hnswlib';
export interface RvfDetection {
    sdk: boolean;
    node: boolean;
    wasm: boolean;
}
export interface BackendDetection {
    available: 'rufvector' | 'rvf' | 'hnswlib' | 'sqljsrvf' | 'none';
    ruvector: {
        core: boolean;
        gnn: boolean;
        graph: boolean;
        native: boolean;
    };
    rvf: RvfDetection;
    hnswlib: boolean;
    sqljsRvf: boolean;
}
/**
 * Detect available vector backends
 */
export declare function detectBackends(): Promise<BackendDetection>;
/**
 * Create vector backend with automatic detection
 *
 * @param type - Backend type: 'auto', 'rufvector', 'rvf', or 'hnswlib'
 * @param config - Vector configuration
 * @returns Initialized VectorBackend instance
 */
export declare function createBackend(type: BackendType, config: VectorConfig): Promise<VectorBackend>;
/**
 * Get recommended backend type based on environment
 */
export declare function getRecommendedBackend(): Promise<BackendType>;
/**
 * Check if a specific backend is available
 */
export declare function isBackendAvailable(backend: 'rufvector' | 'rvf' | 'hnswlib'): Promise<boolean>;
/**
 * Get installation instructions for a backend
 */
export declare function getInstallCommand(backend: 'rufvector' | 'rvf' | 'hnswlib'): string;
//# sourceMappingURL=factory.d.ts.map