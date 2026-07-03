/**
 * ContrastiveTrainer - Contrastive Embedding Improvement for AgentDB
 *
 * Provides:
 * - InfoNCE contrastive loss for embedding refinement
 * - Hard negative mining for effective training samples
 * - Curriculum scheduling for progressive difficulty
 * - AdamW optimizer for weight updates (via @swarmvector/attention when available)
 *
 * Security:
 * - Operates on embeddings only (no user text)
 * - Temperature bounded (0.01-1.0)
 * - Batch sizes bounded to prevent OOM
 * - All inputs dimension-validated
 */
/** Training sample for contrastive learning */
export interface ContrastiveSample {
    anchor: Float32Array;
    positive: Float32Array;
    negatives: Float32Array[];
}
/** Training batch result */
export interface TrainBatchResult {
    loss: number;
    batchSize: number;
    avgGradNorm: number;
}
/** Training session statistics */
export interface TrainingStats {
    totalBatches: number;
    totalSamples: number;
    avgLoss: number;
    bestLoss: number;
    currentDifficulty: number;
    epoch: number;
}
/** Curriculum stage configuration */
export interface CurriculumStage {
    /** Number of negatives per sample in this stage */
    negativeCount: number;
    /** Minimum similarity for hard negatives */
    hardNegativeThreshold: number;
    /** Number of batches in this stage */
    batches: number;
}
/** ContrastiveTrainer configuration */
export interface ContrastiveConfig {
    /** Embedding dimension */
    dimension: number;
    /** InfoNCE temperature (default: 0.07) */
    temperature?: number;
    /** Learning rate (default: 0.001) */
    learningRate?: number;
    /** Weight decay for AdamW (default: 0.01) */
    weightDecay?: number;
    /** Maximum batch size (default: 64) */
    maxBatchSize?: number;
    /** Curriculum stages (default: 3 stages) */
    stages?: CurriculumStage[];
}
import type { NativeAccelerator } from './NativeAccelerator.js';
/**
 * ContrastiveTrainer - Self-improving embedding quality via contrastive learning
 *
 * Uses InfoNCE loss to train a lightweight projection that improves
 * embedding quality over time. Hard negative mining ensures the model
 * focuses on the most informative training signals.
 *
 * Automatically uses NativeAccelerator (ADR-007) for SIMD-accelerated
 * cosine similarity and native AdamW when available.
 */
export declare class ContrastiveTrainer {
    private dim;
    private temperature;
    private learningRate;
    private weightDecay;
    private maxBatchSize;
    private stages;
    private currentStage;
    private batchesInStage;
    private weights;
    private bias;
    private mW;
    private vW;
    private mB;
    private vB;
    private step;
    private accel;
    private _totalBatches;
    private _totalSamples;
    private _lossSum;
    private _bestLoss;
    private _destroyed;
    private constructor();
    /**
     * Create a new contrastive trainer.
     */
    static create(config: ContrastiveConfig): Promise<ContrastiveTrainer>;
    /**
     * Project an embedding through the learned transformation.
     * Use this to enhance query/document embeddings after training.
     */
    project(embedding: Float32Array): Float32Array;
    /**
     * Compute InfoNCE loss for a batch of contrastive samples.
     *
     * L = -log(exp(sim(a, p) / t) / sum(exp(sim(a, n_i) / t)))
     */
    computeLoss(samples: ContrastiveSample[]): number;
    /**
     * Train on a batch of contrastive samples.
     * Uses analytical backpropagation through the InfoNCE loss.
     */
    trainBatch(samples: ContrastiveSample[]): TrainBatchResult;
    /**
     * Mine hard negatives from a pool of embeddings.
     * Returns negatives that are similar to anchor but from different classes.
     *
     * SOTA: Positive-aware filtering (NV-Retriever, 2024). Rejects candidates
     * with high similarity to known positives to eliminate false negatives,
     * which constitute ~70% of naively mined hard negatives.
     */
    mineHardNegatives(anchor: Float32Array, pool: Float32Array[], excludeIndices: Set<number>, count?: number, positives?: Float32Array[]): Float32Array[];
    /**
     * Get the NativeAccelerator instance (for testing/introspection).
     */
    getAccelerator(): NativeAccelerator | null;
    /**
     * Get the current curriculum stage info.
     */
    get currentCurriculumStage(): number;
    /**
     * Get training statistics.
     */
    getStats(): TrainingStats;
    /** Check if destroyed */
    get isDestroyed(): boolean;
    /** Get configured dimension */
    get dimension(): number;
    /** Destroy and free resources */
    destroy(): void;
    private matVecMul;
    private cosineSimilarity;
    private vecNorm;
    private adamWUpdate;
    private ensureAlive;
}
//# sourceMappingURL=ContrastiveTrainer.d.ts.map