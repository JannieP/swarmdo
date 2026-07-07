/**
 * Ambient declarations for OPTIONAL native/wasm modules loaded via guarded
 * dynamic import (MODULE_NOT_FOUND-tolerant at runtime). Not installable
 * from the registry under these names — without ambient declarations tsc
 * fails TS2307 on the dynamic import expressions.
 */
declare module '@swarmnet/bmssp';
declare module '@swarmvector/hyperbolic-hnsw-wasm';
declare module '@swarmvector/attention-wasm';
declare module '@swarmvector/cognitum-gate-kernel';
declare module '@swarmvector/exotic-wasm';
declare module '@swarmvector/gnn-wasm';
declare module '@swarmvector/micro-hnsw-wasm';
declare module '@swarmvector/learning-wasm';
