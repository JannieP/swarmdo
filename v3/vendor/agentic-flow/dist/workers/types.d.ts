/**
 * Background Workers Type Definitions
 * Non-blocking workers triggered by keywords that run silently
 */
export type WorkerId = string;
export type WorkerTrigger = 'ultralearn' | 'optimize' | 'consolidate' | 'predict' | 'audit' | 'map' | 'preload' | 'deepdive' | 'document' | 'refactor' | 'benchmark' | 'testgaps';
export type WorkerStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled' | 'timeout';
export type WorkerPriority = 'low' | 'medium' | 'high' | 'critical';
export interface TriggerConfig {
    keyword: WorkerTrigger;
    worker: string;
    priority: WorkerPriority;
    maxAgents: number;
    timeout: number;
    cooldown: number;
    topicExtractor: RegExp | null;
    description: string;
}
export interface DetectedTrigger {
    keyword: WorkerTrigger;
    topic: string | null;
    config: TriggerConfig;
    detectedAt: number;
}
export interface WorkerInfo {
    id: WorkerId;
    trigger: WorkerTrigger;
    topic: string | null;
    sessionId: string;
    status: WorkerStatus;
    progress: number;
    currentPhase: string | null;
    startedAt: number;
    completedAt: number | null;
    error: string | null;
    memoryDeposits: number;
    resultKeys: string[];
    createdAt: number;
    /** Actual analysis results from worker execution */
    results?: {
        files_analyzed?: number;
        patterns_found?: number;
        bytes_processed?: number;
        sample_patterns?: string[];
        [key: string]: unknown;
    };
}
export interface WorkerResults {
    status: WorkerStatus;
    success?: boolean;
    data?: Record<string, unknown>;
    error?: string;
    completedPhases: number;
    totalPhases: number;
    memoryKeys: string[];
    duration: number;
    tokensUsed?: number;
}
export interface PhaseResult {
    phase: string;
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
    duration: number;
    memoryKeys?: string[];
}
export interface ResourceLimits {
    maxConcurrentWorkers: number;
    maxPerTrigger: number;
    maxHeapMB: number;
    workerTimeout: number;
}
export interface ResourceStats {
    activeWorkers: number;
    workersByType: Record<string, number>;
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
}
export interface MemoryEntry {
    collection: string;
    key: string;
    data: unknown;
    vector?: number[];
    ttl?: number;
    metadata?: Record<string, unknown>;
}
export interface SearchResult {
    collection: string;
    key: string;
    data: unknown;
    score: number;
}
export interface ContextInjection {
    context: Array<{
        source: string;
        type: string;
        content: string;
        score: number;
    }>;
    source: string;
    confidence: number;
}
export interface WorkerMetrics {
    workerId: WorkerId;
    filesAnalyzed: number;
    patternsFound: number;
    memoryBytesWritten: number;
    cpuTimeMs: number;
    peakMemoryMB: number;
    errorCount: number;
}
export interface DashboardMetrics {
    totalSpawned: number;
    totalCompleted: number;
    totalFailed: number;
    avgDurationMs: number;
    p95DurationMs: number;
    peakConcurrency: number;
    avgMemoryMB: number;
    peakMemoryMB: number;
    patternsStored: number;
    memoryDeposits: number;
    contextInjections: number;
    byTrigger: Record<string, {
        count: number;
        avgDuration: number;
        successRate: number;
    }>;
}
export interface WorkerContext {
    workerId: WorkerId;
    trigger: WorkerTrigger;
    topic: string | null;
    sessionId: string;
    startTime: number;
    signal: AbortSignal;
    onProgress: (progress: number, phase: string) => void;
    onMemoryDeposit: (key: string) => void;
}
export interface PoolConfig {
    maxPoolSize: number;
    preWarmCount: number;
    idleTimeout: number;
}
//# sourceMappingURL=types.d.ts.map