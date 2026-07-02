/**
 * Custom Worker Factory
 *
 * Creates worker implementations from CustomWorkerDefinition configs.
 * Handles loading config files, validating definitions, and registering
 * custom workers with the dispatch service.
 */
import { CustomWorkerDefinition, CapabilityConfig, FileFilterConfig, OutputConfig } from './custom-worker-config.js';
import { WorkerContext, WorkerResults } from './types.js';
export interface CustomWorkerInstance {
    /** Worker definition */
    definition: CustomWorkerDefinition;
    /** Merged capabilities */
    capabilities: CapabilityConfig;
    /** Merged file filter */
    fileFilter: FileFilterConfig;
    /** Merged output config */
    output: OutputConfig;
    /** Execute the worker */
    execute: (context: WorkerContext) => Promise<WorkerResults>;
}
/**
 * Create a worker instance from a definition
 */
export declare function createCustomWorker(definition: CustomWorkerDefinition, globalSettings?: {
    defaultCapabilities?: Partial<CapabilityConfig>;
    defaultFileFilter?: Partial<FileFilterConfig>;
    defaultOutput?: Partial<OutputConfig>;
}): CustomWorkerInstance;
/**
 * Create a worker from a preset
 */
export declare function createFromPreset(presetName: string, overrides?: Partial<CustomWorkerDefinition>): CustomWorkerInstance;
/**
 * Load workers from a config file
 */
export declare function loadWorkersFromConfig(configPath?: string): Promise<CustomWorkerInstance[]>;
export declare class CustomWorkerManager {
    private workers;
    private triggerMap;
    /**
     * Register a custom worker
     */
    register(worker: CustomWorkerInstance): void;
    /**
     * Create and register from preset
     */
    registerPreset(presetName: string, overrides?: Partial<CustomWorkerDefinition>): CustomWorkerInstance;
    /**
     * Create and register from definition
     */
    registerDefinition(definition: CustomWorkerDefinition): CustomWorkerInstance;
    /**
     * Load and register from config file
     */
    loadFromConfig(configPath?: string): Promise<number>;
    /**
     * Get worker by name or trigger
     */
    get(nameOrTrigger: string): CustomWorkerInstance | undefined;
    /**
     * Check if a trigger matches a custom worker
     */
    matchesTrigger(input: string): string | undefined;
    /**
     * List all registered workers
     */
    list(): CustomWorkerInstance[];
    /**
     * List available presets
     */
    listPresets(): string[];
    /**
     * Get preset definition
     */
    getPreset(name: string): Partial<CustomWorkerDefinition> | undefined;
    /**
     * Execute a custom worker
     */
    execute(nameOrTrigger: string, context: WorkerContext): Promise<WorkerResults>;
    /**
     * Generate example config file
     */
    generateExampleConfig(): string;
}
export declare const customWorkerManager: CustomWorkerManager;
export declare function formatWorkerInfo(worker: CustomWorkerInstance): string;
export declare function formatPresetList(): string;
//# sourceMappingURL=custom-worker-factory.d.ts.map