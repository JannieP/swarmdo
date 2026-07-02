/**
 * Orchestration Runtime - Implementation (PR1)
 *
 * Delegates to existing safe-exec path; run lifecycle stored in-memory.
 */
import type { OrchestratorConfig, RunHandle, RunStatus, RunArtifacts, OrchestrateTaskInput } from './orchestration-types.js';
export interface Orchestrator {
    orchestrateTask(input: OrchestrateTaskInput): Promise<RunHandle>;
}
/**
 * Create an orchestrator instance.
 */
export declare function createOrchestrator(config?: OrchestratorConfig): Orchestrator;
/**
 * Get status for a run.
 */
export declare function getRunStatus(runId: string): Promise<RunStatus>;
/**
 * Best-effort cancel of a run. No-op when backend does not support cancel.
 */
export declare function cancelRun(_runId: string): Promise<void>;
/**
 * Get artifacts for a run.
 */
export declare function getRunArtifacts(runId: string): Promise<RunArtifacts>;
//# sourceMappingURL=orchestration-runtime.d.ts.map