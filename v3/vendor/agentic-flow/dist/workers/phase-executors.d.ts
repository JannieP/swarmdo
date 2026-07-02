/**
 * Phase Executors - Composable analysis phases for custom workers
 *
 * REFACTORED: Core phases are now in consolidated-phases.ts to eliminate duplication.
 * This module provides backwards compatibility and additional specialized phases.
 */
import { WorkerContext } from './types.js';
import { PhaseConfig, PhaseResult } from './custom-worker-config.js';
import { UnifiedPhaseContext, createUnifiedContext } from './consolidated-phases.js';
export type PhaseContext = UnifiedPhaseContext;
export declare const createPhaseContext: typeof createUnifiedContext;
export type PhaseExecutor = (workerContext: WorkerContext, phaseContext: PhaseContext, options: Record<string, unknown>) => Promise<PhaseResult>;
export declare function registerPhaseExecutor(type: string, executor: PhaseExecutor): void;
export declare function getPhaseExecutor(type: string): PhaseExecutor | undefined;
export declare function listPhaseExecutors(): string[];
export declare function executePhasePipeline(workerContext: WorkerContext, phases: PhaseConfig[], onProgress?: (phase: string, progress: number) => void): Promise<{
    success: boolean;
    phaseContext: PhaseContext;
    results: Map<string, PhaseResult>;
    errors: string[];
}>;
//# sourceMappingURL=phase-executors.d.ts.map