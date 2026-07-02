/**
 * Generic orchestration client (Option A).
 *
 * Stable input/output shape for apps (build systems, IDEs, CI) that drive
 * agentic-flow in-process. Map your app payload to StartRunInput; get back
 * runId and a consistent status/cancel result shape.
 */
import type { OrchestratorConfig, LoopPolicy } from './orchestration-types.js';
import type { MemorySearchScope } from './memory-plane-types.js';
import type { MemorySearchResult } from './memory-plane-types.js';
import type { RunLearning } from './memory-plane.js';
/** Generic input for starting a run. Apps map their payload to this shape. */
export interface StartRunInput {
    /** Full task description for the build agent. */
    taskDescription: string;
    /** Working directory for the run. */
    cwd?: string;
    /** Memory entries to seed before the run (e.g. context refs). */
    memorySeed?: Array<{
        key: string;
        value: string;
        namespace?: string;
        metadata?: Record<string, unknown>;
    }>;
    /** Acceptance criteria (e.g. "tests pass", "lint clean"). */
    acceptanceCriteria?: string[];
    /** Paths the run is allowed to modify. */
    allowedPaths?: string[];
    /** Paths the run must not modify. */
    forbiddenPaths?: string[];
    /** Provenance (run/card/assignment ids) for audit. */
    provenance?: {
        runId?: string;
        assignmentId?: string;
        cardId?: string;
        [key: string]: unknown;
    };
    /** Loop policy: max iterations, success criteria, retry, budget. Pass-through for backends. */
    loopPolicy?: LoopPolicy;
}
/** Status state returned by the generic client. */
export type RunStatusState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
/** Generic run status. Apps map this to their own status type if needed. */
export interface ClientRunStatus {
    runId: string;
    status: RunStatusState;
    progress: number;
    error?: string;
    finished?: boolean;
    summary?: string;
    commits?: Array<{
        sha: string;
        branch: string;
        message: string;
    }>;
}
/** Result of cancel. */
export interface CancelRunResult {
    success: boolean;
    error?: string;
}
/** Harvested run memory (entries + learnings with provenance). */
export interface ClientHarvestResult {
    entries: Array<{
        key?: string;
        value: string;
        metadata?: Record<string, unknown>;
    }>;
    learnings: RunLearning[];
}
/** Generic orchestration client interface. */
export interface OrchestrationClient {
    startRun(input: StartRunInput): Promise<{
        runId: string;
    }>;
    getStatus(runId: string): Promise<ClientRunStatus>;
    cancel(runId: string): Promise<CancelRunResult>;
    /** Seed run-scoped memory before or during a run. */
    seed(runId: string, entries: Array<{
        key?: string;
        value: string;
        metadata?: Record<string, unknown>;
    }>): Promise<void>;
    /** Record a learning/pattern for the run (included in harvest). */
    recordLearning(runId: string, learning: string, score?: number, provenance?: Record<string, unknown>): Promise<void>;
    /** Search memory (run-scoped or global). */
    search(scope: MemorySearchScope | {
        runId?: string;
    }, query: string, topK: number): Promise<MemorySearchResult[]>;
    /** Harvest run-scoped entries and learnings after a run (for audit/reuse). */
    harvest(runId: string): Promise<ClientHarvestResult>;
}
export interface CreateOrchestrationClientOptions {
    /** Orchestrator config (e.g. backend: 'safe-exec' | 'test'). */
    config?: OrchestratorConfig;
}
/**
 * Create a generic orchestration client. Use this when your app needs a stable
 * input/output shape (taskDescription, memorySeed, acceptanceCriteria, paths,
 * provenance) and runId/status/cancel results. Map your app payload to
 * StartRunInput; use the returned runId for getStatus and cancel.
 */
export declare function createOrchestrationClient(options?: CreateOrchestrationClientOptions): OrchestrationClient;
//# sourceMappingURL=orchestration-client.d.ts.map