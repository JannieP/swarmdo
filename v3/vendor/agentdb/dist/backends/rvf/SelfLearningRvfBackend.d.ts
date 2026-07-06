/**
 * SelfLearningRvfBackend - Unified Self-Learning RVF Integration (ADR-006)
 *
 * Wraps RvfBackend with: SemanticQueryRouter + SonaLearningBackend on search,
 * TemporalCompressor + IndexHealthMonitor on insert, ContrastiveTrainer for
 * feedback, FederatedSessionManager for sessions, RvfSolver for adaptive policy.
 */
import type { VectorBackendAsync, SearchResult, SearchOptions, VectorStats } from '../VectorBackend.js';
import { RvfBackend } from './RvfBackend.js';
import type { RvfConfig } from './RvfBackend.js';
import type { SolverPolicyState, SolverAcceptanceManifest, SolverAcceptanceOptions } from './RvfSolver.js';
import type { NativeAccelerator, AcceleratorStats, WitnessVerifyResult } from './NativeAccelerator.js';
export interface SelfLearningConfig extends RvfConfig {
    learning?: boolean;
    tickIntervalMs?: number;
    learningDimension?: number;
    positiveThreshold?: number;
    negativeThreshold?: number;
    trainingBatchSize?: number;
    maxAdapters?: number;
    federated?: boolean;
    solverTrainCount?: number;
    solverMinDifficulty?: number;
    solverMaxDifficulty?: number;
    acceptanceIntervalTicks?: number;
    acceptanceHoldoutSize?: number;
    /** Path for router state persistence (ADR-007 Phase 1) */
    routerPersistencePath?: string;
}
export interface LearningStats {
    searchesEnhanced: number;
    trajectoriesRecorded: number;
    contrastiveSamples: number;
    contrastiveBatches: number;
    tickCount: number;
    solverTrainCount: number;
    useAdaptiveEf: boolean;
    activeSessionCount: number;
    compressionEntries: number;
    /** Accuracy under noise from last acceptance (v0.1.6) */
    noiseAccuracy: number;
    /** Total constraint violations from last acceptance (v0.1.6) */
    violations: number;
    /** Patterns distilled in last acceptance cycle (v0.1.6) */
    patternsDistilled: number;
    /** Improvement dimensions from last acceptance 0-4 (v0.1.6) */
    dimensionsImproved: number;
}
export declare class SelfLearningRvfBackend implements VectorBackendAsync {
    readonly name: "rvf";
    private backend;
    private sona;
    private router;
    private compressor;
    private healthMonitor;
    private trainer;
    private federated;
    private solver;
    private accelerator;
    private config;
    private dim;
    private learningEnabled;
    private useAdaptiveEf;
    private activeTrajectories;
    private trajectoryCounter;
    private sampleBuffer;
    private recentSearches;
    private accessFrequency;
    private totalSearches;
    private activeSessions;
    private tickMutex;
    private _tickCount;
    private _searchesEnhanced;
    private _trajectoriesRecorded;
    private _contrastiveSamples;
    private _contrastiveBatches;
    private _solverTrainCount;
    private _destroyed;
    private _simBuf;
    private _lastManifest;
    private _learningRate;
    private constructor();
    static create(config: SelfLearningConfig): Promise<SelfLearningRvfBackend>;
    /** ADR-010 Phase 7: Append a mutation event to the solver witness chain via training */
    recordMutationWitness(operation: string): void;
    insertAsync(id: string, embedding: Float32Array, metadata?: Record<string, unknown>): Promise<void>;
    insertBatchAsync(items: Array<{
        id: string;
        embedding: Float32Array;
        metadata?: Record<string, unknown>;
    }>): Promise<void>;
    searchAsync(query: Float32Array, k: number, options?: SearchOptions): Promise<SearchResult[]>;
    removeAsync(id: string): Promise<boolean>;
    getStatsAsync(): Promise<VectorStats>;
    flush(): Promise<void>;
    insert(id: string, embedding: Float32Array, metadata?: Record<string, unknown>): void;
    insertBatch(items: Array<{
        id: string;
        embedding: Float32Array;
        metadata?: Record<string, unknown>;
    }>): void;
    search(query: Float32Array, k: number, options?: SearchOptions): SearchResult[];
    remove(id: string): boolean;
    getStats(): VectorStats;
    save(path: string): Promise<void>;
    load(path: string): Promise<void>;
    close(): void;
    beginSession(agentId: string): Promise<string>;
    endSession(agentId: string, quality: number): Promise<void>;
    recordFeedback(queryId: string, quality: number): void;
    tick(): Promise<void>;
    forceLearn(): Promise<void>;
    getSolverPolicy(): SolverPolicyState | null;
    runAcceptance(options?: SolverAcceptanceOptions): SolverAcceptanceManifest | null;
    getWitnessChain(): Uint8Array | null;
    /**
     * Verify the witness chain using native WASM verification (ADR-007 Phase 1).
     * Falls back to structural check if @rufvector/rvf-wasm is unavailable.
     */
    verifyWitnessChain(): WitnessVerifyResult | null;
    /** Get the native accelerator (ADR-007) */
    getAccelerator(): NativeAccelerator | null;
    /** Get accelerator stats (ADR-007) */
    getAcceleratorStats(): AcceleratorStats | null;
    getLearningStats(): LearningStats;
    getBackend(): RvfBackend;
    get isLearningEnabled(): boolean;
    get isAdaptiveEf(): boolean;
    get isDestroyed(): boolean;
    /**
     * Persist router state on demand (ADR-007 Phase 1).
     */
    persistRouter(): Promise<boolean>;
    destroy(): void;
    private initComponents;
    private selectEf;
    private nearestEf;
    private createSamples;
    private expireTrajectories;
    private runAcceptanceCheck;
    private ensureAlive;
}
//# sourceMappingURL=SelfLearningRvfBackend.d.ts.map