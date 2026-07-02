/**
 * WorkerRegistry - SQLite-backed persistence for background workers
 *
 * Supports both better-sqlite3 (native) and sql.js (WASM) backends.
 * Automatically falls back to sql.js on Windows or when native fails.
 */
import { WorkerId, WorkerTrigger, WorkerStatus, WorkerInfo, WorkerMetrics } from './types.js';
export declare class WorkerRegistry {
    private db;
    private initialized;
    private dbBackend;
    private dbPath;
    constructor(dbPath?: string);
    private initializeSync;
    private useMemoryFallback;
    private initialize;
    /**
     * Create a new worker entry
     */
    create(trigger: WorkerTrigger, sessionId: string, topic?: string | null): WorkerId;
    /**
     * Get worker by ID
     */
    get(workerId: WorkerId): WorkerInfo | null;
    /**
     * Update worker status
     */
    updateStatus(workerId: WorkerId, status: WorkerStatus, extra?: {
        progress?: number;
        currentPhase?: string;
        error?: string;
        results?: Record<string, unknown>;
    }): void;
    /**
     * Increment memory deposits counter
     */
    incrementMemoryDeposits(workerId: WorkerId, key?: string): void;
    /**
     * Update worker metrics
     */
    updateMetrics(workerId: WorkerId, metrics: Partial<WorkerMetrics>): void;
    /**
     * Get all workers, optionally filtered
     */
    getAll(options?: {
        sessionId?: string;
        status?: WorkerStatus | WorkerStatus[];
        trigger?: WorkerTrigger;
        limit?: number;
        since?: number;
    }): WorkerInfo[];
    /**
     * Get active workers (queued or running)
     */
    getActive(sessionId?: string): WorkerInfo[];
    /**
     * Count workers by status
     */
    countByStatus(sessionId?: string): Record<WorkerStatus, number>;
    /**
     * Get worker metrics
     */
    getMetrics(workerId: WorkerId): WorkerMetrics | null;
    /**
     * Delete old workers
     */
    cleanup(maxAge?: number): number;
    /**
     * Get aggregated stats for dashboard
     */
    getStats(timeframe?: '1h' | '24h' | '7d'): {
        total: number;
        byStatus: Record<WorkerStatus, number>;
        byTrigger: Record<string, number>;
        avgDuration: number;
    };
    private countByTrigger;
    private rowToWorkerInfo;
    /**
     * Close database connection
     */
    close(): void;
}
export declare function getWorkerRegistry(): WorkerRegistry;
//# sourceMappingURL=worker-registry.d.ts.map