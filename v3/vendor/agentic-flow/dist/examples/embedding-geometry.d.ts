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
export declare class SemanticDriftMonitor {
    private driftThreshold;
    private escalationThreshold;
    private embedder;
    private baseline;
    private history;
    constructor(driftThreshold?: number, escalationThreshold?: number);
    init(): Promise<void>;
    setBaseline(context: string): Promise<void>;
    checkDrift(current: string): Promise<{
        drift: number;
        shouldEscalate: boolean;
        shouldTriggerReasoning: boolean;
        trendDirection: 'stable' | 'drifting' | 'recovering';
    }>;
}
export declare class GeometricMemory {
    private decayRate;
    private interferenceRadius;
    private forgettingThreshold;
    private embedder;
    private memories;
    constructor(decayRate?: number, // Strength decay per hour
    interferenceRadius?: number, // Similarity threshold for interference
    forgettingThreshold?: number);
    init(): Promise<void>;
    store(content: string): Promise<{
        stored: boolean;
        interferenceWith: string[];
    }>;
    recall(query: string, topK?: number): Promise<Array<{
        content: string;
        relevance: number;
        strength: number;
    }>>;
    private applyDecay;
    consolidate(): Promise<{
        merged: number;
        remaining: number;
    }>;
    getStats(): {
        total: number;
        active: number;
        forgotten: number;
    };
}
export declare class EmbeddingSwarm {
    private embedder;
    private agents;
    init(): Promise<void>;
    addAgent(id: string, role: string): Promise<void>;
    coordinate(task: string): Promise<Array<{
        agentId: string;
        role: string;
        taskAlignment: number;
        bestCollaborator: string | null;
    }>>;
    specialize(): void;
}
export declare class CoherenceMonitor {
    private embedder;
    private baselineDistribution;
    private centroid;
    private avgDistanceFromCentroid;
    init(): Promise<void>;
    calibrate(goodOutputs: string[]): Promise<{
        centroid: number[];
        avgDistance: number;
    }>;
    check(output: string): Promise<{
        isCoherent: boolean;
        anomalyScore: number;
        nearestNeighborSim: number;
        warnings: string[];
    }>;
}
export declare class SyntheticNervousSystem {
    private embedder;
    private sensoryBuffer;
    private attentionWeights;
    private internalState;
    private reflexes;
    init(): Promise<void>;
    registerReflex(name: string, triggerConcept: string, threshold: number, response: (activation: number) => void): Promise<void>;
    sense(input: string): Promise<{
        encoding: Float32Array;
        novelty: number;
        reflexesTriggered: string[];
    }>;
    getInternalState(): Float32Array | null;
    getAttention(): Float32Array | null;
}
declare function demo(): Promise<void>;
export { demo };
//# sourceMappingURL=embedding-geometry.d.ts.map