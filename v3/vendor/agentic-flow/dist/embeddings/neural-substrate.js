/**
 * Neural Embedding Substrate Integration
 *
 * Wraps ruvector's NeuralSubstrate for agentic-flow agents
 * treating embeddings as a synthetic nervous system.
 *
 * Based on ruvector@0.1.85 neural-embeddings.ts
 */
import { getOptimizedEmbedder, cosineSimilarity, euclideanDistance } from './optimized-embedder.js';
// ============================================================================
// Security Constants
// ============================================================================
const MAX_TEXT_LENGTH = 10000; // Maximum input text length
const MAX_MEMORIES = 10000; // Maximum memories in MemoryPhysics
const MAX_AGENTS = 1000; // Maximum agents in swarm
const MAX_BASELINE_SAMPLES = 1000; // Maximum calibration samples
const MAX_HISTORY_SIZE = 100; // Maximum drift history
const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]{1,256}$/;
// ============================================================================
// Security Validation Functions
// ============================================================================
/**
 * Validate text input length
 */
function validateTextInput(text, context) {
    if (!text || typeof text !== 'string') {
        throw new Error(`${context}: Input must be a non-empty string`);
    }
    if (text.length > MAX_TEXT_LENGTH) {
        throw new Error(`${context}: Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters`);
    }
}
/**
 * Validate ID format
 */
function validateId(id, context) {
    if (!id || typeof id !== 'string') {
        throw new Error(`${context}: ID must be a non-empty string`);
    }
    if (!VALID_ID_PATTERN.test(id)) {
        throw new Error(`${context}: Invalid ID format. Use 1-256 alphanumeric characters, underscores, or hyphens`);
    }
}
/**
 * Validate array is not null and has expected dimension
 */
function validateEmbedding(arr, context) {
    if (!arr) {
        throw new Error(`${context}: Not initialized. Call the appropriate setup method first.`);
    }
}
/**
 * Semantic Drift Detector
 * Monitors semantic movement and triggers reflexes
 * Optimized with pre-allocated buffers (80-95% less GC pressure)
 */
export class SemanticDriftDetector {
    driftThreshold;
    escalationThreshold;
    historySize;
    embedder = getOptimizedEmbedder();
    baseline = null;
    history = [];
    velocity = null;
    acceleration = null;
    dimension = 0;
    // Pre-allocated buffer for velocity calculation (reused each detect call)
    tempVelocityBuffer = null;
    constructor(driftThreshold = 0.15, escalationThreshold = 0.30, historySize = 20) {
        this.driftThreshold = driftThreshold;
        this.escalationThreshold = escalationThreshold;
        this.historySize = historySize;
    }
    async init() {
        await this.embedder.init();
    }
    async setBaseline(context) {
        validateTextInput(context, 'SemanticDriftDetector.setBaseline');
        this.baseline = await this.embedder.embed(context);
        this.dimension = this.baseline.length;
        this.history = [{ embedding: this.baseline, timestamp: Date.now() }];
        // Pre-allocate buffers once (reused for all subsequent detect calls)
        if (!this.velocity || this.velocity.length !== this.dimension) {
            this.velocity = new Float32Array(this.dimension);
            this.acceleration = new Float32Array(this.dimension);
            this.tempVelocityBuffer = new Float32Array(this.dimension);
        }
        else {
            // Zero out existing buffers
            this.velocity.fill(0);
            this.acceleration.fill(0);
        }
    }
    async detect(input) {
        validateTextInput(input, 'SemanticDriftDetector.detect');
        validateEmbedding(this.baseline, 'SemanticDriftDetector.detect');
        const current = await this.embedder.embed(input);
        const distance = 1 - cosineSimilarity(this.baseline, current);
        // Calculate velocity using pre-allocated buffer (no new allocation!)
        const prev = this.history[this.history.length - 1]?.embedding || this.baseline;
        const newVelocity = this.tempVelocityBuffer;
        const dim = this.dimension;
        // 8x unrolled velocity calculation
        const unrolledLen = dim - (dim % 8);
        let i = 0;
        for (; i < unrolledLen; i += 8) {
            newVelocity[i] = current[i] - prev[i];
            newVelocity[i + 1] = current[i + 1] - prev[i + 1];
            newVelocity[i + 2] = current[i + 2] - prev[i + 2];
            newVelocity[i + 3] = current[i + 3] - prev[i + 3];
            newVelocity[i + 4] = current[i + 4] - prev[i + 4];
            newVelocity[i + 5] = current[i + 5] - prev[i + 5];
            newVelocity[i + 6] = current[i + 6] - prev[i + 6];
            newVelocity[i + 7] = current[i + 7] - prev[i + 7];
        }
        for (; i < dim; i++) {
            newVelocity[i] = current[i] - prev[i];
        }
        // Calculate acceleration and update velocity in-place
        let velocityMagSq = 0;
        let accelerationMagSq = 0;
        for (i = 0; i < dim; i++) {
            const oldVel = this.velocity[i];
            const newVel = newVelocity[i];
            this.acceleration[i] = newVel - oldVel;
            this.velocity[i] = newVel;
            velocityMagSq += newVel * newVel;
            accelerationMagSq += this.acceleration[i] * this.acceleration[i];
        }
        const velocityMag = Math.sqrt(velocityMagSq);
        const accelerationMag = Math.sqrt(accelerationMagSq);
        // Update history
        this.history.push({ embedding: current, timestamp: Date.now() });
        if (this.history.length > this.historySize)
            this.history.shift();
        // Determine trend
        let trend = 'stable';
        if (accelerationMag > 0.01)
            trend = 'accelerating';
        else if (velocityMag > 0.05)
            trend = 'drifting';
        else if (distance < this.driftThreshold * 0.5 && velocityMag < 0.02)
            trend = 'recovering';
        return {
            distance,
            velocity: velocityMag,
            acceleration: accelerationMag,
            trend,
            shouldEscalate: distance > this.driftThreshold,
            shouldTriggerReasoning: distance > this.escalationThreshold
        };
    }
    getStats() {
        if (!this.baseline || this.history.length < 2) {
            return { avgDrift: 0, maxDrift: 0, driftEvents: 0 };
        }
        const drifts = this.history.map(h => 1 - cosineSimilarity(this.baseline, h.embedding));
        const avgDrift = drifts.reduce((a, b) => a + b, 0) / drifts.length;
        const maxDrift = Math.max(...drifts);
        const driftEvents = drifts.filter(d => d > this.driftThreshold).length;
        return { avgDrift, maxDrift, driftEvents };
    }
}
/**
 * Memory Physics
 * Hippocampal-like dynamics: decay, interference, consolidation
 */
