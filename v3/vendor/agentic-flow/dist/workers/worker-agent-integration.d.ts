/**
 * Worker-Agent Integration Layer
 *
 * Bridges the worker system with agent execution through:
 * - Pattern sharing via ReasoningBank
 * - Metrics-based capability matching
 * - Self-learning feedback loops
 * - Performance-aware agent selection
 */
import { WorkerTrigger } from './types.js';
export interface AgentCapability {
    name: string;
    description: string;
    triggers: WorkerTrigger[];
    priority: 'low' | 'medium' | 'high' | 'critical';
    memoryPatterns: string[];
    benchmarkThresholds: BenchmarkThreshold[];
}
export interface BenchmarkThreshold {
    metric: string;
    target: number;
    unit: 'ms' | 'ops/s' | 'MB' | '%';
    direction: 'below' | 'above';
}
export interface AgentPerformanceProfile {
    agentName: string;
    capabilities: string[];
    avgLatencyMs: number;
    p95LatencyMs: number;
    successRate: number;
    memoryUsageMB: number;
    qualityScore: number;
    executionCount: number;
    lastExecuted: number;
}
export interface WorkerAgentMapping {
    trigger: WorkerTrigger;
    recommendedAgents: string[];
    fallbackAgents: string[];
    pipelinePhases: string[];
    memoryKeyPattern: string;
}
export declare class WorkerAgentIntegration {
    private memoryPatterns;
    private feedbackQueue;
    /**
     * Get recommended agents for a worker trigger
     */
    getRecommendedAgents(trigger: WorkerTrigger): {
        primary: string[];
        fallback: string[];
        phases: string[];
        memoryPattern: string;
    };
    /**
     * Get agent capabilities for matching
     */
    getAgentCapabilities(agentName: string): AgentCapability | undefined;
    /**
     * Find best agent for a given trigger based on performance history
     */
    selectBestAgent(trigger: WorkerTrigger): {
        agent: string;
        confidence: number;
        reasoning: string;
    };
    /**
     * Record agent execution feedback for learning
     */
    recordFeedback(trigger: WorkerTrigger, agentName: string, success: boolean, latencyMs: number, qualityScore: number, memoryMB?: number): void;
    /**
     * Process accumulated feedback for learning
     */
    private processFeedbackQueue;
    /**
     * Get performance metrics for all agents
     */
    getAgentMetrics(): AgentPerformanceProfile[];
    /**
     * Get performance metrics for specific trigger
     */
    getTriggerMetrics(trigger: WorkerTrigger): {
        trigger: WorkerTrigger;
        totalExecutions: number;
        avgLatencyMs: number;
        successRate: number;
        topAgents: Array<{
            agent: string;
            score: number;
        }>;
    };
    /**
     * Get benchmark thresholds for an agent
     */
    getBenchmarkThresholds(agentName: string): BenchmarkThreshold[];
    /**
     * Check if agent meets benchmark thresholds
     */
    checkBenchmarkCompliance(agentName: string): {
        compliant: boolean;
        violations: Array<{
            metric: string;
            actual: number;
            target: number;
        }>;
    };
    /**
     * Generate memory key for worker-agent communication
     */
    generateMemoryKey(trigger: WorkerTrigger, topic: string, phase: string): string;
    /**
     * Get integration statistics
     */
    getStats(): {
        totalAgents: number;
        trackedAgents: number;
        totalFeedback: number;
        avgQualityScore: number;
        modelCacheStats: {
            hits: number;
            misses: number;
            hitRate: string;
        };
    };
}
export declare const workerAgentIntegration: WorkerAgentIntegration;
export declare function getAgentForTrigger(trigger: WorkerTrigger): string;
export declare function recordAgentPerformance(trigger: WorkerTrigger, agent: string, success: boolean, latencyMs: number, quality: number): void;
export declare function getIntegrationStats(): {
    totalAgents: number;
    trackedAgents: number;
    totalFeedback: number;
    avgQualityScore: number;
    modelCacheStats: {
        hits: number;
        misses: number;
        hitRate: string;
    };
};
//# sourceMappingURL=worker-agent-integration.d.ts.map