// Rufflo fork: ambient stubs for ruvnet packages not yet vendored (the RVF
// umbrella + WASM backends). agentdb imports these only via optional, guarded
// dynamic backends that fall back gracefully when the module is absent.
// Declaring them as `any` keeps `tsc` green until they are forked in the
// WASM/umbrella phase; runtime behaviour (try/catch fallback) is unchanged.
declare module '@rufvector/rvf';
declare module '@rufvector/rvf-wasm';
declare module '@rufvector/rvf-solver';
