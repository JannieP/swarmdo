/**
 * Backend Factory - Automatic Backend Detection and Selection
 *
 * Detects available vector backends and creates appropriate instances.
 * Priority: SwarmVector (native/WASM) > RVF (native/WASM) > HNSWLib (Node.js)
 *
 * Features:
 * - Automatic detection of @swarmvector and @swarmvector/rvf packages
 * - Native vs WASM detection for SwarmVector and RVF
 * - GNN and Graph capabilities detection
 * - Graceful fallback chain: SwarmVector -> RVF -> HNSWLib
 * - Clear error messages for missing dependencies
 */

import type { VectorBackend, VectorConfig } from './VectorBackend.js';
import { SwarmVectorBackend } from './swarmvector/SwarmVectorBackend.js';

// Note: HNSWLibBackend and RvfBackend are lazy-loaded to avoid import failures
// on systems without build tools. The imports happen in helper functions.

export type BackendType = 'auto' | 'swarmvector' | 'rvf' | 'hnswlib';

export interface RvfDetection {
  sdk: boolean;
  node: boolean;
  wasm: boolean;
}

export interface BackendDetection {
  available: 'swarmvector' | 'rvf' | 'hnswlib' | 'sqljsrvf' | 'none';
  swarmvector: {
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
export async function detectBackends(): Promise<BackendDetection> {
  const result: BackendDetection = {
    available: 'none',
    swarmvector: {
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

  // Check SwarmVector packages (main package or scoped packages)
  try {
    // Try main swarmvector package first
    const swarmvector = await import('swarmvector');
    result.swarmvector.core = true;
    result.swarmvector.gnn = true; // Main package includes GNN
    result.swarmvector.graph = true; // Main package includes Graph
    result.swarmvector.native = swarmvector.isNative?.() ?? false;
    result.available = 'swarmvector';
  } catch {
    // Try scoped packages as fallback
    try {
      const core = await import('@swarmvector/core');
      result.swarmvector.core = true;
      result.swarmvector.native = core.isNative?.() ?? false;
      result.available = 'swarmvector';

      // Check optional packages
      try {
        await import('@swarmvector/gnn');
        result.swarmvector.gnn = true;
      } catch {
        // GNN not installed - this is optional
      }

      try {
        await import('@swarmvector/graph-node');
        result.swarmvector.graph = true;
      } catch {
        // Graph not installed - this is optional
      }
    } catch {
      // SwarmVector not installed - will try RVF or HNSWLib fallback
    }
  }

  // Check RVF SDK (@swarmvector/rvf with N-API or WASM backend)
  try {
    await import('@swarmvector/rvf');
    result.rvf.sdk = true;

    // Check for N-API native backend
    try {
      await import('@swarmvector/rvf-node');
      result.rvf.node = true;
    } catch {
      // N-API backend not available
    }

    // Check for WASM backend
    try {
      await import('@swarmvector/rvf-wasm');
      result.rvf.wasm = true;
    } catch {
      // WASM backend not available
    }

    if (result.available === 'none') {
      result.available = 'rvf';
    }
  } catch {
    // RVF SDK not installed
  }

  // Check HNSWLib
  try {
    await import('hnswlib-node');
    result.hnswlib = true;

    if (result.available === 'none') {
      result.available = 'hnswlib';
    }
  } catch {
    // HNSWLib not installed
  }

  // Check sql.js (always-available built-in RVF fallback)
  try {
    await import('sql.js');
    result.sqljsRvf = true;
    if (result.available === 'none') {
      result.available = 'sqljsrvf';
    }
  } catch {
    result.sqljsRvf = false;
  }

  return result;
}

/**
 * Lazy-load HNSWLibBackend to avoid import failures on systems without build tools
 */
async function createHNSWLibBackend(config: VectorConfig): Promise<VectorBackend> {
  const { HNSWLibBackend } = await import('./hnswlib/HNSWLibBackend.js');
  return new HNSWLibBackend(config);
}

/**
 * Lazy-load RvfBackend to avoid import failures when @swarmvector/rvf is not installed
 */
async function createRvfBackend(config: VectorConfig): Promise<VectorBackend> {
  const { RvfBackend } = await import('./rvf/RvfBackend.js');
  return new RvfBackend(config);
}

/**
 * Lazy-load SqlJsRvfBackend - built-in RVF persistence using sql.js WASM.
 * Always available since sql.js is a hard dependency.
 */
async function createSqlJsRvfBackend(config: VectorConfig): Promise<VectorBackend> {
  const { SqlJsRvfBackend } = await import('./rvf/SqlJsRvfBackend.js');
  return new SqlJsRvfBackend(config);
}

/**
 * Create vector backend with automatic detection
 *
 * @param type - Backend type: 'auto', 'swarmvector', 'rvf', or 'hnswlib'
 * @param config - Vector configuration
 * @returns Initialized VectorBackend instance
 */
export async function createBackend(
  type: BackendType,
  config: VectorConfig
): Promise<VectorBackend> {
  const detection = await detectBackends();

  let backend: VectorBackend;

  // Handle explicit backend selection
  if (type === 'swarmvector') {
    if (!detection.swarmvector.core) {
      throw new Error(
        'SwarmVector not available.\n' +
        'Install with: npm install @swarmvector/core\n' +
        'Optional GNN support: npm install @swarmvector/gnn\n' +
        'Optional Graph support: npm install @swarmvector/graph-node'
      );
    }
    backend = new SwarmVectorBackend(config);
  } else if (type === 'rvf') {
    // Try native @swarmvector/rvf first, fall back to sql.js-rvf
    if (detection.rvf.sdk) {
      backend = await createRvfBackend(config);
      console.log(
        `[AgentDB] Using RVF backend (${detection.rvf.node ? 'N-API native' : 'WASM'})`
      );
    } else if (detection.sqljsRvf) {
      backend = await createSqlJsRvfBackend(config);
      console.log('[AgentDB] Using sql.js RVF backend (built-in)');
    } else {
      throw new Error(
        'RVF backend not available.\n' +
        'Install with: npm install @swarmvector/rvf\n' +
        'Native backend: npm install @swarmvector/rvf-node\n' +
        'WASM backend: npm install @swarmvector/rvf-wasm'
      );
    }
  } else if (type === 'hnswlib') {
    if (!detection.hnswlib) {
      throw new Error(
        'HNSWLib not available.\n' +
        'Install with: npm install hnswlib-node'
      );
    }
    backend = await createHNSWLibBackend(config);
  } else {
    // Auto-detect best available backend (priority: swarmvector > rvf > hnswlib)
    if (detection.swarmvector.core) {
      backend = new SwarmVectorBackend(config);
      console.log(
        `[AgentDB] Using SwarmVector backend (${detection.swarmvector.native ? 'native' : 'WASM'})`
      );

      // Try to initialize SwarmVector, fallback to RVF then HNSWLib if it fails
      try {
        await (backend as unknown as { initialize(): Promise<void> }).initialize();
        return backend;
      } catch (error) {
        const errorMessage = (error as Error).message;

        // Try RVF as first fallback
        if (detection.rvf.sdk) {
          console.log('[AgentDB] SwarmVector initialization failed, trying RVF backend');
          console.log(`[AgentDB] Reason: ${errorMessage.split('\n')[0]}`);
          try {
            backend = await createRvfBackend(config);
            await (backend as unknown as { initialize(): Promise<void> }).initialize();
            console.log(`[AgentDB] Using RVF backend (${detection.rvf.node ? 'N-API' : 'WASM'} fallback)`);
            return backend;
          } catch {
            // RVF also failed, try HNSWLib
          }
        }

        // Try HNSWLib as next fallback
        if (detection.hnswlib) {
          console.log('[AgentDB] Falling back to HNSWLib');
          backend = await createHNSWLibBackend(config);
          console.log('[AgentDB] Using HNSWLib backend (fallback)');
        } else if (detection.sqljsRvf) {
          console.log('[AgentDB] Falling back to sql.js RVF backend');
          backend = await createSqlJsRvfBackend(config);
          console.log('[AgentDB] Using sql.js RVF backend (built-in fallback)');
        } else {
          throw error;
        }
      }
    } else if (detection.rvf.sdk) {
      backend = await createRvfBackend(config);
      console.log(`[AgentDB] Using RVF backend (${detection.rvf.node ? 'N-API native' : 'WASM'})`);
    } else if (detection.hnswlib) {
      backend = await createHNSWLibBackend(config);
      console.log('[AgentDB] Using HNSWLib backend (fallback)');
    } else if (detection.sqljsRvf) {
      backend = await createSqlJsRvfBackend(config);
      console.log('[AgentDB] Using sql.js RVF backend (built-in)');
    } else {
      throw new Error(
        'No vector backend available.\n' +
        'Install one of:\n' +
        '  - npm install @swarmvector/core (recommended)\n' +
        '  - npm install @swarmvector/rvf (single-file format)\n' +
        '  - npm install hnswlib-node (fallback)'
      );
    }
  }

  // Initialize the backend (if not already initialized)
  try {
    await (backend as unknown as { initialize(): Promise<void> }).initialize();
  } catch (error) {
    if (!(error as Error).message.includes('already initialized')) {
      throw error;
    }
  }

  return backend;
}

/**
 * Get recommended backend type based on environment
 */
export async function getRecommendedBackend(): Promise<BackendType> {
  const detection = await detectBackends();

  if (detection.swarmvector.core) {
    return 'swarmvector';
  } else if (detection.rvf.sdk) {
    return 'rvf';
  } else if (detection.hnswlib) {
    return 'hnswlib';
  } else {
    return 'auto';
  }
}

/**
 * Check if a specific backend is available
 */
export async function isBackendAvailable(backend: 'swarmvector' | 'rvf' | 'hnswlib'): Promise<boolean> {
  const detection = await detectBackends();

  if (backend === 'swarmvector') {
    return detection.swarmvector.core;
  }
  if (backend === 'rvf') {
    return detection.rvf.sdk;
  }

  return detection.hnswlib;
}

/**
 * Get installation instructions for a backend
 */
export function getInstallCommand(backend: 'swarmvector' | 'rvf' | 'hnswlib'): string {
  if (backend === 'swarmvector') return 'npm install swarmvector';
  if (backend === 'rvf') return 'npm install @swarmvector/rvf @swarmvector/rvf-node';
  return 'npm install hnswlib-node';
}
