/**
 * Ambient declarations for OPTIONAL native/wasm modules loaded via guarded
 * dynamic import (MODULE_NOT_FOUND-tolerant at runtime). The packages are
 * not installable from the registry under these names, so without ambient
 * declarations tsc fails TS2307 on the dynamic import expressions.
 */
declare module '@swarmnet/bmssp';
declare module '@swarmvector/hyperbolic-hnsw-wasm';
