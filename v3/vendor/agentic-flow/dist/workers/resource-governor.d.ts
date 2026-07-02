/**
 * ResourceGovernor - Prevents resource exhaustion for background workers
 */
import { WorkerId, WorkerTrigger, WorkerInfo, ResourceLimits, ResourceStats } from './types.js';
export declare class ResourceGovernor {
    private limits;
    private activeWorkers;
    private timeouts;
    constructor(limits?: Partial<ResourceLimits>);
    /**
     * Check if a new worker can be spawned
     */
    canSpawn(trigger: WorkerTrigger): {
        allowed: boolean;
        reason?: string;
    };
    /**
     * Register a new worker
     */
    register(worker: WorkerInfo): void;
    /**
     * Update worker in tracking
     */
    update(workerId: WorkerId, updates: Partial<WorkerInfo>): void;
    /**
     * Unregister a worker
     */
    unregister(workerId: WorkerId): void;
    /**
     * Get resource statistics
     */
    getStats(): ResourceStats;
    /**
     * Get all active workers
     */
    getActiveWorkers(): WorkerInfo[];
    /**
     * Get a specific active worker
     */
    getWorker(workerId: WorkerId): WorkerInfo | undefined;
    /**
     * Check if a worker is active
     */
    isActive(workerId: WorkerId): boolean;
    /**
     * Get current limits
     */
    getLimits(): ResourceLimits;
    /**
     * Update limits
     */
    setLimits(limits: Partial<ResourceLimits>): void;
    /**
     * Force cleanup of a worker
     */
    forceCleanup(workerId: WorkerId): boolean;
    /**
     * Cleanup all workers (for shutdown)
     */
    cleanupAll(): void;
    /**
     * Get slot availability info
     */
    getAvailability(): {
        totalSlots: number;
        usedSlots: number;
        availableSlots: number;
        byTrigger: Record<string, {
            used: number;
            max: number;
        }>;
    };
}
export declare function getResourceGovernor(): ResourceGovernor;
//# sourceMappingURL=resource-governor.d.ts.map