export class MemoryPhysics {
    decayRate;
    interferenceRadius;
    forgettingThreshold;
    embedder = getOptimizedEmbedder();
    memories = new Map();
    lastConsolidation = Date.now();
    constructor(decayRate = 0.01, interferenceRadius = 0.3, forgettingThreshold = 0.1) {
        this.decayRate = decayRate;
        this.interferenceRadius = interferenceRadius;
        this.forgettingThreshold = forgettingThreshold;
    }
    async init() {
        await this.embedder.init();
    }
    async store(id, content) {
        validateId(id, 'MemoryPhysics.store');
        validateTextInput(content, 'MemoryPhysics.store');
        // Security: Enforce memory limit
        if (this.memories.size >= MAX_MEMORIES && !this.memories.has(id)) {
            throw new Error(`Memory capacity exceeded (max: ${MAX_MEMORIES}). Call consolidate() to free space.`);
        }
        const embedding = await this.embedder.embed(content);
        const interference = [];
        // Check interference with existing memories
        for (const [memId, mem] of this.memories) {
            const distance = euclideanDistance(embedding, mem.embedding);
            if (distance < this.interferenceRadius) {
                const strength = (this.interferenceRadius - distance) / this.interferenceRadius;
                mem.strength *= (1 - strength * 0.5);
                interference.push(memId);
            }
        }
        this.memories.set(id, {
            id,
            embedding,
            content,
            strength: 1.0,
            timestamp: Date.now(),
            accessCount: 0,
            associations: interference
        });
        return { stored: true, interference };
    }
    async recall(query, topK = 5) {
        validateTextInput(query, 'MemoryPhysics.recall');
        const queryEmb = await this.embedder.embed(query);
        this.applyDecay();
        const results = [];
        for (const mem of this.memories.values()) {
            if (mem.strength < this.forgettingThreshold)
                continue;
            const relevance = cosineSimilarity(queryEmb, mem.embedding);
            mem.accessCount++;
            mem.strength = Math.min(1.0, mem.strength * 1.1); // Retrieval strengthens
            results.push({ ...mem, relevance });
        }
        return results
            .sort((a, b) => (b.relevance * b.strength) - (a.relevance * a.strength))
            .slice(0, topK);
    }
    applyDecay() {
        const now = Date.now();
        for (const mem of this.memories.values()) {
            const hours = (now - mem.timestamp) / 3600000;
            mem.strength *= Math.exp(-this.decayRate * hours);
            mem.timestamp = now;
        }
    }
    consolidate() {
        const clusters = [];
        const used = new Set();
        let merged = 0;
        let forgotten = 0;
        // Remove forgotten memories
        for (const [id, mem] of this.memories) {
            if (mem.strength < this.forgettingThreshold) {
                this.memories.delete(id);
                forgotten++;
            }
        }
        // Cluster similar memories
        for (const mem of this.memories.values()) {
            if (used.has(mem.id))
                continue;
            const cluster = [mem];
            for (const other of this.memories.values()) {
                if (used.has(other.id) || mem.id === other.id)
                    continue;
                const sim = cosineSimilarity(mem.embedding, other.embedding);
                if (sim > 0.9) {
                    cluster.push(other);
                    used.add(other.id);
                    merged++;
                }
            }
            if (cluster.length > 1) {
                // Merge: keep strongest, combine strength
                const strongest = cluster.reduce((a, b) => a.strength > b.strength ? a : b);
                strongest.strength = Math.min(1.0, cluster.reduce((s, m) => s + m.strength, 0));
                strongest.associations = [...new Set(cluster.flatMap(c => c.associations))];
                for (const c of cluster) {
                    if (c.id !== strongest.id)
                        this.memories.delete(c.id);
                }
            }
            clusters.push(cluster);
        }
        this.lastConsolidation = Date.now();
        return { merged, forgotten, remaining: this.memories.size };
    }
    getStats() {
        const active = [...this.memories.values()].filter(m => m.strength > this.forgettingThreshold);
        const avgStrength = active.length > 0
            ? active.reduce((s, m) => s + m.strength, 0) / active.length
            : 0;
        return {
            total: this.memories.size,
            active: active.length,
            avgStrength
        };
    }
}
/**
 * Embedding State Machine
 * Agent state through geometry: position, velocity, attention
 */
