/**
 * Orchestration Runtime API - Types (PR1)
 *
 * Stable programmatic API surface for task orchestration.
 */
/** Backend for orchestration (e.g. safe-exec delegates to claude-flow CLI). */
export type OrchestratorBackend = 'safe-exec' | 'test';
/** Configuration for createOrchestrator. */
export interface OrchestratorConfig {
    /** Which backend to use. Default 'safe-exec'. */
    backend?: OrchestratorBackend;
}
/** Handle returned when a run is started. */
export interface RunHandle {
    /** Unique run identifier. */
    runId: string;
}
/** Phase of a run. */
export type RunPhase = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
/** Status of a run. */
export interface RunStatus {
    /** Current phase. */
    phase: RunPhase;
    /** Progress 0-100. */
    progress: number;
    /** Error message if phase is 'failed'. */
    error?: string;
    /** True when phase is completed, failed, or cancelled. */
    finished?: boolean;
}
/** Artifacts produced by a run. */
export interface RunArtifacts {
    /** Git commits made during the run. */
    commits?: Array<{
        sha?: string;
        message?: string;
    }>;
    /** Test run logs. */
    testLogs?: Array<{
        name?: string;
        output?: string;
        passed?: boolean;
    }>;
    /** Memory writes (keys/namespaces) recorded for the run. */
    memoryWrites?: Array<{
        key?: string;
        namespace?: string;
    }>;
}
/** Success criteria for loop convergence (PR2). */
export interface SuccessCriteria {
    /** Require tests to pass. */
    tests?: boolean;
    /** Require lint to pass. */
    lint?: boolean;
    /** Require typecheck to pass. */
    typecheck?: boolean;
    /** Custom predicate; when provided, run result is passed for evaluation. */
    custom?: (result: unknown) => boolean;
}
/** Retry behavior on failure (PR2). */
export interface RetryPolicy {
    /** Max retry attempts. */
    maxAttempts?: number;
    /** Backoff in ms between attempts. */
    backoffMs?: number;
    /** Failure classification for retry behavior. */
    onFailureClass?: 'transient' | 'permanent' | 'budget';
}
/** Budget limits for a run (PR2). */
export interface BudgetLimits {
    /** Max tokens. */
    tokens?: number;
    /** Max time in ms. */
    timeMs?: number;
    /** Max cost in USD. */
    costUsd?: number;
}
/** Loop policy: iteration and convergence (PR2). */
export interface LoopPolicy {
    /** Max iterations before stopping. */
    maxIterations?: number;
    /** Criteria to consider the run successful. */
    successCriteria?: SuccessCriteria;
    /** Retry policy on failure. */
    retryPolicy?: RetryPolicy;
    /** Budget limits. */
    budgetLimits?: BudgetLimits;
}
/** Provenance for a run (e.g. build system, card, assignment). Pass-through for backends. */
export interface RunProvenance {
    runId?: string;
    assignmentId?: string;
    cardId?: string;
    [key: string]: unknown;
}
/** Input for orchestrateTask. */
export interface OrchestrateTaskInput {
    /** Task description. */
    description: string;
    /** Strategy (passed to backend). */
    strategy?: string;
    /** Priority (passed to backend). */
    priority?: string;
    /** Loop policy (iteration model, success criteria, retry, budget). Passed through; convergence behavior depends on backend. */
    loopPolicy?: LoopPolicy;
    /** Optional initial memory entries; seeded for the run via seedMemory before task start so context is guaranteed. */
    initialMemoryEntries?: Array<{
        key?: string;
        value: string;
        metadata?: Record<string, unknown>;
    }>;
    /** Working directory for the run. Pass-through for backends. */
    cwd?: string;
    /** Acceptance criteria (e.g. "tests pass"). Pass-through for backends. */
    acceptanceCriteria?: string[];
    /** Paths the run is allowed to modify. Pass-through for backends. */
    allowedPaths?: string[];
    /** Paths the run must not modify. Pass-through for backends. */
    forbiddenPaths?: string[];
    /** Provenance (run/card/assignment ids). Pass-through for backends. */
    provenance?: RunProvenance;
}
//# sourceMappingURL=orchestration-types.d.ts.map