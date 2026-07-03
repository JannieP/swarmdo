let wasm;

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let cachedFloat64ArrayMemory0 = null;

function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

let WASM_VECTOR_LEN = 0;

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

const WasmGraphFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmgraph_free(ptr >>> 0, 1));
/**
 * WASM-compatible graph wrapper
 */
export class WasmGraph {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmGraphFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmgraph_free(ptr, 0);
    }
    /**
     * @param {number} vertices
     * @param {boolean} directed
     */
    constructor(vertices, directed) {
        const ret = wasm.wasmgraph_new(vertices, directed);
        this.__wbg_ptr = ret >>> 0;
        WasmGraphFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} from
     * @param {number} to
     * @param {number} weight
     * @returns {boolean}
     */
    add_edge(from, to, weight) {
        const ret = wasm.wasmgraph_add_edge(this.__wbg_ptr, from, to, weight);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get vertex_count() {
        const ret = wasm.wasmgraph_vertex_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get edge_count() {
        const ret = wasm.wasmgraph_edge_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} source
     * @returns {Float64Array}
     */
    compute_shortest_paths(source) {
        const ret = wasm.wasmgraph_compute_shortest_paths(this.__wbg_ptr, source);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
}

const WasmNeuralBMSSPFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmneuralbmssp_free(ptr >>> 0, 1));
/**
 * WASM-compatible neural BMSSP wrapper
 */
export class WasmNeuralBMSSP {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmNeuralBMSSPFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmneuralbmssp_free(ptr, 0);
    }
    /**
     * @param {number} vertices
     * @param {number} embedding_dim
     */
    constructor(vertices, embedding_dim) {
        const ret = wasm.wasmneuralbmssp_new(vertices, embedding_dim);
        this.__wbg_ptr = ret >>> 0;
        WasmNeuralBMSSPFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {number} node
     * @param {Float64Array} embedding
     * @returns {boolean}
     */
    set_embedding(node, embedding) {
        const ptr0 = passArrayF64ToWasm0(embedding, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmneuralbmssp_set_embedding(this.__wbg_ptr, node, ptr0, len0);
        return ret !== 0;
    }
    /**
     * @param {number} from
     * @param {number} to
     * @param {number} alpha
     */
    add_semantic_edge(from, to, alpha) {
        wasm.wasmneuralbmssp_add_semantic_edge(this.__wbg_ptr, from, to, alpha);
    }
    /**
     * @param {number} source
     * @returns {Float64Array}
     */
    compute_neural_paths(source) {
        const ret = wasm.wasmneuralbmssp_compute_neural_paths(this.__wbg_ptr, source);
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * @param {number} node1
     * @param {number} node2
     * @returns {number}
     */
    semantic_distance(node1, node2) {
        const ret = wasm.wasmneuralbmssp_semantic_distance(this.__wbg_ptr, node1, node2);
        return ret;
    }
    /**
     * @param {Float64Array} gradients_flat
     * @param {number} learning_rate
     * @param {number} embedding_dim
     * @returns {boolean}
     */
    update_embeddings(gradients_flat, learning_rate, embedding_dim) {
        const ptr0 = passArrayF64ToWasm0(gradients_flat, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmneuralbmssp_update_embeddings(this.__wbg_ptr, ptr0, len0, learning_rate, embedding_dim);
        return ret !== 0;
    }
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_export_0;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
        ;
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    return imports;
}

function __wbg_init_memory(imports, memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedFloat64ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('bmssp_rust_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    __wbg_init_memory(imports);

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
