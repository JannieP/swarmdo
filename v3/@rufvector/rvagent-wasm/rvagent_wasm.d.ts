/* tslint:disable */
/* eslint-disable */

/**
 * A model provider that delegates to a JavaScript callback function.
 *
 * The JS callback receives a JSON string of messages and must return
 * a Promise that resolves to a JSON string response.
 *
 * # JavaScript usage
 * ```js
 * const provider = new JsModelProvider(async (messagesJson) => {
 *     const messages = JSON.parse(messagesJson);
 *     const response = await callMyModel(messages);
 *     return JSON.stringify(response);
 * });
 * ```
 */
export class JsModelProvider {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Send messages to the JS model provider and get a response.
     *
     * `messages_json` is a JSON-serialized array of message objects.
     * Returns the model's response as a JSON string.
     */
    complete(messages_json: string): Promise<string>;
    /**
     * Create a new provider wrapping a JavaScript async function.
     *
     * The function must accept a JSON string and return a Promise<string>.
     */
    constructor(callback: Function);
}

/**
 * rvAgent WASM — browser and Node.js agent execution.
 *
 * Create with `new WasmAgent(configJson)` from JavaScript.
 */
export class WasmAgent {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Execute a tool directly by passing a JSON tool request.
     */
    execute_tool(tool_json: string): any;
    /**
     * Get the number of files in the virtual filesystem.
     */
    file_count(): number;
    /**
     * Get the current agent state as JSON.
     */
    get_state(): any;
    /**
     * Get the todo list as JSON.
     */
    get_todos(): any;
    /**
     * Get the list of available tools.
     */
    get_tools(): any;
    /**
     * Check whether the agent is stopped.
     */
    is_stopped(): boolean;
    /**
     * Get the configured model identifier.
     */
    model(): string;
    /**
     * Get the agent name, if configured.
     */
    name(): string | undefined;
    /**
     * Create a new WasmAgent from a JSON configuration string.
     *
     * # Example (JavaScript)
     * ```js
     * const agent = new WasmAgent('{"model": "anthropic:claude-sonnet-4-20250514"}');
     * ```
     */
    constructor(config_json: string);
    /**
     * Send a prompt and get a response.
     *
     * If a model provider is set, the prompt is sent to the JS model.
     * Otherwise, returns an echo response for testing.
     */
    prompt(input: string): Promise<any>;
    /**
     * Reset the agent state, clearing messages and turn count.
     */
    reset(): void;
    /**
     * Attach a JavaScript model provider callback.
     *
     * The callback receives a JSON string of messages and must return
     * a `Promise<string>` with the model response.
     */
    set_model_provider(callback: Function): void;
    /**
     * Get the current turn count.
     */
    turn_count(): number;
    /**
     * Get the crate version.
     */
    static version(): string;
}

/**
 * RVF App Gallery — browse, load, and configure agent templates.
 *
 * # Example (JavaScript)
 * ```js
 * const gallery = new WasmGallery();
 *
 * // List all templates
 * const templates = gallery.list();
 *
 * // Search by tags
 * const results = gallery.search("security testing");
 *
 * // Get template details
 * const template = gallery.get("coder");
 *
 * // Load as RVF container
 * const rvfBytes = gallery.loadRvf("coder");
 *
 * // Configure template
 * gallery.configure("coder", { maxTurns: 100 });
 * ```
 */
export class WasmGallery {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add a custom template to the gallery.
     */
    addCustom(template_json: string): void;
    /**
     * Configure the active template with overrides.
     */
    configure(config_json: string): void;
    /**
     * Get the number of templates in the gallery.
     */
    count(): number;
    /**
     * Export all custom templates as JSON.
     */
    exportCustom(): any;
    /**
     * Get a template by ID.
     */
    get(id: string): any;
    /**
     * Get the currently active template ID.
     */
    getActive(): string | undefined;
    /**
     * Get all categories with template counts.
     */
    getCategories(): any;
    /**
     * Get configuration overrides for active template.
     */
    getConfig(): any;
    /**
     * Import custom templates from JSON.
     */
    importCustom(templates_json: string): number;
    /**
     * List all available templates.
     */
    list(): any;
    /**
     * List templates by category.
     */
    listByCategory(category: string): any;
    /**
     * Load a template as an RVF container (returns Uint8Array).
     */
    loadRvf(id: string): Uint8Array;
    /**
     * Create a new gallery with built-in templates.
     */
    constructor();
    /**
     * Remove a custom template by ID.
     */
    removeCustom(id: string): void;
    /**
     * Search templates by query (matches name, description, tags).
     */
    search(query: string): any;
    /**
     * Set a template as active for use.
     */
    setActive(id: string): void;
}

