/**
 * RuVector Native Integration
 *
 * REFACTORED: Core phases are now in consolidated-phases.ts
 * This module provides the native runner wrapper and adapters.
 */
import { WorkerContext } from './types.js';
import { PhaseResult } from './custom-worker-config.js';
import { UnifiedPhaseContext } from './consolidated-phases.js';
export type PhaseContext = UnifiedPhaseContext;
export interface RuVectorNativeConfig {
    onnxModelPath?: string;
    vectorDimension: number;
    hnswM?: number;
    hnswEfConstruction?: number;
    enableSIMD: boolean;
    cacheEmbeddings: boolean;
}
export interface NativeWorkerResult {
    success: boolean;
    phases: string[];
    metrics: {
        filesAnalyzed: number;
        patternsFound: number;
        embeddingsGenerated: number;
        vectorsStored: number;
        durationMs: number;
        onnxLatencyMs?: number;
        throughputOpsPerSec?: number;
    };
    data: Record<string, unknown>;
}
export interface NativePhase {
    name: string;
    description: string;
    execute: (context: NativePhaseContext) => Promise<NativePhaseResult>;
}
export interface NativePhaseContext {
    workDir: string;
    files: string[];
    patterns: string[];
    embeddings: Map<string, Float32Array>;
    vectors: Map<string, number[]>;
    options: Record<string, unknown>;
}
export interface NativePhaseResult {
    success: boolean;
    filesProcessed?: number;
    patternsFound?: number;
    embeddingsGenerated?: number;
    vectorsStored?: number;
    data?: Record<string, unknown>;
    error?: string;
}
/**
 * Register a native ruvector phase
 */
export declare function registerNativePhase(name: string, phase: NativePhase): void;
/**
 * Get registered native phases
 */
export declare function listNativePhases(): string[];
export declare class RuVectorNativeRunner {
    private config;
    constructor(config?: Partial<RuVectorNativeConfig>);
    /**
     * Run a native worker with specified phases
     */
    run(workDir: string, phases: string[], options?: Record<string, unknown>): Promise<NativeWorkerResult>;
    /**
     * Run security scan worker
     */
    runSecurityScan(workDir: string): Promise<NativeWorkerResult>;
    /**
     * Run full analysis worker
     */
    runFullAnalysis(workDir: string): Promise<NativeWorkerResult>;
    /**
     * Run learning worker
     */
    runLearning(workDir: string): Promise<NativeWorkerResult>;
}
/**
 * Create agentic-flow phase executor from native phase
 */
export declare function createPhaseExecutorFromNative(nativePhaseName: string): (context: WorkerContext, phaseContext: UnifiedPhaseContext, options: Record<string, unknown>) => Promise<PhaseResult>;
export declare const nativeRunner: RuVectorNativeRunner;
export declare function runNativeSecurityScan(workDir?: string): Promise<NativeWorkerResult>;
export declare function runNativeAnalysis(workDir?: string): Promise<NativeWorkerResult>;
export declare function runNativeLearning(workDir?: string): Promise<NativeWorkerResult>;
//# sourceMappingURL=ruvector-native-integration.d.ts.map