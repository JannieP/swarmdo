/* tslint:disable */
/* eslint-disable */

/**
 * 1-bit quantized vector index. Builds in O(n × dim) memory + O(n × dim)
 * time; searches in O(n) hamming distance + O(rerank_factor × k × dim)
 * exact-L2² rerank.
 */
export class RabitqIndex {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Build an index from a flat Float32Array of length `n * dim`.
     *
     * `seed` controls the random rotation matrix; the same `(seed,
     * dim, vectors)` triple produces bit-identical codes (ADR-154
     * determinism guarantee). `rerank_factor` is the multiplier on
     * `k` for the exact-L2² rerank pool — typical 20.
     *
     * Errors:
     * - `vectors.length` is not a multiple of `dim`
     * - `dim == 0` or `vectors.length == 0`
     */
    static build(vectors: Float32Array, dim: number, seed: bigint, rerank_factor: number): RabitqIndex;
    /**
     * Find the `k` nearest neighbors of `query`. Returns hits in
     * ascending distance.
     *
     * Errors:
     * - `query.length != dim` of the index
     * - `k == 0`
     */
    search(query: Float32Array, k: number): SearchResult[];
    /**
     * True iff the index has zero vectors. Mirrors Rust's `is_empty`
     * convention; exposed because `wasm-bindgen` getter for `len`
     * returns u32, so callers can't `idx.len === 0` reliably.
     */
    readonly isEmpty: boolean;
    /**
     * Number of vectors indexed.
     */
    readonly len: number;
}

/**
 * Search result — single nearest-neighbor hit.
 *
 * Mirrors the structure used by the Python SDK's `RabitqIndex.search`
 * so callers porting code between languages get identical shapes.
 */
export class SearchResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Approximate L2² distance after RaBitQ rerank.
     */
    readonly distance: number;
    /**
     * Caller-supplied vector id (the position passed to `build`).
     */
    readonly id: number;
}

/**
 * Initialize panic hook for clearer error messages in the browser
 * console. Called once at module import.
 */
export function init(): void;

/**
 * Crate version string baked at build time.
 */
export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_get_searchresult_distance: (a: number) => number;
    readonly __wbg_get_searchresult_id: (a: number) => number;
    readonly __wbg_rabitqindex_free: (a: number, b: number) => void;
    readonly __wbg_searchresult_free: (a: number, b: number) => void;
    readonly rabitqindex_build: (a: number, b: number, c: number, d: number, e: bigint, f: number) => void;
    readonly rabitqindex_isEmpty: (a: number) => number;
    readonly rabitqindex_len: (a: number) => number;
    readonly rabitqindex_search: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly version: (a: number) => void;
    readonly init: () => void;
    readonly __wbindgen_export: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export2: (a: number, b: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
