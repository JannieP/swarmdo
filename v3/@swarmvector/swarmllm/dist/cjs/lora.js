"use strict";
/**
 * LoRA (Low-Rank Adaptation) Runtime
 *
 * Efficient parameter-efficient fine-tuning adapters for LLMs.
 * Supports micro-LoRA (fast, small updates) and base-LoRA (deeper adaptation).
 *
 * @example
 * ```typescript
 * import { LoraAdapter, LoraManager } from '@swarmvector/swarmllm';
 *
 * // Create adapter
 * const adapter = new LoraAdapter({
 *   rank: 8,
 *   alpha: 16,
 *   dropout: 0.1,
 *   targetModules: ['query', 'value'],
 * });
 *
 * // Apply to hidden states
 * const output = adapter.forward(hiddenStates);
 *
 * // Manage multiple adapters
 * const manager = new LoraManager();
 * manager.register('task-1', adapter);
 * manager.activate('task-1');
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoraManager = exports.LoraAdapter = void 0;
/**
 * Default LoRA configuration
 */
const DEFAULT_LORA_CONFIG = {
    rank: 8,
    alpha: 16,
    dropout: 0.1,
    targetModules: ['query', 'value'],
};
/**
 * LoRA Adapter
 *
 * Implements low-rank decomposition for parameter-efficient fine-tuning.
 * W' = W + BA where A is (d x r) and B is (r x d), r << d
 *
 * @example
 * ```typescript
 * const adapter = new LoraAdapter({
 *   rank: 8,
 *   alpha: 16,
 *   inputDim: 768,
 *   outputDim: 768,
 * });
 *
 * // Forward pass
 * const output = adapter.forward(input);
 *
 * // Training step
 * adapter.backward(input, gradOutput, 0.001);
 * ```
 */
class LoraAdapter {
    constructor(config, inputDim = 256, outputDim = 256) {
        this.trainingState = null;
        this.frozen = false;
        this.config = { ...DEFAULT_LORA_CONFIG, ...config };
        this.inputDim = inputDim;
        this.outputDim = outputDim;
        // Initialize weights
        this.weights = this.initializeWeights();
    }
    /**
     * Forward pass through LoRA adapter
     * OPTIMIZED: Uses Float64Array and loop unrolling
     *
     * output = input + scaling * (input @ A @ B)
     */
    forward(input) {
        const rank = this.config.rank;
        const dim = Math.min(input.length, this.inputDim);
        const scaling = this.weights.scaling;
        // Apply dropout during training (simplified check)
        const applyDropout = this.trainingState !== null && this.config.dropout > 0;
        // input @ A (d -> r) - use typed array for hidden
        const hidden = new Float64Array(rank);
        for (let r = 0; r < rank; r++) {
            let sum = 0;
            const loraACol = this.weights.loraA;
            // Unroll loop for better performance
            let i = 0;
            if (applyDropout) {
                for (; i < dim; i++) {
                    if (Math.random() > this.config.dropout) {
                        sum += input[i] * loraACol[i][r];
                    }
                }
            }
            else {
                for (; i + 3 < dim; i += 4) {
                    sum += input[i] * loraACol[i][r] +
                        input[i + 1] * loraACol[i + 1][r] +
                        input[i + 2] * loraACol[i + 2][r] +
                        input[i + 3] * loraACol[i + 3][r];
                }
                for (; i < dim; i++) {
                    sum += input[i] * loraACol[i][r];
                }
            }
            hidden[r] = sum;
        }
        // hidden @ B (r -> d) + residual
        const output = new Array(this.outputDim);
        const loraB = this.weights.loraB;
        for (let i = 0; i < this.outputDim; i++) {
            let delta = 0;
            for (let r = 0; r < rank; r++) {
                delta += hidden[r] * loraB[r][i];
            }
            // Add scaled delta to input (residual connection)
            output[i] = (input[i] || 0) + scaling * delta;
        }
        return output;
    }
    /**
     * Forward with batch processing
     */
    forwardBatch(inputs) {
        return inputs.map(input => this.forward(input));
    }
    /**
     * Backward pass and weight update
     */
    backward(input, gradOutput, learningRate) {
        if (this.frozen)
            return 0;
        const rank = this.config.rank;
        const dim = Math.min(input.length, this.inputDim);
        // Compute hidden activations (for gradient)
        const hidden = new Array(rank).fill(0);
        for (let r = 0; r < rank; r++) {
            for (let i = 0; i < dim; i++) {
                hidden[r] += input[i] * this.weights.loraA[i][r];
            }
        }
        // Gradient for B: hidden^T @ gradOutput
        const gradB = Array(rank).fill(null).map(() => Array(this.outputDim).fill(0));
        for (let r = 0; r < rank; r++) {
            for (let i = 0; i < this.outputDim; i++) {
                gradB[r][i] = hidden[r] * (gradOutput[i] || 0) * this.weights.scaling;
            }
        }
        // Gradient for hidden: gradOutput @ B^T
        const gradHidden = new Array(rank).fill(0);
        for (let r = 0; r < rank; r++) {
            for (let i = 0; i < this.outputDim; i++) {
                gradHidden[r] += (gradOutput[i] || 0) * this.weights.loraB[r][i] * this.weights.scaling;
            }
        }
        // Gradient for A: input^T @ gradHidden
        const gradA = Array(dim).fill(null).map(() => Array(rank).fill(0));
        for (let i = 0; i < dim; i++) {
            for (let r = 0; r < rank; r++) {
                gradA[i][r] = input[i] * gradHidden[r];
            }
        }
        // Update weights
        let totalGrad = 0;
        for (let i = 0; i < dim; i++) {
            for (let r = 0; r < rank; r++) {
                this.weights.loraA[i][r] -= learningRate * gradA[i][r];
                totalGrad += Math.abs(gradA[i][r]);
            }
        }
        for (let r = 0; r < rank; r++) {
            for (let i = 0; i < this.outputDim; i++) {
                this.weights.loraB[r][i] -= learningRate * gradB[r][i];
                totalGrad += Math.abs(gradB[r][i]);
            }
        }
        // Track training state
        if (this.trainingState) {
            this.trainingState.step++;
            this.trainingState.lossHistory.push(totalGrad);
        }
        return totalGrad;
    }
    /**
     * Start training mode
     */
    startTraining(learningRate = 0.001) {
        this.trainingState = {
            step: 0,
            learningRate,
            gradA: Array(this.inputDim).fill(null).map(() => Array(this.config.rank).fill(0)),
            gradB: Array(this.config.rank).fill(null).map(() => Array(this.outputDim).fill(0)),
            lossHistory: [],
        };
    }
    /**
     * End training mode
     */
    endTraining() {
        const state = this.trainingState;
        this.trainingState = null;
        return state;
    }
    /**
     * Freeze adapter (no more updates)
     */
    freeze() {
        this.frozen = true;
    }
    /**
     * Unfreeze adapter
     */
    unfreeze() {
        this.frozen = false;
    }
    /**
     * Check if frozen
     */
    isFrozen() {
        return this.frozen;
    }
    /**
     * Get adapter config
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Get adapter weights
     */
    getWeights() {
        return {
            loraA: this.weights.loraA.map(row => [...row]),
            loraB: this.weights.loraB.map(row => [...row]),
            scaling: this.weights.scaling,
        };
    }
    /**
     * Set adapter weights
     */
    setWeights(weights) {
        this.weights = {
            loraA: weights.loraA.map(row => [...row]),
            loraB: weights.loraB.map(row => [...row]),
            scaling: weights.scaling,
        };
    }
    /**
     * Merge adapter into base weights
     *
     * Returns delta to add to base model weights
     */
    merge() {
        const delta = Array(this.inputDim)
            .fill(null)
            .map(() => Array(this.outputDim).fill(0));
        const rank = this.config.rank;
        for (let i = 0; i < this.inputDim; i++) {
            for (let j = 0; j < this.outputDim; j++) {
                for (let r = 0; r < rank; r++) {
                    delta[i][j] += this.weights.loraA[i][r] * this.weights.loraB[r][j];
                }
                delta[i][j] *= this.weights.scaling;
            }
        }
        return delta;
    }
    /**
     * Get number of trainable parameters
     */
    numParameters() {
        return (this.inputDim * this.config.rank) + (this.config.rank * this.outputDim);
    }
    /**
     * Reset to initial weights
     */
    reset() {
        this.weights = this.initializeWeights();
        this.trainingState = null;
        this.frozen = false;
    }
    /**
     * Clone adapter
     */
    clone() {
        const adapter = new LoraAdapter(this.config, this.inputDim, this.outputDim);
        adapter.setWeights(this.getWeights());
        return adapter;
    }
    /**
     * Serialize to JSON
     */
    toJSON() {
        return JSON.stringify({
            config: this.config,
            inputDim: this.inputDim,
            outputDim: this.outputDim,
            weights: this.weights,
            frozen: this.frozen,
        });
    }
    /**
     * Deserialize from JSON
     */
    static fromJSON(json) {
        const data = JSON.parse(json);
        const adapter = new LoraAdapter(data.config, data.inputDim, data.outputDim);
        adapter.setWeights(data.weights);
        if (data.frozen)
            adapter.freeze();
        return adapter;
    }
    initializeWeights() {
        const rank = this.config.rank;
        // Kaiming initialization for A, zero initialization for B
        const loraA = Array(this.inputDim)
            .fill(null)
            .map(() => Array(rank)
            .fill(0)
            .map(() => (Math.random() - 0.5) * Math.sqrt(2 / this.inputDim)));
        const loraB = Array(rank)
            .fill(null)
            .map(() => Array(this.outputDim).fill(0));
        return {
            loraA,
            loraB,
            scaling: this.config.alpha / this.config.rank,
        };
    }
}
exports.LoraAdapter = LoraAdapter;
/**
 * LoRA Manager for multiple adapters
 *
 * Manages a collection of LoRA adapters for different tasks/domains.
 */
