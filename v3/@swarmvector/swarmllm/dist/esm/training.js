/**
 * Training Pipeline for SONA
 *
 * Comprehensive training infrastructure with metrics tracking,
 * learning rate scheduling, and checkpoint management.
 *
 * @example
 * ```typescript
 * import { TrainingPipeline, TrainingConfig } from '@swarmvector/swarmllm';
 *
 * const pipeline = new TrainingPipeline({
 *   learningRate: 0.001,
 *   batchSize: 32,
 *   epochs: 10,
 * });
 *
 * // Add training data
 * pipeline.addBatch(inputs, targets, qualities);
 *
 * // Run training
 * const result = pipeline.train();
 * console.log(`Final loss: ${result.finalLoss}`);
 * ```
 */
import { LoraAdapter } from './lora';
import { EwcManager } from './sona';
/**
 * Default training config
 */
const DEFAULT_TRAINING_CONFIG = {
    learningRate: 0.001,
    batchSize: 32,
    epochs: 10,
    scheduler: 'cosine',
    warmupSteps: 100,
    weightDecay: 0.01,
    gradientClip: 1.0,
    earlyStoppingPatience: 3,
    checkpointInterval: 1,
    ewcLambda: 2000,
    validationSplit: 0.1,
};
/**
 * Learning Rate Scheduler
 */
export class LRScheduler {
    constructor(config, totalSteps) {
        this.currentStep = 0;
        this.config = config;
        this.initialLR = config.learningRate;
        this.totalSteps = totalSteps;
    }
    /**
     * Get learning rate for current step
     */
    getLR() {
        switch (this.config.scheduler) {
            case 'constant':
                return this.initialLR;
            case 'linear':
                return this.initialLR * (1 - this.currentStep / this.totalSteps);
            case 'cosine':
                return this.initialLR * 0.5 * (1 + Math.cos(Math.PI * this.currentStep / this.totalSteps));
            case 'warmup':
                if (this.currentStep < this.config.warmupSteps) {
                    return this.initialLR * (this.currentStep / this.config.warmupSteps);
                }
                // Cosine decay after warmup
                const decaySteps = this.totalSteps - this.config.warmupSteps;
                const decayProgress = (this.currentStep - this.config.warmupSteps) / decaySteps;
                return this.initialLR * 0.5 * (1 + Math.cos(Math.PI * decayProgress));
            default:
                return this.initialLR;
        }
    }
    /**
     * Step the scheduler
     */
    step() {
        this.currentStep++;
    }
    /**
     * Reset scheduler
     */
    reset() {
        this.currentStep = 0;
    }
}
/**
 * Training Metrics Tracker
 */
export class MetricsTracker {
    constructor() {
        this.lossHistory = [];
        this.valLossHistory = [];
        this.gradNormHistory = [];
        this.startTime = Date.now();
        this.stepTimes = [];
    }
    /**
     * Record training loss
     */
    recordLoss(loss) {
        this.lossHistory.push(loss);
    }
    /**
     * Record validation loss
     */
    recordValLoss(loss) {
        this.valLossHistory.push(loss);
    }
    /**
     * Record gradient norm
     */
    recordGradNorm(norm) {
        this.gradNormHistory.push(norm);
    }
    /**
     * Record step time
     */
    recordStepTime(ms) {
        this.stepTimes.push(ms);
    }
    /**
     * Get average loss over last N steps
     */
    avgLoss(n = 100) {
        const recent = this.lossHistory.slice(-n);
        return recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    }
    /**
     * Get average validation loss
     */
    avgValLoss(n = 10) {
        const recent = this.valLossHistory.slice(-n);
        return recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    }
    /**
     * Get steps per second
     */
    stepsPerSecond() {
        if (this.stepTimes.length === 0)
            return 0;
        const avgStepTime = this.stepTimes.slice(-100).reduce((a, b) => a + b, 0) / Math.min(this.stepTimes.length, 100);
        return avgStepTime > 0 ? 1000 / avgStepTime : 0;
    }
    /**
     * Get ETA in seconds
     */
    eta(remainingSteps) {
        const sps = this.stepsPerSecond();
        return sps > 0 ? remainingSteps / sps : 0;
    }
    /**
     * Get best validation loss
     */
    bestValLoss() {
        return this.valLossHistory.length > 0 ? Math.min(...this.valLossHistory) : Infinity;
    }
    /**
     * Get total duration
     */
    duration() {
        return Date.now() - this.startTime;
    }
    /**
     * Get all loss history
     */
    getLossHistory() {
        return [...this.lossHistory];
    }
    /**
     * Get all validation loss history
     */
    getValLossHistory() {
        return [...this.valLossHistory];
    }
    /**
     * Reset tracker
     */
    reset() {
        this.lossHistory = [];
        this.valLossHistory = [];
        this.gradNormHistory = [];
        this.stepTimes = [];
        this.startTime = Date.now();
    }
}
/**
 * Training Pipeline
 *
 * Full training infrastructure for SONA models.
 */