/**
 * WASM MCP Server — runs the MCP protocol entirely in the browser.
 *
 * This server exposes rvAgent tools via MCP JSON-RPC, enabling integration
 * with MCP clients without requiring a separate server process.
 *
 * # Example (JavaScript)
 * ```js
 * const mcp = new WasmMcpServer("rvagent-wasm");
 *
 * // Handle request
 * const response = mcp.handleRequest(JSON.stringify({
 *     jsonrpc: "2.0",
 *     id: 1,
 *     method: "tools/list",
 *     params: {}
 * }));
 * console.log(response);
 * ```
 */
export class WasmMcpServer {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Execute a tool by name with JSON parameters.
     */
    call_tool(name: string, params_json: string): any;
    /**
     * Get the gallery instance for direct access.
     */
    gallery(): any;
    /**
     * Handle a JSON-RPC request and return a JSON-RPC response.
     */
    handle_request(request_json: string): any;
    /**
     * Check if the server has been initialized.
     */
    is_initialized(): boolean;
    /**
     * Get the list of available tools as JSON.
     */
    list_tools(): any;
    /**
     * Get the server name.
     */
    name(): string;
    /**
     * Create a new WasmMcpServer with the given name.
     */
    constructor(name: string);
    /**
     * Get the server version.
     */
    version(): string;
}

/**
 * RVF Container Builder for WASM.
 *
 * Build RVF cognitive containers that package tools, prompts, skills,
 * orchestrator configs, MCP tools, and Ruvix capabilities.
 *
 * # Example (JavaScript)
 * ```js
 * const builder = new WasmRvfBuilder();
 * builder.addTool({ name: "search", description: "Web search", parameters: {} });
 * builder.addPrompt({ name: "coder", system_prompt: "You are a coder", version: "1.0" });
 * const container = builder.build();
 * // container is Uint8Array with RVF magic bytes
 * ```
 */
