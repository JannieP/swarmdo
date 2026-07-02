/**
 * Consolidated Phase System
 *
 * Eliminates redundancy between phase-executors.ts and ruvector-native-integration.ts
 * by providing a unified phase registry that:
 * 1. Uses native implementations as primary (faster, SIMD-optimized)
 * 2. Falls back to legacy implementations if needed
 * 3. Shares the cached ONNX embedder across all phases
 */
import { WorkerContext } from './types.js';
import { PhaseResult } from './custom-worker-config.js';
export interface UnifiedPhaseContext {
    files: string[];
    patterns: string[];
    bytes: number;
    dependencies: Map<string, string[]>;
    metrics: Record<string, number>;
    embeddings: Map<string, Float32Array>;
    vectors: Map<string, number[]>;
    phaseData: Map<string, Record<string, unknown>>;
    vulnerabilities: Array<{
        type: string;
        file: string;
        line: number;
        severity: string;
    }>;
}
export declare function createUnifiedContext(): UnifiedPhaseContext;
export type UnifiedPhaseExecutor = (workerContext: WorkerContext, phaseContext: UnifiedPhaseContext, options: Record<string, unknown>) => Promise<PhaseResult>;
export declare function registerUnifiedPhase(type: string, executor: UnifiedPhaseExecutor): void;
export declare function getUnifiedPhase(type: string): UnifiedPhaseExecutor | undefined;
export declare function listUnifiedPhases(): string[];
export declare function runUnifiedPipeline(workerContext: WorkerContext, phases: string[], options?: Record<string, unknown>): Promise<{
    success: boolean;
    phases: string[];
    context: UnifiedPhaseContext;
    results: Record<string, PhaseResult>;
    duration: number;
}>;
//# sourceMappingURL=consolidated-phases.d.ts.map