export class TrainingPipeline {
    constructor(config, adapter) {
        this.scheduler = null;
        this.batches = [];
        this.checkpoints = [];
        this.currentEpoch = 0;
        this.currentStep = 0;
        this.bestValLoss = Infinity;
        this.patienceCounter = 0;
        this.config = { ...DEFAULT_TRAINING_CONFIG, ...config };
        this.adapter = adapter || new LoraAdapter({ rank: 8 });
        this.ewcManager = new EwcManager(this.config.ewcLambda);
        this.metrics = new MetricsTracker();
    }
    /**
     * Add training batch
     */
    addBatch(inputs, targets, qualities) {
        this.batches.push({ inputs, targets, qualities });
    }
    /**
     * Add training data
     */
    addData(data) {
        // Group into batches
        for (let i = 0; i < data.length; i += this.config.batchSize) {
            const batch = data.slice(i, i + this.config.batchSize);
            this.addBatch(batch.map(d => d.input), batch.map(d => d.target), batch.map(d => d.quality));
        }
    }
    /**
     * Run training
     */
    train() {
        const totalSteps = this.batches.length * this.config.epochs;
        this.scheduler = new LRScheduler(this.config, totalSteps);
        this.metrics.reset();
        this.adapter.startTraining(this.config.learningRate);
        let earlyStopped = false;
        for (let epoch = 0; epoch < this.config.epochs; epoch++) {
            this.currentEpoch = epoch;
            // Shuffle batches
            const shuffledBatches = this.shuffleBatches();
            // Split into train/val
            const valSize = Math.floor(shuffledBatches.length * this.config.validationSplit);
            const trainBatches = shuffledBatches.slice(valSize);
            const valBatches = shuffledBatches.slice(0, valSize);
            // Training epoch
            for (const batch of trainBatches) {
                const stepStart = Date.now();
                const loss = this.trainStep(batch);
                this.metrics.recordLoss(loss);
                this.metrics.recordStepTime(Date.now() - stepStart);
                this.scheduler.step();
                this.currentStep++;
            }
            // Validation
            if (valBatches.length > 0) {
                const valLoss = this.validate(valBatches);
                this.metrics.recordValLoss(valLoss);
                // Early stopping
                if (valLoss < this.bestValLoss) {
                    this.bestValLoss = valLoss;
                    this.patienceCounter = 0;
                }
                else {
                    this.patienceCounter++;
                    if (this.patienceCounter >= this.config.earlyStoppingPatience) {
                        earlyStopped = true;
                        break;
                    }
                }
            }
            // Checkpoint
            if ((epoch + 1) % this.config.checkpointInterval === 0) {
                this.saveCheckpoint();
            }
        }
        this.adapter.endTraining();
        // Register with EWC for continual learning
        const weights = this.adapter.merge().flat();
        this.ewcManager.registerTask(`task-${Date.now()}`, weights);
        return {
            epochs: this.currentEpoch + 1,
            steps: this.currentStep,
            finalLoss: this.metrics.avgLoss(100),
            bestValLoss: this.bestValLoss,
            durationMs: this.metrics.duration(),
            lossHistory: this.metrics.getLossHistory(),
            valLossHistory: this.metrics.getValLossHistory(),
            earlyStopped,
        };
    }
    /**
     * Single training step
     */
    trainStep(batch) {
        let totalLoss = 0;
        const lr = this.scheduler?.getLR() || this.config.learningRate;
        for (let i = 0; i < batch.inputs.length; i++) {
            const input = batch.inputs[i];
            const target = batch.targets[i];
            const quality = batch.qualities[i];
            // Forward pass
            const output = this.adapter.forward(input);
            // Compute loss (MSE weighted by quality)
            const gradOutput = [];
            let loss = 0;
            for (let j = 0; j < output.length; j++) {
                const diff = output[j] - (target[j] || 0);
                loss += diff * diff;
                gradOutput.push(2 * diff * quality); // Quality-weighted gradient
            }
            loss = (loss / output.length) * quality;
            // Add EWC penalty
            const ewcPenalty = this.ewcManager.computePenalty(this.adapter.merge().flat());
            loss += ewcPenalty * 0.001;
            // Backward pass
            this.adapter.backward(input, gradOutput, lr);
            totalLoss += loss;
        }
        return totalLoss / batch.inputs.length;
    }
    /**
     * Validation pass
     */
    validate(batches) {
        let totalLoss = 0;
        let count = 0;
        for (const batch of batches) {
            for (let i = 0; i < batch.inputs.length; i++) {
                const output = this.adapter.forward(batch.inputs[i]);
                const target = batch.targets[i];
                let loss = 0;
                for (let j = 0; j < output.length; j++) {
                    const diff = output[j] - (target[j] || 0);
                    loss += diff * diff;
                }
                totalLoss += loss / output.length;
                count++;
            }
        }
        return count > 0 ? totalLoss / count : 0;
    }
    /**
     * Save checkpoint
     */
    saveCheckpoint() {
        this.checkpoints.push({
            epoch: this.currentEpoch,
            step: this.currentStep,
            loss: this.metrics.avgLoss(100),
            weights: this.adapter.toJSON(),
            timestamp: Date.now(),
        });
    }
    /**
     * Load checkpoint
     */
    loadCheckpoint(index) {
        const checkpoint = this.checkpoints[index];
        if (!checkpoint)
            return false;
        this.adapter = LoraAdapter.fromJSON(checkpoint.weights);
        this.currentEpoch = checkpoint.epoch;
        this.currentStep = checkpoint.step;
        return true;
    }
    /**
     * Get current metrics
     */
    getMetrics() {
        return {
            epoch: this.currentEpoch,
            step: this.currentStep,
            trainLoss: this.metrics.avgLoss(100),
            valLoss: this.metrics.avgValLoss(10),
            learningRate: this.scheduler?.getLR() || this.config.learningRate,
            gradNorm: 0,
            stepsPerSecond: this.metrics.stepsPerSecond(),
            etaSeconds: this.metrics.eta((this.config.epochs - this.currentEpoch) * this.batches.length),
        };
    }
    /**
     * Get adapter
     */
    getAdapter() {
        return this.adapter;
    }
    /**
     * Get EWC manager
     */
    getEwcManager() {
        return this.ewcManager;
    }
    /**
     * Get checkpoints
     */
    getCheckpoints() {
        return [...this.checkpoints];
    }
    /**
     * Reset pipeline
     */
    reset() {
        this.batches = [];
        this.checkpoints = [];
        this.currentEpoch = 0;
        this.currentStep = 0;
        this.bestValLoss = Infinity;
        this.patienceCounter = 0;
        this.metrics.reset();
        this.adapter.reset();
    }
    shuffleBatches() {
        const shuffled = [...this.batches];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}
/**
 * Training Factory
 *
 * Create pre-configured training pipelines for common scenarios.
 */
export class TrainingFactory {
    /**
     * Create pipeline for quick fine-tuning
     */
    static quickFinetune() {
        return new TrainingPipeline({
            learningRate: 0.01,
            epochs: 3,
            batchSize: 16,
            scheduler: 'constant',
        });
    }
    /**
     * Create pipeline for deep training
     */
    static deepTraining() {
        return new TrainingPipeline({
            learningRate: 0.001,
            epochs: 50,
            batchSize: 32,
            scheduler: 'warmup',
            warmupSteps: 500,
            earlyStoppingPatience: 5,
        });
    }
    /**
     * Create pipeline for continual learning
     */
    static continualLearning(ewcLambda = 5000) {
        return new TrainingPipeline({
            learningRate: 0.0005,
            epochs: 10,
            batchSize: 16,
            scheduler: 'cosine',
            ewcLambda,
            earlyStoppingPatience: 10,
        });
    }
    /**
     * Create pipeline for federated aggregation
     */
    static federatedAggregation() {
        return new TrainingPipeline({
            learningRate: 0.0001,
            epochs: 5,
            batchSize: 64,
            scheduler: 'linear',
            ewcLambda: 2000,
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhaW5pbmcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvdHJhaW5pbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dBdUJHO0FBR0gsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUNyQyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBRXBDOztHQUVHO0FBQ0gsTUFBTSx1QkFBdUIsR0FBNkI7SUFDeEQsWUFBWSxFQUFFLEtBQUs7SUFDbkIsU0FBUyxFQUFFLEVBQUU7SUFDYixNQUFNLEVBQUUsRUFBRTtJQUNWLFNBQVMsRUFBRSxRQUFRO0lBQ25CLFdBQVcsRUFBRSxHQUFHO0lBQ2hCLFdBQVcsRUFBRSxJQUFJO0lBQ2pCLFlBQVksRUFBRSxHQUFHO0lBQ2pCLHFCQUFxQixFQUFFLENBQUM7SUFDeEIsa0JBQWtCLEVBQUUsQ0FBQztJQUNyQixTQUFTLEVBQUUsSUFBSTtJQUNmLGVBQWUsRUFBRSxHQUFHO0NBQ3JCLENBQUM7QUFvREY7O0dBRUc7QUFDSCxNQUFNLE9BQU8sV0FBVztJQU10QixZQUFZLE1BQWdDLEVBQUUsVUFBa0I7UUFIeEQsZ0JBQVcsR0FBVyxDQUFDLENBQUM7UUFJOUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLFNBQVMsR0FBRyxNQUFNLENBQUMsWUFBWSxDQUFDO1FBQ3JDLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO0lBQy9CLENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUs7UUFDSCxRQUFRLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDOUIsS0FBSyxVQUFVO2dCQUNiLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQztZQUV4QixLQUFLLFFBQVE7Z0JBQ1gsT0FBTyxJQUFJLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FB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QUNMLENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogVHJhaW5pbmcgUGlwZWxpbmUgZm9yIFNPTkFcbiAqXG4gKiBDb21wcmVoZW5zaXZlIHRyYWluaW5nIGluZnJhc3RydWN0dXJlIHdpdGggbWV0cmljcyB0cmFja2luZyxcbiAqIGxlYXJuaW5nIHJhdGUgc2NoZWR1bGluZywgYW5kIGNoZWNrcG9pbnQgbWFuYWdlbWVudC5cbiAqXG4gKiBAZXhhbXBsZVxuICogYGBgdHlwZXNjcmlwdFxuICogaW1wb3J0IHsgVHJhaW5pbmdQaXBlbGluZSwgVHJhaW5pbmdDb25maWcgfSBmcm9tICdAcnVmdmVjdG9yL3J1ZmxsbSc7XG4gKlxuICogY29uc3QgcGlwZWxpbmUgPSBuZXcgVHJhaW5pbmdQaXBlbGluZSh7XG4gKiAgIGxlYXJuaW5nUmF0ZTogMC4wMDEsXG4gKiAgIGJhdGNoU2l6ZTogMzIsXG4gKiAgIGVwb2NoczogMTAsXG4gKiB9KTtcbiAqXG4gKiAvLyBBZGQgdHJhaW5pbmcgZGF0YVxuICogcGlwZWxpbmUuYWRkQmF0Y2goaW5wdXRzLCB0YXJnZXRzLCBxdWFsaXRpZXMpO1xuICpcbiAqIC8vIFJ1biB0cmFpbmluZ1xuICogY29uc3QgcmVzdWx0ID0gcGlwZWxpbmUudHJhaW4oKTtcbiAqIGNvbnNvbGUubG9nKGBGaW5hbCBsb3NzOiAke3Jlc3VsdC5maW5hbExvc3N9YCk7XG4gKiBgYGBcbiAqL1xuXG5pbXBvcnQgeyBFbWJlZGRpbmcsIFRyYWluaW5nQ29uZmlnLCBUcmFpbmluZ1Jlc3VsdCB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHsgTG9yYUFkYXB0ZXIgfSBmcm9tICcuL2xvcmEnO1xuaW1wb3J0IHsgRXdjTWFuYWdlciB9IGZyb20gJy4vc29uYSc7XG5cbi8qKlxuICogRGVmYXVsdCB0cmFpbmluZyBjb25maWdcbiAqL1xuY29uc3QgREVGQVVMVF9UUkFJTklOR19DT05GSUc6IFJlcXVpcmVkPFRyYWluaW5nQ29uZmlnPiA9IHtcbiAgbGVhcm5pbmdSYXRlOiAwLjAwMSxcbiAgYmF0Y2hTaXplOiAzMixcbiAgZXBvY2hzOiAxMCxcbiAgc2NoZWR1bGVyOiAnY29zaW5lJyxcbiAgd2FybXVwU3RlcHM6IDEwMCxcbiAgd2VpZ2h0RGVjYXk6IDAuMDEsXG4gIGdyYWRpZW50Q2xpcDogMS4wLFxuICBlYXJseVN0b3BwaW5nUGF0aWVuY2U6IDMsXG4gIGNoZWNrcG9pbnRJbnRlcnZhbDogMSxcbiAgZXdjTGFtYmRhOiAyMDAwLFxuICB2YWxpZGF0aW9uU3BsaXQ6IDAuMSxcbn07XG5cbi8qKlxuICogVHJhaW5pbmcgbWV0cmljc1xuICovXG5leHBvcnQgaW50ZXJmYWNlIFRyYWluaW5nTWV0cmljcyB7XG4gIC8qKiBDdXJyZW50IGVwb2NoICovXG4gIGVwb2NoOiBudW1iZXI7XG4gIC8qKiBDdXJyZW50IHN0ZXAgKi9cbiAgc3RlcDogbnVtYmVyO1xuICAvKiogVHJhaW5pbmcgbG9zcyAqL1xuICB0cmFpbkxvc3M6IG51bWJlcjtcbiAgLyoqIFZhbGlkYXRpb24gbG9zcyAqL1xuICB2YWxMb3NzOiBudW1iZXI7XG4gIC8qKiBMZWFybmluZyByYXRlICovXG4gIGxlYXJuaW5nUmF0ZTogbnVtYmVyO1xuICAvKiogR3JhZGllbnQgbm9ybSAqL1xuICBncmFkTm9ybTogbnVtYmVyO1xuICAvKiogU3RlcHMgcGVyIHNlY29uZCAqL1xuICBzdGVwc1BlclNlY29uZDogbnVtYmVyO1xuICAvKiogRVRBIGluIHNlY29uZHMgKi9cbiAgZXRhU2Vjb25kczogbnVtYmVyO1xufVxuXG4vKipcbiAqIFRyYWluaW5nIGRhdGEgYmF0Y2hcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBUcmFpbmluZ0JhdGNoIHtcbiAgLyoqIElucHV0IGVtYmVkZGluZ3MgKi9cbiAgaW5wdXRzOiBFbWJlZGRpbmdbXTtcbiAgLyoqIFRhcmdldCBvdXRwdXRzICovXG4gIHRhcmdldHM6IEVtYmVkZGluZ1tdO1xuICAvKiogUXVhbGl0eSBzY29yZXMgKi9cbiAgcXVhbGl0aWVzOiBudW1iZXJbXTtcbn1cblxuLyoqXG4gKiBDaGVja3BvaW50IGRhdGFcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBDaGVja3BvaW50IHtcbiAgLyoqIEVwb2NoIG51bWJlciAqL1xuICBlcG9jaDogbnVtYmVyO1xuICAvKiogU3RlcCBudW1iZXIgKi9cbiAgc3RlcDogbnVtYmVyO1xuICAvKiogVHJhaW5pbmcgbG9zcyBhdCBjaGVja3BvaW50ICovXG4gIGxvc3M6IG51bWJlcjtcbiAgLyoqIE1vZGVsIHdlaWdodHMgKHNlcmlhbGl6ZWQpICovXG4gIHdlaWdodHM6IHN0cmluZztcbiAgLyoqIFRpbWVzdGFtcCAqL1xuICB0aW1lc3RhbXA6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBMZWFybmluZyBSYXRlIFNjaGVkdWxlclxuICovXG5leHBvcnQgY2xhc3MgTFJTY2hlZHVsZXIge1xuICBwcml2YXRlIGNvbmZpZzogUmVxdWlyZWQ8VHJhaW5pbmdDb25maWc+O1xuICBwcml2YXRlIGluaXRpYWxMUjogbnVtYmVyO1xuICBwcml2YXRlIGN1cnJlbnRTdGVwOiBudW1iZXIgPSAwO1xuICBwcml2YXRlIHRvdGFsU3RlcHM6IG51bWJlcjtcblxuICBjb25zdHJ1Y3Rvcihjb25maWc6IFJlcXVpcmVkPFRyYWluaW5nQ29uZmlnPiwgdG90YWxTdGVwczogbnVtYmVyKSB7XG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gICAgdGhpcy5pbml0aWFsTFIgPSBjb25maWcubGVhcm5pbmdSYXRlO1xuICAgIHRoaXMudG90YWxTdGVwcyA9IHRvdGFsU3RlcHM7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGxlYXJuaW5nIHJhdGUgZm9yIGN1cnJlbnQgc3RlcFxuICAgKi9cbiAgZ2V0TFIoKTogbnVtYmVyIHtcbiAgICBzd2l0Y2ggKHRoaXMuY29uZmlnLnNjaGVkdWxlcikge1xuICAgICAgY2FzZSAnY29uc3RhbnQnOlxuICAgICAgICByZXR1cm4gdGhpcy5pbml0aWFsTFI7XG5cbiAgICAgIGNhc2UgJ2xpbmVhcic6XG4gICAgICAgIHJldHVybiB0aGlzLmluaXRpYWxMUiAqICgxIC0gdGhpcy5jdXJyZW50U3RlcCAvIHRoaXMudG90YWxTdGVwcyk7XG5cbiAgICAgIGNhc2UgJ2Nvc2luZSc6XG4gICAgICAgIHJldHVybiB0aGlzLmluaXRpYWxMUiAqIDAuNSAqICgxICsgTWF0aC5jb3MoTWF0aC5QSSAqIHRoaXMuY3VycmVudFN0ZXAgLyB0aGlzLnRvdGFsU3RlcHMpKTtcblxuICAgICAgY2FzZSAnd2FybXVwJzpcbiAgICAgICAgaWYgKHRoaXMuY3VycmVudFN0ZXAgPCB0aGlzLmNvbmZpZy53YXJtdXBTdGVwcykge1xuICAgICAgICAgIHJldHVybiB0aGlzLmluaXRpYWxMUiAqICh0aGlzLmN1cnJlbnRTdGVwIC8gdGhpcy5jb25maWcud2FybXVwU3RlcHMpO1xuICAgICAgICB9XG4gICAgICAgIC8vIENvc2luZSBkZWNheSBhZnRlciB3YXJtdXBcbiAgICAgICAgY29uc3QgZGVjYXlTdGVwcyA9IHRoaXMudG90YWxTdGVwcyAtIHRoaXMuY29uZmlnLndhcm11cFN0ZXBzO1xuICAgICAgICBjb25zdCBkZWNheVByb2dyZXNzID0gKHRoaXMuY3VycmVudFN0ZXAgLSB0aGlzLmNvbmZpZy53YXJtdXBTdGVwcykgLyBkZWNheVN0ZXBzO1xuICAgICAgICByZXR1cm4gdGhpcy5pbml0aWFsTFIgKiAwLjUgKiAoMSArIE1hdGguY29zKE1hdGguUEkgKiBkZWNheVByb2dyZXNzKSk7XG5cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiB0aGlzLmluaXRpYWxMUjtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogU3RlcCB0aGUgc2NoZWR1bGVyXG4gICAqL1xuICBzdGVwKCk6IHZvaWQge1xuICAgIHRoaXMuY3VycmVudFN0ZXArKztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNldCBzY2hlZHVsZXJcbiAgICovXG4gIHJlc2V0KCk6IHZvaWQge1xuICAgIHRoaXMuY3VycmVudFN0ZXAgPSAwO1xuICB9XG59XG5cbi8qKlxuICogVHJhaW5pbmcgTWV0cmljcyBUcmFja2VyXG4gKi9cbmV4cG9ydCBjbGFzcyBNZXRyaWNzVHJhY2tlciB7XG4gIHByaXZhdGUgbG9zc0hpc3Rvcnk6IG51bWJlcltdID0gW107XG4gIHByaXZhdGUgdmFsTG9zc0hpc3Rvcnk6IG51bWJlcltdID0gW107XG4gIHByaXZhdGUgZ3JhZE5vcm1IaXN0b3J5OiBudW1iZXJbXSA9IFtdO1xuICBwcml2YXRlIHN0YXJ0VGltZTogbnVtYmVyID0gRGF0ZS5ub3coKTtcbiAgcHJpdmF0ZSBzdGVwVGltZXM6IG51bWJlcltdID0gW107XG5cbiAgLyoqXG4gICAqIFJlY29yZCB0cmFpbmluZyBsb3NzXG4gICAqL1xuICByZWNvcmRMb3NzKGxvc3M6IG51bWJlcik6IHZvaWQge1xuICAgIHRoaXMubG9zc0hpc3RvcnkucHVzaChsb3NzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWNvcmQgdmFsaWRhdGlvbiBsb3NzXG4gICAqL1xuICByZWNvcmRWYWxMb3NzKGxvc3M6IG51bWJlcik6IHZvaWQge1xuICAgIHRoaXMudmFsTG9zc0hpc3RvcnkucHVzaChsb3NzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWNvcmQgZ3JhZGllbnQgbm9ybVxuICAgKi9cbiAgcmVjb3JkR3JhZE5vcm0obm9ybTogbnVtYmVyKTogdm9pZCB7XG4gICAgdGhpcy5ncmFkTm9ybUhpc3RvcnkucHVzaChub3JtKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWNvcmQgc3RlcCB0aW1lXG4gICAqL1xuICByZWNvcmRTdGVwVGltZShtczogbnVtYmVyKTogdm9pZCB7XG4gICAgdGhpcy5zdGVwVGltZXMucHVzaChtcyk7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGF2ZXJhZ2UgbG9zcyBvdmVyIGxhc3QgTiBzdGVwc1xuICAgKi9cbiAgYXZnTG9zcyhuOiBudW1iZXIgPSAxMDApOiBudW1iZXIge1xuICAgIGNvbnN0IHJlY2VudCA9IHRoaXMubG9zc0hpc3Rvcnkuc2xpY2UoLW4pO1xuICAgIHJldHVybiByZWNlbnQubGVuZ3RoID4gMCA/IHJlY2VudC5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKSAvIHJlY2VudC5sZW5ndGggOiAwO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhdmVyYWdlIHZhbGlkYXRpb24gbG9zc1xuICAgKi9cbiAgYXZnVmFsTG9zcyhuOiBudW1iZXIgPSAxMCk6IG51bWJlciB7XG4gICAgY29uc3QgcmVjZW50ID0gdGhpcy52YWxMb3NzSGlzdG9yeS5zbGljZSgtbik7XG4gICAgcmV0dXJuIHJlY2VudC5sZW5ndGggPiAwID8gcmVjZW50LnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApIC8gcmVjZW50Lmxlbmd0aCA6IDA7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHN0ZXBzIHBlciBzZWNvbmRcbiAgICovXG4gIHN0ZXBzUGVyU2Vjb25kKCk6IG51bWJlciB7XG4gICAgaWYgKHRoaXMuc3RlcFRpbWVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuIDA7XG4gICAgY29uc3QgYXZnU3RlcFRpbWUgPSB0aGlzLnN0ZXBUaW1lcy5zbGljZSgtMTAwKS5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKSAvIE1hdGgubWluKHRoaXMuc3RlcFRpbWVzLmxlbmd0aCwgMTAwKTtcbiAgICByZXR1cm4gYXZnU3RlcFRpbWUgPiAwID8gMTAwMCAvIGF2Z1N0ZXBUaW1lIDogMDtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgRVRBIGluIHNlY29uZHNcbiAgICovXG4gIGV0YShyZW1haW5pbmdTdGVwczogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBzcHMgPSB0aGlzLnN0ZXBzUGVyU2Vjb25kKCk7XG4gICAgcmV0dXJuIHNwcyA+IDAgPyByZW1haW5pbmdTdGVwcyAvIHNwcyA6IDA7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGJlc3QgdmFsaWRhdGlvbiBsb3NzXG4gICAqL1xuICBiZXN0VmFsTG9zcygpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLnZhbExvc3NIaXN0b3J5Lmxlbmd0aCA+IDAgPyBNYXRoLm1pbiguLi50aGlzLnZhbExvc3NIaXN0b3J5KSA6IEluZmluaXR5O1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0b3RhbCBkdXJhdGlvblxuICAgKi9cbiAgZHVyYXRpb24oKTogbnVtYmVyIHtcbiAgICByZXR1cm4gRGF0ZS5ub3coKSAtIHRoaXMuc3RhcnRUaW1lO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhbGwgbG9zcyBoaXN0b3J5XG4gICAqL1xuICBnZXRMb3NzSGlzdG9yeSgpOiBudW1iZXJbXSB7XG4gICAgcmV0dXJuIFsuLi50aGlzLmxvc3NIaXN0b3J5XTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYWxsIHZhbGlkYXRpb24gbG9zcyBoaXN0b3J5XG4gICAqL1xuICBnZXRWYWxMb3NzSGlzdG9yeSgpOiBudW1iZXJbXSB7XG4gICAgcmV0dXJuIFsuLi50aGlzLnZhbExvc3NIaXN0b3J5XTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXNldCB0cmFja2VyXG4gICAqL1xuICByZXNldCgpOiB2b2lkIHtcbiAgICB0aGlzLmxvc3NIaXN0b3J5ID0gW107XG4gICAgdGhpcy52YWxMb3NzSGlzdG9yeSA9IFtdO1xuICAgIHRoaXMuZ3JhZE5vcm1IaXN0b3J5ID0gW107XG4gICAgdGhpcy5zdGVwVGltZXMgPSBbXTtcbiAgICB0aGlzLnN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gIH1cbn1cblxuLyoqXG4gKiBUcmFpbmluZyBQaXBlbGluZVxuICpcbiAqIEZ1bGwgdHJhaW5pbmcgaW5mcmFzdHJ1Y3R1cmUgZm9yIFNPTkEgbW9kZWxzLlxuICovXG5leHBvcnQgY2xhc3MgVHJhaW5pbmdQaXBlbGluZSB7XG4gIHByaXZhdGUgY29uZmlnOiBSZXF1aXJlZDxUcmFpbmluZ0NvbmZpZz47XG4gIHByaXZhdGUgYWRhcHRlcjogTG9yYUFkYXB0ZXI7XG4gIHByaXZhdGUgZXdjTWFuYWdlcjogRXdjTWFuYWdlcjtcbiAgcHJpdmF0ZSBtZXRyaWNzOiBNZXRyaWNzVHJhY2tlcjtcbiAgcHJpdmF0ZSBzY2hlZHVsZXI6IExSU2NoZWR1bGVyIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgYmF0Y2hlczogVHJhaW5pbmdCYXRjaFtdID0gW107XG4gIHByaXZhdGUgY2hlY2twb2ludHM6IENoZWNrcG9pbnRbXSA9IFtdO1xuICBwcml2YXRlIGN1cnJlbnRFcG9jaDogbnVtYmVyID0gMDtcbiAgcHJpdmF0ZSBjdXJyZW50U3RlcDogbnVtYmVyID0gMDtcbiAgcHJpdmF0ZSBiZXN0VmFsTG9zczogbnVtYmVyID0gSW5maW5pdHk7XG4gIHByaXZhdGUgcGF0aWVuY2VDb3VudGVyOiBudW1iZXIgPSAwO1xuXG4gIGNvbnN0cnVjdG9yKGNvbmZpZz86IFRyYWluaW5nQ29uZmlnLCBhZGFwdGVyPzogTG9yYUFkYXB0ZXIpIHtcbiAgICB0aGlzLmNvbmZpZyA9IHsgLi4uREVGQVVMVF9UUkFJTklOR19DT05GSUcsIC4uLmNvbmZpZyB9O1xuICAgIHRoaXMuYWRhcHRlciA9IGFkYXB0ZXIgfHwgbmV3IExvcmFBZGFwdGVyKHsgcmFuazogOCB9KTtcbiAgICB0aGlzLmV3Y01hbmFnZXIgPSBuZXcgRXdjTWFuYWdlcih0aGlzLmNvbmZpZy5ld2NMYW1iZGEpO1xuICAgIHRoaXMubWV0cmljcyA9IG5ldyBNZXRyaWNzVHJhY2tlcigpO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCB0cmFpbmluZyBiYXRjaFxuICAgKi9cbiAgYWRkQmF0Y2goaW5wdXRzOiBFbWJlZGRpbmdbXSwgdGFyZ2V0czogRW1iZWRkaW5nW10sIHF1YWxpdGllczogbnVtYmVyW10pOiB2b2lkIHtcbiAgICB0aGlzLmJhdGNoZXMucHVzaCh7IGlucHV0cywgdGFyZ2V0cywgcXVhbGl0aWVzIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZCB0cmFpbmluZyBkYXRhXG4gICAqL1xuICBhZGREYXRhKGRhdGE6IEFycmF5PHsgaW5wdXQ6IEVtYmVkZGluZzsgdGFyZ2V0OiBFbWJlZGRpbmc7IHF1YWxpdHk6IG51bWJlciB9Pik6IHZvaWQge1xuICAgIC8vIEdyb3VwIGludG8gYmF0Y2hlc1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZGF0YS5sZW5ndGg7IGkgKz0gdGhpcy5jb25maWcuYmF0Y2hTaXplKSB7XG4gICAgICBjb25zdCBiYXRjaCA9IGRhdGEuc2xpY2UoaSwgaSArIHRoaXMuY29uZmlnLmJhdGNoU2l6ZSk7XG4gICAgICB0aGlzLmFkZEJhdGNoKFxuICAgICAgICBiYXRjaC5tYXAoZCA9PiBkLmlucHV0KSxcbiAgICAgICAgYmF0Y2gubWFwKGQgPT4gZC50YXJnZXQpLFxuICAgICAgICBiYXRjaC5tYXAoZCA9PiBkLnF1YWxpdHkpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSdW4gdHJhaW5pbmdcbiAgICovXG4gIHRyYWluKCk6IFRyYWluaW5nUmVzdWx0IHtcbiAgICBjb25zdCB0b3RhbFN0ZXBzID0gdGhpcy5iYXRjaGVzLmxlbmd0aCAqIHRoaXMuY29uZmlnLmVwb2NocztcbiAgICB0aGlzLnNjaGVkdWxlciA9IG5ldyBMUlNjaGVkdWxlcih0aGlzLmNvbmZpZywgdG90YWxTdGVwcyk7XG4gICAgdGhpcy5tZXRyaWNzLnJlc2V0KCk7XG4gICAgdGhpcy5hZGFwdGVyLnN0YXJ0VHJhaW5pbmcodGhpcy5jb25maWcubGVhcm5pbmdSYXRlKTtcblxuICAgIGxldCBlYXJseVN0b3BwZWQgPSBmYWxzZTtcblxuICAgIGZvciAobGV0IGVwb2NoID0gMDsgZXBvY2ggPCB0aGlzLmNvbmZpZy5lcG9jaHM7IGVwb2NoKyspIHtcbiAgICAgIHRoaXMuY3VycmVudEVwb2NoID0gZXBvY2g7XG5cbiAgICAgIC8vIFNodWZmbGUgYmF0Y2hlc1xuICAgICAgY29uc3Qgc2h1ZmZsZWRCYXRjaGVzID0gdGhpcy5zaHVmZmxlQmF0Y2hlcygpO1xuXG4gICAgICAvLyBTcGxpdCBpbnRvIHRyYWluL3ZhbFxuICAgICAgY29uc3QgdmFsU2l6ZSA9IE1hdGguZmxvb3Ioc2h1ZmZsZWRCYXRjaGVzLmxlbmd0aCAqIHRoaXMuY29uZmlnLnZhbGlkYXRpb25TcGxpdCk7XG4gICAgICBjb25zdCB0cmFpbkJhdGNoZXMgPSBzaHVmZmxlZEJhdGNoZXMuc2xpY2UodmFsU2l6ZSk7XG4gICAgICBjb25zdCB2YWxCYXRjaGVzID0gc2h1ZmZsZWRCYXRjaGVzLnNsaWNlKDAsIHZhbFNpemUpO1xuXG4gICAgICAvLyBUcmFpbmluZyBlcG9jaFxuICAgICAgZm9yIChjb25zdCBiYXRjaCBvZiB0cmFpbkJhdGNoZXMpIHtcbiAgICAgICAgY29uc3Qgc3RlcFN0YXJ0ID0gRGF0ZS5ub3coKTtcbiAgICAgICAgY29uc3QgbG9zcyA9IHRoaXMudHJhaW5TdGVwKGJhdGNoKTtcbiAgICAgICAgdGhpcy5tZXRyaWNzLnJlY29yZExvc3MobG9zcyk7XG4gICAgICAgIHRoaXMubWV0cmljcy5yZWNvcmRTdGVwVGltZShEYXRlLm5vdygpIC0gc3RlcFN0YXJ0KTtcbiAgICAgICAgdGhpcy5zY2hlZHVsZXIuc3RlcCgpO1xuICAgICAgICB0aGlzLmN1cnJlbnRTdGVwKys7XG4gICAgICB9XG5cbiAgICAgIC8vIFZhbGlkYXRpb25cbiAgICAgIGlmICh2YWxCYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgdmFsTG9zcyA9IHRoaXMudmFsaWRhdGUodmFsQmF0Y2hlcyk7XG4gICAgICAgIHRoaXMubWV0cmljcy5yZWNvcmRWYWxMb3NzKHZhbExvc3MpO1xuXG4gICAgICAgIC8vIEVhcmx5IHN0b3BwaW5nXG4gICAgICAgIGlmICh2YWxMb3NzIDwgdGhpcy5iZXN0VmFsTG9zcykge1xuICAgICAgICAgIHRoaXMuYmVzdFZhbExvc3MgPSB2YWxMb3NzO1xuICAgICAgICAgIHRoaXMucGF0aWVuY2VDb3VudGVyID0gMDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLnBhdGllbmNlQ291bnRlcisrO1xuICAgICAgICAgIGlmICh0aGlzLnBhdGllbmNlQ291bnRlciA+PSB0aGlzLmNvbmZpZy5lYXJseVN0b3BwaW5nUGF0aWVuY2UpIHtcbiAgICAgICAgICAgIGVhcmx5U3RvcHBlZCA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gQ2hlY2twb2ludFxuICAgICAgaWYgKChlcG9jaCArIDEpICUgdGhpcy5jb25maWcuY2hlY2twb2ludEludGVydmFsID09PSAwKSB7XG4gICAgICAgIHRoaXMuc2F2ZUNoZWNrcG9pbnQoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLmFkYXB0ZXIuZW5kVHJhaW5pbmcoKTtcblxuICAgIC8vIFJlZ2lzdGVyIHdpdGggRVdDIGZvciBjb250aW51YWwgbGVhcm5pbmdcbiAgICBjb25zdCB3ZWlnaHRzID0gdGhpcy5hZGFwdGVyLm1lcmdlKCkuZmxhdCgpO1xuICAgIHRoaXMuZXdjTWFuYWdlci5yZWdpc3RlclRhc2soYHRhc2stJHtEYXRlLm5vdygpfWAsIHdlaWdodHMpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGVwb2NoczogdGhpcy5jdXJyZW50RXBvY2ggKyAxLFxuICAgICAgc3RlcHM6IHRoaXMuY3VycmVudFN0ZXAsXG4gICAgICBmaW5hbExvc3M6IHRoaXMubWV0cmljcy5hdmdMb3NzKDEwMCksXG4gICAgICBiZXN0VmFsTG9zczogdGhpcy5iZXN0VmFsTG9zcyxcbiAgICAgIGR1cmF0aW9uTXM6IHRoaXMubWV0cmljcy5kdXJhdGlvbigpLFxuICAgICAgbG9zc0hpc3Rvcnk6IHRoaXMubWV0cmljcy5nZXRMb3NzSGlzdG9yeSgpLFxuICAgICAgdmFsTG9zc0hpc3Rvcnk6IHRoaXMubWV0cmljcy5nZXRWYWxMb3NzSGlzdG9yeSgpLFxuICAgICAgZWFybHlTdG9wcGVkLFxuICAgIH07XG4gIH1cblxuICAvKipcbiAgICogU2luZ2xlIHRyYWluaW5nIHN0ZXBcbiAgICovXG4gIHByaXZhdGUgdHJhaW5TdGVwKGJhdGNoOiBUcmFpbmluZ0JhdGNoKTogbnVtYmVyIHtcbiAgICBsZXQgdG90YWxMb3NzID0gMDtcbiAgICBjb25zdCBsciA9IHRoaXMuc2NoZWR1bGVyPy5nZXRMUigpIHx8IHRoaXMuY29uZmlnLmxlYXJuaW5nUmF0ZTtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYmF0Y2guaW5wdXRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBpbnB1dCA9IGJhdGNoLmlucHV0c1tpXTtcbiAgICAgIGNvbnN0IHRhcmdldCA9IGJhdGNoLnRhcmdldHNbaV07XG4gICAgICBjb25zdCBxdWFsaXR5ID0gYmF0Y2gucXVhbGl0aWVzW2ldO1xuXG4gICAgICAvLyBGb3J3YXJkIHBhc3NcbiAgICAgIGNvbnN0IG91dHB1dCA9IHRoaXMuYWRhcHRlci5mb3J3YXJkKGlucHV0KTtcblxuICAgICAgLy8gQ29tcHV0ZSBsb3NzIChNU0Ugd2VpZ2h0ZWQgYnkgcXVhbGl0eSlcbiAgICAgIGNvbnN0IGdyYWRPdXRwdXQ6IG51bWJlcltdID0gW107XG4gICAgICBsZXQgbG9zcyA9IDA7XG4gICAgICBmb3IgKGxldCBqID0gMDsgaiA8IG91dHB1dC5sZW5ndGg7IGorKykge1xuICAgICAgICBjb25zdCBkaWZmID0gb3V0cHV0W2pdIC0gKHRhcmdldFtqXSB8fCAwKTtcbiAgICAgICAgbG9zcyArPSBkaWZmICogZGlmZjtcbiAgICAgICAgZ3JhZE91dHB1dC5wdXNoKDIgKiBkaWZmICogcXVhbGl0eSk7IC8vIFF1YWxpdHktd2VpZ2h0ZWQgZ3JhZGllbnRcbiAgICAgIH1cbiAgICAgIGxvc3MgPSAobG9zcyAvIG91dHB1dC5sZW5ndGgpICogcXVhbGl0eTtcblxuICAgICAgLy8gQWRkIEVXQyBwZW5hbHR5XG4gICAgICBjb25zdCBld2NQZW5hbHR5ID0gdGhpcy5ld2NNYW5hZ2VyLmNvbXB1dGVQZW5hbHR5KHRoaXMuYWRhcHRlci5tZXJnZSgpLmZsYXQoKSk7XG4gICAgICBsb3NzICs9IGV3Y1BlbmFsdHkgKiAwLjAwMTtcblxuICAgICAgLy8gQmFja3dhcmQgcGFzc1xuICAgICAgdGhpcy5hZGFwdGVyLmJhY2t3YXJkKGlucHV0LCBncmFkT3V0cHV0LCBscik7XG5cbiAgICAgIHRvdGFsTG9zcyArPSBsb3NzO1xuICAgIH1cblxuICAgIHJldHVybiB0b3RhbExvc3MgLyBiYXRjaC5pbnB1dHMubGVuZ3RoO1xuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRpb24gcGFzc1xuICAgKi9cbiAgcHJpdmF0ZSB2YWxpZGF0ZShiYXRjaGVzOiBUcmFpbmluZ0JhdGNoW10pOiBudW1iZXIge1xuICAgIGxldCB0b3RhbExvc3MgPSAwO1xuICAgIGxldCBjb3VudCA9IDA7XG5cbiAgICBmb3IgKGNvbnN0IGJhdGNoIG9mIGJhdGNoZXMpIHtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYmF0Y2guaW5wdXRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IG91dHB1dCA9IHRoaXMuYWRhcHRlci5mb3J3YXJkKGJhdGNoLmlucHV0c1tpXSk7XG4gICAgICAgIGNvbnN0IHRhcmdldCA9IGJhdGNoLnRhcmdldHNbaV07XG5cbiAgICAgICAgbGV0IGxvc3MgPSAwO1xuICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IG91dHB1dC5sZW5ndGg7IGorKykge1xuICAgICAgICAgIGNvbnN0IGRpZmYgPSBvdXRwdXRbal0gLSAodGFyZ2V0W2pdIHx8IDApO1xuICAgICAgICAgIGxvc3MgKz0gZGlmZiAqIGRpZmY7XG4gICAgICAgIH1cbiAgICAgICAgdG90YWxMb3NzICs9IGxvc3MgLyBvdXRwdXQubGVuZ3RoO1xuICAgICAgICBjb3VudCsrO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBjb3VudCA+IDAgPyB0b3RhbExvc3MgLyBjb3VudCA6IDA7XG4gIH1cblxuICAvKipcbiAgICogU2F2ZSBjaGVja3BvaW50XG4gICAqL1xuICBwcml2YXRlIHNhdmVDaGVja3BvaW50KCk6IHZvaWQge1xuICAgIHRoaXMuY2hlY2twb2ludHMucHVzaCh7XG4gICAgICBlcG9jaDogdGhpcy5jdXJyZW50RXBvY2gsXG4gICAgICBzdGVwOiB0aGlzLmN1cnJlbnRTdGVwLFxuICAgICAgbG9zczogdGhpcy5tZXRyaWNzLmF2Z0xvc3MoMTAwKSxcbiAgICAgIHdlaWdodHM6IHRoaXMuYWRhcHRlci50b0pTT04oKSxcbiAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBMb2FkIGNoZWNrcG9pbnRcbiAgICovXG4gIGxvYWRDaGVja3BvaW50KGluZGV4OiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBjb25zdCBjaGVja3BvaW50ID0gdGhpcy5jaGVja3BvaW50c1tpbmRleF07XG4gICAgaWYgKCFjaGVja3BvaW50KSByZXR1cm4gZmFsc2U7XG5cbiAgICB0aGlzLmFkYXB0ZXIgPSBMb3JhQWRhcHRlci5mcm9tSlNPTihjaGVja3BvaW50LndlaWdodHMpO1xuICAgIHRoaXMuY3VycmVudEVwb2NoID0gY2hlY2twb2ludC5lcG9jaDtcbiAgICB0aGlzLmN1cnJlbnRTdGVwID0gY2hlY2twb2ludC5zdGVwO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBjdXJyZW50IG1ldHJpY3NcbiAgICovXG4gIGdldE1ldHJpY3MoKTogVHJhaW5pbmdNZXRyaWNzIHtcbiAgICByZXR1cm4ge1xuICAgICAgZXBvY2g6IHRoaXMuY3VycmVudEVwb2NoLFxuICAgICAgc3RlcDogdGhpcy5jdXJyZW50U3RlcCxcbiAgICAgIHRyYWluTG9zczogdGhpcy5tZXRyaWNzLmF2Z0xvc3MoMTAwKSxcbiAgICAgIHZhbExvc3M6IHRoaXMubWV0cmljcy5hdmdWYWxMb3NzKDEwKSxcbiAgICAgIGxlYXJuaW5nUmF0ZTogdGhpcy5zY2hlZHVsZXI/LmdldExSKCkgfHwgdGhpcy5jb25maWcubGVhcm5pbmdSYXRlLFxuICAgICAgZ3JhZE5vcm06IDAsXG4gICAgICBzdGVwc1BlclNlY29uZDogdGhpcy5tZXRyaWNzLnN0ZXBzUGVyU2Vjb25kKCksXG4gICAgICBldGFTZWNvbmRzOiB0aGlzLm1ldHJpY3MuZXRhKFxuICAgICAgICAodGhpcy5jb25maWcuZXBvY2hzIC0gdGhpcy5jdXJyZW50RXBvY2gpICogdGhpcy5iYXRjaGVzLmxlbmd0aFxuICAgICAgKSxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhZGFwdGVyXG4gICAqL1xuICBnZXRBZGFwdGVyKCk6IExvcmFBZGFwdGVyIHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBFV0MgbWFuYWdlclxuICAgKi9cbiAgZ2V0RXdjTWFuYWdlcigpOiBFd2NNYW5hZ2VyIHtcbiAgICByZXR1cm4gdGhpcy5ld2NNYW5hZ2VyO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBjaGVja3BvaW50c1xuICAgKi9cbiAgZ2V0Q2hlY2twb2ludHMoKTogQ2hlY2twb2ludFtdIHtcbiAgICByZXR1cm4gWy4uLnRoaXMuY2hlY2twb2ludHNdO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlc2V0IHBpcGVsaW5lXG4gICAqL1xuICByZXNldCgpOiB2b2lkIHtcbiAgICB0aGlzLmJhdGNoZXMgPSBbXTtcbiAgICB0aGlzLmNoZWNrcG9pbnRzID0gW107XG4gICAgdGhpcy5jdXJyZW50RXBvY2ggPSAwO1xuICAgIHRoaXMuY3VycmVudFN0ZXAgPSAwO1xuICAgIHRoaXMuYmVzdFZhbExvc3MgPSBJbmZpbml0eTtcbiAgICB0aGlzLnBhdGllbmNlQ291bnRlciA9IDA7XG4gICAgdGhpcy5tZXRyaWNzLnJlc2V0KCk7XG4gICAgdGhpcy5hZGFwdGVyLnJlc2V0KCk7XG4gIH1cblxuICBwcml2YXRlIHNodWZmbGVCYXRjaGVzKCk6IFRyYWluaW5nQmF0Y2hbXSB7XG4gICAgY29uc3Qgc2h1ZmZsZWQgPSBbLi4udGhpcy5iYXRjaGVzXTtcbiAgICBmb3IgKGxldCBpID0gc2h1ZmZsZWQubGVuZ3RoIC0gMTsgaSA+IDA7IGktLSkge1xuICAgICAgY29uc3QgaiA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChpICsgMSkpO1xuICAgICAgW3NodWZmbGVkW2ldLCBzaHVmZmxlZFtqXV0gPSBbc2h1ZmZsZWRbal0sIHNodWZmbGVkW2ldXTtcbiAgICB9XG4gICAgcmV0dXJuIHNodWZmbGVkO1xuICB9XG59XG5cbi8qKlxuICogVHJhaW5pbmcgRmFjdG9yeVxuICpcbiAqIENyZWF0ZSBwcmUtY29uZmlndXJlZCB0cmFpbmluZyBwaXBlbGluZXMgZm9yIGNvbW1vbiBzY2VuYXJpb3MuXG4gKi9cbmV4cG9ydCBjbGFzcyBUcmFpbmluZ0ZhY3Rvcnkge1xuICAvKipcbiAgICogQ3JlYXRlIHBpcGVsaW5lIGZvciBxdWljayBmaW5lLXR1bmluZ1xuICAgKi9cbiAgc3RhdGljIHF1aWNrRmluZXR1bmUoKTogVHJhaW5pbmdQaXBlbGluZSB7XG4gICAgcmV0dXJuIG5ldyBUcmFpbmluZ1BpcGVsaW5lKHtcbiAgICAgIGxlYXJuaW5nUmF0ZTogMC4wMSxcbiAgICAgIGVwb2NoczogMyxcbiAgICAgIGJhdGNoU2l6ZTogMTYsXG4gICAgICBzY2hlZHVsZXI6ICdjb25zdGFudCcsXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIHBpcGVsaW5lIGZvciBkZWVwIHRyYWluaW5nXG4gICAqL1xuICBzdGF0aWMgZGVlcFRyYWluaW5nKCk6IFRyYWluaW5nUGlwZWxpbmUge1xuICAgIHJldHVybiBuZXcgVHJhaW5pbmdQaXBlbGluZSh7XG4gICAgICBsZWFybmluZ1JhdGU6IDAuMDAxLFxuICAgICAgZXBvY2hzOiA1MCxcbiAgICAgIGJhdGNoU2l6ZTogMzIsXG4gICAgICBzY2hlZHVsZXI6ICd3YXJtdXAnLFxuICAgICAgd2FybXVwU3RlcHM6IDUwMCxcbiAgICAgIGVhcmx5U3RvcHBpbmdQYXRpZW5jZTogNSxcbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgcGlwZWxpbmUgZm9yIGNvbnRpbnVhbCBsZWFybmluZ1xuICAgKi9cbiAgc3RhdGljIGNvbnRpbnVhbExlYXJuaW5nKGV3Y0xhbWJkYTogbnVtYmVyID0gNTAwMCk6IFRyYWluaW5nUGlwZWxpbmUge1xuICAgIHJldHVybiBuZXcgVHJhaW5pbmdQaXBlbGluZSh7XG4gICAgICBsZWFybmluZ1JhdGU6IDAuMDAwNSxcbiAgICAgIGVwb2NoczogMTAsXG4gICAgICBiYXRjaFNpemU6IDE2LFxuICAgICAgc2NoZWR1bGVyOiAnY29zaW5lJyxcbiAgICAgIGV3Y0xhbWJkYSxcbiAgICAgIGVhcmx5U3RvcHBpbmdQYXRpZW5jZTogMTAsXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIHBpcGVsaW5lIGZvciBmZWRlcmF0ZWQgYWdncmVnYXRpb25cbiAgICovXG4gIHN0YXRpYyBmZWRlcmF0ZWRBZ2dyZWdhdGlvbigpOiBUcmFpbmluZ1BpcGVsaW5lIHtcbiAgICByZXR1cm4gbmV3IFRyYWluaW5nUGlwZWxpbmUoe1xuICAgICAgbGVhcm5pbmdSYXRlOiAwLjAwMDEsXG4gICAgICBlcG9jaHM6IDUsXG4gICAgICBiYXRjaFNpemU6IDY0LFxuICAgICAgc2NoZWR1bGVyOiAnbGluZWFyJyxcbiAgICAgIGV3Y0xhbWJkYTogMjAwMCxcbiAgICB9KTtcbiAgfVxufVxuIl19