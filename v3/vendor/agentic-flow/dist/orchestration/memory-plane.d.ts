/**
 * Memory plane implementation (PR3)
 *
 * Explicit methods so vector memorization and run context are guaranteed.
 * In-memory implementation; can be wired to AgentDB/ReasoningBank/safe-exec later.
 */
import type { MemoryEntry, MemorySearchResult, MemorySearchScope } from './memory-plane-types.js';
/**
 * Seed run context so the run sees these entries. Guaranteed, not prompt-only.
 */
export declare function seedMemory(runId: string, entries: Array<{
    key?: string;
    value: string;
    metadata?: Record<string, unknown>;
}>): Promise<void>;
/**
 * Record a learning/pattern for the run (e.g. for ReasoningBank/pattern store).
 */
export declare function recordLearning(runId: string, learning: string, score?: number, provenance?: Record<string, unknown>): Promise<void>;
/**
 * Search memory. Scope is run-scoped (when runId present) or 'global'.
 * Returns up to topK results. In-memory impl uses simple substring match.
 */
export declare function searchMemory(scope: MemorySearchScope | {
    runId?: string;
}, query: string, topK: number): Promise<MemorySearchResult[]>;
/** Learning record stored for a run. */
export interface RunLearning {
    learning: string;
    score?: number;
    provenance?: Record<string, unknown>;
}
/**
 * Harvest run-scoped memory (entries + learnings) for a run. Use after completion
 * to pull context and learnings with provenance for audit or reuse.
 */
export declare function harvestMemory(runId: string): Promise<{
    entries: MemoryEntry[];
    learnings: RunLearning[];
}>;
//# sourceMappingURL=memory-plane.d.ts.map