class LoraManager {
    constructor(defaultConfig) {
        this.adapters = new Map();
        this.activeAdapterId = null;
        this.defaultConfig = { ...DEFAULT_LORA_CONFIG, ...defaultConfig };
    }
    /**
     * Register a new adapter
     */
    register(id, adapter) {
        this.adapters.set(id, adapter);
    }
    /**
     * Create and register a new adapter
     */
    create(id, config, inputDim, outputDim) {
        const mergedConfig = { ...this.defaultConfig, ...config };
        const adapter = new LoraAdapter(mergedConfig, inputDim, outputDim);
        this.register(id, adapter);
        return adapter;
    }
    /**
     * Get adapter by ID
     */
    get(id) {
        return this.adapters.get(id);
    }
    /**
     * Remove adapter
     */
    remove(id) {
        if (this.activeAdapterId === id) {
            this.activeAdapterId = null;
        }
        return this.adapters.delete(id);
    }
    /**
     * Activate an adapter
     */
    activate(id) {
        if (this.adapters.has(id)) {
            this.activeAdapterId = id;
            return true;
        }
        return false;
    }
    /**
     * Deactivate current adapter
     */
    deactivate() {
        this.activeAdapterId = null;
    }
    /**
     * Get active adapter
     */
    getActive() {
        return this.activeAdapterId ? this.adapters.get(this.activeAdapterId) || null : null;
    }
    /**
     * Get active adapter ID
     */
    getActiveId() {
        return this.activeAdapterId;
    }
    /**
     * Apply active adapter
     */
    forward(input) {
        const active = this.getActive();
        return active ? active.forward(input) : [...input];
    }
    /**
     * List all adapter IDs
     */
    list() {
        return Array.from(this.adapters.keys());
    }
    /**
     * Get adapter count
     */
    count() {
        return this.adapters.size;
    }
    /**
     * Freeze all adapters
     */
    freezeAll() {
        for (const adapter of this.adapters.values()) {
            adapter.freeze();
        }
    }
    /**
     * Unfreeze all adapters
     */
    unfreezeAll() {
        for (const adapter of this.adapters.values()) {
            adapter.unfreeze();
        }
    }
    /**
     * Merge multiple adapters into one
     */
    mergeAdapters(ids, outputId) {
        const adapters = ids.map(id => this.adapters.get(id)).filter(Boolean);
        if (adapters.length === 0)
            return null;
        // Use first adapter as base
        const merged = adapters[0].clone();
        const weights = merged.getWeights();
        // Average weights from other adapters
        for (let i = 1; i < adapters.length; i++) {
            const otherWeights = adapters[i].getWeights();
            for (let row = 0; row < weights.loraA.length && row < otherWeights.loraA.length; row++) {
                for (let col = 0; col < weights.loraA[row].length && col < otherWeights.loraA[row].length; col++) {
                    weights.loraA[row][col] = (weights.loraA[row][col] + otherWeights.loraA[row][col]) / 2;
                }
            }
            for (let row = 0; row < weights.loraB.length && row < otherWeights.loraB.length; row++) {
                for (let col = 0; col < weights.loraB[row].length && col < otherWeights.loraB[row].length; col++) {
                    weights.loraB[row][col] = (weights.loraB[row][col] + otherWeights.loraB[row][col]) / 2;
                }
            }
        }
        merged.setWeights(weights);
        this.register(outputId, merged);
        return merged;
    }
    /**
     * Get statistics
     */
    stats() {
        let totalParams = 0;
        let frozenCount = 0;
        for (const adapter of this.adapters.values()) {
            totalParams += adapter.numParameters();
            if (adapter.isFrozen())
                frozenCount++;
        }
        return {
            totalAdapters: this.adapters.size,
            activeAdapter: this.activeAdapterId,
            totalParameters: totalParams,
            frozenCount,
        };
    }
    /**
     * Clear all adapters
     */
    clear() {
        this.adapters.clear();
        this.activeAdapterId = null;
    }
}
exports.LoraManager = LoraManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9yYS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9sb3JhLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0EwQkc7OztBQUlIOztHQUVHO0FBQ0gsTUFBTSxtQkFBbUIsR0FBeUI7SUFDaEQsSUFBSSxFQUFFLENBQUM7SUFDUCxLQUFLLEVBQUUsRUFBRTtJQUNULE9BQU8sRUFBRSxHQUFHO0lBQ1osYUFBYSxFQUFFLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQztDQUNsQyxDQUFDO0FBOEJGOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FxQkc7QUFDSCxNQUFhLFdBQVc7SUFRdEIsWUFBWSxNQUE0QixFQUFFLFFBQVEsR0FBRyxHQUFHLEVBQUUsU0FBUyxHQUFHLEdBQUc7UUFIakUsa0JBQWEsR0FBNkIsSUFBSSxDQUFDO1FBQy9DLFdBQU0sR0FBWSxLQUFLLENBQUM7UUFHOUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxFQUFFLEdBQUcsbUJBQW1CLEVBQUUsR0FBRyxNQUFNLEVBQUUsQ0FBQztRQUNwRCxJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztRQUN6QixJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUUzQixxQkFBcUI7UUFDckIsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztJQUMxQyxDQUFDO0lBRUQ7Ozs7O09BS0c7SUFDSCxPQUFPLENBQUMsS0FBZTtRQUNyQixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztRQUM5QixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2xELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDO1FBRXJDLG1EQUFtRDtRQUNu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SUFFRDs7T0FFRztJQUNILEtBQUs7UUFNSCxJQUFJLFdBQVcsR0FBRyxDQUFDLENBQUM7UUFDcEIsSUFBSSxXQUFXLEdBQUcsQ0FBQyxDQUFDO1FBRXBCLEtBQUssTUFBTSxPQUFPLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDO1lBQzdDLFdBQVcsSUFBSSxPQUFPLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDdkMsSUFBSSxPQUFPLENBQUMsUUFBUSxFQUFFO2dCQUFFLFdBQVcsRUFBRSxDQUFDO1FBQ3hDLENBQUM7UUFFRCxPQUFPO1lBQ0wsYUFBYSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSTtZQUNqQyxhQUFhLEVBQUUsSUFBSSxDQUFDLGVBQWU7WUFDbkMsZUFBZSxFQUFFLFdBQVc7WUFDNUIsV0FBVztTQUNaLENBQUM7SUFDSixDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLO1FBQ0gsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUN0QixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztJQUM5QixDQUFDO0NBQ0Y7QUFuTEQsa0NBbUxDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBMb1JBIChMb3ctUmFuayBBZGFwdGF0aW9uKSBSdW50aW1lXG4gKlxuICogRWZmaWNpZW50IHBhcmFtZXRlci1lZmZpY2llbnQgZmluZS10dW5pbmcgYWRhcHRlcnMgZm9yIExMTXMuXG4gKiBTdXBwb3J0cyBtaWNyby1Mb1JBIChmYXN0LCBzbWFsbCB1cGRhdGVzKSBhbmQgYmFzZS1Mb1JBIChkZWVwZXIgYWRhcHRhdGlvbikuXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGltcG9ydCB7IExvcmFBZGFwdGVyLCBMb3JhTWFuYWdlciB9IGZyb20gJ0BydWZ2ZWN0b3IvcnVmbGxtJztcbiAqXG4gKiAvLyBDcmVhdGUgYWRhcHRlclxuICogY29uc3QgYWRhcHRlciA9IG5ldyBMb3JhQWRhcHRlcih7XG4gKiAgIHJhbms6IDgsXG4gKiAgIGFscGhhOiAxNixcbiAqICAgZHJvcG91dDogMC4xLFxuICogICB0YXJnZXRNb2R1bGVzOiBbJ3F1ZXJ5JywgJ3ZhbHVlJ10sXG4gKiB9KTtcbiAqXG4gKiAvLyBBcHBseSB0byBoaWRkZW4gc3RhdGVzXG4gKiBjb25zdCBvdXRwdXQgPSBhZGFwdGVyLmZvcndhcmQoaGlkZGVuU3RhdGVzKTtcbiAqXG4gKiAvLyBNYW5hZ2UgbXVsdGlwbGUgYWRhcHRlcnNcbiAqIGNvbnN0IG1hbmFnZXIgPSBuZXcgTG9yYU1hbmFnZXIoKTtcbiAqIG1hbmFnZXIucmVnaXN0ZXIoJ3Rhc2stMScsIGFkYXB0ZXIpO1xuICogbWFuYWdlci5hY3RpdmF0ZSgndGFzay0xJyk7XG4gKiBgYGBcbiAqL1xuXG5pbXBvcnQgeyBMb1JBQ29uZmlnLCBFbWJlZGRpbmcgfSBmcm9tICcuL3R5cGVzJztcblxuLyoqXG4gKiBEZWZhdWx0IExvUkEgY29uZmlndXJhdGlvblxuICovXG5jb25zdCBERUZBVUxUX0xPUkFfQ09ORklHOiBSZXF1aXJlZDxMb1JBQ29uZmlnPiA9IHtcbiAgcmFuazogOCxcbiAgYWxwaGE6IDE2LFxuICBkcm9wb3V0OiAwLjEsXG4gIHRhcmdldE1vZHVsZXM6IFsncXVlcnknLCAndmFsdWUnXSxcbn07XG5cbi8qKlxuICogTG9SQSBhZGFwdGVyIHdlaWdodHNcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBMb3JhV2VpZ2h0cyB7XG4gIC8qKiBEb3duIHByb2plY3Rpb24gbWF0cml4IChkIHggcikgKi9cbiAgbG9yYUE6IG51bWJlcltdW107XG4gIC8qKiBVcCBwcm9qZWN0aW9uIG1hdHJpeCAociB4IGQpICovXG4gIGxvcmFCOiBudW1iZXJbXVtdO1xuICAvKiogU2NhbGluZyBmYWN0b3IgKi9cbiAgc2NhbGluZzogbnVtYmVyO1xufVxuXG4vKipcbiAqIExvUkEgdHJhaW5pbmcgc3RhdGVcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBMb3JhVHJhaW5pbmdTdGF0ZSB7XG4gIC8qKiBDdXJyZW50IHN0ZXAgKi9cbiAgc3RlcDogbnVtYmVyO1xuICAvKiogTGVhcm5pbmcgcmF0ZSAqL1xuICBsZWFybmluZ1JhdGU6IG51bWJlcjtcbiAgLyoqIEFjY3VtdWxhdGVkIGdyYWRpZW50cyBmb3IgQSAqL1xuICBncmFkQTogbnVtYmVyW11bXTtcbiAgLyoqIEFjY3VtdWxhdGVkIGdyYWRpZW50cyBmb3IgQiAqL1xuICBncmFkQjogbnVtYmVyW11bXTtcbiAgLyoqIExvc3MgaGlzdG9yeSAqL1xuICBsb3NzSGlzdG9yeTogbnVtYmVyW107XG59XG5cbi8qKlxuICogTG9SQSBBZGFwdGVyXG4gKlxuICogSW1wbGVtZW50cyBsb3ctcmFuayBkZWNvbXBvc2l0aW9uIGZvciBwYXJhbWV0ZXItZWZmaWNpZW50IGZpbmUtdHVuaW5nLlxuICogVycgPSBXICsgQkEgd2hlcmUgQSBpcyAoZCB4IHIpIGFuZCBCIGlzIChyIHggZCksIHIgPDwgZFxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBjb25zdCBhZGFwdGVyID0gbmV3IExvcmFBZGFwdGVyKHtcbiAqICAgcmFuazogOCxcbiAqICAgYWxwaGE6IDE2LFxuICogICBpbnB1dERpbTogNzY4LFxuICogICBvdXRwdXREaW06IDc2OCxcbiAqIH0pO1xuICpcbiAqIC8vIEZvcndhcmQgcGFzc1xuICogY29uc3Qgb3V0cHV0ID0gYWRhcHRlci5mb3J3YXJkKGlucHV0KTtcbiAqXG4gKiAvLyBUcmFpbmluZyBzdGVwXG4gKiBhZGFwdGVyLmJhY2t3YXJkKGlucHV0LCBncmFkT3V0cHV0LCAwLjAwMSk7XG4gKiBgYGBcbiAqL1xuZXhwb3J0IGNsYXNzIExvcmFBZGFwdGVyIHtcbiAgcHJpdmF0ZSBjb25maWc6IFJlcXVpcmVkPExvUkFDb25maWc+O1xuICBwcml2YXRlIGlucHV0RGltOiBudW1iZXI7XG4gIHByaXZhdGUgb3V0cHV0RGltOiBudW1iZXI7XG4gIHByaXZhdGUgd2VpZ2h0czogTG9yYVdlaWdodHM7XG4gIHByaXZhdGUgdHJhaW5pbmdTdGF0ZTogTG9yYVRyYWluaW5nU3RhdGUgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBmcm96ZW46IGJvb2xlYW4gPSBmYWxzZTtcblxuICBjb25zdHJ1Y3Rvcihjb25maWc/OiBQYXJ0aWFsPExvUkFDb25maWc+LCBpbnB1dERpbSA9IDI1Niwgb3V0cHV0RGltID0gMjU2KSB7XG4gICAgdGhpcy5jb25maWcgPSB7IC4uLkRFRkFVTFRfTE9SQV9DT05GSUcsIC4uLmNvbmZpZyB9O1xuICAgIHRoaXMuaW5wdXREaW0gPSBpbnB1dERpbTtcbiAgICB0aGlzLm91dHB1dERpbSA9IG91dHB1dERpbTtcblxuICAgIC8vIEluaXRpYWxpemUgd2VpZ2h0c1xuICAgIHRoaXMud2VpZ2h0cyA9IHRoaXMuaW5pdGlhbGl6ZVdlaWdodHMoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBGb3J3YXJkIHBhc3MgdGhyb3VnaCBMb1JBIGFkYXB0ZXJcbiAgICogT1BUSU1JWkVEOiBVc2VzIEZsb2F0NjRBcnJheSBhbmQgbG9vcCB1bnJvbGxpbmdcbiAgICpcbiAgICogb3V0cHV0ID0gaW5wdXQgKyBzY2FsaW5nICogKGlucHV0IEAgQSBAIEIpXG4gICAqL1xuICBmb3J3YXJkKGlucHV0OiBudW1iZXJbXSk6IG51bWJlcltdIHtcbiAgICBjb25zdCByYW5rID0gdGhpcy5jb25maWcucmFuaztcbiAgICBjb25zdCBkaW0gPSBNYXRoLm1pbihpbnB1dC5sZW5ndGgsIHRoaXMuaW5wdXREaW0pO1xuICAgIGNvbnN0IHNjYWxpbmcgPSB0aGlzLndlaWdodHMuc2NhbGluZztcblxuICAgIC8vIEFwcGx5IGRyb3BvdXQgZHVyaW5nIHRyYWluaW5nIChzaW1wbGlmaWVkIGNoZWNrKVxuICAgIGNvbnN0IGFwcGx5RHJvcG91dCA9IHRoaXMudHJhaW5pbmdTdGF0ZSAhPT0gbnVsbCAmJiB0aGlzLmNvbmZpZy5kcm9wb3V0ID4gMDtcblxuICAgIC8vIGlucHV0IEAgQSAoZCAtPiByKSAtIHVzZSB0eXBlZCBhcnJheSBmb3IgaGlkZGVuXG4gICAgY29uc3QgaGlkZGVuID0gbmV3IEZsb2F0NjRBcnJheShyYW5rKTtcbiAgICBmb3IgKGxldCByID0gMDsgciA8IHJhbms7IHIrKykge1xuICAgICAgbGV0IHN1bSA9IDA7XG4gICAgICBjb25zdCBsb3JhQUNvbCA9IHRoaXMud2VpZ2h0cy5sb3JhQTtcbiAgICAgIC8vIFVucm9sbCBsb29wIGZvciBiZXR0ZXIgcGVyZm9ybWFuY2VcbiAgICAgIGxldCBpID0gMDtcbiAgICAgIGlmIChhcHBseURyb3BvdXQpIHtcbiAgICAgICAgZm9yICg7IGkgPCBkaW07IGkrKykge1xuICAgICAgICAgIGlmIChNYXRoLnJhbmRvbSgpID4gdGhpcy5jb25maWcuZHJvcG91dCkge1xuICAgICAgICAgICAgc3VtICs9IGlucHV0W2ldICogbG9yYUFDb2xbaV1bcl07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb3IgKDsgaSArIDMgPCBkaW07IGkgKz0gNCkge1xuICAgICAgICAgIHN1bSArPSBpbnB1dFtpXSAqIGxvcmFBQ29sW2ldW3JdICtcbiAgICAgICAgICAgICAgICAgaW5wdXRbaSArIDFdICogbG9yYUFDb2xbaSArIDFdW3JdICtcbiAgICAgICAgICAgICAgICAgaW5wdXRbaSArIDJdICogbG9yYUFDb2xbaSArIDJdW3JdICtcbiAgICAgICAgICAgICAgICAgaW5wdXRbaSArIDNdICogbG9yYUFDb2xbaSArIDNdW3JdO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoOyBpIDwgZGltOyBpKyspIHtcbiAgICAgICAgICBzdW0gKz0gaW5wdXRbaV0gKiBsb3JhQUNvbFtpXVtyXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaGlkZGVuW3JdID0gc3VtO1xuICAgIH1cblxuICAgIC8vIGhpZGRlbiBAIEIgKHIgLT4gZCkgKyByZXNpZHVhbFxuICAgIGNvbnN0IG91dHB1dCA9IG5ldyBBcnJheSh0aGlzLm91dHB1dERpbSk7XG4gICAgY29uc3QgbG9yYUIgPSB0aGlzLndlaWdodHMubG9yYUI7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLm91dHB1dERpbTsgaSsrKSB7XG4gICAgICBsZXQgZGVsdGEgPSAwO1xuICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCByYW5rOyByKyspIHtcbiAgICAgICAgZGVsdGEgKz0gaGlkZGVuW3JdICogbG9yYUJbcl1baV07XG4gICAgICB9XG4gICAgICAvLyBBZGQgc2NhbGVkIGRlbHRhIHRvIGlucHV0IChyZXNpZHVhbCBjb25uZWN0aW9uKVxuICAgICAgb3V0cHV0W2ldID0gKGlucHV0W2ldIHx8IDApICsgc2NhbGluZyAqIGRlbHRhO1xuICAgIH1cblxuICAgIHJldHVybiBvdXRwdXQ7XG4gIH1cblxuICAvKipcbiAgICogRm9yd2FyZCB3aXRoIGJhdGNoIHByb2Nlc3NpbmdcbiAgICovXG4gIGZvcndhcmRCYXRjaChpbnB1dHM6IG51bWJlcltdW10pOiBudW1iZXJbXVtdIHtcbiAgICByZXR1cm4gaW5wdXRzLm1hcChpbnB1dCA9PiB0aGlzLmZvcndhcmQoaW5wdXQpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBCYWNrd2FyZCBwYXNzIGFuZCB3ZWlnaHQgdXBkYXRlXG4gICAqL1xuICBiYWNrd2FyZChpbnB1dDogbnVtYmVyW10sIGdyYWRPdXRwdXQ6IG51bWJlcltdLCBsZWFybmluZ1JhdGU6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKHRoaXMuZnJvemVuKSByZXR1cm4gMDtcblxuICAgIGNvbnN0IHJhbmsgPSB0aGlzLmNvbmZpZy5yYW5rO1xuICAgIGNvbnN0IGRpbSA9IE1hdGgubWluKGlucHV0Lmxlbmd0aCwgdGhpcy5pbnB1dERpbSk7XG5cbiAgICAvLyBDb21wdXRlIGhpZGRlbiBhY3RpdmF0aW9ucyAoZm9yIGdyYWRpZW50KVxuICAgIGNvbnN0IGhpZGRlbiA9IG5ldyBBcnJheShyYW5rKS5maWxsKDApO1xuICAgIGZvciAobGV0IHIgPSAwOyByIDwgcmFuazsgcisrKSB7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRpbTsgaSsrKSB7XG4gICAgICAgIGhpZGRlbltyXSArPSBpbnB1dFtpXSAqIHRoaXMud2VpZ2h0cy5sb3JhQVtpXVtyXTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBHcmFkaWVudCBmb3IgQjogaGlkZGVuXlQgQCBncmFkT3V0cHV0XG4gICAgY29uc3QgZ3JhZEI6IG51bWJlcltdW10gPSBBcnJheShyYW5rKS5maWxsKG51bGwpLm1hcCgoKSA9PiBBcnJheSh0aGlzLm91dHB1dERpbSkuZmlsbCgwKSk7XG4gICAgZm9yIChsZXQgciA9IDA7IHIgPCByYW5rOyByKyspIHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5vdXRwdXREaW07IGkrKykge1xuICAgICAgICBncmFkQltyXVtpXSA9IGhpZGRlbltyXSAqIChncmFkT3V0cHV0W2ldIHx8IDApICogdGhpcy53ZWlnaHRzLnNjYWxpbmc7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gR3JhZGllbnQgZm9yIGhpZGRlbjogZ3JhZE91dHB1dCBAIEJeVFxuICAgIGNvbnN0IGdyYWRIaWRkZW4gPSBuZXcgQXJyYXkocmFuaykuZmlsbCgwKTtcbiAgICBmb3IgKGxldCByID0gMDsgciA8IHJhbms7IHIrKykge1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLm91dHB1dERpbTsgaSsrKSB7XG4gICAgICAgIGdyYWRIaWRkZW5bcl0gKz0gKGdyYWRPdXRwdXRbaV0gfHwgMCkgKiB0aGlzLndlaWdodHMubG9yYUJbcl1baV0gKiB0aGlzLndlaWdodHMuc2NhbGluZztcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBHcmFkaWVudCBmb3IgQTogaW5wdXReVCBAIGdyYWRIaWRkZW5cbiAgICBjb25zdCBncmFkQTogbnVtYmVyW11bXSA9IEFycmF5KGRpbSkuZmlsbChudWxsKS5tYXAoKCkgPT4gQXJyYXkocmFuaykuZmlsbCgwKSk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBkaW07IGkrKykge1xuICAgICAgZm9yIChsZXQgciA9IDA7IHIgPCByYW5rOyByKyspIHtcbiAgICAgICAgZ3JhZEFbaV1bcl0gPSBpbnB1dFtpXSAqIGdyYWRIaWRkZW5bcl07XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIHdlaWdodHNcbiAgICBsZXQgdG90YWxHcmFkID0gMDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRpbTsgaSsrKSB7XG4gICAgICBmb3IgKGxldCByID0gMDsgciA8IHJhbms7IHIrKykge1xuICAgICAgICB0aGlzLndlaWdodHMubG9yYUFbaV1bcl0gLT0gbGVhcm5pbmdSYXRlICogZ3JhZEFbaV1bcl07XG4gICAgICAgIHRvdGFsR3JhZCArPSBNYXRoLmFicyhncmFkQVtpXVtyXSk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAobGV0IHIgPSAwOyByIDwgcmFuazsgcisrKSB7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMub3V0cHV0RGltOyBpKyspIHtcbiAgICAgICAgdGhpcy53ZWlnaHRzLmxvcmFCW3JdW2ldIC09IGxlYXJuaW5nUmF0ZSAqIGdyYWRCW3JdW2ldO1xuICAgICAgICB0b3RhbEdyYWQgKz0gTWF0aC5hYnMoZ3JhZEJbcl1baV0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFRyYWNrIHRyYWluaW5nIHN0YXRlXG4gICAgaWYgKHRoaXMudHJhaW5pbmdTdGF0ZSkge1xuICAgICAgdGhpcy50cmFpbmluZ1N0YXRlLnN0ZXArKztcbiAgICAgIHRoaXMudHJhaW5pbmdTdGF0ZS5sb3NzSGlzdG9yeS5wdXNoKHRvdGFsR3JhZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRvdGFsR3JhZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydCB0cmFpbmluZyBtb2RlXG4gICAqL1xuICBzdGFydFRyYWluaW5nKGxlYXJuaW5nUmF0ZSA9IDAuMDAxKTogdm9pZCB7XG4gICAgdGhpcy50cmFpbmluZ1N0YXRlID0ge1xuICAgICAgc3RlcDogMCxcbiAgICAgIGxlYXJuaW5nUmF0ZSxcbiAgICAgIGdyYWRBOiBBcnJheSh0aGlzLmlucHV0RGltKS5maWxsKG51bGwpLm1hcCgoKSA9PiBBcnJheSh0aGlzLmNvbmZpZy5yYW5rKS5maWxsKDApKSxcbiAgICAgIGdyYWRCOiBBcnJheSh0aGlzLmNvbmZpZy5yYW5rKS5maWxsKG51bGwpLm1hcCgoKSA9PiBBcnJheSh0aGlzLm91dHB1dERpbSkuZmlsbCgwKSksXG4gICAgICBsb3NzSGlzdG9yeTogW10sXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFbmQgdHJhaW5pbmcgbW9kZVxuICAgKi9cbiAgZW5kVHJhaW5pbmcoKTogTG9yYVRyYWluaW5nU3RhdGUgfCBudWxsIHtcbiAgICBjb25zdCBzdGF0ZSA9IHRoaXMudHJhaW5pbmdTdGF0ZTtcbiAgICB0aGlzLnRyYWluaW5nU3RhdGUgPSBudWxsO1xuICAgIHJldHVybiBzdGF0ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBGcmVlemUgYWRhcHRlciAobm8gbW9yZSB1cGRhdGVzKVxuICAgKi9cbiAgZnJlZXplKCk6IHZvaWQge1xuICAgIHRoaXMuZnJvemVuID0gdHJ1ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBVbmZyZWV6ZSBhZGFwdGVyXG4gICAqL1xuICB1bmZyZWV6ZSgpOiB2b2lkIHtcbiAgICB0aGlzLmZyb3plbiA9IGZhbHNlO1xuICB9XG5cbiAgLyoqXG4gICAqIENoZWNrIGlmIGZyb3plblxuICAgKi9cbiAgaXNGcm96ZW4oKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuZnJvemVuO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhZGFwdGVyIGNvbmZpZ1xuICAgKi9cbiAgZ2V0Q29uZmlnKCk6IFJlcXVpcmVkPExvUkFDb25maWc+IHtcbiAgICByZXR1cm4geyAuLi50aGlzLmNvbmZpZyB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhZGFwdGVyIHdlaWdodHNcbiAgICovXG4gIGdldFdlaWdodHMoKTogTG9yYVdlaWdodHMge1xuICAgIHJldHVybiB7XG4gICAgICBsb3JhQTogdGhpcy53ZWlnaHRzLmxvcmFBLm1hcChyb3cgPT4gWy4uLnJvd10pLFxuICAgICAgbG9yYUI6IHRoaXMud2VpZ2h0cy5sb3JhQi5tYXAocm93ID0+IFsuLi5yb3ddKSxcbiAgICAgIHNjYWxpbmc6IHRoaXMud2VpZ2h0cy5zY2FsaW5nLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogU2V0IGFkYXB0ZXIgd2VpZ2h0c1xuICAgKi9cbiAgc2V0V2VpZ2h0cyh3ZWlnaHRzOiBMb3JhV2VpZ2h0cyk6IHZvaWQge1xuICAgIHRoaXMud2VpZ2h0cyA9IHtcbiAgICAgIGxvcmFBOiB3ZWlnaHRzLmxvcmFBLm1hcChyb3cgPT4gWy4uLnJvd10pLFxuICAgICAgbG9yYUI6IHdlaWdodHMubG9yYUIubWFwKHJvdyA9PiBbLi4ucm93XSksXG4gICAgICBzY2FsaW5nOiB3ZWlnaHRzLnNjYWxpbmcsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBNZXJnZSBhZGFwdGVyIGludG8gYmFzZSB3ZWlnaHRzXG4gICAqXG4gICAqIFJldHVybnMgZGVsdGEgdG8gYWRkIHRvIGJhc2UgbW9kZWwgd2VpZ2h0c1xuICAgKi9cbiAgbWVyZ2UoKTogbnVtYmVyW11bXSB7XG4gICAgY29uc3QgZGVsdGE6IG51bWJlcltdW10gPSBBcnJheSh0aGlzLmlucHV0RGltKVxuICAgICAgLmZpbGwobnVsbClcbiAgICAgIC5tYXAoKCkgPT4gQXJyYXkodGhpcy5vdXRwdXREaW0pLmZpbGwoMCkpO1xuXG4gICAgY29uc3QgcmFuayA9IHRoaXMuY29uZmlnLnJhbms7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmlucHV0RGltOyBpKyspIHtcbiAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgdGhpcy5vdXRwdXREaW07IGorKykge1xuICAgICAgICBmb3IgKGxldCByID0gMDsgciA8IHJhbms7IHIrKykge1xuICAgICAgICAgIGRlbHRhW2ldW2pdICs9IHRoaXMud2VpZ2h0cy5sb3JhQVtpXVtyXSAqIHRoaXMud2VpZ2h0cy5sb3JhQltyXVtqXTtcbiAgICAgICAgfVxuICAgICAgICBkZWx0YVtpXVtqXSAqPSB0aGlzLndlaWdodHMuc2NhbGluZztcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZGVsdGE7XG4gIH1cblxuICAvKipcbiAgICogR2V0IG51bWJlciBvZiB0cmFpbmFibGUgcGFyYW1ldGVyc1xuICAgKi9cbiAgbnVtUGFyYW1ldGVycygpOiBudW1iZXIge1xuICAgIHJldHVybiAodGhpcy5pbnB1dERpbSAqIHRoaXMuY29uZmlnLnJhbmspICsgKHRoaXMuY29uZmlnLnJhbmsgKiB0aGlzLm91dHB1dERpbSk7XG4gIH1cblxuICAvKipcbiAgICogUmVzZXQgdG8gaW5pdGlhbCB3ZWlnaHRzXG4gICAqL1xuICByZXNldCgpOiB2b2lkIHtcbiAgICB0aGlzLndlaWdodHMgPSB0aGlzLmluaXRpYWxpemVXZWlnaHRzKCk7XG4gICAgdGhpcy50cmFpbmluZ1N0YXRlID0gbnVsbDtcbiAgICB0aGlzLmZyb3plbiA9IGZhbHNlO1xuICB9XG5cbiAgLyoqXG4gICAqIENsb25lIGFkYXB0ZXJcbiAgICovXG4gIGNsb25lKCk6IExvcmFBZGFwdGVyIHtcbiAgICBjb25zdCBhZGFwdGVyID0gbmV3IExvcmFBZGFwdGVyKHRoaXMuY29uZmlnLCB0aGlzLmlucHV0RGltLCB0aGlzLm91dHB1dERpbSk7XG4gICAgYWRhcHRlci5zZXRXZWlnaHRzKHRoaXMuZ2V0V2VpZ2h0cygpKTtcbiAgICByZXR1cm4gYWRhcHRlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXJpYWxpemUgdG8gSlNPTlxuICAgKi9cbiAgdG9KU09OKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgICBpbnB1dERpbTogdGhpcy5pbnB1dERpbSxcbiAgICAgIG91dHB1dERpbTogdGhpcy5vdXRwdXREaW0sXG4gICAgICB3ZWlnaHRzOiB0aGlzLndlaWdodHMsXG4gICAgICBmcm96ZW46IHRoaXMuZnJvemVuLFxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIERlc2VyaWFsaXplIGZyb20gSlNPTlxuICAgKi9cbiAgc3RhdGljIGZyb21KU09OKGpzb246IHN0cmluZyk6IExvcmFBZGFwdGVyIHtcbiAgICBjb25zdCBkYXRhID0gSlNPTi5wYXJzZShqc29uKTtcbiAgICBjb25zdCBhZGFwdGVyID0gbmV3IExvcmFBZGFwdGVyKGRhdGEuY29uZmlnLCBkYXRhLmlucHV0RGltLCBkYXRhLm91dHB1dERpbSk7XG4gICAgYWRhcHRlci5zZXRXZWlnaHRzKGRhdGEud2VpZ2h0cyk7XG4gICAgaWYgKGRhdGEuZnJvemVuKSBhZGFwdGVyLmZyZWV6ZSgpO1xuICAgIHJldHVybiBhZGFwdGVyO1xuICB9XG5cbiAgcHJpdmF0ZSBpbml0aWFsaXplV2VpZ2h0cygpOiBMb3JhV2VpZ2h0cyB7XG4gICAgY29uc3QgcmFuayA9IHRoaXMuY29uZmlnLnJhbms7XG5cbiAgICAvLyBLYWltaW5nIGluaXRpYWxpemF0aW9uIGZvciBBLCB6ZXJvIGluaXRpYWxpemF0aW9uIGZvciBCXG4gICAgY29uc3QgbG9yYUE6IG51bWJlcltdW10gPSBBcnJheSh0aGlzLmlucHV0RGltKVxuICAgICAgLmZpbGwobnVsbClcbiAgICAgIC5tYXAoKCkgPT5cbiAgICAgICAgQXJyYXkocmFuaylcbiAgICAgICAgICAuZmlsbCgwKVxuICAgICAgICAgIC5tYXAoKCkgPT4gKE1hdGgucmFuZG9tKCkgLSAwLjUpICogTWF0aC5zcXJ0KDIgLyB0aGlzLmlucHV0RGltKSlcbiAgICAgICk7XG5cbiAgICBjb25zdCBsb3JhQjogbnVtYmVyW11bXSA9IEFycmF5KHJhbmspXG4gICAgICAuZmlsbChudWxsKVxuICAgICAgLm1hcCgoKSA9PiBBcnJheSh0aGlzLm91dHB1dERpbSkuZmlsbCgwKSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgbG9yYUEsXG4gICAgICBsb3JhQixcbiAgICAgIHNjYWxpbmc6IHRoaXMuY29uZmlnLmFscGhhIC8gdGhpcy5jb25maWcucmFuayxcbiAgICB9O1xuICB9XG59XG5cbi8qKlxuICogTG9SQSBNYW5hZ2VyIGZvciBtdWx0aXBsZSBhZGFwdGVyc1xuICpcbiAqIE1hbmFnZXMgYSBjb2xsZWN0aW9uIG9mIExvUkEgYWRhcHRlcnMgZm9yIGRpZmZlcmVudCB0YXNrcy9kb21haW5zLlxuICovXG5leHBvcnQgY2xhc3MgTG9yYU1hbmFnZXIge1xuICBwcml2YXRlIGFkYXB0ZXJzOiBNYXA8c3RyaW5nLCBMb3JhQWRhcHRlcj4gPSBuZXcgTWFwKCk7XG4gIHByaXZhdGUgYWN0aXZlQWRhcHRlcklkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBkZWZhdWx0Q29uZmlnOiBSZXF1aXJlZDxMb1JBQ29uZmlnPjtcblxuICBjb25zdHJ1Y3RvcihkZWZhdWx0Q29uZmlnPzogUGFydGlhbDxMb1JBQ29uZmlnPikge1xuICAgIHRoaXMuZGVmYXVsdENvbmZpZyA9IHsgLi4uREVGQVVMVF9MT1JBX0NPTkZJRywgLi4uZGVmYXVsdENvbmZpZyB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFJlZ2lzdGVyIGEgbmV3IGFkYXB0ZXJcbiAgICovXG4gIHJlZ2lzdGVyKGlkOiBzdHJpbmcsIGFkYXB0ZXI6IExvcmFBZGFwdGVyKTogdm9pZCB7XG4gICAgdGhpcy5hZGFwdGVycy5zZXQoaWQsIGFkYXB0ZXIpO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhbmQgcmVnaXN0ZXIgYSBuZXcgYWRhcHRlclxuICAgKi9cbiAgY3JlYXRlKGlkOiBzdHJpbmcsIGNvbmZpZz86IFBhcnRpYWw8TG9SQUNvbmZpZz4sIGlucHV0RGltPzogbnVtYmVyLCBvdXRwdXREaW0/OiBudW1iZXIpOiBMb3JhQWRhcHRlciB7XG4gICAgY29uc3QgbWVyZ2VkQ29uZmlnID0geyAuLi50aGlzLmRlZmF1bHRDb25maWcsIC4uLmNvbmZpZyB9O1xuICAgIGNvbnN0IGFkYXB0ZXIgPSBuZXcgTG9yYUFkYXB0ZXIobWVyZ2VkQ29uZmlnLCBpbnB1dERpbSwgb3V0cHV0RGltKTtcbiAgICB0aGlzLnJlZ2lzdGVyKGlkLCBhZGFwdGVyKTtcbiAgICByZXR1cm4gYWRhcHRlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYWRhcHRlciBieSBJRFxuICAgKi9cbiAgZ2V0KGlkOiBzdHJpbmcpOiBMb3JhQWRhcHRlciB8IHVuZGVmaW5lZCB7XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlcnMuZ2V0KGlkKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmUgYWRhcHRlclxuICAgKi9cbiAgcmVtb3ZlKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBpZiAodGhpcy5hY3RpdmVBZGFwdGVySWQgPT09IGlkKSB7XG4gICAgICB0aGlzLmFjdGl2ZUFkYXB0ZXJJZCA9IG51bGw7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJzLmRlbGV0ZShpZCk7XG4gIH1cblxuICAvKipcbiAgICogQWN0aXZhdGUgYW4gYWRhcHRlclxuICAgKi9cbiAgYWN0aXZhdGUoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIGlmICh0aGlzLmFkYXB0ZXJzLmhhcyhpZCkpIHtcbiAgICAgIHRoaXMuYWN0aXZlQWRhcHRlcklkID0gaWQ7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLyoqXG4gICAqIERlYWN0aXZhdGUgY3VycmVudCBhZGFwdGVyXG4gICAqL1xuICBkZWFjdGl2YXRlKCk6IHZvaWQge1xuICAgIHRoaXMuYWN0aXZlQWRhcHRlcklkID0gbnVsbDtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYWN0aXZlIGFkYXB0ZXJcbiAgICovXG4gIGdldEFjdGl2ZSgpOiBMb3JhQWRhcHRlciB8IG51bGwge1xuICAgIHJldHVybiB0aGlzLmFjdGl2ZUFkYXB0ZXJJZCA/IHRoaXMuYWRhcHRlcnMuZ2V0KHRoaXMuYWN0aXZlQWRhcHRlcklkKSB8fCBudWxsIDogbnVsbDtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYWN0aXZlIGFkYXB0ZXIgSURcbiAgICovXG4gIGdldEFjdGl2ZUlkKCk6IHN0cmluZyB8IG51bGwge1xuICAgIHJldHVybiB0aGlzLmFjdGl2ZUFkYXB0ZXJJZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBBcHBseSBhY3RpdmUgYWRhcHRlclxuICAgKi9cbiAgZm9yd2FyZChpbnB1dDogbnVtYmVyW10pOiBudW1iZXJbXSB7XG4gICAgY29uc3QgYWN0aXZlID0gdGhpcy5nZXRBY3RpdmUoKTtcbiAgICByZXR1cm4gYWN0aXZlID8gYWN0aXZlLmZvcndhcmQoaW5wdXQpIDogWy4uLmlucHV0XTtcbiAgfVxuXG4gIC8qKlxuICAgKiBMaXN0IGFsbCBhZGFwdGVyIElEc1xuICAgKi9cbiAgbGlzdCgpOiBzdHJpbmdbXSB7XG4gICAgcmV0dXJuIEFycmF5LmZyb20odGhpcy5hZGFwdGVycy5rZXlzKCkpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhZGFwdGVyIGNvdW50XG4gICAqL1xuICBjb3VudCgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJzLnNpemU7XG4gIH1cblxuICAvKipcbiAgICogRnJlZXplIGFsbCBhZGFwdGVyc1xuICAgKi9cbiAgZnJlZXplQWxsKCk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgYWRhcHRlciBvZiB0aGlzLmFkYXB0ZXJzLnZhbHVlcygpKSB7XG4gICAgICBhZGFwdGVyLmZyZWV6ZSgpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBVbmZyZWV6ZSBhbGwgYWRhcHRlcnNcbiAgICovXG4gIHVuZnJlZXplQWxsKCk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgYWRhcHRlciBvZiB0aGlzLmFkYXB0ZXJzLnZhbHVlcygpKSB7XG4gICAgICBhZGFwdGVyLnVuZnJlZXplKCk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIE1lcmdlIG11bHRpcGxlIGFkYXB0ZXJzIGludG8gb25lXG4gICAqL1xuICBtZXJnZUFkYXB0ZXJzKGlkczogc3RyaW5nW10sIG91dHB1dElkOiBzdHJpbmcpOiBMb3JhQWRhcHRlciB8IG51bGwge1xuICAgIGNvbnN0IGFkYXB0ZXJzID0gaWRzLm1hcChpZCA9PiB0aGlzLmFkYXB0ZXJzLmdldChpZCkpLmZpbHRlcihCb29sZWFuKSBhcyBMb3JhQWRhcHRlcltdO1xuICAgIGlmIChhZGFwdGVycy5sZW5ndGggPT09IDApIHJldHVybiBudWxsO1xuXG4gICAgLy8gVXNlIGZpcnN0IGFkYXB0ZXIgYXMgYmFzZVxuICAgIGNvbnN0IG1lcmdlZCA9IGFkYXB0ZXJzWzBdLmNsb25lKCk7XG4gICAgY29uc3Qgd2VpZ2h0cyA9IG1lcmdlZC5nZXRXZWlnaHRzKCk7XG5cbiAgICAvLyBBdmVyYWdlIHdlaWdodHMgZnJvbSBvdGhlciBhZGFwdGVyc1xuICAgIGZvciAobGV0IGkgPSAxOyBpIDwgYWRhcHRlcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IG90aGVyV2VpZ2h0cyA9IGFkYXB0ZXJzW2ldLmdldFdlaWdodHMoKTtcblxuICAgICAgZm9yIChsZXQgcm93ID0gMDsgcm93IDwgd2VpZ2h0cy5sb3JhQS5sZW5ndGggJiYgcm93IDwgb3RoZXJXZWlnaHRzLmxvcmFBLmxlbmd0aDsgcm93KyspIHtcbiAgICAgICAgZm9yIChsZXQgY29sID0gMDsgY29sIDwgd2VpZ2h0cy5sb3JhQVtyb3ddLmxlbmd0aCAmJiBjb2wgPCBvdGhlcldlaWdodHMubG9yYUFbcm93XS5sZW5ndGg7IGNvbCsrKSB7XG4gICAgICAgICAgd2VpZ2h0cy5sb3JhQVtyb3ddW2NvbF0gPSAod2VpZ2h0cy5sb3JhQVtyb3ddW2NvbF0gKyBvdGhlcldlaWdodHMubG9yYUFbcm93XVtjb2xdKSAvIDI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGZvciAobGV0IHJvdyA9IDA7IHJvdyA8IHdlaWdodHMubG9yYUIubGVuZ3RoICYmIHJvdyA8IG90aGVyV2VpZ2h0cy5sb3JhQi5sZW5ndGg7IHJvdysrKSB7XG4gICAgICAgIGZvciAobGV0IGNvbCA9IDA7IGNvbCA8IHdlaWdodHMubG9yYUJbcm93XS5sZW5ndGggJiYgY29sIDwgb3RoZXJXZWlnaHRzLmxvcmFCW3Jvd10ubGVuZ3RoOyBjb2wrKykge1xuICAgICAgICAgIHdlaWdodHMubG9yYUJbcm93XVtjb2xdID0gKHdlaWdodHMubG9yYUJbcm93XVtjb2xdICsgb3RoZXJXZWlnaHRzLmxvcmFCW3Jvd11bY29sXSkgLyAyO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgbWVyZ2VkLnNldFdlaWdodHMod2VpZ2h0cyk7XG4gICAgdGhpcy5yZWdpc3RlcihvdXRwdXRJZCwgbWVyZ2VkKTtcbiAgICByZXR1cm4gbWVyZ2VkO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBzdGF0aXN0aWNzXG4gICAqL1xuICBzdGF0cygpOiB7XG4gICAgdG90YWxBZGFwdGVyczogbnVtYmVyO1xuICAgIGFjdGl2ZUFkYXB0ZXI6IHN0cmluZyB8IG51bGw7XG4gICAgdG90YWxQYXJhbWV0ZXJzOiBudW1iZXI7XG4gICAgZnJvemVuQ291bnQ6IG51bWJlcjtcbiAgfSB7XG4gICAgbGV0IHRvdGFsUGFyYW1zID0gMDtcbiAgICBsZXQgZnJvemVuQ291bnQgPSAwO1xuXG4gICAgZm9yIChjb25zdCBhZGFwdGVyIG9mIHRoaXMuYWRhcHRlcnMudmFsdWVzKCkpIHtcbiAgICAgIHRvdGFsUGFyYW1zICs9IGFkYXB0ZXIubnVtUGFyYW1ldGVycygpO1xuICAgICAgaWYgKGFkYXB0ZXIuaXNGcm96ZW4oKSkgZnJvemVuQ291bnQrKztcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgdG90YWxBZGFwdGVyczogdGhpcy5hZGFwdGVycy5zaXplLFxuICAgICAgYWN0aXZlQWRhcHRlcjogdGhpcy5hY3RpdmVBZGFwdGVySWQsXG4gICAgICB0b3RhbFBhcmFtZXRlcnM6IHRvdGFsUGFyYW1zLFxuICAgICAgZnJvemVuQ291bnQsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhciBhbGwgYWRhcHRlcnNcbiAgICovXG4gIGNsZWFyKCk6IHZvaWQge1xuICAgIHRoaXMuYWRhcHRlcnMuY2xlYXIoKTtcbiAgICB0aGlzLmFjdGl2ZUFkYXB0ZXJJZCA9IG51bGw7XG4gIH1cbn1cbiJdfQ==