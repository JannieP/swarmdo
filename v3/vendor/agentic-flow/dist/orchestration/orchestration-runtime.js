/**
 * Orchestration Runtime - Implementation (PR1)
 *
 * Delegates to existing safe-exec path; run lifecycle stored in-memory.
 */
import { ulid } from 'ulid';
import { seedMemory } from './memory-plane.js';
const defaultConfig = {
    backend: 'safe-exec',
};
/** In-memory run store: runId -> RunStatus. */
const runStatusStore = new Map();
/** In-memory artifacts store: runId -> RunArtifacts. */
const runArtifactsStore = new Map();
/**
 * Create an orchestrator instance.
 */
export function createOrchestrator(config = {}) {
    const { backend } = { ...defaultConfig, ...config };
    return {
        async orchestrateTask(input) {
            const runId = ulid();
            runStatusStore.set(runId, { phase: 'running', progress: 0, finished: false });
            if (input.initialMemoryEntries?.length) {
                await seedMemory(runId, input.initialMemoryEntries);
            }
            try {
                if (backend === 'safe-exec') {
                    const { execTaskOrchestrate } = await import('../utils/safe-exec.js');
                    const strategy = input.strategy ?? 'adaptive';
                    const priority = input.priority ?? 'medium';
                    execTaskOrchestrate(input.description, strategy, priority);
                }
                runStatusStore.set(runId, { phase: 'completed', progress: 100, finished: true });
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                runStatusStore.set(runId, {
                    phase: 'failed',
                    progress: 100,
                    error: message,
                    finished: true,
                });
            }
            runArtifactsStore.set(runId, {
                commits: [],
                testLogs: [],
                memoryWrites: [],
            });
            return { runId };
        },
    };
}
/**
 * Get status for a run.
 */
export async function getRunStatus(runId) {
    const status = runStatusStore.get(runId);
    if (status)
        return status;
    return { phase: 'unknown', progress: 0, finished: false };
}
/**
 * Best-effort cancel of a run. No-op when backend does not support cancel.
 */
export async function cancelRun(_runId) {
    // P2P and safe-exec backends do not support cancel today.
}
/**
 * Get artifacts for a run.
 */
export async function getRunArtifacts(runId) {
    const artifacts = runArtifactsStore.get(runId);
    if (artifacts)
        return artifacts;
    return { commits: [], testLogs: [], memoryWrites: [] };
}
//# sourceMappingURL=orchestration-runtime.js.map