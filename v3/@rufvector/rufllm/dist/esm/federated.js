/**
 * Federated Learning for SONA
 *
 * Enable distributed learning across ephemeral agents that share
 * trajectories with a central coordinator.
 *
 * Architecture:
 * ```
 * ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
 * │  Agent A    │     │  Agent B    │     │  Agent C    │
 * │ (ephemeral) │     │ (ephemeral) │     │ (ephemeral) │
 * └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
 *        │                   │                   │
 *        │    export()       │    export()       │    export()
 *        ▼                   ▼                   ▼
 *   ┌────────────────────────────────────────────────┐
 *   │            Federated Coordinator               │
 *   │         (persistent, large capacity)           │
 *   └────────────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```typescript
 * import { EphemeralAgent, FederatedCoordinator } from '@rufvector/rufllm';
 *
 * // Create coordinator (persistent)
 * const coordinator = new FederatedCoordinator('coord-1', { hiddenDim: 256 });
 *
 * // Create ephemeral agent
 * const agent = new EphemeralAgent('agent-1', { hiddenDim: 256 });
 *
 * // Agent processes tasks
 * agent.processTask([0.1, 0.2, ...], 0.85);
 * agent.processTask([0.3, 0.4, ...], 0.92);
 *
 * // Export and aggregate before agent terminates
 * const exportData = agent.exportState();
 * const result = coordinator.aggregate(exportData);
 *
 * console.log(`Accepted: ${result.trajectoriesAccepted}`);
 * ```
 */
import { ReasoningBank } from './sona';
/**
 * Default federated config
 */
const DEFAULT_FEDERATED_CONFIG = {
    hiddenDim: 256,
    embeddingDim: 256,
    microLoraRank: 2,
    baseLoraRank: 8,
    trajectoryCapacity: 500,
    patternClusters: 25,
    ewcLambda: 2000,
    qualityThreshold: 0.4,
};
/**
 * Ephemeral Agent for federated learning
 *
 * Collects trajectories during its session and exports state before termination.
 *
 * @example
 * ```typescript
 * const agent = new EphemeralAgent('agent-1', { hiddenDim: 256 });
 *
 * // Process tasks during session
 * agent.processTask(embedding1, 0.85);
 * agent.processTaskWithRoute(embedding2, 0.92, 'code-model');
 *
 * // Export before termination
 * const exportData = agent.exportState();
 * ```
 */
export class EphemeralAgent {
    constructor(agentId, config) {
        this.trajectories = [];
        this.qualitySamples = [];
        this.loraWeights = [];
        this.agentId = agentId;
        this.config = { ...DEFAULT_FEDERATED_CONFIG, ...config };
        this.startTime = Date.now();
        this.reasoningBank = new ReasoningBank(0.7);
        // Initialize micro-LoRA weights
        this.loraWeights = new Array(this.config.hiddenDim * this.config.microLoraRank)
            .fill(0)
            .map(() => (Math.random() - 0.5) * 0.01);
    }
    /**
     * Get agent ID
     */
    getAgentId() {
        return this.agentId;
    }
    /**
     * Process a task and record trajectory
     */
    processTrajectory(embedding, activations, quality, route, context = []) {
        const now = Date.now();
        // Store trajectory for export
        this.trajectories.push({
            embedding: [...embedding],
            quality,
            route,
            context: [...context],
            timestamp: now,
        });
        this.qualitySamples.push(quality);
        // Store in local reasoning bank if high quality
        if (quality >= 0.7) {
            this.reasoningBank.store('query_response', embedding);
        }
        // Update local LoRA weights based on quality
        this.updateLoraWeights(embedding, quality);
    }
    /**
     * Simple process task method
     */
    processTask(embedding, quality) {
        this.processTrajectory(embedding, embedding, quality);
    }
    /**
     * Process task with route information
     */
    processTaskWithRoute(embedding, quality, route) {
        this.processTrajectory(embedding, embedding, quality, route);
    }
    /**
     * Apply micro-LoRA to hidden states
     */
    applyMicroLora(input, output) {
        const rank = this.config.microLoraRank;
        const dim = Math.min(input.length, this.config.hiddenDim);
        // Simple low-rank decomposition: output = input + A @ B @ input
        // A is (dim x rank), B is (rank x dim)
        for (let i = 0; i < dim; i++) {
            let delta = 0;
            for (let r = 0; r < rank; r++) {
                let bSum = 0;
                for (let j = 0; j < dim; j++) {
                    const bIdx = r * dim + j;
                    if (bIdx < this.loraWeights.length) {
                        bSum += this.loraWeights[bIdx] * (input[j] || 0);
                    }
                }
                const aIdx = i * rank + r;
                if (aIdx < this.loraWeights.length) {
                    delta += this.loraWeights[aIdx] * bSum;
                }
            }
            output[i] = (input[i] || 0) + delta * 0.1; // Scale factor
        }
    }
    /**
     * Get number of collected trajectories
     */
    trajectoryCount() {
        return this.trajectories.length;
    }
    /**
     * Get average quality
     */
    avgQuality() {
        if (this.qualitySamples.length === 0)
            return 0;
        return this.qualitySamples.reduce((a, b) => a + b, 0) / this.qualitySamples.length;
    }
    /**
     * Get uptime in seconds
     */
    uptimeSeconds() {
        return Math.floor((Date.now() - this.startTime) / 1000);
    }
    /**
     * Get agent stats
     */
    stats() {
        return {
            totalTrajectories: this.trajectories.length,
            avgQuality: this.avgQuality(),
            patternsLearned: this.reasoningBank.stats().totalPatterns,
        };
    }
    /**
     * Force local learning
     */
    forceLearn() {
        // Prune low-performing patterns
        const pruned = this.reasoningBank.prune(0.3, 3);
        return `Pruned ${pruned} patterns, ${this.reasoningBank.stats().totalPatterns} remaining`;
    }
    /**
     * Get learned patterns
     */
    getPatterns() {
        return this.reasoningBank.getByType('query_response');
    }
    /**
     * Clear trajectories (after export)
     */
    clear() {
        this.trajectories = [];
        this.qualitySamples = [];
    }
    /**
     * Export agent state for federation
     *
     * Call this before terminating the agent.
     */
    exportState() {
        // Force learning before export
        this.forceLearn();
        return {
            agentId: this.agentId,
            trajectories: [...this.trajectories],
            stats: this.stats(),
            sessionDurationMs: Date.now() - this.startTime,
            timestamp: Date.now(),
        };
    }
    /**
     * Serialize to JSON
     */
    toJSON() {
        return JSON.stringify(this.exportState());
    }
    updateLoraWeights(embedding, quality) {
        // Simple gradient update based on quality
        const lr = 0.001 * quality;
        const dim = Math.min(embedding.length, this.config.hiddenDim);
        for (let i = 0; i < Math.min(dim, this.loraWeights.length); i++) {
            const grad = embedding[i % embedding.length] * (quality - 0.5);
            this.loraWeights[i] += lr * grad;
        }
    }
}
/**
 * Federated Learning Coordinator
 *
 * Aggregates learning from multiple ephemeral agents.
 *
 * @example
 * ```typescript
 * const coordinator = new FederatedCoordinator('coord-1', { hiddenDim: 256 });
 *
 * // Aggregate exports from multiple agents
 * for (const agentExport of agentExports) {
 *   const result = coordinator.aggregate(agentExport);
 *   console.log(`Agent ${result.agentId}: ${result.trajectoriesAccepted} accepted`);
 * }
 *
 * // Get coordinator statistics
 * const stats = coordinator.stats();
 * console.log(`Total patterns: ${stats.patternsLearned}`);
 * ```
 */