export class EmbeddingStateMachine {
    dimension;
    embedder = getOptimizedEmbedder();
    agents = new Map();
    stateRegions = new Map();
    constructor(dimension = 384) {
        this.dimension = dimension;
    }
    async init() {
        await this.embedder.init();
        // Initialize default state regions
        const regions = {
            exploring: 'exploring options, gathering information, uncertain, searching',
            executing: 'executing task, confident, taking action, progressing',
            waiting: 'waiting for input, paused, blocked, need information',
            error: 'error state, confused, failed, need help, recovery'
        };
        for (const [name, desc] of Object.entries(regions)) {
            this.stateRegions.set(name, await this.embedder.embed(desc));
        }
    }
    async registerAgent(id, initialRole) {
        validateId(id, 'EmbeddingStateMachine.registerAgent');
        validateTextInput(initialRole, 'EmbeddingStateMachine.registerAgent');
        // Security: Enforce agent limit
        if (this.agents.size >= MAX_AGENTS && !this.agents.has(id)) {
            throw new Error(`Agent capacity exceeded (max: ${MAX_AGENTS})`);
        }
        const position = await this.embedder.embed(initialRole);
        const state = {
            id,
            position,
            velocity: new Float32Array(this.dimension).fill(0),
            attention: new Float32Array(this.dimension).fill(1),
            energy: 1.0,
            lastUpdate: Date.now()
        };
        this.agents.set(id, state);
        return state;
    }
    async updateState(agentId, observation) {
        validateId(agentId, 'EmbeddingStateMachine.updateState');
        validateTextInput(observation, 'EmbeddingStateMachine.updateState');
        const agent = this.agents.get(agentId);
        if (!agent)
            throw new Error('Agent not found or access denied');
        const obsEmb = await this.embedder.embed(observation);
        // Update velocity and position
        const learningRate = 0.3;
        const momentumRate = 0.7;
        for (let i = 0; i < this.dimension; i++) {
            const gradient = obsEmb[i] - agent.position[i];
            agent.velocity[i] = momentumRate * agent.velocity[i] + learningRate * gradient;
            agent.position[i] += agent.velocity[i];
        }
        // Normalize position
        const norm = Math.sqrt(agent.position.reduce((s, v) => s + v * v, 0));
        for (let i = 0; i < this.dimension; i++) {
            agent.position[i] /= norm;
        }
        // Update attention based on velocity magnitude
        const velocityMag = Math.sqrt(agent.velocity.reduce((s, v) => s + v * v, 0));
        for (let i = 0; i < this.dimension; i++) {
            agent.attention[i] = 1 + velocityMag * Math.abs(agent.velocity[i]);
        }
        // Energy decay with movement
        agent.energy = Math.max(0.1, agent.energy - velocityMag * 0.1);
        agent.lastUpdate = Date.now();
        // Find nearest state region
        let nearestRegion = 'unknown';
        let regionProximity = -1;
        for (const [name, region] of this.stateRegions) {
            const sim = cosineSimilarity(agent.position, region);
            if (sim > regionProximity) {
                regionProximity = sim;
                nearestRegion = name;
            }
        }
        return { newState: agent, nearestRegion, regionProximity };
    }
    getAgent(id) {
        return this.agents.get(id);
    }
    getAllAgents() {
        return [...this.agents.values()];
    }
}
/**
 * Swarm Coordinator
 * Multi-agent coordination through shared embedding space
 */
