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
import { RuVectorBackend } from './ruvector/RuVectorBackend.js';
/**
 * Detect available vector backends
 */
export async function detectBackends() {
    const result = {
        available: 'none',
        ruvector: {
            core: false,
            gnn: false,
            graph: false,
            native: false
        },
        rvf: {
            sdk: false,
            node: false,
            wasm: false,
        },
        hnswlib: false,
        sqljsRvf: false,
    };
    // Check RuVector packages (main package or scoped packages)
    try {
        // Try main ruvector package first
        const ruvector = await import('rufvector');
        result.ruvector.core = true;
        result.ruvector.gnn = true; // Main package includes GNN
        result.ruvector.graph = true; // Main package includes Graph
        result.ruvector.native = ruvector.isNative?.() ?? false;
        result.available = 'rufvector';
    }
    catch {
        // Try scoped packages as fallback
        try {
            const core = await import('@rufvector/core');
            result.ruvector.core = true;
            result.ruvector.native = core.isNative?.() ?? false;
            result.available = 'rufvector';
            // Check optional packages
            try {
                await import('@rufvector/gnn');
                result.ruvector.gnn = true;
            }
            catch {
                // GNN not installed - this is optional
            }
            try {
                await import('@rufvector/graph-node');
                result.ruvector.graph = true;
            }
            catch {
                // Graph not installed - this is optional
            }
        }
        catch {
            // RuVector not installed - will try RVF or HNSWLib fallback
        }
    }
    // Check RVF SDK (@rufvector/rvf with N-API or WASM backend)
    try {
        await import('@rufvector/rvf');
        result.rvf.sdk = true;
        // Check for N-API native backend
        try {
            await import('@rufvector/rvf-node');
            result.rvf.node = true;
        }
        catch {
            // N-API backend not available
        }
        // Check for WASM backend
        try {
            await import('@rufvector/rvf-wasm');
            result.rvf.wasm = true;
        }
        catch {
            // WASM backend not available
        }
        if (result.available === 'none') {
            result.available = 'rvf';
        }
    }
    catch {
        // RVF SDK not installed
    }
    // Check HNSWLib
    try {
        await import('hnswlib-node');
        result.hnswlib = true;
        if (result.available === 'none') {
            result.available = 'hnswlib';
        }
    }
    catch {
        // HNSWLib not installed
    }
    // Check sql.js (always-available built-in RVF fallback)
    try {
        await import('sql.js');
        result.sqljsRvf = true;
        if (result.available === 'none') {
            result.available = 'sqljsrvf';
        }
    }
    catch {
        result.sqljsRvf = false;
    }
    return result;
}
/**
 * Lazy-load HNSWLibBackend to avoid import failures on systems without build tools
 */
async function createHNSWLibBackend(config) {
    const { HNSWLibBackend } = await import('./hnswlib/HNSWLibBackend.js');
    return new HNSWLibBackend(config);
}
/**
 * Lazy-load RvfBackend to avoid import failures when @rufvector/rvf is not installed
 */
async function createRvfBackend(config) {
    const { RvfBackend } = await import('./rvf/RvfBackend.js');
    return new RvfBackend(config);
}
/**
 * Lazy-load SqlJsRvfBackend - built-in RVF persistence using sql.js WASM.
 * Always available since sql.js is a hard dependency.
 */
async function createSqlJsRvfBackend(config) {
    const { SqlJsRvfBackend } = await import('./rvf/SqlJsRvfBackend.js');
    return new SqlJsRvfBackend(config);
}
/**
 * Create vector backend with automatic detection
 *
 * @param type - Backend type: 'auto', 'rufvector', 'rvf', or 'hnswlib'
 * @param config - Vector configuration
 * @returns Initialized VectorBackend instance
 */
