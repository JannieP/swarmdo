/**
 * WorkerDispatchService - Dispatches and manages background workers
 *
 * Integrates with RuVector ecosystem:
 * - SONA: Self-learning trajectory tracking
 * - ReasoningBank: Pattern storage and memory retrieval
 * - HNSW: Vector indexing for semantic search
 */
import { EventEmitter } from 'events';
import { WorkerId, WorkerTrigger, WorkerInfo, WorkerResults, DetectedTrigger, WorkerContext } from './types.js';
import { ResourceGovernor } from './resource-governor.js';
import { RuVectorWorkerIntegration } from './ruvector-integration.js';
import { CustomWorkerInstance } from './custom-worker-factory.js';
type WorkerImplementation = (context: WorkerContext) => Promise<WorkerResults>;
export declare class WorkerDispatchService extends EventEmitter {
    private registry;
    private governor;
    private detector;
    private ruvector;
    private runningWorkers;
    private workerImplementations;
    constructor();
    /**
     * Dispatch a worker based on trigger
     */
    dispatch(trigger: WorkerTrigger, topic: string | null, sessionId: string): Promise<WorkerId>;
    /**
     * Detect triggers in prompt and dispatch workers
     * @param parallel - Enable parallel dispatch for better batch performance (default: true)
     */
    dispatchFromPrompt(prompt: string, sessionId: string, options?: {
        parallel?: boolean;
    }): Promise<{
        triggers: DetectedTrigger[];
        workerIds: WorkerId[];
    }>;
    /**
     * Execute worker in background with RuVector integration
     */
    private executeWorker;
    /**
     * Get worker status
     */
    getStatus(workerId: WorkerId): WorkerInfo | null;
    /**
     * Get all workers
     */
    getAllWorkers(sessionId?: string): WorkerInfo[];
    /**
     * Get active workers
     */
    getActiveWorkers(sessionId?: string): WorkerInfo[];
    /**
     * Cancel a running worker
     */
    cancel(workerId: WorkerId): boolean;
    /**
     * Wait for worker completion
     */
    awaitCompletion(workerId: WorkerId, timeout?: number): Promise<WorkerInfo | null>;
    /**
     * Register a worker implementation
     */
    registerWorker(trigger: string, implementation: WorkerImplementation): void;
    /**
     * Register a custom worker from definition
     */
    registerCustomWorker(worker: CustomWorkerInstance): void;
    /**
     * Load and register custom workers from config file
     */
    loadCustomWorkers(configPath?: string): Promise<number>;
    /**
     * Check if a trigger has a custom worker
     */
    hasCustomWorker(trigger: string): boolean;
    /**
     * Get available custom worker presets
     */
    getCustomWorkerPresets(): string[];
    /**
     * Register default worker implementations
     */
    private registerDefaultWorkers;
    private createUltralearnWorker;
    private createOptimizeWorker;
    private createConsolidateWorker;
    private createPredictWorker;
    private createAuditWorker;
    private createMapWorker;
    private createPreloadWorker;
    private createDeepdiveWorker;
    private createDocumentWorker;
    private createRefactorWorker;
    private createBenchmarkWorker;
    private createTestgapsWorker;
    private phaseResults;
    /**
     * Execute a worker phase with REAL file analysis (pure JS, no native bindings)
     */
    private executePhase;
    /**
     * Extract code patterns related to a topic
     */
    private extractPatterns;
    /**
     * Get dashboard statistics including RuVector integration
     */
    getStats(): {
        active: number;
        byStatus: Record<string, number>;
        byTrigger: Record<string, number>;
        availability: ReturnType<ResourceGovernor['getAvailability']>;
        ruvector: ReturnType<RuVectorWorkerIntegration['getStats']>;
    };
    /**
     * Get RuVector integration instance for advanced operations
     */
    getRuVectorIntegration(): RuVectorWorkerIntegration;
}
export declare function getWorkerDispatchService(): WorkerDispatchService;
export {};
//# sourceMappingURL=dispatch-service.d.ts.map