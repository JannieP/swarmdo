/**
 * Embedding Geometry Examples
 *
 * Demonstrates frontier embedding patterns:
 * 1. Control signals (semantic drift detection)
 * 2. Memory physics (decay, interference, consolidation)
 * 3. Coordination primitives (swarm alignment)
 * 4. Safety monitors (coherence detection)
 * 5. Synthetic nervous system (reflexes, attention)
 */
import { getOptimizedEmbedder, cosineSimilarity, euclideanDistance } from '../embeddings/index.js';
// =============================================================================
// 1. SEMANTIC DRIFT MONITOR - Control Signals
// =============================================================================
export class SemanticDriftMonitor {
    driftThreshold;
    escalationThreshold;
    embedder = getOptimizedEmbedder();
    baseline = null;
    history = [];
    constructor(driftThreshold = 0.15, escalationThreshold = 0.30) {
        this.driftThreshold = driftThreshold;
        this.escalationThreshold = escalationThreshold;
    }
    async init() {
        await this.embedder.init();
    }
    async setBaseline(context) {
        this.baseline = await this.embedder.embed(context);
        this.history = [{ embedding: this.baseline, timestamp: Date.now() }];
    }
    async checkDrift(current) {
        const currentEmb = await this.embedder.embed(current);
        const similarity = cosineSimilarity(this.baseline, currentEmb);
        const drift = 1 - similarity;
        // Track history for trend detection
        this.history.push({ embedding: currentEmb, timestamp: Date.now() });
        if (this.history.length > 20)
            this.history.shift();
        // Calculate trend
        let trendDirection = 'stable';
        if (this.history.length >= 3) {
            const recentDrifts = this.history.slice(-3).map(h => 1 - cosineSimilarity(this.baseline, h.embedding));
            const driftDelta = recentDrifts[2] - recentDrifts[0];
            if (driftDelta > 0.05)
                trendDirection = 'drifting';
            else if (driftDelta < -0.05)
                trendDirection = 'recovering';
        }
        return {
            drift,
            shouldEscalate: drift > this.driftThreshold,
            shouldTriggerReasoning: drift > this.escalationThreshold,
            trendDirection
        };
    }
}
// =============================================================================
// 2. GEOMETRIC MEMORY - Memory Physics
// =============================================================================
export class GeometricMemory {
    decayRate;
    interferenceRadius;
    forgettingThreshold;
    embedder = getOptimizedEmbedder();
    memories = [];
    constructor(decayRate = 0.01, // Strength decay per hour
    interferenceRadius = 0.3, // Similarity threshold for interference
    forgettingThreshold = 0.1 // Below this strength = forgotten
    ) {
        this.decayRate = decayRate;
        this.interferenceRadius = interferenceRadius;
        this.forgettingThreshold = forgettingThreshold;
    }
    async init() {
        await this.embedder.init();
    }
    async store(content) {
        const embedding = await this.embedder.embed(content);
        const interferenceWith = [];
        // Check for interference with existing memories
        for (const mem of this.memories) {
            const distance = euclideanDistance(embedding, mem.embedding);
            if (distance < this.interferenceRadius) {
                // Nearby memories interfere
                const interferenceStrength = (this.interferenceRadius - distance) / this.interferenceRadius;
                mem.strength *= (1 - interferenceStrength * 0.5);
                interferenceWith.push(mem.content.substring(0, 50));
            }
        }
        this.memories.push({
            embedding,
            content,
            strength: 1.0,
            timestamp: Date.now(),
            accessCount: 0
        });
        return { stored: true, interferenceWith };
    }
    async recall(query, topK = 5) {
        const queryEmb = await this.embedder.embed(query);
        this.applyDecay();
        // Score by similarity * strength
        const scored = this.memories
            .filter(m => m.strength > this.forgettingThreshold)
            .map(m => {
            const similarity = cosineSimilarity(queryEmb, m.embedding);
            m.accessCount++; // Retrieval strengthens memory
            m.strength = Math.min(1.0, m.strength * 1.1);
            return {
                content: m.content,
                relevance: similarity,
                strength: m.strength,
                score: similarity * m.strength
            };
        })
            .sort((a, b) => b.score - a.score);
        return scored.slice(0, topK).map(({ content, relevance, strength }) => ({
            content, relevance, strength
        }));
    }
    applyDecay() {
        const now = Date.now();
        for (const mem of this.memories) {
            const hoursElapsed = (now - mem.timestamp) / 3600000;
            mem.strength *= Math.exp(-this.decayRate * hoursElapsed);
            mem.timestamp = now; // Reset decay timer
        }
    }
    // Consolidation: merge similar memories (like sleep)
    async consolidate() {
        const consolidated = [];
        const used = new Set();
        let merged = 0;
        for (let i = 0; i < this.memories.length; i++) {
            if (used.has(i))
                continue;
            const cluster = [this.memories[i]];
            for (let j = i + 1; j < this.memories.length; j++) {
                if (used.has(j))
                    continue;
                const sim = cosineSimilarity(this.memories[i].embedding, this.memories[j].embedding);
                if (sim > 0.9) {
                    cluster.push(this.memories[j]);
                    used.add(j);
                    merged++;
                }
            }
            // Merge cluster - keep strongest, sum strengths
            const strongest = cluster.reduce((a, b) => a.strength > b.strength ? a : b);
            strongest.strength = Math.min(1.0, cluster.reduce((sum, m) => sum + m.strength, 0));
            consolidated.push(strongest);
        }
        this.memories = consolidated;
        return { merged, remaining: this.memories.length };
    }
    getStats() {
        const active = this.memories.filter(m => m.strength > this.forgettingThreshold).length;
        return {
            total: this.memories.length,
            active,
            forgotten: this.memories.length - active
        };
    }
}
// =============================================================================
// 3. EMBEDDING SWARM - Coordination Primitives
// =============================================================================
export class EmbeddingSwarm {
    embedder = getOptimizedEmbedder();
    agents = new Map();
    async init() {
        await this.embedder.init();
    }
    async addAgent(id, role) {
        const roleEmb = await this.embedder.embed(role);
        this.agents.set(id, {
            position: new Float32Array(roleEmb),
            velocity: new Float32Array(roleEmb.length).fill(0),
            role,
            taskAlignment: 0
        });
    }
    async coordinate(task) {
        const taskEmb = await this.embedder.embed(task);
        const results = [];
        for (const [agentId, agent] of this.agents) {
            // Calculate task alignment
            agent.taskAlignment = cosineSimilarity(agent.position, taskEmb);
            // Find best collaborator
            let bestCollaborator = null;
            let bestCollab = -1;
            for (const [otherId, other] of this.agents) {
                if (otherId === agentId)
                    continue;
                // Collaboration score = both aligned to task + complementary skills
                const otherTaskAlign = cosineSimilarity(other.position, taskEmb);
                const complementarity = 1 - cosineSimilarity(agent.position, other.position);
                const collabScore = otherTaskAlign * 0.6 + complementarity * 0.4;
                if (collabScore > bestCollab) {
                    bestCollab = collabScore;
                    bestCollaborator = otherId;
                }
            }
            // Update position (move toward task)
            const learningRate = 0.1;
            for (let i = 0; i < agent.position.length; i++) {
                agent.velocity[i] = 0.9 * agent.velocity[i] +
                    learningRate * (taskEmb[i] - agent.position[i]);
                agent.position[i] += agent.velocity[i];
            }
            // Normalize
            const norm = Math.sqrt(agent.position.reduce((s, v) => s + v * v, 0));
            for (let i = 0; i < agent.position.length; i++) {
                agent.position[i] /= norm;
            }
            results.push({
                agentId,
                role: agent.role,
                taskAlignment: agent.taskAlignment,
                bestCollaborator
            });
        }
        return results.sort((a, b) => b.taskAlignment - a.taskAlignment);
    }
    // Emergent specialization through repulsion
    specialize() {
        const repulsionStrength = 0.05;
        for (const [id1, agent1] of this.agents) {
            for (const [id2, agent2] of this.agents) {
                if (id1 >= id2)
                    continue;
                const similarity = cosineSimilarity(agent1.position, agent2.position);
                if (similarity > 0.8) {
                    // Too similar - repel
                    for (let i = 0; i < agent1.position.length; i++) {
                        const repulsion = repulsionStrength * (agent2.position[i] - agent1.position[i]);
                        agent1.position[i] -= repulsion;
                        agent2.position[i] += repulsion;
                    }
                }
            }
        }
        // Normalize all
        for (const agent of this.agents.values()) {
            const norm = Math.sqrt(agent.position.reduce((s, v) => s + v * v, 0));
            for (let i = 0; i < agent.position.length; i++) {
                agent.position[i] /= norm;
            }
        }
    }
}
// =============================================================================
// 4. COHERENCE MONITOR - Safety Signals
// =============================================================================
export class CoherenceMonitor {
    embedder = getOptimizedEmbedder();
    baselineDistribution = [];
    centroid = null;
    avgDistanceFromCentroid = 0;
    async init() {
        await this.embedder.init();
    }
    async calibrate(goodOutputs) {
        this.baselineDistribution = await this.embedder.embedBatch(goodOutputs);
        const dim = this.baselineDistribution[0].length;
        // Calculate centroid
        this.centroid = new Float32Array(dim).fill(0);
        for (const emb of this.baselineDistribution) {
            for (let i = 0; i < dim; i++) {
                this.centroid[i] += emb[i];
            }
        }
        for (let i = 0; i < dim; i++) {
            this.centroid[i] /= this.baselineDistribution.length;
        }
        // Calculate average distance
        this.avgDistanceFromCentroid = this.baselineDistribution.reduce((sum, b) => sum + euclideanDistance(b, this.centroid), 0) / this.baselineDistribution.length;
        return {
            centroid: Array.from(this.centroid),
            avgDistance: this.avgDistanceFromCentroid
        };
    }
    async check(output) {
        if (!this.centroid)
            throw new Error('Monitor not calibrated');
        const outputEmb = await this.embedder.embed(output);
        const warnings = [];
        // Distance from centroid
        const centroidDistance = euclideanDistance(outputEmb, this.centroid);
        const anomalyScore = centroidDistance / this.avgDistanceFromCentroid;
        // Nearest neighbor
        let nearestSim = -1;
        for (const baseline of this.baselineDistribution) {
            const sim = cosineSimilarity(outputEmb, baseline);
            if (sim > nearestSim)
                nearestSim = sim;
        }
        // Generate warnings
        if (anomalyScore > 2.0) {
            warnings.push('CRITICAL: Output significantly outside baseline distribution');
        }
        else if (anomalyScore > 1.5) {
            warnings.push('WARNING: Output drifting from baseline');
        }
        if (nearestSim < 0.5) {
            warnings.push('WARNING: Output dissimilar to all known-good examples');
        }
        return {
            isCoherent: anomalyScore < 1.5 && nearestSim > 0.5,
            anomalyScore,
            nearestNeighborSim: nearestSim,
            warnings
        };
    }
}
// =============================================================================
// 5. SYNTHETIC NERVOUS SYSTEM - Continuous Regulation
// =============================================================================
export class SyntheticNervousSystem {
    embedder = getOptimizedEmbedder();
    sensoryBuffer = [];
    attentionWeights = null;
    internalState = null;
    reflexes = new Map();
    async init() {
        await this.embedder.init();
        const dim = (await this.embedder.embed('init')).length;
        this.internalState = new Float32Array(dim).fill(0);
    }
    async registerReflex(name, triggerConcept, threshold, response) {
        const triggerEmb = await this.embedder.embed(triggerConcept);
        this.reflexes.set(name, { trigger: triggerEmb, threshold, response });
    }
    async sense(input) {
        const encoded = await this.embedder.embed(input);
        const reflexesTriggered = [];
        // Check reflexes
        for (const [name, reflex] of this.reflexes) {
            const activation = cosineSimilarity(encoded, reflex.trigger);
            if (activation > reflex.threshold) {
                reflexesTriggered.push(name);
                reflex.response(activation);
            }
        }
        // Calculate novelty
        let novelty = 1.0;
        if (this.sensoryBuffer.length > 0) {
            const recentAvg = new Float32Array(encoded.length).fill(0);
            for (const past of this.sensoryBuffer) {
                for (let i = 0; i < encoded.length; i++) {
                    recentAvg[i] += past[i];
                }
            }
            for (let i = 0; i < encoded.length; i++) {
                recentAvg[i] /= this.sensoryBuffer.length;
            }
            novelty = 1 - cosineSimilarity(encoded, recentAvg);
        }
        // Update buffer
        this.sensoryBuffer.push(encoded);
        if (this.sensoryBuffer.length > 10)
            this.sensoryBuffer.shift();
        // Update attention (high novelty = high attention)
        this.attentionWeights = new Float32Array(encoded.length);
        for (let i = 0; i < encoded.length; i++) {
            this.attentionWeights[i] = 1 + novelty * 2;
        }
        // Update internal state (blend with perception)
        if (this.internalState) {
            for (let i = 0; i < this.internalState.length; i++) {
                this.internalState[i] = 0.7 * this.internalState[i] + 0.3 * encoded[i];
            }
        }
        return { encoding: encoded, novelty, reflexesTriggered };
    }
    getInternalState() {
        return this.internalState;
    }
    getAttention() {
        return this.attentionWeights;
    }
}
// =============================================================================
// DEMO
// =============================================================================
async function demo() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('         EMBEDDING GEOMETRY - Frontier Patterns Demo');
    console.log('═══════════════════════════════════════════════════════════════\n');
    // 1. Semantic Drift Monitor
    console.log('1️⃣  SEMANTIC DRIFT MONITOR');
    console.log('─────────────────────────────────────────────────────────────\n');
    const driftMonitor = new SemanticDriftMonitor();
    await driftMonitor.init();
    await driftMonitor.setBaseline('User asking about API authentication and security');
    const queries = [
        'How do I set up OAuth2?',
        'What are the rate limits?',
        'Can I bypass the security checks?',
        'How do I hack into the admin panel?'
    ];
    for (const query of queries) {
        const result = await driftMonitor.checkDrift(query);
        console.log(`Query: "${query}"`);
        console.log(`  Drift: ${(result.drift * 100).toFixed(1)}%`);
        console.log(`  Escalate: ${result.shouldEscalate ? '⚠️ YES' : '✓ No'}`);
        console.log(`  Trigger Reasoning: ${result.shouldTriggerReasoning ? '🚨 YES' : '✓ No'}`);
        console.log(`  Trend: ${result.trendDirection}\n`);
    }
    // 2. Geometric Memory
    console.log('\n2️⃣  GEOMETRIC MEMORY');
    console.log('─────────────────────────────────────────────────────────────\n');
    const memory = new GeometricMemory();
    await memory.init();
    const experiences = [
        'Successfully deployed API using Docker containers',
        'Fixed authentication bug in JWT token validation',
        'Deployed React frontend to Vercel',
        'Debugged CORS issues with API gateway',
        'Similar: Fixed token expiration bug in auth' // Will interfere with JWT one
    ];
    for (const exp of experiences) {
        const result = await memory.store(exp);
        console.log(`Stored: "${exp.substring(0, 50)}..."`);
        if (result.interferenceWith.length > 0) {
            console.log(`  ⚡ Interference with: ${result.interferenceWith.join(', ')}`);
        }
    }
    console.log('\nRecalling "authentication problems":');
    const recalled = await memory.recall('authentication problems', 3);
    for (const mem of recalled) {
        console.log(`  • ${mem.content.substring(0, 50)}...`);
        console.log(`    Relevance: ${(mem.relevance * 100).toFixed(1)}%, Strength: ${(mem.strength * 100).toFixed(1)}%`);
    }
    const consolidation = await memory.consolidate();
    console.log(`\nConsolidation: merged ${consolidation.merged} memories, ${consolidation.remaining} remaining`);
    // 3. Embedding Swarm
    console.log('\n3️⃣  EMBEDDING SWARM COORDINATION');
    console.log('─────────────────────────────────────────────────────────────\n');
    const swarm = new EmbeddingSwarm();
    await swarm.init();
    await swarm.addAgent('alice', 'frontend developer specializing in React and UI');
    await swarm.addAgent('bob', 'backend engineer expert in APIs and databases');
    await swarm.addAgent('carol', 'security specialist focusing on authentication');
    await swarm.addAgent('dave', 'devops engineer handling deployment and CI/CD');
    const task = 'Build a secure user authentication system with OAuth2';
    console.log(`Task: "${task}"\n`);
    const coordination = await swarm.coordinate(task);
    console.log('Agent Alignment to Task:');
    for (const agent of coordination) {
        console.log(`  ${agent.agentId} (${agent.role})`);
        console.log(`    Task alignment: ${(agent.taskAlignment * 100).toFixed(1)}%`);
        console.log(`    Best collaborator: ${agent.bestCollaborator || 'none'}`);
    }
    console.log('\nApplying specialization pressure...');
    swarm.specialize();
    const afterSpecialization = await swarm.coordinate(task);
    console.log('After specialization:');
    for (const agent of afterSpecialization) {
        console.log(`  ${agent.agentId}: ${(agent.taskAlignment * 100).toFixed(1)}% alignment`);
    }
    // 4. Coherence Monitor
    console.log('\n4️⃣  COHERENCE MONITOR (Safety)');
    console.log('─────────────────────────────────────────────────────────────\n');
    const coherenceMonitor = new CoherenceMonitor();
    await coherenceMonitor.init();
    const goodOutputs = [
        'Here is the code for the API endpoint.',
        'The function handles authentication correctly.',
        'I have implemented error handling as requested.',
        'The tests are passing successfully.',
        'Documentation has been updated.'
    ];
    await coherenceMonitor.calibrate(goodOutputs);
    console.log('Calibrated with 5 known-good outputs\n');
    const testOutputs = [
        'Here is the updated authentication code.',
        'I refuse to help with that request.',
        'BUY CRYPTO NOW! GUARANTEED RETURNS!',
        'The implementation follows best practices.'
    ];
    for (const output of testOutputs) {
        const result = await coherenceMonitor.check(output);
        console.log(`Output: "${output.substring(0, 50)}..."`);
        console.log(`  Coherent: ${result.isCoherent ? '✓ Yes' : '✗ No'}`);
        console.log(`  Anomaly Score: ${result.anomalyScore.toFixed(2)}`);
        console.log(`  Nearest Neighbor Sim: ${(result.nearestNeighborSim * 100).toFixed(1)}%`);
        if (result.warnings.length > 0) {
            console.log(`  ⚠️ Warnings: ${result.warnings.join(', ')}`);
        }
        console.log('');
    }
    // 5. Synthetic Nervous System
    console.log('\n5️⃣  SYNTHETIC NERVOUS SYSTEM');
    console.log('─────────────────────────────────────────────────────────────\n');
    const nervous = new SyntheticNervousSystem();
    await nervous.init();
    await nervous.registerReflex('danger', 'threat danger emergency attack harm security breach', 0.6, (activation) => console.log(`  🚨 DANGER REFLEX (activation: ${(activation * 100).toFixed(0)}%)`));
    await nervous.registerReflex('opportunity', 'opportunity success reward achievement win', 0.7, (activation) => console.log(`  ✨ OPPORTUNITY REFLEX (activation: ${(activation * 100).toFixed(0)}%)`));
    const inputs = [
        'The user is making good progress on the task.',
        'Everything is running smoothly.',
        'Warning: unauthorized access attempt detected!',
        'Great news! The deployment was successful!',
        'Critical security vulnerability discovered!'
    ];
    console.log('Processing sensory inputs:\n');
    for (const input of inputs) {
        console.log(`Input: "${input}"`);
        const result = await nervous.sense(input);
        console.log(`  Novelty: ${(result.novelty * 100).toFixed(1)}%`);
        if (result.reflexesTriggered.length === 0) {
            console.log(`  Reflexes: (none)`);
        }
        console.log('');
    }
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('           Intelligence moves from models to geometry.');
    console.log('═══════════════════════════════════════════════════════════════\n');
}
// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
    demo().catch(console.error);
}
export { demo };
//# sourceMappingURL=embedding-geometry.js.map