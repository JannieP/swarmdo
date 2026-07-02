/**
 * ResourceGovernor - Prevents resource exhaustion for background workers
 */
import { getWorkerRegistry } from './worker-registry.js';
import { TRIGGER_CONFIGS } from './trigger-detector.js';
const DEFAULT_LIMITS = {
    maxConcurrentWorkers: 10,
    maxPerTrigger: 3,
    maxHeapMB: 1024,
    workerTimeout: 600000 // 10 minutes
};
export class ResourceGovernor {
    limits;
    activeWorkers = new Map();
    timeouts = new Map();
    constructor(limits) {
        this.limits = { ...DEFAULT_LIMITS, ...limits };
    }
    /**
     * Check if a new worker can be spawned
     */
    canSpawn(trigger) {
        // Check total worker count
        if (this.activeWorkers.size >= this.limits.maxConcurrentWorkers) {
            return {
                allowed: false,
                reason: `Max workers (${this.limits.maxConcurrentWorkers}) reached`
            };
        }
        // Check workers of same type
        const sameType = Array.from(this.activeWorkers.values())
            .filter(w => w.trigger === trigger);
        if (sameType.length >= this.limits.maxPerTrigger) {
            return {
                allowed: false,
                reason: `Max ${trigger} workers (${this.limits.maxPerTrigger}) reached`
            };
        }
        // Check memory usage
        const memUsage = process.memoryUsage();
        const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
        if (heapUsedMB > this.limits.maxHeapMB) {
            return {
                allowed: false,
                reason: `Memory limit exceeded: ${heapUsedMB.toFixed(0)}MB > ${this.limits.maxHeapMB}MB`
            };
        }
        return { allowed: true };
    }
    /**
     * Register a new worker
     */
    register(worker) {
        this.activeWorkers.set(worker.id, worker);
        // Get timeout from trigger config or use default
        const config = TRIGGER_CONFIGS.get(worker.trigger);
        const timeout = config?.timeout || this.limits.workerTimeout;
        // Set timeout for cleanup
        const timer = setTimeout(() => {
            const w = this.activeWorkers.get(worker.id);
            if (w && w.status !== 'complete' && w.status !== 'failed') {
                // Mark as timeout in registry
                const registry = getWorkerRegistry();
                registry.updateStatus(worker.id, 'timeout', {
                    error: `Worker exceeded timeout of ${timeout}ms`
                });
                this.unregister(worker.id);
            }
        }, timeout);
        this.timeouts.set(worker.id, timer);
    }
    /**
     * Update worker in tracking
     */
    update(workerId, updates) {
        const worker = this.activeWorkers.get(workerId);
        if (worker) {
            this.activeWorkers.set(workerId, { ...worker, ...updates });
        }
    }
    /**
     * Unregister a worker
     */
    unregister(workerId) {
        this.activeWorkers.delete(workerId);
        const timer = this.timeouts.get(workerId);
        if (timer) {
            clearTimeout(timer);
            this.timeouts.delete(workerId);
        }
    }
    /**
     * Get resource statistics
     */
    getStats() {
        const workersByType = {};
        for (const worker of this.activeWorkers.values()) {
            workersByType[worker.trigger] = (workersByType[worker.trigger] || 0) + 1;
        }
        return {
            activeWorkers: this.activeWorkers.size,
            workersByType,
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime()
        };
    }
    /**
     * Get all active workers
     */
    getActiveWorkers() {
        return Array.from(this.activeWorkers.values());
    }
    /**
     * Get a specific active worker
     */
    getWorker(workerId) {
        return this.activeWorkers.get(workerId);
    }
    /**
     * Check if a worker is active
     */
    isActive(workerId) {
        return this.activeWorkers.has(workerId);
    }
    /**
     * Get current limits
     */
    getLimits() {
        return { ...this.limits };
    }
    /**
     * Update limits
     */
    setLimits(limits) {
        this.limits = { ...this.limits, ...limits };
    }
    /**
     * Force cleanup of a worker
     */
    forceCleanup(workerId) {
        if (!this.activeWorkers.has(workerId)) {
            return false;
        }
        const registry = getWorkerRegistry();
        registry.updateStatus(workerId, 'cancelled', {
            error: 'Force cancelled by resource governor'
        });
        this.unregister(workerId);
        return true;
    }
    /**
     * Cleanup all workers (for shutdown)
     */
    cleanupAll() {
        for (const workerId of this.activeWorkers.keys()) {
            this.forceCleanup(workerId);
        }
    }
    /**
     * Get slot availability info
     */
    getAvailability() {
        const stats = this.getStats();
        const byTrigger = {};
        for (const trigger of TRIGGER_CONFIGS.keys()) {
            byTrigger[trigger] = {
                used: stats.workersByType[trigger] || 0,
                max: this.limits.maxPerTrigger
            };
        }
        return {
            totalSlots: this.limits.maxConcurrentWorkers,
            usedSlots: stats.activeWorkers,
            availableSlots: this.limits.maxConcurrentWorkers - stats.activeWorkers,
            byTrigger
        };
    }
}
// Singleton instance
let instance = null;
export function getResourceGovernor() {
    if (!instance) {
        instance = new ResourceGovernor();
    }
    return instance;
}
//# sourceMappingURL=resource-governor.js.map