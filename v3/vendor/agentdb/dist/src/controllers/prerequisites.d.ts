/**
 * Controller Prerequisites Registry
 *
 * Documents which agentdb controllers can be auto-activated by downstream
 * consumers (e.g. swarmdo's memory bridge) versus which require external
 * dependencies that the embedding host has to supply.
 *
 * Issue #146 Gap 2 — downstream consumers were reading dist source to discover
 * which controllers were safe to default-construct. This module hoists that
 * information into the public API so callers can do:
 *
 * ```ts
 * import { controllerPrerequisites } from 'agentdb';
 *
 * const safe = controllerPrerequisites.filter(c => c.requirements.length === 0);
 * // → controllers whose constructor needs no external resources
 * ```
 *
 * The data is hand-curated and tracked alongside controller source files so
 * adding a new controller forces a registry update in the same change.
 */
/**
 * What a controller needs at construction time. Anything in `requirements`
 * has to be produced by the host before the controller can be instantiated.
 */
export type ControllerRequirement = 'database' | 'embedder' | 'vectorBackend' | 'graphBackend' | 'learningBackend' | 'config' | 'wasm' | 'networkEndpoint';
/** Activation safety: what happens when this controller is constructed. */
export type ControllerSafety = 
/** Constructor itself is pure — no I/O, threads, or network. */
'pure'
/** Constructor opens a file handle / WASM module / process resource. */
 | 'opens-resource'
/** Constructor performs a network operation (e.g. binds a socket). */
 | 'opens-network';
export interface ControllerPrerequisite {
    /** Controller class name as exported from `agentdb`. */
    name: string;
    /**
     * Required external resources. When empty, the controller can be
     * default-constructed with no host-supplied arguments.
     */
    requirements: ControllerRequirement[];
    /** Optional resources — controller works without them but is degraded. */
    optional: ControllerRequirement[];
    /** Constructor arity (positional args). Useful for reflection-style wiring. */
    arity: number;
    /** What happens when this controller is instantiated. */
    safety: ControllerSafety;
    /** Short human description for tooling output. */
    description: string;
}
/**
 * Authoritative list of agentdb controllers and their construction needs.
 *
 * Order is alphabetical for easy diffs. Entries match the export names from
 * `controllers/index.ts`.
 */
export declare const controllerPrerequisites: readonly ControllerPrerequisite[];
/**
 * Convenience: controllers safe to default-construct (no required resources).
 * These are what downstream "auto-activate" passes can enable without host
 * cooperation.
 */
export declare const noArgControllers: readonly ControllerPrerequisite[];
/** Look up a controller's prerequisites by name. Returns null if unknown. */
export declare function getControllerPrerequisite(name: string): ControllerPrerequisite | null;
/**
 * Filter controllers by safety class. Useful for hosts that want to enable
 * everything except network-touching controllers, for example:
 *
 * ```ts
 * const offlineSafe = filterBySafety(['pure', 'opens-resource']);
 * ```
 */
export declare function filterBySafety(safety: readonly ControllerSafety[]): readonly ControllerPrerequisite[];
//# sourceMappingURL=prerequisites.d.ts.map