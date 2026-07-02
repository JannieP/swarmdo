/**
 * Neural Embedding Substrate Integration
 *
 * Wraps ruvector's NeuralSubstrate for agentic-flow agents
 * treating embeddings as a synthetic nervous system.
 *
 * Based on ruvector@0.1.85 neural-embeddings.ts
 */
export interface DriftResult {
    distance: number;
    velocity: number;
    acceleration: number;
    trend: 'stable' | 'drifting' | 'accelerating' | 'recovering';
    shouldEscalate: boolean;
    shouldTriggerReasoning: boolean;
}
export interface MemoryEntry {
    id: string;
    embedding: Float32Array;
    content: string;
    strength: number;
    timestamp: number;
    accessCount: number;
    associations: string[];
}
export interface AgentState {
    id: string;
    position: Float32Array;
    velocity: Float32Array;
    attention: Float32Array;
    energy: number;
    lastUpdate: number;
}
export interface CoherenceResult {
    isCoherent: boolean;
    anomalyScore: number;
    stabilityScore: number;
    driftDirection: Float32Array | null;
    warnings: string[];
}
export interface SubstrateHealth {
    memoryCount: number;
    activeAgents: number;
    avgDrift: number;
    avgCoherence: number;
    lastConsolidation: number;
    uptime: number;
}
/**
 * Semantic Drift Detector
 * Monitors semantic movement and triggers reflexes
 * Optimized with pre-allocated buffers (80-95% less GC pressure)
 */
export declare class SemanticDriftDetector {
    private driftThreshold;
    private escalationThreshold;
    private historySize;
    private embedder;
    private baseline;
    private history;
    private velocity;
    private acceleration;
    private dimension;
    private tempVelocityBuffer;
    constructor(driftThreshold?: number, escalationThreshold?: number, historySize?: number);
    init(): Promise<void>;
    setBaseline(context: string): Promise<void>;
    detect(input: string): Promise<DriftResult>;
    getStats(): {
        avgDrift: number;
        maxDrift: number;
        driftEvents: number;
    };
}
/**
 * Memory Physics
 * Hippocampal-like dynamics: decay, interference, consolidation
 */
export declare class MemoryPhysics {
    private decayRate;
    private interferenceRadius;
    private forgettingThreshold;
    private embedder;
    private memories;
    private lastConsolidation;
    constructor(decayRate?: number, interferenceRadius?: number, forgettingThreshold?: number);
    init(): Promise<void>;
    store(id: string, content: string): Promise<{
        stored: boolean;
        interference: string[];
    }>;
    recall(query: string, topK?: number): Promise<Array<MemoryEntry & {
        relevance: number;
    }>>;
    private applyDecay;
    consolidate(): {
        merged: number;
        forgotten: number;
        remaining: number;
    };
    getStats(): {
        total: number;
        active: number;
        avgStrength: number;
    };
}
/**
 * Embedding State Machine
 * Agent state through geometry: position, velocity, attention
 */
export declare class EmbeddingStateMachine {
    private dimension;
    private embedder;
    private agents;
    private stateRegions;
    constructor(dimension?: number);
    init(): Promise<void>;
    registerAgent(id: string, initialRole: string): Promise<AgentState>;
    updateState(agentId: string, observation: string): Promise<{
        newState: AgentState;
        nearestRegion: string;
        regionProximity: number;
    }>;
    getAgent(id: string): AgentState | undefined;
    getAllAgents(): AgentState[];
}
/**
 * Swarm Coordinator
 * Multi-agent coordination through shared embedding space
 */
export declare class SwarmCoordinator {
    private embedder;
    private stateMachine;
    constructor(dimension?: number);
    init(): Promise<void>;
    addAgent(id: string, role: string): Promise<AgentState>;
    coordinate(task: string): Promise<Array<{
        agentId: string;
        taskAlignment: number;
        bestCollaborator: string | null;
        collaborationScore: number;
    }>>;
    specialize(): void;
    getStatus(): {
        agentCount: number;
        avgEnergy: number;
        coherence: number;
    };
}
/**
 * Coherence Monitor
 * Safety and alignment detection
 */
export declare class CoherenceMonitor {
    private embedder;
    private baseline;
    private centroid;
    private avgDistance;
    init(): Promise<void>;
    calibrate(goodOutputs: string[]): Promise<{
        calibrated: boolean;
        sampleCount: number;
    }>;
    check(output: string): Promise<CoherenceResult>;
}
/**
 * Neural Substrate
 * Unified nervous system combining all components
 */
export declare class NeuralSubstrate {
    drift: SemanticDriftDetector;
    memory: MemoryPhysics;
    states: EmbeddingStateMachine;
    swarm: SwarmCoordinator;
    coherence: CoherenceMonitor;
    private startTime;
    constructor(config?: {
        dimension?: number;
        driftThreshold?: number;
        decayRate?: number;
    });
    init(): Promise<void>;
    process(input: string, context?: {
        agentId?: string;
        memoryId?: string;
        checkCoherence?: boolean;
    }): Promise<{
        drift: DriftResult;
        state?: {
            nearestRegion: string;
            regionProximity: number;
        };
        coherence?: CoherenceResult;
        stored?: boolean;
    }>;
    consolidate(): {
        memory: ReturnType<MemoryPhysics['consolidate']>;
    };
    health(): SubstrateHealth;
}
export declare function getNeuralSubstrate(config?: {
    dimension?: number;
    driftThreshold?: number;
    decayRate?: number;
}): Promise<NeuralSubstrate>;
//# sourceMappingURL=neural-substrate.d.ts.map