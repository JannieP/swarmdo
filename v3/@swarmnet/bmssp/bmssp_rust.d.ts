/* tslint:disable */
/* eslint-disable */
/**
 * WASM-compatible graph wrapper
 */
export class WasmGraph {
  free(): void;
  constructor(vertices: number, directed: boolean);
  add_edge(from: number, to: number, weight: number): boolean;
  compute_shortest_paths(source: number): Float64Array;
  readonly vertex_count: number;
  readonly edge_count: number;
}
/**
 * WASM-compatible neural BMSSP wrapper
 */
export class WasmNeuralBMSSP {
  free(): void;
  constructor(vertices: number, embedding_dim: number);
  set_embedding(node: number, embedding: Float64Array): boolean;
  add_semantic_edge(from: number, to: number, alpha: number): void;
  compute_neural_paths(source: number): Float64Array;
  semantic_distance(node1: number, node2: number): number;
  update_embeddings(gradients_flat: Float64Array, learning_rate: number, embedding_dim: number): boolean;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_wasmgraph_free: (a: number, b: number) => void;
  readonly wasmgraph_new: (a: number, b: number) => number;
  readonly wasmgraph_add_edge: (a: number, b: number, c: number, d: number) => number;
  readonly wasmgraph_vertex_count: (a: number) => number;
  readonly wasmgraph_edge_count: (a: number) => number;
  readonly wasmgraph_compute_shortest_paths: (a: number, b: number) => [number, number];
  readonly __wbg_wasmneuralbmssp_free: (a: number, b: number) => void;
  readonly wasmneuralbmssp_new: (a: number, b: number) => number;
  readonly wasmneuralbmssp_set_embedding: (a: number, b: number, c: number, d: number) => number;
  readonly wasmneuralbmssp_add_semantic_edge: (a: number, b: number, c: number, d: number) => void;
  readonly wasmneuralbmssp_compute_neural_paths: (a: number, b: number) => [number, number];
  readonly wasmneuralbmssp_semantic_distance: (a: number, b: number, c: number) => number;
  readonly wasmneuralbmssp_update_embeddings: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly __wbindgen_export_0: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
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