export class FederatedCoordinator {
    constructor(coordinatorId, config) {
        this.contributions = new Map();
        this.totalTrajectories = 0;
        this.consolidationInterval = 50;
        this.qualitySamples = [];
        this.masterLoraWeights = [];
        this.coordinatorId = coordinatorId;
        this.config = {
            ...DEFAULT_FEDERATED_CONFIG,
            trajectoryCapacity: 50000, // Large capacity for coordinator
            patternClusters: 200,
            baseLoraRank: 16, // Deeper for aggregation
            ...config,
        };
        this.reasoningBank = new ReasoningBank(this.config.qualityThreshold);
        // Initialize master LoRA weights
        this.masterLoraWeights = new Array(this.config.hiddenDim * this.config.baseLoraRank)
            .fill(0)
            .map(() => (Math.random() - 0.5) * 0.01);
    }
    /**
     * Get coordinator ID
     */
    getCoordinatorId() {
        return this.coordinatorId;
    }
    /**
     * Set quality threshold for accepting trajectories
     */
    setQualityThreshold(threshold) {
        this.config.qualityThreshold = threshold;
    }
    /**
     * Set consolidation interval
     */
    setConsolidationInterval(interval) {
        this.consolidationInterval = interval;
    }
    /**
     * Aggregate agent export into coordinator
     */
    aggregate(exportData) {
        let accepted = 0;
        let rejected = 0;
        // Replay trajectories into master
        for (const traj of exportData.trajectories) {
            if (traj.quality >= this.config.qualityThreshold) {
                // Store pattern
                const patternType = this.routeToPatternType(traj.route);
                this.reasoningBank.store(patternType, traj.embedding);
                this.qualitySamples.push(traj.quality);
                // Update master LoRA weights
                this.updateMasterLora(traj.embedding, traj.quality);
                accepted++;
            }
            else {
                rejected++;
            }
        }
        this.totalTrajectories += accepted;
        // Record contribution
        this.contributions.set(exportData.agentId, {
            trajectoryCount: exportData.trajectories.length,
            avgQuality: exportData.stats.avgQuality,
            timestamp: Date.now(),
            sessionDurationMs: exportData.sessionDurationMs,
        });
        // Auto-consolidate if needed
        const consolidated = this.shouldConsolidate();
        if (consolidated) {
            this.forceConsolidate();
        }
        return {
            agentId: exportData.agentId,
            trajectoriesAccepted: accepted,
            trajectoriesRejected: rejected,
            consolidated,
            totalAgents: this.contributions.size,
            totalTrajectories: this.totalTrajectories,
        };
    }
    /**
     * Force consolidation (learning)
     */
    forceConsolidate() {
        const pruned = this.reasoningBank.prune(0.3, 5);
        return `Consolidated: pruned ${pruned} patterns, ${this.reasoningBank.stats().totalPatterns} remaining`;
    }
    /**
     * Consolidate learning (alias)
     */
    consolidate() {
        return this.forceConsolidate();
    }
    /**
     * Get initial patterns for new agents (warm start)
     */
    getInitialPatterns(k = 10) {
        const allPatterns = [
            ...this.reasoningBank.getByType('query_response'),
            ...this.reasoningBank.getByType('routing'),
        ];
        // Sort by success rate and return top k
        return allPatterns
            .sort((a, b) => b.successRate - a.successRate)
            .slice(0, k);
    }
    /**
     * Get all learned patterns
     */
    getAllPatterns() {
        return [
            ...this.reasoningBank.getByType('query_response'),
            ...this.reasoningBank.getByType('routing'),
            ...this.reasoningBank.getByType('context_retrieval'),
            ...this.reasoningBank.getByType('correction'),
        ];
    }
    /**
     * Find similar patterns
     */
    findPatterns(query, k) {
        return this.reasoningBank.findSimilar(query, k);
    }
    /**
     * Apply coordinator's LoRA to input
     * OPTIMIZED: Pre-compute hidden layer once, reuse typed arrays
     */
    applyLora(input) {
        const rank = this.config.baseLoraRank;
        const dim = Math.min(input.length, this.config.hiddenDim);
        const weightsLen = this.masterLoraWeights.length;
        // Pre-compute hidden layer (input @ B)
        const hidden = new Float64Array(rank);
        for (let r = 0; r < rank; r++) {
            let sum = 0;
            const baseIdx = r * dim;
            // Unroll the inner loop
            let j = 0;
            for (; j + 3 < dim && baseIdx + j + 3 < weightsLen; j += 4) {
                sum += this.masterLoraWeights[baseIdx + j] * (input[j] || 0) +
                    this.masterLoraWeights[baseIdx + j + 1] * (input[j + 1] || 0) +
                    this.masterLoraWeights[baseIdx + j + 2] * (input[j + 2] || 0) +
                    this.masterLoraWeights[baseIdx + j + 3] * (input[j + 3] || 0);
            }
            for (; j < dim && baseIdx + j < weightsLen; j++) {
                sum += this.masterLoraWeights[baseIdx + j] * (input[j] || 0);
            }
            hidden[r] = sum;
        }
        // Compute output (hidden @ A + input)
        const output = new Array(input.length);
        for (let i = 0; i < input.length; i++) {
            if (i < dim) {
                let delta = 0;
                const baseIdx = i * rank;
                for (let r = 0; r < rank && baseIdx + r < weightsLen; r++) {
                    delta += this.masterLoraWeights[baseIdx + r] * hidden[r];
                }
                output[i] = (input[i] || 0) + delta * 0.1;
            }
            else {
                output[i] = input[i] || 0;
            }
        }
        return output;
    }
    /**
     * Get coordinator statistics
     */
    stats() {
        const avgQuality = this.qualitySamples.length > 0
            ? this.qualitySamples.reduce((a, b) => a + b, 0) / this.qualitySamples.length
            : 0;
        return {
            coordinatorId: this.coordinatorId,
            totalAgents: this.contributions.size,
            totalTrajectories: this.totalTrajectories,
            patternsLearned: this.reasoningBank.stats().totalPatterns,
            avgQuality,
            qualityThreshold: this.config.qualityThreshold,
        };
    }
    /**
     * Get contribution history
     */
    getContributions() {
        return new Map(this.contributions);
    }
    /**
     * Get total agent count
     */
    agentCount() {
        return this.contributions.size;
    }
    /**
     * Get total trajectory count
     */
    getTotalTrajectories() {
        return this.totalTrajectories;
    }
    /**
     * Clear all contributions
     */
    clear() {
        this.contributions.clear();
        this.totalTrajectories = 0;
        this.qualitySamples = [];
    }
    /**
     * Export coordinator state
     */
    toJSON() {
        return JSON.stringify({
            coordinatorId: this.coordinatorId,
            stats: this.stats(),
            contributions: Object.fromEntries(this.contributions),
            patterns: this.getAllPatterns(),
        });
    }
    /**
     * Create agent with coordinator's learned patterns
     */
    createAgent(agentId) {
        const agent = new EphemeralAgent(agentId, {
            hiddenDim: this.config.hiddenDim,
            embeddingDim: this.config.embeddingDim,
            microLoraRank: this.config.microLoraRank,
        });
        // Warm start: process initial patterns as positive examples
        const initialPatterns = this.getInitialPatterns(5);
        for (const pattern of initialPatterns) {
            agent.processTask(pattern.embedding, pattern.successRate);
        }
        return agent;
    }
    shouldConsolidate() {
        return this.contributions.size % this.consolidationInterval === 0 &&
            this.contributions.size > 0;
    }
    routeToPatternType(route) {
        if (!route)
            return 'query_response';
        if (route.includes('code'))
            return 'query_response';
        if (route.includes('route'))
            return 'routing';
        if (route.includes('memory'))
            return 'context_retrieval';
        return 'query_response';
    }
    updateMasterLora(embedding, quality) {
        const lr = 0.0005 * quality; // Slower learning for coordinator
        const dim = Math.min(embedding.length, this.config.hiddenDim);
        for (let i = 0; i < Math.min(dim, this.masterLoraWeights.length); i++) {
            const grad = embedding[i % embedding.length] * (quality - 0.5);
            this.masterLoraWeights[i] += lr * grad;
            // EWC regularization - prevent large weight changes
            const penalty = this.config.ewcLambda * this.masterLoraWeights[i] * 0.0001;
            this.masterLoraWeights[i] -= penalty;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmVkZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2ZlZGVyYXRlZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0F5Q0c7QUFjSCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBRXZDOztHQUVHO0FBQ0gsTUFBTSx3QkFBd0IsR0FBOEI7SUFDMUQsU0FBUyxFQUFFLEdBQUc7SUFDZCxZQUFZLEVBQUUsR0FBRztJQUNqQixhQUFhLEVBQUUsQ0FBQztJQUNoQixZQUFZLEVBQUUsQ0FBQztJQUNmLGtCQUFrQixFQUFFLEdBQUc7SUFDdkIsZUFBZSxFQUFFLEVBQUU7SUFDbkIsU0FBUyxFQUFFLElBQUk7SUFDZixnQkFBZ0IsRUFBRSxHQUFHO0NBQ3RCLENBQUM7QUFFRjs7Ozs7Ozs7Ozs7Ozs7OztHQWdCRztBQUNILE1BQU0sT0FBTyxjQUFjO0lBU3pCLFlBQVksT0FBZSxFQUFFLE1BQXdCO1FBTjdDLGlCQUFZLEdBQXVCLEVBQUUsQ0FBQztRQUV0QyxtQkFBYyxHQUFhLEVBQUUsQ0FBQztRQUU5QixnQkFBVyxHQUFhLEVBQUUsQ0FBQztRQUdqQyxJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUN2QixJQUFJLENBQUMsTUFBTSxHQUFHLEVBQUUsR0FBRyx3QkFBd0IsRUFBRSxHQUFHLE1BQU0sRUFBRSxDQUFDO1FBQ3pELElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQzVCLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFNUMsZ0NBQWdDO1FBQ2hDLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUM7YUFD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QUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxJQUFJLE9BQU8sQ0FBQztRQUN2QyxDQUFDO0lBQ0gsQ0FBQztDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBGZWRlcmF0ZWQgTGVhcm5pbmcgZm9yIFNPTkFcbiAqXG4gKiBFbmFibGUgZGlzdHJpYnV0ZWQgbGVhcm5pbmcgYWNyb3NzIGVwaGVtZXJhbCBhZ2VudHMgdGhhdCBzaGFyZVxuICogdHJhamVjdG9yaWVzIHdpdGggYSBjZW50cmFsIGNvb3JkaW5hdG9yLlxuICpcbiAqIEFyY2hpdGVjdHVyZTpcbiAqIGBgYFxuICog4pSM4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSQICAgICDilIzilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilJAgICAgIOKUjOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUkFxuICog4pSCICBBZ2VudCBBICAgIOKUgiAgICAg4pSCICBBZ2VudCBCICAgIOKUgiAgICAg4pSCICBBZ2VudCBDICAgIOKUglxuICog4pSCIChlcGhlbWVyYWwpIOKUgiAgICAg4pSCIChlcGhlbWVyYWwpIOKUgiAgICAg4pSCIChlcGhlbWVyYWwpIOKUglxuICog4pSU4pSA4pSA4pSA4pSA4pSA4pSA4pSs4pSA4pSA4pSA4pSA4pSA4pSA4pSYICAgICDilJTilIDilIDilIDilIDilIDilIDilKzilIDilIDilIDilIDilIDilIDilJggICAgIOKUlOKUgOKUgOKUgOKUgOKUgOKUgOKUrOKUgOKUgOKUgOKUgOKUgOKUgOKUmFxuICogICAgICAgIOKUgiAgICAgICAgICAgICAgICAgICDilIIgICAgICAgICAgICAgICAgICAg4pSCXG4gKiAgICAgICAg4pSCICAgIGV4cG9ydCgpICAgICAgIOKUgiAgICBleHBvcnQoKSAgICAgICDilIIgICAgZXhwb3J0KClcbiAqICAgICAgICDilrwgICAgICAgICAgICAgICAgICAg4pa8ICAgICAgICAgICAgICAgICAgIOKWvFxuICogICDilIzilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilJBcbiAqICAg4pSCICAgICAgICAgICAgRmVkZXJhdGVkIENvb3JkaW5hdG9yICAgICAgICAgICAgICAg4pSCXG4gKiAgIOKUgiAgICAgICAgIChwZXJzaXN0ZW50LCBsYXJnZSBjYXBhY2l0eSkgICAgICAgICAgIOKUglxuICogICDilJTilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilJhcbiAqIGBgYFxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBpbXBvcnQgeyBFcGhlbWVyYWxBZ2VudCwgRmVkZXJhdGVkQ29vcmRpbmF0b3IgfSBmcm9tICdAcnVmdmVjdG9yL3J1ZmxsbSc7XG4gKlxuICogLy8gQ3JlYXRlIGNvb3JkaW5hdG9yIChwZXJzaXN0ZW50KVxuICogY29uc3QgY29vcmRpbmF0b3IgPSBuZXcgRmVkZXJhdGVkQ29vcmRpbmF0b3IoJ2Nvb3JkLTEnLCB7IGhpZGRlbkRpbTogMjU2IH0pO1xuICpcbiAqIC8vIENyZWF0ZSBlcGhlbWVyYWwgYWdlbnRcbiAqIGNvbnN0IGFnZW50ID0gbmV3IEVwaGVtZXJhbEFnZW50KCdhZ2VudC0xJywgeyBoaWRkZW5EaW06IDI1NiB9KTtcbiAqXG4gKiAvLyBBZ2VudCBwcm9jZXNzZXMgdGFza3NcbiAqIGFnZW50LnByb2Nlc3NUYXNrKFswLjEsIDAuMiwgLi4uXSwgMC44NSk7XG4gKiBhZ2VudC5wcm9jZXNzVGFzayhbMC4zLCAwLjQsIC4uLl0sIDAuOTIpO1xuICpcbiAqIC8vIEV4cG9ydCBhbmQgYWdncmVnYXRlIGJlZm9yZSBhZ2VudCB0ZXJtaW5hdGVzXG4gKiBjb25zdCBleHBvcnREYXRhID0gYWdlbnQuZXhwb3J0U3RhdGUoKTtcbiAqIGNvbnN0IHJlc3VsdCA9IGNvb3JkaW5hdG9yLmFnZ3JlZ2F0ZShleHBvcnREYXRhKTtcbiAqXG4gKiBjb25zb2xlLmxvZyhgQWNjZXB0ZWQ6ICR7cmVzdWx0LnRyYWplY3Rvcmllc0FjY2VwdGVkfWApO1xuICogYGBgXG4gKi9cblxuaW1wb3J0IHtcbiAgRW1iZWRkaW5nLFxuICBMZWFybmVkUGF0dGVybixcbiAgUGF0dGVyblR5cGUsXG4gIEZlZGVyYXRlZENvbmZpZyxcbiAgVHJhamVjdG9yeUV4cG9ydCxcbiAgQWdlbnRFeHBvcnRTdGF0cyxcbiAgQWdlbnRFeHBvcnQsXG4gIEFnZW50Q29udHJpYnV0aW9uLFxuICBBZ2dyZWdhdGlvblJlc3VsdCxcbiAgQ29vcmRpbmF0b3JTdGF0cyxcbn0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBSZWFzb25pbmdCYW5rIH0gZnJvbSAnLi9zb25hJztcblxuLyoqXG4gKiBEZWZhdWx0IGZlZGVyYXRlZCBjb25maWdcbiAqL1xuY29uc3QgREVGQVVMVF9GRURFUkFURURfQ09ORklHOiBSZXF1aXJlZDxGZWRlcmF0ZWRDb25maWc+ID0ge1xuICBoaWRkZW5EaW06IDI1NixcbiAgZW1iZWRkaW5nRGltOiAyNTYsXG4gIG1pY3JvTG9yYVJhbms6IDIsXG4gIGJhc2VMb3JhUmFuazogOCxcbiAgdHJhamVjdG9yeUNhcGFjaXR5OiA1MDAsXG4gIHBhdHRlcm5DbHVzdGVyczogMjUsXG4gIGV3Y0xhbWJkYTogMjAwMCxcbiAgcXVhbGl0eVRocmVzaG9sZDogMC40LFxufTtcblxuLyoqXG4gKiBFcGhlbWVyYWwgQWdlbnQgZm9yIGZlZGVyYXRlZCBsZWFybmluZ1xuICpcbiAqIENvbGxlY3RzIHRyYWplY3RvcmllcyBkdXJpbmcgaXRzIHNlc3Npb24gYW5kIGV4cG9ydHMgc3RhdGUgYmVmb3JlIHRlcm1pbmF0aW9uLlxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBjb25zdCBhZ2VudCA9IG5ldyBFcGhlbWVyYWxBZ2VudCgnYWdlbnQtMScsIHsgaGlkZGVuRGltOiAyNTYgfSk7XG4gKlxuICogLy8gUHJvY2VzcyB0YXNrcyBkdXJpbmcgc2Vzc2lvblxuICogYWdlbnQucHJvY2Vzc1Rhc2soZW1iZWRkaW5nMSwgMC44NSk7XG4gKiBhZ2VudC5wcm9jZXNzVGFza1dpdGhSb3V0ZShlbWJlZGRpbmcyLCAwLjkyLCAnY29kZS1tb2RlbCcpO1xuICpcbiAqIC8vIEV4cG9ydCBiZWZvcmUgdGVybWluYXRpb25cbiAqIGNvbnN0IGV4cG9ydERhdGEgPSBhZ2VudC5leHBvcnRTdGF0ZSgpO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBFcGhlbWVyYWxBZ2VudCB7XG4gIHByaXZhdGUgYWdlbnRJZDogc3RyaW5nO1xuICBwcml2YXRlIGNvbmZpZzogUmVxdWlyZWQ8RmVkZXJhdGVkQ29uZmlnPjtcbiAgcHJpdmF0ZSB0cmFqZWN0b3JpZXM6IFRyYWplY3RvcnlFeHBvcnRbXSA9IFtdO1xuICBwcml2YXRlIHN0YXJ0VGltZTogbnVtYmVyO1xuICBwcml2YXRlIHF1YWxpdHlTYW1wbGVzOiBudW1iZXJbXSA9IFtdO1xuICBwcml2YXRlIHJlYXNvbmluZ0Jhbms6IFJlYXNvbmluZ0Jhbms7XG4gIHByaXZhdGUgbG9yYVdlaWdodHM6IG51bWJlcltdID0gW107XG5cbiAgY29uc3RydWN0b3IoYWdlbnRJZDogc3RyaW5nLCBjb25maWc/OiBGZWRlcmF0ZWRDb25maWcpIHtcbiAgICB0aGlzLmFnZW50SWQgPSBhZ2VudElkO1xuICAgIHRoaXMuY29uZmlnID0geyAuLi5ERUZBVUxUX0ZFREVSQVRFRF9DT05GSUcsIC4uLmNvbmZpZyB9O1xuICAgIHRoaXMuc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICB0aGlzLnJlYXNvbmluZ0JhbmsgPSBuZXcgUmVhc29uaW5nQmFuaygwLjcpO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBtaWNyby1Mb1JBIHdlaWdodHNcbiAgICB0aGlzLmxvcmFXZWlnaHRzID0gbmV3IEFycmF5KHRoaXMuY29uZmlnLmhpZGRlbkRpbSAqIHRoaXMuY29uZmlnLm1pY3JvTG9yYVJhbmspXG4gICAgICAuZmlsbCgwKVxuICAgICAgLm1hcCgoKSA9PiAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiAwLjAxKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYWdlbnQgSURcbiAgICovXG4gIGdldEFnZW50SWQoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5hZ2VudElkO1xuICB9XG5cbiAgLyoqXG4gICAqIFByb2Nlc3MgYSB0YXNrIGFuZCByZWNvcmQgdHJhamVjdG9yeVxuICAgKi9cbiAgcHJvY2Vzc1RyYWplY3RvcnkoXG4gICAgZW1iZWRkaW5nOiBFbWJlZGRpbmcsXG4gICAgYWN0aXZhdGlvbnM6IEVtYmVkZGluZyxcbiAgICBxdWFsaXR5OiBudW1iZXIsXG4gICAgcm91dGU/OiBzdHJpbmcsXG4gICAgY29udGV4dDogc3RyaW5nW10gPSBbXVxuICApOiB2b2lkIHtcbiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXG4gICAgLy8gU3RvcmUgdHJhamVjdG9yeSBmb3IgZXhwb3J0XG4gICAgdGhpcy50cmFqZWN0b3JpZXMucHVzaCh7XG4gICAgICBlbWJlZGRpbmc6IFsuLi5lbWJlZGRpbmddLFxuICAgICAgcXVhbGl0eSxcbiAgICAgIHJvdXRlLFxuICAgICAgY29udGV4dDogWy4uLmNvbnRleHRdLFxuICAgICAgdGltZXN0YW1wOiBub3csXG4gICAgfSk7XG5cbiAgICB0aGlzLnF1YWxpdHlTYW1wbGVzLnB1c2gocXVhbGl0eSk7XG5cbiAgICAvLyBTdG9yZSBpbiBsb2NhbCByZWFzb25pbmcgYmFuayBpZiBoaWdoIHF1YWxpdHlcbiAgICBpZiAocXVhbGl0eSA+PSAwLjcpIHtcbiAgICAgIHRoaXMucmVhc29uaW5nQmFuay5zdG9yZSgncXVlcnlfcmVzcG9uc2UnLCBlbWJlZGRpbmcpO1xuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBsb2NhbCBMb1JBIHdlaWdodHMgYmFzZWQgb24gcXVhbGl0eVxuICAgIHRoaXMudXBkYXRlTG9yYVdlaWdodHMoZW1iZWRkaW5nLCBxdWFsaXR5KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTaW1wbGUgcHJvY2VzcyB0YXNrIG1ldGhvZFxuICAgKi9cbiAgcHJvY2Vzc1Rhc2soZW1iZWRkaW5nOiBFbWJlZGRpbmcsIHF1YWxpdHk6IG51bWJlcik6IHZvaWQge1xuICAgIHRoaXMucHJvY2Vzc1RyYWplY3RvcnkoZW1iZWRkaW5nLCBlbWJlZGRpbmcsIHF1YWxpdHkpO1xuICB9XG5cbiAgLyoqXG4gICAqIFByb2Nlc3MgdGFzayB3aXRoIHJvdXRlIGluZm9ybWF0aW9uXG4gICAqL1xuICBwcm9jZXNzVGFza1dpdGhSb3V0ZShlbWJlZGRpbmc6IEVtYmVkZGluZywgcXVhbGl0eTogbnVtYmVyLCByb3V0ZTogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy5wcm9jZXNzVHJhamVjdG9yeShlbWJlZGRpbmcsIGVtYmVkZGluZywgcXVhbGl0eSwgcm91dGUpO1xuICB9XG5cbiAgLyoqXG4gICAqIEFwcGx5IG1pY3JvLUxvUkEgdG8gaGlkZGVuIHN0YXRlc1xuICAgKi9cbiAgYXBwbHlNaWNyb0xvcmEoaW5wdXQ6IG51bWJlcltdLCBvdXRwdXQ6IG51bWJlcltdKTogdm9pZCB7XG4gICAgY29uc3QgcmFuayA9IHRoaXMuY29uZmlnLm1pY3JvTG9yYVJhbms7XG4gICAgY29uc3QgZGltID0gTWF0aC5taW4oaW5wdXQubGVuZ3RoLCB0aGlzLmNvbmZpZy5oaWRkZW5EaW0pO1xuXG4gICAgLy8gU2ltcGxlIGxvdy1yYW5rIGRlY29tcG9zaXRpb246IG91dHB1dCA9IGlucHV0ICsgQSBAIEIgQCBpbnB1dFxuICAgIC8vIEEgaXMgKGRpbSB4IHJhbmspLCBCIGlzIChyYW5rIHggZGltKVxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZGltOyBpKyspIHtcbiAgICAgIGxldCBkZWx0YSA9IDA7XG4gICAgICBmb3IgKGxldCByID0gMDsgciA8IHJhbms7IHIrKykge1xuICAgICAgICBsZXQgYlN1bSA9IDA7XG4gICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgZGltOyBqKyspIHtcbiAgICAgICAgICBjb25zdCBiSWR4ID0gciAqIGRpbSArIGo7XG4gICAgICAgICAgaWYgKGJJZHggPCB0aGlzLmxvcmFXZWlnaHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgYlN1bSArPSB0aGlzLmxvcmFXZWlnaHRzW2JJZHhdICogKGlucHV0W2pdIHx8IDApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjb25zdCBhSWR4ID0gaSAqIHJhbmsgKyByO1xuICAgICAgICBpZiAoYUlkeCA8IHRoaXMubG9yYVdlaWdodHMubGVuZ3RoKSB7XG4gICAgICAgICAgZGVsdGEgKz0gdGhpcy5sb3JhV2VpZ2h0c1thSWR4XSAqIGJTdW07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIG91dHB1dFtpXSA9IChpbnB1dFtpXSB8fCAwKSArIGRlbHRhICogMC4xOyAvLyBTY2FsZSBmYWN0b3JcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogR2V0IG51bWJlciBvZiBjb2xsZWN0ZWQgdHJhamVjdG9yaWVzXG4gICAqL1xuICB0cmFqZWN0b3J5Q291bnQoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy50cmFqZWN0b3JpZXMubGVuZ3RoO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBhdmVyYWdlIHF1YWxpdHlcbiAgICovXG4gIGF2Z1F1YWxpdHkoKTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy5xdWFsaXR5U2FtcGxlcy5sZW5ndGggPT09IDApIHJldHVybiAwO1xuICAgIHJldHVybiB0aGlzLnF1YWxpdHlTYW1wbGVzLnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApIC8gdGhpcy5xdWFsaXR5U2FtcGxlcy5sZW5ndGg7XG4gIH1cblxuICAvKipcbiAgICogR2V0IHVwdGltZSBpbiBzZWNvbmRzXG4gICAqL1xuICB1cHRpbWVTZWNvbmRzKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIE1hdGguZmxvb3IoKERhdGUubm93KCkgLSB0aGlzLnN0YXJ0VGltZSkgLyAxMDAwKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYWdlbnQgc3RhdHNcbiAgICovXG4gIHN0YXRzKCk6IEFnZW50RXhwb3J0U3RhdHMge1xuICAgIHJldHVybiB7XG4gICAgICB0b3RhbFRyYWplY3RvcmllczogdGhpcy50cmFqZWN0b3JpZXMubGVuZ3RoLFxuICAgICAgYXZnUXVhbGl0eTogdGhpcy5hdmdRdWFsaXR5KCksXG4gICAgICBwYXR0ZXJuc0xlYXJuZWQ6IHRoaXMucmVhc29uaW5nQmFuay5zdGF0cygpLnRvdGFsUGF0dGVybnMsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBGb3JjZSBsb2NhbCBsZWFybmluZ1xuICAgKi9cbiAgZm9yY2VMZWFybigpOiBzdHJpbmcge1xuICAgIC8vIFBydW5lIGxvdy1wZXJmb3JtaW5nIHBhdHRlcm5zXG4gICAgY29uc3QgcHJ1bmVkID0gdGhpcy5yZWFzb25pbmdCYW5rLnBydW5lKDAuMywgMyk7XG4gICAgcmV0dXJuIGBQcnVuZWQgJHtwcnVuZWR9IHBhdHRlcm5zLCAke3RoaXMucmVhc29uaW5nQmFuay5zdGF0cygpLnRvdGFsUGF0dGVybnN9IHJlbWFpbmluZ2A7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGxlYXJuZWQgcGF0dGVybnNcbiAgICovXG4gIGdldFBhdHRlcm5zKCk6IExlYXJuZWRQYXR0ZXJuW10ge1xuICAgIHJldHVybiB0aGlzLnJlYXNvbmluZ0JhbmsuZ2V0QnlUeXBlKCdxdWVyeV9yZXNwb25zZScpO1xuICB9XG5cbiAgLyoqXG4gICAqIENsZWFyIHRyYWplY3RvcmllcyAoYWZ0ZXIgZXhwb3J0KVxuICAgKi9cbiAgY2xlYXIoKTogdm9pZCB7XG4gICAgdGhpcy50cmFqZWN0b3JpZXMgPSBbXTtcbiAgICB0aGlzLnF1YWxpdHlTYW1wbGVzID0gW107XG4gIH1cblxuICAvKipcbiAgICogRXhwb3J0IGFnZW50IHN0YXRlIGZvciBmZWRlcmF0aW9uXG4gICAqXG4gICAqIENhbGwgdGhpcyBiZWZvcmUgdGVybWluYXRpbmcgdGhlIGFnZW50LlxuICAgKi9cbiAgZXhwb3J0U3RhdGUoKTogQWdlbnRFeHBvcnQge1xuICAgIC8vIEZvcmNlIGxlYXJuaW5nIGJlZm9yZSBleHBvcnRcbiAgICB0aGlzLmZvcmNlTGVhcm4oKTtcblxuICAgIHJldHVybiB7XG4gICAgICBhZ2VudElkOiB0aGlzLmFnZW50SWQsXG4gICAgICB0cmFqZWN0b3JpZXM6IFsuLi50aGlzLnRyYWplY3Rvcmllc10sXG4gICAgICBzdGF0czogdGhpcy5zdGF0cygpLFxuICAgICAgc2Vzc2lvbkR1cmF0aW9uTXM6IERhdGUubm93KCkgLSB0aGlzLnN0YXJ0VGltZSxcbiAgICAgIHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFNlcmlhbGl6ZSB0byBKU09OXG4gICAqL1xuICB0b0pTT04oKTogc3RyaW5nIHtcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodGhpcy5leHBvcnRTdGF0ZSgpKTtcbiAgfVxuXG4gIHByaXZhdGUgdXBkYXRlTG9yYVdlaWdodHMoZW1iZWRkaW5nOiBFbWJlZGRpbmcsIHF1YWxpdHk6IG51bWJlcik6IHZvaWQge1xuICAgIC8vIFNpbXBsZSBncmFkaWVudCB1cGRhdGUgYmFzZWQgb24gcXVhbGl0eVxuICAgIGNvbnN0IGxyID0gMC4wMDEgKiBxdWFsaXR5O1xuICAgIGNvbnN0IGRpbSA9IE1hdGgubWluKGVtYmVkZGluZy5sZW5ndGgsIHRoaXMuY29uZmlnLmhpZGRlbkRpbSk7XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IE1hdGgubWluKGRpbSwgdGhpcy5sb3JhV2VpZ2h0cy5sZW5ndGgpOyBpKyspIHtcbiAgICAgIGNvbnN0IGdyYWQgPSBlbWJlZGRpbmdbaSAlIGVtYmVkZGluZy5sZW5ndGhdICogKHF1YWxpdHkgLSAwLjUpO1xuICAgICAgdGhpcy5sb3JhV2VpZ2h0c1tpXSArPSBsciAqIGdyYWQ7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogRmVkZXJhdGVkIExlYXJuaW5nIENvb3JkaW5hdG9yXG4gKlxuICogQWdncmVnYXRlcyBsZWFybmluZyBmcm9tIG11bHRpcGxlIGVwaGVtZXJhbCBhZ2VudHMuXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGNvbnN0IGNvb3JkaW5hdG9yID0gbmV3IEZlZGVyYXRlZENvb3JkaW5hdG9yKCdjb29yZC0xJywgeyBoaWRkZW5EaW06IDI1NiB9KTtcbiAqXG4gKiAvLyBBZ2dyZWdhdGUgZXhwb3J0cyBmcm9tIG11bHRpcGxlIGFnZW50c1xuICogZm9yIChjb25zdCBhZ2VudEV4cG9ydCBvZiBhZ2VudEV4cG9ydHMpIHtcbiAqICAgY29uc3QgcmVzdWx0ID0gY29vcmRpbmF0b3IuYWdncmVnYXRlKGFnZW50RXhwb3J0KTtcbiAqICAgY29uc29sZS5sb2coYEFnZW50ICR7cmVzdWx0LmFnZW50SWR9OiAke3Jlc3VsdC50cmFqZWN0b3JpZXNBY2NlcHRlZH0gYWNjZXB0ZWRgKTtcbiAqIH1cbiAqXG4gKiAvLyBHZXQgY29vcmRpbmF0b3Igc3RhdGlzdGljc1xuICogY29uc3Qgc3RhdHMgPSBjb29yZGluYXRvci5zdGF0cygpO1xuICogY29uc29sZS5sb2coYFRvdGFsIHBhdHRlcm5zOiAke3N0YXRzLnBhdHRlcm5zTGVhcm5lZH1gKTtcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgRmVkZXJhdGVkQ29vcmRpbmF0b3Ige1xuICBwcml2YXRlIGNvb3JkaW5hdG9ySWQ6IHN0cmluZztcbiAgcHJpdmF0ZSBjb25maWc6IFJlcXVpcmVkPEZlZGVyYXRlZENvbmZpZz47XG4gIHByaXZhdGUgY29udHJpYnV0aW9uczogTWFwPHN0cmluZywgQWdlbnRDb250cmlidXRpb24+ID0gbmV3IE1hcCgpO1xuICBwcml2YXRlIHRvdGFsVHJhamVjdG9yaWVzOiBudW1iZXIgPSAwO1xuICBwcml2YXRlIGNvbnNvbGlkYXRpb25JbnRlcnZhbDogbnVtYmVyID0gNTA7XG4gIHByaXZhdGUgcmVhc29uaW5nQmFuazogUmVhc29uaW5nQmFuaztcbiAgcHJpdmF0ZSBxdWFsaXR5U2FtcGxlczogbnVtYmVyW10gPSBbXTtcbiAgcHJpdmF0ZSBtYXN0ZXJMb3JhV2VpZ2h0czogbnVtYmVyW10gPSBbXTtcblxuICBjb25zdHJ1Y3Rvcihjb29yZGluYXRvcklkOiBzdHJpbmcsIGNvbmZpZz86IEZlZGVyYXRlZENvbmZpZykge1xuICAgIHRoaXMuY29vcmRpbmF0b3JJZCA9IGNvb3JkaW5hdG9ySWQ7XG4gICAgdGhpcy5jb25maWcgPSB7XG4gICAgICAuLi5ERUZBVUxUX0ZFREVSQVRFRF9DT05GSUcsXG4gICAgICB0cmFqZWN0b3J5Q2FwYWNpdHk6IDUwMDAwLCAvLyBMYXJnZSBjYXBhY2l0eSBmb3IgY29vcmRpbmF0b3JcbiAgICAgIHBhdHRlcm5DbHVzdGVyczogMjAwLFxuICAgICAgYmFzZUxvcmFSYW5rOiAxNiwgLy8gRGVlcGVyIGZvciBhZ2dyZWdhdGlvblxuICAgICAgLi4uY29uZmlnLFxuICAgIH07XG4gICAgdGhpcy5yZWFzb25pbmdCYW5rID0gbmV3IFJlYXNvbmluZ0JhbmsodGhpcy5jb25maWcucXVhbGl0eVRocmVzaG9sZCk7XG5cbiAgICAvLyBJbml0aWFsaXplIG1hc3RlciBMb1JBIHdlaWdodHNcbiAgICB0aGlzLm1hc3RlckxvcmFXZWlnaHRzID0gbmV3IEFycmF5KHRoaXMuY29uZmlnLmhpZGRlbkRpbSAqIHRoaXMuY29uZmlnLmJhc2VMb3JhUmFuaylcbiAgICAgIC5maWxsKDApXG4gICAgICAubWFwKCgpID0+IChNYXRoLnJhbmRvbSgpIC0gMC41KSAqIDAuMDEpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBjb29yZGluYXRvciBJRFxuICAgKi9cbiAgZ2V0Q29vcmRpbmF0b3JJZCgpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLmNvb3JkaW5hdG9ySWQ7XG4gIH1cblxuICAvKipcbiAgICogU2V0IHF1YWxpdHkgdGhyZXNob2xkIGZvciBhY2NlcHRpbmcgdHJhamVjdG9yaWVzXG4gICAqL1xuICBzZXRRdWFsaXR5VGhyZXNob2xkKHRocmVzaG9sZDogbnVtYmVyKTogdm9pZCB7XG4gICAgdGhpcy5jb25maWcucXVhbGl0eVRocmVzaG9sZCA9IHRocmVzaG9sZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXQgY29uc29saWRhdGlvbiBpbnRlcnZhbFxuICAgKi9cbiAgc2V0Q29uc29saWRhdGlvbkludGVydmFsKGludGVydmFsOiBudW1iZXIpOiB2b2lkIHtcbiAgICB0aGlzLmNvbnNvbGlkYXRpb25JbnRlcnZhbCA9IGludGVydmFsO1xuICB9XG5cbiAgLyoqXG4gICAqIEFnZ3JlZ2F0ZSBhZ2VudCBleHBvcnQgaW50byBjb29yZGluYXRvclxuICAgKi9cbiAgYWdncmVnYXRlKGV4cG9ydERhdGE6IEFnZW50RXhwb3J0KTogQWdncmVnYXRpb25SZXN1bHQge1xuICAgIGxldCBhY2NlcHRlZCA9IDA7XG4gICAgbGV0IHJlamVjdGVkID0gMDtcblxuICAgIC8vIFJlcGxheSB0cmFqZWN0b3JpZXMgaW50byBtYXN0ZXJcbiAgICBmb3IgKGNvbnN0IHRyYWogb2YgZXhwb3J0RGF0YS50cmFqZWN0b3JpZXMpIHtcbiAgICAgIGlmICh0cmFqLnF1YWxpdHkgPj0gdGhpcy5jb25maWcucXVhbGl0eVRocmVzaG9sZCkge1xuICAgICAgICAvLyBTdG9yZSBwYXR0ZXJuXG4gICAgICAgIGNvbnN0IHBhdHRlcm5UeXBlID0gdGhpcy5yb3V0ZVRvUGF0dGVyblR5cGUodHJhai5yb3V0ZSk7XG4gICAgICAgIHRoaXMucmVhc29uaW5nQmFuay5zdG9yZShwYXR0ZXJuVHlwZSwgdHJhai5lbWJlZGRpbmcpO1xuICAgICAgICB0aGlzLnF1YWxpdHlTYW1wbGVzLnB1c2godHJhai5xdWFsaXR5KTtcblxuICAgICAgICAvLyBVcGRhdGUgbWFzdGVyIExvUkEgd2VpZ2h0c1xuICAgICAgICB0aGlzLnVwZGF0ZU1hc3RlckxvcmEodHJhai5lbWJlZGRpbmcsIHRyYWoucXVhbGl0eSk7XG5cbiAgICAgICAgYWNjZXB0ZWQrKztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlamVjdGVkKys7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy50b3RhbFRyYWplY3RvcmllcyArPSBhY2NlcHRlZDtcblxuICAgIC8vIFJlY29yZCBjb250cmlidXRpb25cbiAgICB0aGlzLmNvbnRyaWJ1dGlvbnMuc2V0KGV4cG9ydERhdGEuYWdlbnRJZCwge1xuICAgICAgdHJhamVjdG9yeUNvdW50OiBleHBvcnREYXRhLnRyYWplY3Rvcmllcy5sZW5ndGgsXG4gICAgICBhdmdRdWFsaXR5OiBleHBvcnREYXRhLnN0YXRzLmF2Z1F1YWxpdHksXG4gICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICBzZXNzaW9uRHVyYXRpb25NczogZXhwb3J0RGF0YS5zZXNzaW9uRHVyYXRpb25NcyxcbiAgICB9KTtcblxuICAgIC8vIEF1dG8tY29uc29saWRhdGUgaWYgbmVlZGVkXG4gICAgY29uc3QgY29uc29saWRhdGVkID0gdGhpcy5zaG91bGRDb25zb2xpZGF0ZSgpO1xuICAgIGlmIChjb25zb2xpZGF0ZWQpIHtcbiAgICAgIHRoaXMuZm9yY2VDb25zb2xpZGF0ZSgpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBhZ2VudElkOiBleHBvcnREYXRhLmFnZW50SWQsXG4gICAgICB0cmFqZWN0b3JpZXNBY2NlcHRlZDogYWNjZXB0ZWQsXG4gICAgICB0cmFqZWN0b3JpZXNSZWplY3RlZDogcmVqZWN0ZWQsXG4gICAgICBjb25zb2xpZGF0ZWQsXG4gICAgICB0b3RhbEFnZW50czogdGhpcy5jb250cmlidXRpb25zLnNpemUsXG4gICAgICB0b3RhbFRyYWplY3RvcmllczogdGhpcy50b3RhbFRyYWplY3RvcmllcyxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEZvcmNlIGNvbnNvbGlkYXRpb24gKGxlYXJuaW5nKVxuICAgKi9cbiAgZm9yY2VDb25zb2xpZGF0ZSgpOiBzdHJpbmcge1xuICAgIGNvbnN0IHBydW5lZCA9IHRoaXMucmVhc29uaW5nQmFuay5wcnVuZSgwLjMsIDUpO1xuICAgIHJldHVybiBgQ29uc29saWRhdGVkOiBwcnVuZWQgJHtwcnVuZWR9IHBhdHRlcm5zLCAke3RoaXMucmVhc29uaW5nQmFuay5zdGF0cygpLnRvdGFsUGF0dGVybnN9IHJlbWFpbmluZ2A7XG4gIH1cblxuICAvKipcbiAgICogQ29uc29saWRhdGUgbGVhcm5pbmcgKGFsaWFzKVxuICAgKi9cbiAgY29uc29saWRhdGUoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5mb3JjZUNvbnNvbGlkYXRlKCk7XG4gIH1cblxuICAvKipcbiAgICogR2V0IGluaXRpYWwgcGF0dGVybnMgZm9yIG5ldyBhZ2VudHMgKHdhcm0gc3RhcnQpXG4gICAqL1xuICBnZXRJbml0aWFsUGF0dGVybnMoazogbnVtYmVyID0gMTApOiBMZWFybmVkUGF0dGVybltdIHtcbiAgICBjb25zdCBhbGxQYXR0ZXJucyA9IFtcbiAgICAgIC4uLnRoaXMucmVhc29uaW5nQmFuay5nZXRCeVR5cGUoJ3F1ZXJ5X3Jlc3BvbnNlJyksXG4gICAgICAuLi50aGlzLnJlYXNvbmluZ0JhbmsuZ2V0QnlUeXBlKCdyb3V0aW5nJyksXG4gICAgXTtcblxuICAgIC8vIFNvcnQgYnkgc3VjY2VzcyByYXRlIGFuZCByZXR1cm4gdG9wIGtcbiAgICByZXR1cm4gYWxsUGF0dGVybnNcbiAgICAgIC5zb3J0KChhLCBiKSA9PiBiLnN1Y2Nlc3NSYXRlIC0gYS5zdWNjZXNzUmF0ZSlcbiAgICAgIC5zbGljZSgwLCBrKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgYWxsIGxlYXJuZWQgcGF0dGVybnNcbiAgICovXG4gIGdldEFsbFBhdHRlcm5zKCk6IExlYXJuZWRQYXR0ZXJuW10ge1xuICAgIHJldHVybiBbXG4gICAgICAuLi50aGlzLnJlYXNvbmluZ0JhbmsuZ2V0QnlUeXBlKCdxdWVyeV9yZXNwb25zZScpLFxuICAgICAgLi4udGhpcy5yZWFzb25pbmdCYW5rLmdldEJ5VHlwZSgncm91dGluZycpLFxuICAgICAgLi4udGhpcy5yZWFzb25pbmdCYW5rLmdldEJ5VHlwZSgnY29udGV4dF9yZXRyaWV2YWwnKSxcbiAgICAgIC4uLnRoaXMucmVhc29uaW5nQmFuay5nZXRCeVR5cGUoJ2NvcnJlY3Rpb24nKSxcbiAgICBdO1xuICB9XG5cbiAgLyoqXG4gICAqIEZpbmQgc2ltaWxhciBwYXR0ZXJuc1xuICAgKi9cbiAgZmluZFBhdHRlcm5zKHF1ZXJ5OiBFbWJlZGRpbmcsIGs6IG51bWJlcik6IExlYXJuZWRQYXR0ZXJuW10ge1xuICAgIHJldHVybiB0aGlzLnJlYXNvbmluZ0JhbmsuZmluZFNpbWlsYXIocXVlcnksIGspO1xuICB9XG5cbiAgLyoqXG4gICAqIEFwcGx5IGNvb3JkaW5hdG9yJ3MgTG9SQSB0byBpbnB1dFxuICAgKiBPUFRJTUlaRUQ6IFByZS1jb21wdXRlIGhpZGRlbiBsYXllciBvbmNlLCByZXVzZSB0eXBlZCBhcnJheXNcbiAgICovXG4gIGFwcGx5TG9yYShpbnB1dDogbnVtYmVyW10pOiBudW1iZXJbXSB7XG4gICAgY29uc3QgcmFuayA9IHRoaXMuY29uZmlnLmJhc2VMb3JhUmFuaztcbiAgICBjb25zdCBkaW0gPSBNYXRoLm1pbihpbnB1dC5sZW5ndGgsIHRoaXMuY29uZmlnLmhpZGRlbkRpbSk7XG4gICAgY29uc3Qgd2VpZ2h0c0xlbiA9IHRoaXMubWFzdGVyTG9yYVdlaWdodHMubGVuZ3RoO1xuXG4gICAgLy8gUHJlLWNvbXB1dGUgaGlkZGVuIGxheWVyIChpbnB1dCBAIEIpXG4gICAgY29uc3QgaGlkZGVuID0gbmV3IEZsb2F0NjRBcnJheShyYW5rKTtcbiAgICBmb3IgKGxldCByID0gMDsgciA8IHJhbms7IHIrKykge1xuICAgICAgbGV0IHN1bSA9IDA7XG4gICAgICBjb25zdCBiYXNlSWR4ID0gciAqIGRpbTtcbiAgICAgIC8vIFVucm9sbCB0aGUgaW5uZXIgbG9vcFxuICAgICAgbGV0IGogPSAwO1xuICAgICAgZm9yICg7IGogKyAzIDwgZGltICYmIGJhc2VJZHggKyBqICsgMyA8IHdlaWdodHNMZW47IGogKz0gNCkge1xuICAgICAgICBzdW0gKz0gdGhpcy5tYXN0ZXJMb3JhV2VpZ2h0c1tiYXNlSWR4ICsgal0gKiAoaW5wdXRbal0gfHwgMCkgK1xuICAgICAgICAgICAgICAgdGhpcy5tYXN0ZXJMb3JhV2VpZ2h0c1tiYXNlSWR4ICsgaiArIDFdICogKGlucHV0W2ogKyAxXSB8fCAwKSArXG4gICAgICAgICAgICAgICB0aGlzLm1hc3RlckxvcmFXZWlnaHRzW2Jhc2VJZHggKyBqICsgMl0gKiAoaW5wdXRbaiArIDJdIHx8IDApICtcbiAgICAgICAgICAgICAgIHRoaXMubWFzdGVyTG9yYVdlaWdodHNbYmFzZUlkeCArIGogKyAzXSAqIChpbnB1dFtqICsgM10gfHwgMCk7XG4gICAgICB9XG4gICAgICBmb3IgKDsgaiA8IGRpbSAmJiBiYXNlSWR4ICsgaiA8IHdlaWdodHNMZW47IGorKykge1xuICAgICAgICBzdW0gKz0gdGhpcy5tYXN0ZXJMb3JhV2VpZ2h0c1tiYXNlSWR4ICsgal0gKiAoaW5wdXRbal0gfHwgMCk7XG4gICAgICB9XG4gICAgICBoaWRkZW5bcl0gPSBzdW07XG4gICAgfVxuXG4gICAgLy8gQ29tcHV0ZSBvdXRwdXQgKGhpZGRlbiBAIEEgKyBpbnB1dClcbiAgICBjb25zdCBvdXRwdXQgPSBuZXcgQXJyYXkoaW5wdXQubGVuZ3RoKTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGlucHV0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoaSA8IGRpbSkge1xuICAgICAgICBsZXQgZGVsdGEgPSAwO1xuICAgICAgICBjb25zdCBiYXNlSWR4ID0gaSAqIHJhbms7XG4gICAgICAgIGZvciAobGV0IHIgPSAwOyByIDwgcmFuayAmJiBiYXNlSWR4ICsgciA8IHdlaWdodHNMZW47IHIrKykge1xuICAgICAgICAgIGRlbHRhICs9IHRoaXMubWFzdGVyTG9yYVdlaWdodHNbYmFzZUlkeCArIHJdICogaGlkZGVuW3JdO1xuICAgICAgICB9XG4gICAgICAgIG91dHB1dFtpXSA9IChpbnB1dFtpXSB8fCAwKSArIGRlbHRhICogMC4xO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0W2ldID0gaW5wdXRbaV0gfHwgMDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gb3V0cHV0O1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCBjb29yZGluYXRvciBzdGF0aXN0aWNzXG4gICAqL1xuICBzdGF0cygpOiBDb29yZGluYXRvclN0YXRzIHtcbiAgICBjb25zdCBhdmdRdWFsaXR5ID0gdGhpcy5xdWFsaXR5U2FtcGxlcy5sZW5ndGggPiAwXG4gICAgICA/IHRoaXMucXVhbGl0eVNhbXBsZXMucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCkgLyB0aGlzLnF1YWxpdHlTYW1wbGVzLmxlbmd0aFxuICAgICAgOiAwO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNvb3JkaW5hdG9ySWQ6IHRoaXMuY29vcmRpbmF0b3JJZCxcbiAgICAgIHRvdGFsQWdlbnRzOiB0aGlzLmNvbnRyaWJ1dGlvbnMuc2l6ZSxcbiAgICAgIHRvdGFsVHJhamVjdG9yaWVzOiB0aGlzLnRvdGFsVHJhamVjdG9yaWVzLFxuICAgICAgcGF0dGVybnNMZWFybmVkOiB0aGlzLnJlYXNvbmluZ0Jhbmsuc3RhdHMoKS50b3RhbFBhdHRlcm5zLFxuICAgICAgYXZnUXVhbGl0eSxcbiAgICAgIHF1YWxpdHlUaHJlc2hvbGQ6IHRoaXMuY29uZmlnLnF1YWxpdHlUaHJlc2hvbGQsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgY29udHJpYnV0aW9uIGhpc3RvcnlcbiAgICovXG4gIGdldENvbnRyaWJ1dGlvbnMoKTogTWFwPHN0cmluZywgQWdlbnRDb250cmlidXRpb24+IHtcbiAgICByZXR1cm4gbmV3IE1hcCh0aGlzLmNvbnRyaWJ1dGlvbnMpO1xuICB9XG5cbiAgLyoqXG4gICAqIEdldCB0b3RhbCBhZ2VudCBjb3VudFxuICAgKi9cbiAgYWdlbnRDb3VudCgpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmNvbnRyaWJ1dGlvbnMuc2l6ZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgdG90YWwgdHJhamVjdG9yeSBjb3VudFxuICAgKi9cbiAgZ2V0VG90YWxUcmFqZWN0b3JpZXMoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy50b3RhbFRyYWplY3RvcmllcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDbGVhciBhbGwgY29udHJpYnV0aW9uc1xuICAgKi9cbiAgY2xlYXIoKTogdm9pZCB7XG4gICAgdGhpcy5jb250cmlidXRpb25zLmNsZWFyKCk7XG4gICAgdGhpcy50b3RhbFRyYWplY3RvcmllcyA9IDA7XG4gICAgdGhpcy5xdWFsaXR5U2FtcGxlcyA9IFtdO1xuICB9XG5cbiAgLyoqXG4gICAqIEV4cG9ydCBjb29yZGluYXRvciBzdGF0ZVxuICAgKi9cbiAgdG9KU09OKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgIGNvb3JkaW5hdG9ySWQ6IHRoaXMuY29vcmRpbmF0b3JJZCxcbiAgICAgIHN0YXRzOiB0aGlzLnN0YXRzKCksXG4gICAgICBjb250cmlidXRpb25zOiBPYmplY3QuZnJvbUVudHJpZXModGhpcy5jb250cmlidXRpb25zKSxcbiAgICAgIHBhdHRlcm5zOiB0aGlzLmdldEFsbFBhdHRlcm5zKCksXG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGFnZW50IHdpdGggY29vcmRpbmF0b3IncyBsZWFybmVkIHBhdHRlcm5zXG4gICAqL1xuICBjcmVhdGVBZ2VudChhZ2VudElkOiBzdHJpbmcpOiBFcGhlbWVyYWxBZ2VudCB7XG4gICAgY29uc3QgYWdlbnQgPSBuZXcgRXBoZW1lcmFsQWdlbnQoYWdlbnRJZCwge1xuICAgICAgaGlkZGVuRGltOiB0aGlzLmNvbmZpZy5oaWRkZW5EaW0sXG4gICAgICBlbWJlZGRpbmdEaW06IHRoaXMuY29uZmlnLmVtYmVkZGluZ0RpbSxcbiAgICAgIG1pY3JvTG9yYVJhbms6IHRoaXMuY29uZmlnLm1pY3JvTG9yYVJhbmssXG4gICAgfSk7XG5cbiAgICAvLyBXYXJtIHN0YXJ0OiBwcm9jZXNzIGluaXRpYWwgcGF0dGVybnMgYXMgcG9zaXRpdmUgZXhhbXBsZXNcbiAgICBjb25zdCBpbml0aWFsUGF0dGVybnMgPSB0aGlzLmdldEluaXRpYWxQYXR0ZXJucyg1KTtcbiAgICBmb3IgKGNvbnN0IHBhdHRlcm4gb2YgaW5pdGlhbFBhdHRlcm5zKSB7XG4gICAgICBhZ2VudC5wcm9jZXNzVGFzayhwYXR0ZXJuLmVtYmVkZGluZywgcGF0dGVybi5zdWNjZXNzUmF0ZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGFnZW50O1xuICB9XG5cbiAgcHJpdmF0ZSBzaG91bGRDb25zb2xpZGF0ZSgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5jb250cmlidXRpb25zLnNpemUgJSB0aGlzLmNvbnNvbGlkYXRpb25JbnRlcnZhbCA9PT0gMCAmJlxuICAgICAgICAgICB0aGlzLmNvbnRyaWJ1dGlvbnMuc2l6ZSA+IDA7XG4gIH1cblxuICBwcml2YXRlIHJvdXRlVG9QYXR0ZXJuVHlwZShyb3V0ZT86IHN0cmluZyk6IFBhdHRlcm5UeXBlIHtcbiAgICBpZiAoIXJvdXRlKSByZXR1cm4gJ3F1ZXJ5X3Jlc3BvbnNlJztcbiAgICBpZiAocm91dGUuaW5jbHVkZXMoJ2NvZGUnKSkgcmV0dXJuICdxdWVyeV9yZXNwb25zZSc7XG4gICAgaWYgKHJvdXRlLmluY2x1ZGVzKCdyb3V0ZScpKSByZXR1cm4gJ3JvdXRpbmcnO1xuICAgIGlmIChyb3V0ZS5pbmNsdWRlcygnbWVtb3J5JykpIHJldHVybiAnY29udGV4dF9yZXRyaWV2YWwnO1xuICAgIHJldHVybiAncXVlcnlfcmVzcG9uc2UnO1xuICB9XG5cbiAgcHJpdmF0ZSB1cGRhdGVNYXN0ZXJMb3JhKGVtYmVkZGluZzogRW1iZWRkaW5nLCBxdWFsaXR5OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBsciA9IDAuMDAwNSAqIHF1YWxpdHk7IC8vIFNsb3dlciBsZWFybmluZyBmb3IgY29vcmRpbmF0b3JcbiAgICBjb25zdCBkaW0gPSBNYXRoLm1pbihlbWJlZGRpbmcubGVuZ3RoLCB0aGlzLmNvbmZpZy5oaWRkZW5EaW0pO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBNYXRoLm1pbihkaW0sIHRoaXMubWFzdGVyTG9yYVdlaWdodHMubGVuZ3RoKTsgaSsrKSB7XG4gICAgICBjb25zdCBncmFkID0gZW1iZWRkaW5nW2kgJSBlbWJlZGRpbmcubGVuZ3RoXSAqIChxdWFsaXR5IC0gMC41KTtcbiAgICAgIHRoaXMubWFzdGVyTG9yYVdlaWdodHNbaV0gKz0gbHIgKiBncmFkO1xuXG4gICAgICAvLyBFV0MgcmVndWxhcml6YXRpb24gLSBwcmV2ZW50IGxhcmdlIHdlaWdodCBjaGFuZ2VzXG4gICAgICBjb25zdCBwZW5hbHR5ID0gdGhpcy5jb25maWcuZXdjTGFtYmRhICogdGhpcy5tYXN0ZXJMb3JhV2VpZ2h0c1tpXSAqIDAuMDAwMTtcbiAgICAgIHRoaXMubWFzdGVyTG9yYVdlaWdodHNbaV0gLT0gcGVuYWx0eTtcbiAgICB9XG4gIH1cbn1cbiJdfQ==