/**
 * Generic orchestration client (Option A).
 *
 * Stable input/output shape for apps (build systems, IDEs, CI) that drive
 * agentic-flow in-process. Map your app payload to StartRunInput; get back
 * runId and a consistent status/cancel result shape.
 */
import { createOrchestrator, getRunStatus, cancelRun, getRunArtifacts, } from './orchestration-runtime.js';
import { seedMemory, recordLearning, searchMemory, harvestMemory, } from './memory-plane.js';
function phaseToState(phase) {
    switch (phase) {
        case 'pending':
            return 'queued';
        case 'running':
            return 'running';
        case 'completed':
            return 'completed';
        case 'failed':
            return 'failed';
        case 'cancelled':
            return 'cancelled';
        case 'unknown':
        default:
            return 'unknown';
    }
}
/**
 * Create a generic orchestration client. Use this when your app needs a stable
 * input/output shape (taskDescription, memorySeed, acceptanceCriteria, paths,
 * provenance) and runId/status/cancel results. Map your app payload to
 * StartRunInput; use the returned runId for getStatus and cancel.
 */
export function createOrchestrationClient(options = {}) {
    const { config = {} } = options;
    const orchestrator = createOrchestrator(config);
    return {
        async startRun(input) {
            const handle = await orchestrator.orchestrateTask({
                description: input.taskDescription,
                strategy: 'adaptive',
                priority: 'medium',
                initialMemoryEntries: input.memorySeed,
                cwd: input.cwd,
                acceptanceCriteria: input.acceptanceCriteria,
                allowedPaths: input.allowedPaths,
                forbiddenPaths: input.forbiddenPaths,
                provenance: input.provenance,
                loopPolicy: input.loopPolicy,
            });
            return { runId: handle.runId };
        },
        async getStatus(runId) {
            const status = await getRunStatus(runId);
            const artifacts = await getRunArtifacts(runId);
            const commits = (artifacts.commits ?? []).map((c) => ({
                sha: c.sha ?? '',
                branch: '',
                message: c.message ?? '',
            }));
            return {
                runId,
                status: phaseToState(status.phase),
                progress: status.progress,
                error: status.error,
                finished: status.finished,
                summary: status.finished ? `Progress: ${status.progress}%` : undefined,
                commits: commits.length > 0 ? commits : undefined,
            };
        },
        async cancel(runId) {
            try {
                await cancelRun(runId);
                return { success: true };
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { success: false, error: message };
            }
        },
        async seed(runId, entries) {
            await seedMemory(runId, entries);
        },
        async recordLearning(runId, learning, score, provenance) {
            await recordLearning(runId, learning, score, provenance);
        },
        async search(scope, query, topK) {
            return searchMemory(scope, query, topK);
        },
        async harvest(runId) {
            return harvestMemory(runId);
        },
    };
}
//# sourceMappingURL=orchestration-client.js.map