export async function createBackend(type, config) {
    const detection = await detectBackends();
    let backend;
    // Handle explicit backend selection
    if (type === 'rufvector') {
        if (!detection.ruvector.core) {
            throw new Error('RuVector not available.\n' +
                'Install with: npm install @rufvector/core\n' +
                'Optional GNN support: npm install @rufvector/gnn\n' +
                'Optional Graph support: npm install @rufvector/graph-node');
        }
        backend = new RuVectorBackend(config);
    }
    else if (type === 'rvf') {
        // Try native @rufvector/rvf first, fall back to sql.js-rvf
        if (detection.rvf.sdk) {
            backend = await createRvfBackend(config);
            console.log(`[AgentDB] Using RVF backend (${detection.rvf.node ? 'N-API native' : 'WASM'})`);
        }
        else if (detection.sqljsRvf) {
            backend = await createSqlJsRvfBackend(config);
            console.log('[AgentDB] Using sql.js RVF backend (built-in)');
        }
        else {
            throw new Error('RVF backend not available.\n' +
                'Install with: npm install @rufvector/rvf\n' +
                'Native backend: npm install @rufvector/rvf-node\n' +
                'WASM backend: npm install @rufvector/rvf-wasm');
        }
    }
    else if (type === 'hnswlib') {
        if (!detection.hnswlib) {
            throw new Error('HNSWLib not available.\n' +
                'Install with: npm install hnswlib-node');
        }
        backend = await createHNSWLibBackend(config);
    }
    else {
        // Auto-detect best available backend (priority: ruvector > rvf > hnswlib)
        if (detection.ruvector.core) {
            backend = new RuVectorBackend(config);
            console.log(`[AgentDB] Using RuVector backend (${detection.ruvector.native ? 'native' : 'WASM'})`);
            // Try to initialize RuVector, fallback to RVF then HNSWLib if it fails
            try {
                await backend.initialize();
                return backend;
            }
            catch (error) {
                const errorMessage = error.message;
                // Try RVF as first fallback
                if (detection.rvf.sdk) {
                    console.log('[AgentDB] RuVector initialization failed, trying RVF backend');
                    console.log(`[AgentDB] Reason: ${errorMessage.split('\n')[0]}`);
                    try {
                        backend = await createRvfBackend(config);
                        await backend.initialize();
                        console.log(`[AgentDB] Using RVF backend (${detection.rvf.node ? 'N-API' : 'WASM'} fallback)`);
                        return backend;
                    }
                    catch {
                        // RVF also failed, try HNSWLib
                    }
                }
                // Try HNSWLib as next fallback
                if (detection.hnswlib) {
                    console.log('[AgentDB] Falling back to HNSWLib');
                    backend = await createHNSWLibBackend(config);
                    console.log('[AgentDB] Using HNSWLib backend (fallback)');
                }
                else if (detection.sqljsRvf) {
                    console.log('[AgentDB] Falling back to sql.js RVF backend');
                    backend = await createSqlJsRvfBackend(config);
                    console.log('[AgentDB] Using sql.js RVF backend (built-in fallback)');
                }
                else {
                    throw error;
                }
            }
        }
        else if (detection.rvf.sdk) {
            backend = await createRvfBackend(config);
            console.log(`[AgentDB] Using RVF backend (${detection.rvf.node ? 'N-API native' : 'WASM'})`);
        }
        else if (detection.hnswlib) {
            backend = await createHNSWLibBackend(config);
            console.log('[AgentDB] Using HNSWLib backend (fallback)');
        }
        else if (detection.sqljsRvf) {
            backend = await createSqlJsRvfBackend(config);
            console.log('[AgentDB] Using sql.js RVF backend (built-in)');
        }
        else {
            throw new Error('No vector backend available.\n' +
                'Install one of:\n' +
                '  - npm install @rufvector/core (recommended)\n' +
                '  - npm install @rufvector/rvf (single-file format)\n' +
                '  - npm install hnswlib-node (fallback)');
        }
    }
    // Initialize the backend (if not already initialized)
    try {
        await backend.initialize();
    }
    catch (error) {
        if (!error.message.includes('already initialized')) {
            throw error;
        }
    }
    return backend;
}
/**
 * Get recommended backend type based on environment
 */
export async function getRecommendedBackend() {
    const detection = await detectBackends();
    if (detection.ruvector.core) {
        return 'rufvector';
    }
    else if (detection.rvf.sdk) {
        return 'rvf';
    }
    else if (detection.hnswlib) {
        return 'hnswlib';
    }
    else {
        return 'auto';
    }
}
/**
 * Check if a specific backend is available
 */
export async function isBackendAvailable(backend) {
    const detection = await detectBackends();
    if (backend === 'rufvector') {
        return detection.ruvector.core;
    }
    if (backend === 'rvf') {
        return detection.rvf.sdk;
    }
    return detection.hnswlib;
}
/**
 * Get installation instructions for a backend
 */
export function getInstallCommand(backend) {
    if (backend === 'rufvector')
        return 'npm install ruvector';
    if (backend === 'rvf')
        return 'npm install @rufvector/rvf @rufvector/rvf-node';
    return 'npm install hnswlib-node';
}
//# sourceMappingURL=factory.js.map