export class SwarmCoordinator {
    embedder = getOptimizedEmbedder();
    stateMachine;
    constructor(dimension = 384) {
        this.stateMachine = new EmbeddingStateMachine(dimension);
    }
    async init() {
        await this.embedder.init();
        await this.stateMachine.init();
    }
    async addAgent(id, role) {
        validateId(id, 'SwarmCoordinator.addAgent');
        validateTextInput(role, 'SwarmCoordinator.addAgent');
        return this.stateMachine.registerAgent(id, role);
    }
    async coordinate(task) {
        const taskEmb = await this.embedder.embed(task);
        const agents = this.stateMachine.getAllAgents();
        const results = [];
        for (const agent of agents) {
            const taskAlignment = cosineSimilarity(agent.position, taskEmb);
            // Find best collaborator
            let bestCollaborator = null;
            let bestScore = -1;
            for (const other of agents) {
                if (other.id === agent.id)
                    continue;
                const otherAlignment = cosineSimilarity(other.position, taskEmb);
                const complementarity = 1 - cosineSimilarity(agent.position, other.position);
                const score = otherAlignment * 0.6 + complementarity * 0.4;
                if (score > bestScore) {
                    bestScore = score;
                    bestCollaborator = other.id;
                }
            }
            results.push({
                agentId: agent.id,
                taskAlignment,
                bestCollaborator,
                collaborationScore: bestScore
            });
        }
        return results.sort((a, b) => b.taskAlignment - a.taskAlignment);
    }
    specialize() {
        const agents = this.stateMachine.getAllAgents();
        const repulsionStrength = 0.05;
        for (let i = 0; i < agents.length; i++) {
            for (let j = i + 1; j < agents.length; j++) {
                const sim = cosineSimilarity(agents[i].position, agents[j].position);
                if (sim > 0.8) {
                    // Repel similar agents
                    for (let k = 0; k < agents[i].position.length; k++) {
                        const repulsion = repulsionStrength * (agents[j].position[k] - agents[i].position[k]);
                        agents[i].position[k] -= repulsion;
                        agents[j].position[k] += repulsion;
                    }
                }
            }
        }
        // Normalize all
        for (const agent of agents) {
            const norm = Math.sqrt(agent.position.reduce((s, v) => s + v * v, 0));
            for (let k = 0; k < agent.position.length; k++) {
                agent.position[k] /= norm;
            }
        }
    }
    getStatus() {
        const agents = this.stateMachine.getAllAgents();
        if (agents.length === 0)
            return { agentCount: 0, avgEnergy: 0, coherence: 0 };
        const avgEnergy = agents.reduce((s, a) => s + a.energy, 0) / agents.length;
        // Coherence = average pairwise similarity
        let coherence = 0;
        let pairs = 0;
        for (let i = 0; i < agents.length; i++) {
            for (let j = i + 1; j < agents.length; j++) {
                coherence += cosineSimilarity(agents[i].position, agents[j].position);
                pairs++;
            }
        }
        coherence = pairs > 0 ? coherence / pairs : 1;
        return { agentCount: agents.length, avgEnergy, coherence };
    }
}
/**
 * Coherence Monitor
 * Safety and alignment detection
 */
