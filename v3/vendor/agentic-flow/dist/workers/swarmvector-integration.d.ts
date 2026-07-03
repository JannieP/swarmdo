/**
 * SwarmVector Integration for Background Workers
 *
 * Connects workers to the full SwarmVector ecosystem:
 * - SONA: Self-learning trajectory tracking
 * - ReasoningBank: Pattern storage and memory retrieval
 * - HNSW: Vector indexing for fast semantic search
 * - Intelligence Layer: Unified pattern recognition
 */
import { EventEmitter } from 'events';
import { WorkerContext, WorkerResults, WorkerTrigger } from './types.js';
/**
 * SwarmVector integration configuration
 */
export interface SwarmVectorWorkerConfig {
    /** Enable SONA trajectory tracking (default: true) */
    enableSona: boolean;
    /** Enable ReasoningBank pattern storage (default: true) */
    enableReasoningBank: boolean;
    /** Enable HNSW vector indexing (default: true) */
    enableHnsw: boolean;
    /** SONA learning profile */
    sonaProfile: 'real-time' | 'batch' | 'balanced';
    /** Embedding dimension (default: 384) */
    embeddingDim: number;
    /** HNSW parameters */
    hnswM: number;
    hnswEfConstruction: number;
    /** Quality threshold for pattern storage (0-1) */
    qualityThreshold: number;
}
/**
 * Worker trajectory step
 */
export interface WorkerStep {
    phase: string;
    activations: number[];
    duration: number;
    memoryDeposits: number;
    successRate: number;
}
/**
 * Worker learning result
 */
export interface WorkerLearningResult {
    trajectoryId: string;
    qualityScore: number;
    patternsLearned: number;
    memoryDeposits: string[];
    sonaAdaptation: boolean;
}
/**
 * SwarmVector Worker Integration Service
 * Provides unified access to SwarmVector capabilities for background workers
 */
export declare class SwarmVectorWorkerIntegration extends EventEmitter {
    private config;
    private sonaService;
    private reasoningBank;
    private swarmvectorCore;
    private intelligenceStore;
    private onnxEmbeddings;
    private initialized;
    private activeTrajectories;
    constructor(config?: Partial<SwarmVectorWorkerConfig>);
    /**
     * Initialize SwarmVector services lazily
     * Uses unified 'swarmvector' package which includes SONA, VectorDB, embeddings
     * Falls back gracefully if native modules aren't available
     */
    initialize(): Promise<boolean>;
    /**
     * Start tracking a worker trajectory
     */
    startTrajectory(workerId: string, trigger: WorkerTrigger, topic: string | null): Promise<string>;
    /**
     * Record a worker phase step
     */
    recordStep(trajectoryId: string, phase: string, metrics: {
        duration: number;
        memoryDeposits: number;
        successRate: number;
        data?: Record<string, unknown>;
    }): Promise<void>;
    /**
     * Complete trajectory and trigger learning
     */
    completeTrajectory(trajectoryId: string, results: WorkerResults): Promise<WorkerLearningResult>;
    /**
     * Find relevant patterns for a worker task
     */
    findRelevantPatterns(trigger: WorkerTrigger, topic: string | null, limit?: number): Promise<Array<{
        key: string;
        similarity: number;
        pattern: Record<string, unknown>;
    }>>;
    /**
     * Store pattern in ReasoningBank with distillation
     */
    private storePattern;
    /**
     * Index pattern in HNSW for semantic search
     */
    private indexPattern;
    /**
     * Search HNSW index
     */
    private searchHnsw;
    /**
     * Generate embedding for text using ONNX WASM (real semantic embeddings)
     */
    private generateEmbedding;
    /**
     * Simple hash-based embedding fallback
     */
    private simpleEmbedding;
    /**
     * Generate activations for a phase
     */
    private generateActivations;
    /**
     * Calculate quality score for a trajectory
     */
    private calculateQualityScore;
    /**
     * Get integration stats
     */
    getStats(): {
        initialized: boolean;
        modules: {
            sona: boolean;
            reasoningBank: boolean;
            hnsw: boolean;
            intelligence: boolean;
            onnxEmbeddings: boolean;
        };
        activeTrajectories: number;
        config: SwarmVectorWorkerConfig;
    };
    /**
     * Cleanup resources
     */
    cleanup(): Promise<void>;
}
export declare function getSwarmVectorWorkerIntegration(config?: Partial<SwarmVectorWorkerConfig>): SwarmVectorWorkerIntegration;
/**
 * Create worker context with SwarmVector integration
 */
export declare function createSwarmVectorWorkerContext(context: WorkerContext): Promise<{
    trajectoryId: string;
    recordStep: (phase: string, metrics: {
        duration: number;
        memoryDeposits: number;
        successRate: number;
    }) => Promise<void>;
    complete: (results: WorkerResults) => Promise<WorkerLearningResult>;
    findPatterns: (limit?: number) => Promise<Array<{
        key: string;
        similarity: number;
        pattern: Record<string, unknown>;
    }>>;
}>;
//# sourceMappingURL=swarmvector-integration.d.ts.map