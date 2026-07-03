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
const DEFAULT_CONFIG = {
    enableSona: true,
    enableReasoningBank: true,
    enableHnsw: true,
    sonaProfile: 'batch',
    embeddingDim: 384,
    hnswM: 16,
    hnswEfConstruction: 200,
    qualityThreshold: 0.6
};
/**
 * SwarmVector Worker Integration Service
 * Provides unified access to SwarmVector capabilities for background workers
 */
export class SwarmVectorWorkerIntegration extends EventEmitter {
    config;
    sonaService = null;
    reasoningBank = null;
    swarmvectorCore = null;
    intelligenceStore = null;
    onnxEmbeddings = null;
    initialized = false;
    activeTrajectories = new Map();
    constructor(config = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Initialize SwarmVector services lazily
     * Uses unified 'swarmvector' package which includes SONA, VectorDB, embeddings
     * Falls back gracefully if native modules aren't available
     */
    async initialize() {
        if (this.initialized)
            return true;
        try {
            // Try to load swarmvector - may fail if native bindings not available
            try {
                const swarmvector = await import('swarmvector');
                this.swarmvectorCore = swarmvector;
                // Initialize SONA engine if available
                if (this.config.enableSona && swarmvector.SonaEngine) {
                    try {
                        // SonaEngine constructor signature varies by version - use any for compatibility
                        this.sonaService = new swarmvector.SonaEngine(this.config.embeddingDim);
                        this.emit('module:loaded', { module: 'sona' });
                    }
                    catch (e) {
                        // SONA is optional
                    }
                }
                // Initialize VectorDB if available (may require native bindings)
                if (this.config.enableReasoningBank && swarmvector.VectorDb) {
                    try {
                        // VectorDb constructor signature varies by version - use any for compatibility
                        this.reasoningBank = new swarmvector.VectorDb({
                            dimensions: this.config.embeddingDim,
                            storagePath: '.agentic-flow/vectors.db',
                            hnswConfig: {
                                efConstruction: this.config.hnswEfConstruction,
                                M: this.config.hnswM
                            }
                        });
                        this.emit('module:loaded', { module: 'reasoningbank' });
                    }
                    catch (e) {
                        // VectorDB is optional - continue without pattern storage
                    }
                }
                // HNSW is part of VectorDb
                if (this.config.enableHnsw && this.reasoningBank) {
                    this.emit('module:loaded', { module: 'hnsw' });
                }
            }
            catch (e) {
                // SwarmVector package not available - workers still function without learning
                // This is expected in environments without native bindings
            }
            // Lazy load IntelligenceStore (optional fallback for local learning)
            try {
                const intModule = await import('../intelligence/IntelligenceStore.js');
                this.intelligenceStore = intModule.getIntelligenceStore?.();
                this.emit('module:loaded', { module: 'intelligence' });
            }
            catch (e) {
                // Intelligence store is optional
            }
            // Load ONNX WASM embeddings (uses global cache for performance)
            try {
                const { getCachedOnnxEmbedder } = await import('../utils/model-cache.js');
                this.onnxEmbeddings = await getCachedOnnxEmbedder();
                if (this.onnxEmbeddings) {
                    this.emit('module:loaded', { module: 'onnx-embeddings', cached: true });
                }
            }
            catch (e) {
                // ONNX embeddings optional - will use fallback
            }
            this.initialized = true;
            this.emit('initialized', {
                sona: !!this.sonaService,
                reasoningBank: !!this.reasoningBank,
                hnsw: !!this.swarmvectorCore,
                intelligence: !!this.intelligenceStore,
                onnxEmbeddings: !!this.onnxEmbeddings
            });
            return true;
        }
        catch (error) {
            // Even on error, mark as initialized so workers can continue
            this.initialized = true;
            this.emit('initialized', {
                sona: false,
                reasoningBank: false,
                hnsw: false,
                intelligence: false,
                onnxEmbeddings: false
            });
            return true; // Return true so workers continue without learning
        }
    }
    /**
     * Start tracking a worker trajectory
     */
    async startTrajectory(workerId, trigger, topic) {
        await this.initialize();
        const trajectoryId = `traj_${workerId}_${Date.now()}`;
        // Create initial embedding from topic/trigger
        let embedding;
        if (this.swarmvectorCore && topic) {
            try {
                // Generate embedding for semantic similarity later
                embedding = await this.generateEmbedding(`${trigger} ${topic}`);
            }
            catch (e) {
                // Embedding is optional
            }
        }
        this.activeTrajectories.set(trajectoryId, {
            workerId,
            trigger,
            steps: [],
            startTime: Date.now(),
            embedding
        });
        // Start SONA trajectory if available
        if (this.sonaService) {
            try {
                await this.sonaService.startTrajectory?.(trajectoryId, {
                    route: `worker/${trigger}`,
                    contexts: [workerId, topic || 'general'],
                    embedding
                });
            }
            catch (e) {
                // SONA tracking is best-effort
            }
        }
        this.emit('trajectory:started', { trajectoryId, workerId, trigger });
        return trajectoryId;
    }
    /**
     * Record a worker phase step
     */
    async recordStep(trajectoryId, phase, metrics) {
        const trajectory = this.activeTrajectories.get(trajectoryId);
        if (!trajectory)
            return;
        // Generate activations (simplified - would be actual neural activations in production)
        const activations = this.generateActivations(phase, metrics);
        const step = {
            phase,
            activations,
            duration: metrics.duration,
            memoryDeposits: metrics.memoryDeposits,
            successRate: metrics.successRate
        };
        trajectory.steps.push(step);
        // Record SONA step if available
        if (this.sonaService) {
            try {
                await this.sonaService.recordStep?.(trajectoryId, {
                    activations,
                    attentionWeights: activations.map(a => Math.abs(a)),
                    reward: metrics.successRate,
                    timestamp: Date.now()
                });
            }
            catch (e) {
                // Best effort
            }
        }
        this.emit('step:recorded', { trajectoryId, phase, step });
    }
    /**
     * Complete trajectory and trigger learning
     */
    async completeTrajectory(trajectoryId, results) {
        const trajectory = this.activeTrajectories.get(trajectoryId);
        if (!trajectory) {
            return {
                trajectoryId,
                qualityScore: 0,
                patternsLearned: 0,
                memoryDeposits: [],
                sonaAdaptation: false
            };
        }
        const duration = Date.now() - trajectory.startTime;
        const qualityScore = this.calculateQualityScore(trajectory, results);
        let patternsLearned = 0;
        const memoryDeposits = [];
        let sonaAdaptation = false;
        // Store in ReasoningBank if quality meets threshold
        if (this.reasoningBank && qualityScore >= this.config.qualityThreshold) {
            try {
                const memoryKey = `worker/${trajectory.trigger}/${trajectoryId}`;
                // Store trajectory pattern
                await this.storePattern(memoryKey, {
                    trigger: trajectory.trigger,
                    steps: trajectory.steps.map(s => s.phase),
                    duration,
                    qualityScore,
                    results: results.data
                });
                memoryDeposits.push(memoryKey);
                patternsLearned++;
            }
            catch (e) {
                console.warn('[SwarmVector] Failed to store pattern:', e);
            }
        }
        // Complete SONA trajectory and trigger learning
        if (this.sonaService) {
            try {
                await this.sonaService.endTrajectory?.(trajectoryId, qualityScore);
                // Force learn if quality is high
                if (qualityScore >= 0.8) {
                    await this.sonaService.forceLearn?.();
                    sonaAdaptation = true;
                }
            }
            catch (e) {
                // Best effort
            }
        }
        // Index in HNSW for semantic search
        if (this.swarmvectorCore && trajectory.embedding) {
            try {
                await this.indexPattern(trajectoryId, trajectory.embedding, {
                    trigger: trajectory.trigger,
                    qualityScore,
                    timestamp: Date.now()
                });
            }
            catch (e) {
                // Best effort
            }
        }
        // Cleanup
        this.activeTrajectories.delete(trajectoryId);
        const result = {
            trajectoryId,
            qualityScore,
            patternsLearned,
            memoryDeposits,
            sonaAdaptation
        };
        this.emit('trajectory:completed', result);
        return result;
    }
    /**
     * Find relevant patterns for a worker task
     */
    async findRelevantPatterns(trigger, topic, limit = 5) {
        await this.initialize();
        const patterns = [];
        // Search HNSW if available
        if (this.swarmvectorCore && topic) {
            try {
                const embedding = await this.generateEmbedding(`${trigger} ${topic}`);
                const results = await this.searchHnsw(embedding, limit);
                for (const result of results) {
                    patterns.push({
                        key: result.id,
                        similarity: result.similarity,
                        pattern: result.metadata || {}
                    });
                }
            }
            catch (e) {
                // Fallback to ReasoningBank
            }
        }
        // Also query ReasoningBank
        if (this.reasoningBank && patterns.length < limit) {
            try {
                const rbPatterns = await this.reasoningBank.retrieveMemories?.(`${trigger} ${topic || ''}`, { domain: 'workers', limit: limit - patterns.length });
                if (rbPatterns) {
                    for (const p of rbPatterns) {
                        patterns.push({
                            key: p.id || p.key,
                            similarity: p.score || 0.5,
                            pattern: p.content || p
                        });
                    }
                }
            }
            catch (e) {
                // Best effort
            }
        }
        return patterns;
    }
    /**
     * Store pattern in ReasoningBank with distillation
     */
    async storePattern(key, data) {
        if (!this.reasoningBank)
            return;
        try {
            // Use distillMemories if available for intelligent storage
            if (this.reasoningBank.distillMemories) {
                await this.reasoningBank.distillMemories(data, { label: 'success', confidence: data.qualityScore }, `Worker task: ${key}`, { taskId: key, domain: 'workers' });
            }
            else {
                // Fallback to direct db storage
                const db = this.reasoningBank.db;
                if (db?.storePattern) {
                    await db.storePattern(key, JSON.stringify(data), Date.now());
                }
            }
        }
        catch (e) {
            console.warn('[SwarmVector] Pattern storage failed:', e);
        }
    }
    /**
     * Index pattern in HNSW for semantic search
     */
    async indexPattern(id, embedding, metadata) {
        if (!this.swarmvectorCore)
            return;
        try {
            // Access HNSW index (implementation depends on swarmvector version)
            const index = this.swarmvectorCore.getIndex?.() || this.swarmvectorCore;
            if (index.add) {
                await index.add(id, embedding, metadata);
            }
        }
        catch (e) {
            // HNSW indexing is best-effort
        }
    }
    /**
     * Search HNSW index
     */
    async searchHnsw(embedding, limit) {
        if (!this.swarmvectorCore)
            return [];
        try {
            const index = this.swarmvectorCore.getIndex?.() || this.swarmvectorCore;
            if (index.search) {
                return await index.search(embedding, limit);
            }
        }
        catch (e) {
            // Search is best-effort
        }
        return [];
    }
    /**
     * Generate embedding for text using ONNX WASM (real semantic embeddings)
     */
    async generateEmbedding(text) {
        // Priority 1: Use ONNX WASM embeddings (real semantic embeddings)
        if (this.onnxEmbeddings) {
            try {
                const embedding = await this.onnxEmbeddings.embed?.(text)
                    || await this.onnxEmbeddings.encode?.(text)
                    || await this.onnxEmbeddings.generate?.(text);
                if (embedding && embedding.length > 0) {
                    return Array.isArray(embedding) ? embedding : Array.from(embedding);
                }
            }
            catch (e) {
                // Try other methods
            }
        }
        // Priority 2: Use swarmvector core embedding if available
        if (this.swarmvectorCore?.embed) {
            try {
                const embedding = await this.swarmvectorCore.embed(text);
                if (embedding)
                    return Array.from(embedding);
            }
            catch (e) {
                // Fallback
            }
        }
        // Priority 3: Use intelligence store if available
        if (this.intelligenceStore?.embed) {
            try {
                return await this.intelligenceStore.embed(text);
            }
            catch (e) {
                // Fallback
            }
        }
        // Priority 4: Use ReasoningBank embedding
        if (this.reasoningBank?.computeEmbedding) {
            try {
                return await this.reasoningBank.computeEmbedding(text);
            }
            catch (e) {
                // Fallback
            }
        }
        // Fallback: Generate simple hash-based embedding
        return this.simpleEmbedding(text);
    }
    /**
     * Simple hash-based embedding fallback
     */
    simpleEmbedding(text) {
        const dim = this.config.embeddingDim;
        const embedding = new Array(dim).fill(0);
        const words = text.toLowerCase().split(/\s+/);
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            for (let j = 0; j < word.length; j++) {
                const idx = (word.charCodeAt(j) + i * 31 + j * 17) % dim;
                embedding[idx] += 1 / (1 + Math.sqrt(i + j));
            }
        }
        // Normalize
        const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0)) || 1;
        return embedding.map(v => v / norm);
    }
    /**
     * Generate activations for a phase
     */
    generateActivations(phase, metrics) {
        const dim = 64; // Reduced dimension for activations
        const activations = new Array(dim).fill(0);
        // Encode phase name
        for (let i = 0; i < phase.length; i++) {
            const idx = phase.charCodeAt(i) % dim;
            activations[idx] += 1 / phase.length;
        }
        // Encode success rate
        activations[0] = metrics.successRate;
        activations[dim - 1] = 1 - metrics.successRate;
        return activations;
    }
    /**
     * Calculate quality score for a trajectory
     */
    calculateQualityScore(trajectory, results) {
        if (results.status !== 'complete')
            return 0;
        const completedPhases = results.completedPhases || 0;
        const totalPhases = results.totalPhases || 1;
        const phaseScore = completedPhases / totalPhases;
        // Average success rate across steps
        const avgSuccessRate = trajectory.steps.length > 0
            ? trajectory.steps.reduce((s, step) => s + step.successRate, 0) / trajectory.steps.length
            : 0.5;
        // Duration penalty (penalize very long or very short runs)
        const duration = Date.now() - trajectory.startTime;
        const expectedDuration = 30000; // 30 seconds expected
        const durationScore = Math.exp(-Math.abs(Math.log(duration / expectedDuration)));
        // Weighted combination
        return phaseScore * 0.4 + avgSuccessRate * 0.4 + durationScore * 0.2;
    }
    /**
     * Get integration stats
     */
    getStats() {
        return {
            initialized: this.initialized,
            modules: {
                sona: !!this.sonaService,
                reasoningBank: !!this.reasoningBank,
                hnsw: !!this.swarmvectorCore,
                intelligence: !!this.intelligenceStore,
                onnxEmbeddings: !!this.onnxEmbeddings
            },
            activeTrajectories: this.activeTrajectories.size,
            config: this.config
        };
    }
    /**
     * Cleanup resources
     */
    async cleanup() {
        // Complete any remaining trajectories
        for (const [trajectoryId, trajectory] of this.activeTrajectories) {
            await this.completeTrajectory(trajectoryId, {
                status: 'cancelled',
                data: null,
                completedPhases: trajectory.steps.length,
                totalPhases: trajectory.steps.length,
                memoryKeys: [],
                duration: Date.now() - trajectory.startTime
            });
        }
        this.activeTrajectories.clear();
        this.emit('cleanup');
    }
}
// Singleton instance
let instance = null;
export function getSwarmVectorWorkerIntegration(config) {
    if (!instance) {
        instance = new SwarmVectorWorkerIntegration(config);
    }
    return instance;
}
/**
 * Create worker context with SwarmVector integration
 */
export async function createSwarmVectorWorkerContext(context) {
    const integration = getSwarmVectorWorkerIntegration();
    const trajectoryId = await integration.startTrajectory(context.workerId, context.trigger, context.topic);
    return {
        trajectoryId,
        recordStep: (phase, metrics) => integration.recordStep(trajectoryId, phase, metrics),
        complete: (results) => integration.completeTrajectory(trajectoryId, results),
        findPatterns: (limit = 5) => integration.findRelevantPatterns(context.trigger, context.topic, limit)
    };
}
//# sourceMappingURL=swarmvector-integration.js.map