export class WasmRvfBuilder {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add Ruvix capability definitions.
     */
    addCapabilities(caps_json: string): void;
    /**
     * Add MCP tool entries.
     */
    addMcpTools(tools_json: string): void;
    /**
     * Add an agent prompt.
     */
    addPrompt(prompt_json: string): void;
    /**
     * Add multiple prompts from JSON array.
     */
    addPrompts(prompts_json: string): void;
    /**
     * Add a skill definition.
     */
    addSkill(skill_json: string): void;
    /**
     * Add multiple skills from JSON array.
     */
    addSkills(skills_json: string): void;
    /**
     * Add a tool definition.
     */
    addTool(tool_json: string): void;
    /**
     * Add multiple tools from JSON array.
     */
    addTools(tools_json: string): void;
    /**
     * Build the RVF container as bytes.
     *
     * Returns a Uint8Array containing the RVF binary:
     * - Magic bytes: "RVF\x01" (4 bytes)
     * - Segment count: u32 LE (4 bytes)
     * - Segments: type(1) + tag(2) + len(4) + data
     * - Checksum: SHA3-256 (32 bytes)
     */
    build(): Uint8Array;
    /**
     * Get the RVF magic bytes for detection.
     */
    static getMagic(): Uint8Array;
    /**
     * Create a new RVF container builder.
     */
    constructor();
    /**
     * Parse an RVF container from bytes.
     */
    static parse(data: Uint8Array): any;
    /**
     * Set orchestrator configuration.
     */
    setOrchestrator(config_json: string): void;
    /**
     * Validate an RVF container (check magic and checksum).
     */
    static validate(data: Uint8Array): boolean;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_jsmodelprovider_free: (a: number, b: number) => void;
    readonly __wbg_wasmagent_free: (a: number, b: number) => void;
    readonly __wbg_wasmgallery_free: (a: number, b: number) => void;
    readonly __wbg_wasmmcpserver_free: (a: number, b: number) => void;
    readonly __wbg_wasmrvfbuilder_free: (a: number, b: number) => void;
    readonly jsmodelprovider_complete: (a: number, b: number, c: number) => number;
    readonly jsmodelprovider_new: (a: number, b: number) => void;
    readonly wasmagent_execute_tool: (a: number, b: number, c: number, d: number) => void;
    readonly wasmagent_file_count: (a: number) => number;
    readonly wasmagent_get_state: (a: number, b: number) => void;
    readonly wasmagent_get_todos: (a: number, b: number) => void;
    readonly wasmagent_get_tools: (a: number, b: number) => void;
    readonly wasmagent_is_stopped: (a: number) => number;
    readonly wasmagent_model: (a: number, b: number) => void;
    readonly wasmagent_name: (a: number, b: number) => void;
    readonly wasmagent_new: (a: number, b: number, c: number) => void;
    readonly wasmagent_prompt: (a: number, b: number, c: number) => number;
    readonly wasmagent_reset: (a: number) => void;
    readonly wasmagent_set_model_provider: (a: number, b: number, c: number) => void;
    readonly wasmagent_turn_count: (a: number) => number;
    readonly wasmagent_version: (a: number) => void;
    readonly wasmgallery_addCustom: (a: number, b: number, c: number, d: number) => void;
    readonly wasmgallery_configure: (a: number, b: number, c: number, d: number) => void;
    readonly wasmgallery_count: (a: number) => number;
    readonly wasmgallery_exportCustom: (a: number, b: number) => void;
    readonly wasmgallery_get: (a: number, b: number, c: number, d: number) => void;
    readonly wasmgallery_getActive: (a: number, b: number) => void;
    readonly wasmgallery_getCategories: (a: number, b: number) => void;
    readonly wasmgallery_getConfig: (a: number, b: number) => void;
    readonly wasmgallery_importCustom: (a: number, b: number, c: number, d: number) => void;
    readonly wasmgallery_list: (a: number, b: number) => void;
    readonly wasmgallery_listByCategory: (a: number, b: number, c: number, d: number) => void;
    readonly wasmgallery_loadRvf: (a: number, b: number, c: number, d: number) => void;
    readonly wasmgallery_new: () => number;
    readonly wasmgallery_removeCustom: (a: number, b: number, c: number, d: number) => void;
    readonly wasmgallery_search: (a: number, b: number, c: number, d: number) => void;
    readonly wasmgallery_setActive: (a: number, b: number, c: number, d: number) => void;
    readonly wasmmcpserver_call_tool: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly wasmmcpserver_gallery: (a: number, b: number) => void;
    readonly wasmmcpserver_handle_request: (a: number, b: number, c: number, d: number) => void;
    readonly wasmmcpserver_is_initialized: (a: number) => number;
    readonly wasmmcpserver_list_tools: (a: number, b: number) => void;
    readonly wasmmcpserver_name: (a: number, b: number) => void;
    readonly wasmmcpserver_new: (a: number, b: number) => number;
    readonly wasmmcpserver_version: (a: number, b: number) => void;
    readonly wasmrvfbuilder_addCapabilities: (a: number, b: number, c: number, d: number) => void;
    readonly wasmrvfbuilder_addMcpTools: (a: number, b: number, c: number, d: number) => void;
    readonly wasmrvfbuilder_addPrompt: (a: number, b: number, c: number, d: number) => void;
    readonly wasmrvfbuilder_addPrompts: (a: number, b: number, c: number, d: number) => void;
    readonly wasmrvfbuilder_addSkill: (a: number, b: number, c: number, d: number) => void;
    readonly wasmrvfbuilder_addSkills: (a: number, b: number, c: number, d: number) => void;
    readonly wasmrvfbuilder_addTool: (a: number, b: number, c: number, d: number) => void;
    readonly wasmrvfbuilder_addTools: (a: number, b: number, c: number, d: number) => void;
    readonly wasmrvfbuilder_build: (a: number, b: number) => void;
    readonly wasmrvfbuilder_new: () => number;
    readonly wasmrvfbuilder_parse: (a: number, b: number, c: number) => void;
    readonly wasmrvfbuilder_setOrchestrator: (a: number, b: number, c: number, d: number) => void;
    readonly wasmrvfbuilder_validate: (a: number, b: number, c: number) => void;
    readonly wasmrvfbuilder_getMagic: () => number;
    readonly __wasm_bindgen_func_elem_497: (a: number, b: number) => void;
    readonly __wasm_bindgen_func_elem_498: (a: number, b: number, c: number, d: number) => void;
    readonly __wasm_bindgen_func_elem_535: (a: number, b: number, c: number, d: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
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