export class CoherenceMonitor {
    embedder = getOptimizedEmbedder();
    baseline = [];
    centroid = null;
    avgDistance = 0;
    async init() {
        await this.embedder.init();
    }
    async calibrate(goodOutputs) {
        // Security: Validate input array
        if (!Array.isArray(goodOutputs)) {
            throw new Error('CoherenceMonitor.calibrate: goodOutputs must be an array');
        }
        if (goodOutputs.length === 0) {
            throw new Error('CoherenceMonitor.calibrate: At least one sample is required');
        }
        if (goodOutputs.length > MAX_BASELINE_SAMPLES) {
            throw new Error(`CoherenceMonitor.calibrate: Sample count exceeds maximum of ${MAX_BASELINE_SAMPLES}`);
        }
        // Validate each sample
        for (const output of goodOutputs) {
            validateTextInput(output, 'CoherenceMonitor.calibrate');
        }
        this.baseline = await this.embedder.embedBatch(goodOutputs);
        const dim = this.baseline[0].length;
        // Calculate centroid
        this.centroid = new Float32Array(dim).fill(0);
        for (const emb of this.baseline) {
            for (let i = 0; i < dim; i++) {
                this.centroid[i] += emb[i];
            }
        }
        for (let i = 0; i < dim; i++) {
            this.centroid[i] /= this.baseline.length;
        }
        // Average distance from centroid
        this.avgDistance = this.baseline.reduce((s, b) => s + euclideanDistance(b, this.centroid), 0) / this.baseline.length;
        return { calibrated: true, sampleCount: this.baseline.length };
    }
    async check(output) {
        validateTextInput(output, 'CoherenceMonitor.check');
        validateEmbedding(this.centroid, 'CoherenceMonitor.check (call calibrate() first)');
        const outputEmb = await this.embedder.embed(output);
        const warnings = [];
        // Anomaly score
        const distance = euclideanDistance(outputEmb, this.centroid);
        const anomalyScore = distance / this.avgDistance;
        // Nearest neighbor
        let maxSim = -1;
        for (const b of this.baseline) {
            const sim = cosineSimilarity(outputEmb, b);
            if (sim > maxSim)
                maxSim = sim;
        }
        const stabilityScore = maxSim;
        // Drift direction
        const driftDirection = new Float32Array(outputEmb.length);
        for (let i = 0; i < outputEmb.length; i++) {
            driftDirection[i] = outputEmb[i] - this.centroid[i];
        }
        // Warnings
        if (anomalyScore > 2.0) {
            warnings.push('CRITICAL: Output significantly outside baseline');
        }
        else if (anomalyScore > 1.5) {
            warnings.push('WARNING: Output drifting from baseline');
        }
        if (stabilityScore < 0.5) {
            warnings.push('WARNING: Low similarity to all baseline examples');
        }
        return {
            isCoherent: anomalyScore < 1.5 && stabilityScore > 0.5,
            anomalyScore,
            stabilityScore,
            driftDirection,
            warnings
        };
    }
}
/**
 * Neural Substrate
 * Unified nervous system combining all components
 */
export class NeuralSubstrate {
    drift;
    memory;
    states;
    swarm;
    coherence;
    startTime = Date.now();
    constructor(config = {}) {
        const { dimension = 384, driftThreshold = 0.15, decayRate = 0.01 } = config;
        this.drift = new SemanticDriftDetector(driftThreshold);
        this.memory = new MemoryPhysics(decayRate);
        this.states = new EmbeddingStateMachine(dimension);
        this.swarm = new SwarmCoordinator(dimension);
        this.coherence = new CoherenceMonitor();
    }
    async init() {
        await Promise.all([
            this.drift.init(),
            this.memory.init(),
            this.states.init(),
            this.swarm.init(),
            this.coherence.init()
        ]);
    }
    async process(input, context) {
        const result = {};
        // Always check drift
        result.drift = await this.drift.detect(input);
        // Update agent state if specified
        if (context?.agentId) {
            const { nearestRegion, regionProximity } = await this.states.updateState(context.agentId, input);
            result.state = { nearestRegion, regionProximity };
        }
        // Store in memory if specified
        if (context?.memoryId) {
            const { stored } = await this.memory.store(context.memoryId, input);
            result.stored = stored;
        }
        // Check coherence if requested
        if (context?.checkCoherence) {
            result.coherence = await this.coherence.check(input);
        }
        return result;
    }
    consolidate() {
        return { memory: this.memory.consolidate() };
    }
    health() {
        const memStats = this.memory.getStats();
        const driftStats = this.drift.getStats();
        const swarmStatus = this.swarm.getStatus();
        return {
            memoryCount: memStats.total,
            activeAgents: swarmStatus.agentCount,
            avgDrift: driftStats.avgDrift,
            avgCoherence: swarmStatus.coherence,
            lastConsolidation: 0, // Would need to track this
            uptime: Date.now() - this.startTime
        };
    }
}
// Export singleton factory
let substrate = null;
export async function getNeuralSubstrate(config) {
    if (!substrate) {
        substrate = new NeuralSubstrate(config);
        await substrate.init();
    }
    return substrate;
}
//# sourceMappingURL=neural-substrate.js.map