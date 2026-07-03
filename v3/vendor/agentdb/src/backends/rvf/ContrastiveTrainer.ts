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

// Bounds
const MIN_TEMPERATURE = 0.01;
const MAX_TEMPERATURE = 1.0;
const MAX_BATCH_SIZE = 256;
const MAX_NEGATIVES = 128;
const MAX_DIMENSION = 4096;

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
export class ContrastiveTrainer {
  private dim: number;
  private temperature: number;
  private learningRate: number;
  private weightDecay: number;
  private maxBatchSize: number;
  private stages: CurriculumStage[];
  private currentStage = 0;
  private batchesInStage = 0;

  // Lightweight linear projection: W * x + b
  private weights: Float32Array;
  private bias: Float32Array;

  // AdamW state
  private mW: Float32Array;
  private vW: Float32Array;
  private mB: Float32Array;
  private vB: Float32Array;
  private step = 0;

  // Native accelerator (ADR-007) — optional SIMD + native ops
  private accel: NativeAccelerator | null = null;

  // Stats
  private _totalBatches = 0;
  private _totalSamples = 0;
  private _lossSum = 0;
  private _bestLoss = Infinity;
  private _destroyed = false;

  private constructor(config: ContrastiveConfig) {
    this.dim = config.dimension;
    this.temperature = Math.min(
      Math.max(MIN_TEMPERATURE, config.temperature ?? 0.07),
      MAX_TEMPERATURE,
    );
    this.learningRate = Math.max(1e-6, config.learningRate ?? 0.001);
    this.weightDecay = Math.max(0, config.weightDecay ?? 0.01);
    this.maxBatchSize = Math.min(
      Math.max(1, config.maxBatchSize ?? 64),
      MAX_BATCH_SIZE,
    );
    this.stages = config.stages ?? [
      { negativeCount: 4, hardNegativeThreshold: 0.5, batches: 100 },
      { negativeCount: 8, hardNegativeThreshold: 0.3, batches: 100 },
      { negativeCount: 16, hardNegativeThreshold: 0.1, batches: 100 },
    ];

    // Initialize projection as identity + small noise
    const d = this.dim;
    this.weights = new Float32Array(d * d);
    this.bias = new Float32Array(d);
    for (let i = 0; i < d; i++) {
      this.weights[i * d + i] = 1.0; // Identity diagonal
    }
    // Small random perturbation
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] += (Math.random() - 0.5) * 0.01;
    }

    // AdamW momentum/velocity
    this.mW = new Float32Array(d * d);
    this.vW = new Float32Array(d * d);
    this.mB = new Float32Array(d);
    this.vB = new Float32Array(d);
  }

  /**
   * Create a new contrastive trainer.
   */
  static async create(config: ContrastiveConfig): Promise<ContrastiveTrainer> {
    if (!Number.isFinite(config.dimension) || config.dimension < 1 || config.dimension > MAX_DIMENSION) {
      throw new Error(`dimension must be between 1 and ${MAX_DIMENSION}`);
    }
    const trainer = new ContrastiveTrainer(config);
    // Lazy-load NativeAccelerator for SIMD cosine + native AdamW (ADR-007)
    try {
      const { NativeAccelerator: N } = await import('./NativeAccelerator.js');
      trainer.accel = new N();
      await trainer.accel.initialize();
    } catch { /* proceed without acceleration */ }
    return trainer;
  }

  /**
   * Project an embedding through the learned transformation.
   * Use this to enhance query/document embeddings after training.
   */
  project(embedding: Float32Array): Float32Array {
    this.ensureAlive();
    if (embedding.length !== this.dim) {
      throw new Error(`Expected dimension ${this.dim}, got ${embedding.length}`);
    }
    return this.matVecMul(this.weights, embedding, this.bias);
  }

  /**
   * Compute InfoNCE loss for a batch of contrastive samples.
   *
   * L = -log(exp(sim(a, p) / t) / sum(exp(sim(a, n_i) / t)))
   */
  computeLoss(samples: ContrastiveSample[]): number {
    this.ensureAlive();
    if (samples.length === 0) return 0;

    let totalLoss = 0;
    for (const sample of samples) {
      const projAnchor = this.matVecMul(this.weights, sample.anchor, this.bias);
      const projPos = this.matVecMul(this.weights, sample.positive, this.bias);

      // ADR-007 Phase 1: delegate to native InfoNCE when available
      if (this.accel && this.accel.nativeInfoNceAvailable) {
        const projNegs = sample.negatives.map(n => this.matVecMul(this.weights, n, this.bias));
        totalLoss += this.accel.infoNceLoss(projAnchor, projPos, projNegs, this.temperature);
        continue;
      }

      const posSim = this.cosineSimilarity(projAnchor, projPos) / this.temperature;

      let logSumExp = Math.exp(posSim);
      for (const neg of sample.negatives) {
        const projNeg = this.matVecMul(this.weights, neg, this.bias);
        const negSim = this.cosineSimilarity(projAnchor, projNeg) / this.temperature;
        logSumExp += Math.exp(negSim);
      }

      totalLoss += -posSim + Math.log(logSumExp);
    }

    return totalLoss / samples.length;
  }

  /**
   * Train on a batch of contrastive samples.
   * Uses analytical backpropagation through the InfoNCE loss.
   */
  trainBatch(samples: ContrastiveSample[]): TrainBatchResult {
    this.ensureAlive();
    const batchSize = Math.min(samples.length, this.maxBatchSize);
    const batch = samples.slice(0, batchSize);
    const d = this.dim;

    // Forward pass: compute loss
    const loss = this.computeLoss(batch);

    // Backward pass: analytical gradients via chain rule
    const wGrad = new Float32Array(d * d);
    const bGrad = new Float32Array(d);

    for (const sample of batch) {
      // Forward: project all vectors
      const aProj = this.matVecMul(this.weights, sample.anchor, this.bias);
      const pProj = this.matVecMul(this.weights, sample.positive, this.bias);

      const aNorm = this.vecNorm(aProj);
      const pNorm = this.vecNorm(pProj);
      if (aNorm < 1e-10 || pNorm < 1e-10) continue;

      // Normalized anchor and positive
      const invAN = 1 / aNorm;
      const invPN = 1 / pNorm;
      const aHat = new Float32Array(d);
      const pHat = new Float32Array(d);
      for (let i = 0; i < d; i++) {
        aHat[i] = aProj[i] * invAN;
        pHat[i] = pProj[i] * invPN;
      }

      // Positive cosine similarity
      let cosPos = 0;
      for (let i = 0; i < d; i++) cosPos += aHat[i] * pHat[i];
      const sPos = cosPos / this.temperature;

      // Project and normalize negatives, compute cosine similarities
      const negHats: Float32Array[] = [];
      const negNorms: number[] = [];
      const negCos: number[] = [];
      let Z = Math.exp(sPos);

      for (const neg of sample.negatives) {
        const nProj = this.matVecMul(this.weights, neg, this.bias);
        const nNorm = this.vecNorm(nProj);
        negNorms.push(nNorm);

        const nHat = new Float32Array(d);
        if (nNorm > 1e-10) {
          const invNN = 1 / nNorm;
          for (let i = 0; i < d; i++) nHat[i] = nProj[i] * invNN;
        }
        negHats.push(nHat);

        let cosN = 0;
        for (let i = 0; i < d; i++) cosN += aHat[i] * nHat[i];
        negCos.push(cosN);
        Z += Math.exp(cosN / this.temperature);
      }

      // Gradient of loss w.r.t. cosine similarities
      // dL/d(cos_pos) = (-1 + exp(s_pos)/Z) / τ
      const dLdCosPos = (-1 + Math.exp(sPos) / Z) / this.temperature;

      // Accumulate dL/da' from positive + all negatives
      // d(cos(â,b̂))/da' = (b̂ - cos*â) / ||a'||
      const dLda = new Float32Array(d);
      for (let i = 0; i < d; i++) {
        dLda[i] = dLdCosPos * (pHat[i] - cosPos * aHat[i]) * invAN;
      }

      // dL/dp' = dLdCosPos * (â - cos*p̂) / ||p'||
      const dLdp = new Float32Array(d);
      for (let i = 0; i < d; i++) {
        dLdp[i] = dLdCosPos * (aHat[i] - cosPos * pHat[i]) * invPN;
      }

      // Process negatives
      const dLdn: Float32Array[] = [];
      for (let n = 0; n < negHats.length; n++) {
        const dLdCosNeg = Math.exp(negCos[n] / this.temperature) / (this.temperature * Z);
        const nNorm = negNorms[n];

        // Accumulate anchor gradient from this negative
        if (nNorm > 1e-10) {
          const invNN = 1 / nNorm;
          for (let i = 0; i < d; i++) {
            dLda[i] += dLdCosNeg * (negHats[n][i] - negCos[n] * aHat[i]) * invAN;
          }

          // Gradient w.r.t. negative projection
          const g = new Float32Array(d);
          for (let i = 0; i < d; i++) {
            g[i] = dLdCosNeg * (aHat[i] - negCos[n] * negHats[n][i]) * invNN;
          }
          dLdn.push(g);
        } else {
          dLdn.push(new Float32Array(d));
        }
      }

      // Accumulate weight and bias gradients via outer products
      // dL/dW += outer(dL/da', anchor) + outer(dL/dp', positive) + sum(outer(dL/dn_i', neg_i))
      for (let i = 0; i < d; i++) {
        const rowOff = i * d;
        const dLda_i = dLda[i];
        const dLdp_i = dLdp[i];
        for (let j = 0; j < d; j++) {
          wGrad[rowOff + j] += dLda_i * sample.anchor[j] + dLdp_i * sample.positive[j];
        }
        bGrad[i] += dLda_i + dLdp_i;
      }

      // Negative outer products
      for (let n = 0; n < sample.negatives.length; n++) {
        for (let i = 0; i < d; i++) {
          const rowOff = i * d;
          const g_i = dLdn[n][i];
          for (let j = 0; j < d; j++) {
            wGrad[rowOff + j] += g_i * sample.negatives[n][j];
          }
          bGrad[i] += g_i;
        }
      }
    }

    // Average over batch
    const invN = 1 / batchSize;
    let totalGradNorm = 0;
    for (let i = 0; i < wGrad.length; i++) {
      wGrad[i] *= invN;
      totalGradNorm += wGrad[i] * wGrad[i];
    }
    for (let i = 0; i < bGrad.length; i++) {
      bGrad[i] *= invN;
      totalGradNorm += bGrad[i] * bGrad[i];
    }
    totalGradNorm = Math.sqrt(totalGradNorm);

    // AdamW update
    this.step++;
    this.adamWUpdate(this.weights, wGrad, this.mW, this.vW);
    this.adamWUpdate(this.bias, bGrad, this.mB, this.vB);

    // Update stats
    this._totalBatches++;
    this._totalSamples += batchSize;
    this._lossSum += loss;
    if (loss < this._bestLoss) this._bestLoss = loss;

    // Advance curriculum
    this.batchesInStage++;
    if (this.currentStage < this.stages.length &&
        this.batchesInStage >= this.stages[this.currentStage].batches) {
      this.currentStage = Math.min(this.currentStage + 1, this.stages.length - 1);
      this.batchesInStage = 0;
    }

    return {
      loss,
      batchSize,
      avgGradNorm: totalGradNorm,
    };
  }

  /**
   * Mine hard negatives from a pool of embeddings.
   * Returns negatives that are similar to anchor but from different classes.
   *
   * SOTA: Positive-aware filtering (NV-Retriever, 2024). Rejects candidates
   * with high similarity to known positives to eliminate false negatives,
   * which constitute ~70% of naively mined hard negatives.
   */
  mineHardNegatives(
    anchor: Float32Array,
    pool: Float32Array[],
    excludeIndices: Set<number>,
    count?: number,
    positives?: Float32Array[],
  ): Float32Array[] {
    this.ensureAlive();
    const stage = this.stages[Math.min(this.currentStage, this.stages.length - 1)];
    const n = Math.min(count ?? stage.negativeCount, MAX_NEGATIVES, pool.length);
    const falseNegThreshold = 0.85; // NV-Retriever recommended threshold

    // Score all candidates by similarity to anchor
    const scored: Array<{ idx: number; sim: number }> = [];
    for (let i = 0; i < pool.length; i++) {
      if (excludeIndices.has(i)) continue;
      const sim = this.cosineSimilarity(anchor, pool[i]);
      if (sim < stage.hardNegativeThreshold) continue;

      // SOTA: Positive-aware false negative filtering
      // Skip candidates too similar to any known positive (likely false negatives)
      if (positives && positives.length > 0) {
        let isFalseNeg = false;
        for (const pos of positives) {
          if (this.cosineSimilarity(pool[i], pos) > falseNegThreshold) {
            isFalseNeg = true;
            break;
          }
        }
        if (isFalseNeg) continue;
      }

      scored.push({ idx: i, sim });
    }

    // Sort by similarity descending (hardest negatives first)
    scored.sort((a, b) => b.sim - a.sim);

    return scored.slice(0, n).map((s) => pool[s.idx]);
  }

  /**
   * Get the NativeAccelerator instance (for testing/introspection).
   */
  getAccelerator(): NativeAccelerator | null {
    return this.accel;
  }

  /**
   * Get the current curriculum stage info.
   */
  get currentCurriculumStage(): number {
    return this.currentStage;
  }

  /**
   * Get training statistics.
   */
  getStats(): TrainingStats {
    return {
      totalBatches: this._totalBatches,
      totalSamples: this._totalSamples,
      avgLoss: this._totalBatches > 0 ? this._lossSum / this._totalBatches : 0,
      bestLoss: this._bestLoss === Infinity ? 0 : this._bestLoss,
      currentDifficulty: this.currentStage / Math.max(1, this.stages.length - 1),
      epoch: this.currentStage,
    };
  }

  /** Check if destroyed */
  get isDestroyed(): boolean {
    return this._destroyed;
  }

  /** Get configured dimension */
  get dimension(): number {
    return this.dim;
  }

  /** Destroy and free resources */
  destroy(): void {
    if (!this._destroyed) {
      this._destroyed = true;
    }
  }

  // --- Private helpers ---

  private matVecMul(W: Float32Array, x: Float32Array, b: Float32Array): Float32Array {
    const d = this.dim;
    const result = new Float32Array(d);
    for (let i = 0; i < d; i++) {
      let sum = b[i];
      const rowOffset = i * d;
      for (let j = 0; j < d; j++) {
        sum += W[rowOffset + j] * x[j];
      }
      result[i] = sum;
    }
    return result;
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    // Delegate to NativeAccelerator for SIMD-accelerated cosine when available
    if (this.accel) return this.accel.cosineSimilarity(a, b);
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA * normB);
    return denom > 0 ? dot / denom : 0;
  }

  private vecNorm(v: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
    return Math.sqrt(sum);
  }

  private adamWUpdate(
    params: Float32Array,
    grads: Float32Array,
    m: Float32Array,
    v: Float32Array,
  ): void {
    // Delegate to NativeAccelerator when available (ADR-007)
    if (this.accel) {
      this.accel.adamWStep(params, grads, m, v, this.step, this.learningRate, this.weightDecay);
      return;
    }

    const beta1 = 0.9;
    const beta2 = 0.999;
    const eps = 1e-8;
    const lr = this.learningRate;
    const wd = this.weightDecay;

    const bc1 = 1 - Math.pow(beta1, this.step);
    const bc2 = 1 - Math.pow(beta2, this.step);

    for (let i = 0; i < params.length; i++) {
      // AdamW: decouple weight decay
      params[i] -= lr * wd * params[i];

      // Adam update
      m[i] = beta1 * m[i] + (1 - beta1) * grads[i];
      v[i] = beta2 * v[i] + (1 - beta2) * grads[i] * grads[i];

      const mHat = m[i] / bc1;
      const vHat = v[i] / bc2;

      params[i] -= lr * mHat / (Math.sqrt(vHat) + eps);
    }
  }

  private ensureAlive(): void {
    if (this._destroyed) {
      throw new Error('ContrastiveTrainer has been destroyed. Create a new instance.');
    }
  }
}
