/**
 * Ambient declaration for the OPTIONAL wasm module loaded via guarded
 * dynamic import. Not installable from the registry under this name —
 * without it tsc fails TS2307 on the dynamic import expressions.
 */
declare module 'prime-radiant-advanced-wasm';
