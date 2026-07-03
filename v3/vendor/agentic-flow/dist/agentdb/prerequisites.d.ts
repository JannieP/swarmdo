/**
 * Controller Prerequisites — local shim for `agentic-flow/agentdb`.
 *
 * Mirrors the registry that lives in the upstream `agentdb` package
 * (`agentdb/dist/controllers/prerequisites.js`). Exposing it through the
 * `agentic-flow/agentdb` re-export means consumers (e.g. swarmdo) can rely on
 * a single import surface regardless of which agentdb version is installed.
 *
 * Issue #146 Gap 2.
 */
export type ControllerRequirement = 'database' | 'embedder' | 'vectorBackend' | 'graphBackend' | 'learningBackend' | 'config' | 'wasm' | 'networkEndpoint';
export type ControllerSafety = 'pure' | 'opens-resource' | 'opens-network';
export interface ControllerPrerequisite {
    name: string;
    requirements: ControllerRequirement[];
    optional: ControllerRequirement[];
    arity: number;
    safety: ControllerSafety;
    description: string;
}
export declare const controllerPrerequisites: readonly ControllerPrerequisite[];
export declare const noArgControllers: readonly ControllerPrerequisite[];
export declare function getControllerPrerequisite(name: string): ControllerPrerequisite | null;
export declare function filterBySafety(safety: readonly ControllerSafety[]): readonly ControllerPrerequisite[];
//# sourceMappingURL=prerequisites.d.ts.map