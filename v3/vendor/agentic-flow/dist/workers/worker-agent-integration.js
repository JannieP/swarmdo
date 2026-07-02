/**
 * Worker-Agent Integration Layer
 *
 * Bridges the worker system with agent execution through:
 * - Pattern sharing via ReasoningBank
 * - Metrics-based capability matching
 * - Self-learning feedback loops
 * - Performance-aware agent selection
 */
import { modelCache } from '../utils/model-cache.js';
// ============================================================================
// Agent Capability Registry
// ============================================================================
const AGENT_CAPABILITIES = new Map([
    ['researcher', {
            name: 'researcher',
            description: 'Deep research and pattern discovery',
            triggers: ['ultralearn', 'deepdive', 'map'],
            priority: 'high',
            memoryPatterns: ['research/*', 'patterns/*', 'context/*'],
            benchmarkThresholds: [
                { metric: 'p95_latency', target: 500, unit: 'ms', direction: 'below' },
                { metric: 'memory_mb', target: 256, unit: 'MB', direction: 'below' }
            ]
        }],
    ['coder', {
            name: 'coder',
            description: 'Code implementation and optimization',
            triggers: ['optimize', 'refactor'],
            priority: 'high',
            memoryPatterns: ['code/*', 'implementations/*', 'patterns/code/*'],
            benchmarkThresholds: [
                { metric: 'p95_latency', target: 300, unit: 'ms', direction: 'below' },
                { metric: 'quality_score', target: 0.85, unit: '%', direction: 'above' }
            ]
        }],
    ['tester', {
            name: 'tester',
            description: 'Test coverage and gap analysis',
            triggers: ['testgaps', 'audit'],
            priority: 'medium',
            memoryPatterns: ['tests/*', 'coverage/*', 'quality/*'],
            benchmarkThresholds: [
                { metric: 'coverage', target: 80, unit: '%', direction: 'above' },
                { metric: 'p95_latency', target: 400, unit: 'ms', direction: 'below' }
            ]
        }],
    ['security-analyst', {
            name: 'security-analyst',
            description: 'Security analysis and vulnerability detection',
            triggers: ['audit', 'deepdive'],
            priority: 'critical',
            memoryPatterns: ['security/*', 'vulnerabilities/*', 'audit/*'],
            benchmarkThresholds: [
                { metric: 'scan_coverage', target: 95, unit: '%', direction: 'above' },
                { metric: 'p95_latency', target: 1000, unit: 'ms', direction: 'below' }
            ]
        }],
    ['performance-analyzer', {
            name: 'performance-analyzer',
            description: 'Performance analysis and optimization recommendations',
            triggers: ['benchmark', 'optimize'],
            priority: 'medium',
            memoryPatterns: ['performance/*', 'metrics/*', 'benchmarks/*'],
            benchmarkThresholds: [
                { metric: 'analysis_depth', target: 10, unit: 'ops/s', direction: 'above' }
            ]
        }],
    ['documenter', {
            name: 'documenter',
            description: 'Documentation generation and maintenance',
            triggers: ['document'],
            priority: 'low',
            memoryPatterns: ['docs/*', 'api/*', 'readme/*'],
            benchmarkThresholds: [
                { metric: 'p95_latency', target: 600, unit: 'ms', direction: 'below' }
            ]
        }]
]);
// ============================================================================
// Worker-Agent Mappings
// ============================================================================
const WORKER_AGENT_MAPPINGS = new Map([
    ['ultralearn', {
            trigger: 'ultralearn',
            recommendedAgents: ['researcher', 'coder'],
            fallbackAgents: ['planner'],
            pipelinePhases: ['file-discovery', 'pattern-discovery', 'vectorization', 'summarization'],
            memoryKeyPattern: 'ultralearn/{topic}/{phase}'
        }],
    ['optimize', {
            trigger: 'optimize',
            recommendedAgents: ['performance-analyzer', 'coder'],
            fallbackAgents: ['researcher'],
            pipelinePhases: ['static-analysis', 'performance-analysis', 'pattern-extraction'],
            memoryKeyPattern: 'optimize/{topic}/{metric}'
        }],
    ['audit', {
            trigger: 'audit',
            recommendedAgents: ['security-analyst', 'tester'],
            fallbackAgents: ['reviewer'],
            pipelinePhases: ['security-analysis', 'secret-detection', 'vulnerability-scan'],
            memoryKeyPattern: 'audit/{topic}/{finding}'
        }],
    ['benchmark', {
            trigger: 'benchmark',
            recommendedAgents: ['performance-analyzer'],
            fallbackAgents: ['coder', 'tester'],
            pipelinePhases: ['performance-analysis', 'metrics-collection', 'report-generation'],
            memoryKeyPattern: 'benchmark/{topic}/{metric}'
        }],
    ['testgaps', {
            trigger: 'testgaps',
            recommendedAgents: ['tester'],
            fallbackAgents: ['coder'],
            pipelinePhases: ['file-discovery', 'coverage-analysis', 'gap-detection'],
            memoryKeyPattern: 'testgaps/{module}/{coverage}'
        }],
    ['document', {
            trigger: 'document',
            recommendedAgents: ['documenter', 'researcher'],
            fallbackAgents: ['coder'],
            pipelinePhases: ['api-discovery', 'doc-generation', 'indexing'],
            memoryKeyPattern: 'docs/{topic}/{section}'
        }],
    ['deepdive', {
            trigger: 'deepdive',
            recommendedAgents: ['researcher', 'security-analyst'],
            fallbackAgents: ['coder'],
            pipelinePhases: ['call-graph', 'dependency-graph', 'trace-analysis'],
            memoryKeyPattern: 'deepdive/{topic}/{level}'
        }],
    ['refactor', {
            trigger: 'refactor',
            recommendedAgents: ['coder', 'reviewer'],
            fallbackAgents: ['researcher'],
            pipelinePhases: ['complexity-analysis', 'code-smell-detection', 'pattern-extraction'],
            memoryKeyPattern: 'refactor/{topic}/{improvement}'
        }],
    ['map', {
            trigger: 'map',
            recommendedAgents: ['researcher'],
            fallbackAgents: ['coder'],
            pipelinePhases: ['dependency-discovery', 'graph-build', 'indexing'],
            memoryKeyPattern: 'map/{module}/{relationship}'
        }],
    ['preload', {
            trigger: 'preload',
            recommendedAgents: ['researcher'],
            fallbackAgents: [],
            pipelinePhases: ['file-discovery', 'vectorization'],
            memoryKeyPattern: 'preload/{context}/{file}'
        }],
    ['predict', {
            trigger: 'predict',
            recommendedAgents: ['performance-analyzer'],
            fallbackAgents: ['researcher'],
            pipelinePhases: ['pattern-discovery', 'prediction'],
            memoryKeyPattern: 'predict/{context}/{next}'
        }],
    ['consolidate', {
            trigger: 'consolidate',
            recommendedAgents: ['researcher'],
            fallbackAgents: [],
            pipelinePhases: ['pattern-extraction', 'pattern-storage'],
            memoryKeyPattern: 'consolidate/{session}/{pattern}'
        }]
]);
// ============================================================================
// Performance Tracking
// ============================================================================
const agentPerformanceProfiles = new Map();
function updateAgentPerformance(agentName, latencyMs, success, memoryMB, quality) {
    const existing = agentPerformanceProfiles.get(agentName);
    const count = existing?.executionCount || 0;
    // Exponential moving average
    const alpha = 0.2;
    if (existing) {
        existing.avgLatencyMs = alpha * latencyMs + (1 - alpha) * existing.avgLatencyMs;
        existing.p95LatencyMs = Math.max(latencyMs, existing.p95LatencyMs * 0.95);
        existing.successRate = alpha * (success ? 1 : 0) + (1 - alpha) * existing.successRate;
        existing.memoryUsageMB = alpha * memoryMB + (1 - alpha) * existing.memoryUsageMB;
        existing.qualityScore = alpha * quality + (1 - alpha) * existing.qualityScore;
        existing.executionCount = count + 1;
        existing.lastExecuted = Date.now();
    }
    else {
        agentPerformanceProfiles.set(agentName, {
            agentName,
            capabilities: AGENT_CAPABILITIES.get(agentName)?.triggers || [],
            avgLatencyMs: latencyMs,
            p95LatencyMs: latencyMs,
            successRate: success ? 1 : 0,
            memoryUsageMB: memoryMB,
            qualityScore: quality,
            executionCount: 1,
            lastExecuted: Date.now()
        });
    }
}
// ============================================================================
// Worker-Agent Integration Manager
// ============================================================================
export class WorkerAgentIntegration {
    memoryPatterns = new Map();
    feedbackQueue = [];
    /**
     * Get recommended agents for a worker trigger
     */
    getRecommendedAgents(trigger) {
        const mapping = WORKER_AGENT_MAPPINGS.get(trigger);
        if (!mapping) {
            return {
                primary: ['researcher'],
                fallback: [],
                phases: ['file-discovery', 'summarization'],
                memoryPattern: `${trigger}/{topic}/{phase}`
            };
        }
        // Sort by performance if we have data
        const sortedPrimary = [...mapping.recommendedAgents].sort((a, b) => {
            const profA = agentPerformanceProfiles.get(a);
            const profB = agentPerformanceProfiles.get(b);
            if (!profA)
                return 1;
            if (!profB)
                return -1;
            return profB.qualityScore - profA.qualityScore;
        });
        return {
            primary: sortedPrimary,
            fallback: mapping.fallbackAgents,
            phases: mapping.pipelinePhases,
            memoryPattern: mapping.memoryKeyPattern
        };
    }
    /**
     * Get agent capabilities for matching
     */
    getAgentCapabilities(agentName) {
        return AGENT_CAPABILITIES.get(agentName);
    }
    /**
     * Find best agent for a given trigger based on performance history
     */
    selectBestAgent(trigger) {
        const { primary, fallback } = this.getRecommendedAgents(trigger);
        const candidates = [...primary, ...fallback];
        if (candidates.length === 0) {
            return {
                agent: 'researcher',
                confidence: 0.5,
                reasoning: 'Default agent - no specific mapping'
            };
        }
        // Find best performing agent
        let bestAgent = candidates[0];
        let bestScore = 0;
        for (const agent of candidates) {
            const profile = agentPerformanceProfiles.get(agent);
            if (profile) {
                // Combined score: quality * success_rate * (1 / latency_factor)
                const latencyFactor = Math.max(1, profile.avgLatencyMs / 100);
                const score = profile.qualityScore * profile.successRate * (1 / latencyFactor);
                if (score > bestScore) {
                    bestScore = score;
                    bestAgent = agent;
                }
            }
        }
        const profile = agentPerformanceProfiles.get(bestAgent);
        const confidence = profile
            ? Math.min(0.95, 0.5 + (profile.executionCount * 0.01) + (profile.qualityScore * 0.4))
            : 0.6;
        return {
            agent: bestAgent,
            confidence,
            reasoning: profile
                ? `Selected based on ${profile.executionCount} executions with ${(profile.successRate * 100).toFixed(1)}% success`
                : 'No performance history - using default recommendation'
        };
    }
    /**
     * Record agent execution feedback for learning
     */
    recordFeedback(trigger, agentName, success, latencyMs, qualityScore, memoryMB = 0) {
        updateAgentPerformance(agentName, latencyMs, success, memoryMB, qualityScore);
        this.feedbackQueue.push({
            trigger,
            agent: agentName,
            success,
            latency: latencyMs,
            quality: qualityScore
        });
        // Process feedback queue periodically
        if (this.feedbackQueue.length > 50) {
            this.processFeedbackQueue();
        }
    }
    /**
     * Process accumulated feedback for learning
     */
    processFeedbackQueue() {
        // Group by trigger and agent
        const grouped = new Map();
        for (const feedback of this.feedbackQueue) {
            const key = `${feedback.trigger}:${feedback.agent}`;
            const group = grouped.get(key) || [];
            group.push(feedback);
            grouped.set(key, group);
        }
        // Calculate aggregate metrics
        for (const [key, feedbacks] of grouped) {
            const avgQuality = feedbacks.reduce((sum, f) => sum + f.quality, 0) / feedbacks.length;
            const avgLatency = feedbacks.reduce((sum, f) => sum + f.latency, 0) / feedbacks.length;
            const successRate = feedbacks.filter(f => f.success).length / feedbacks.length;
            // Store as pattern for future retrieval
            const patternKey = `learning/agent-performance/${key.replace(':', '/')}`;
            this.memoryPatterns.set(patternKey, [{
                    avgQuality,
                    avgLatency,
                    successRate,
                    sampleCount: feedbacks.length,
                    updatedAt: Date.now()
                }]);
        }
        this.feedbackQueue = [];
    }
    /**
     * Get performance metrics for all agents
     */
    getAgentMetrics() {
        return Array.from(agentPerformanceProfiles.values());
    }
    /**
     * Get performance metrics for specific trigger
     */
    getTriggerMetrics(trigger) {
        const { primary, fallback } = this.getRecommendedAgents(trigger);
        const agents = [...primary, ...fallback];
        let totalExecutions = 0;
        let totalLatency = 0;
        let successCount = 0;
        const agentScores = [];
        for (const agent of agents) {
            const profile = agentPerformanceProfiles.get(agent);
            if (profile) {
                totalExecutions += profile.executionCount;
                totalLatency += profile.avgLatencyMs * profile.executionCount;
                successCount += profile.successRate * profile.executionCount;
                agentScores.push({
                    agent,
                    score: profile.qualityScore * profile.successRate
                });
            }
        }
        return {
            trigger,
            totalExecutions,
            avgLatencyMs: totalExecutions > 0 ? totalLatency / totalExecutions : 0,
            successRate: totalExecutions > 0 ? successCount / totalExecutions : 0,
            topAgents: agentScores.sort((a, b) => b.score - a.score).slice(0, 3)
        };
    }
    /**
     * Get benchmark thresholds for an agent
     */
    getBenchmarkThresholds(agentName) {
        return AGENT_CAPABILITIES.get(agentName)?.benchmarkThresholds || [];
    }
    /**
     * Check if agent meets benchmark thresholds
     */
    checkBenchmarkCompliance(agentName) {
        const thresholds = this.getBenchmarkThresholds(agentName);
        const profile = agentPerformanceProfiles.get(agentName);
        if (!profile || thresholds.length === 0) {
            return { compliant: true, violations: [] };
        }
        const violations = [];
        for (const threshold of thresholds) {
            let actual;
            switch (threshold.metric) {
                case 'p95_latency':
                    actual = profile.p95LatencyMs;
                    break;
                case 'memory_mb':
                    actual = profile.memoryUsageMB;
                    break;
                case 'quality_score':
                    actual = profile.qualityScore;
                    break;
                default:
                    continue;
            }
            const passed = threshold.direction === 'below'
                ? actual <= threshold.target
                : actual >= threshold.target;
            if (!passed) {
                violations.push({
                    metric: threshold.metric,
                    actual,
                    target: threshold.target
                });
            }
        }
        return {
            compliant: violations.length === 0,
            violations
        };
    }
    /**
     * Generate memory key for worker-agent communication
     */
    generateMemoryKey(trigger, topic, phase) {
        const mapping = WORKER_AGENT_MAPPINGS.get(trigger);
        const pattern = mapping?.memoryKeyPattern || `${trigger}/{topic}/{phase}`;
        return pattern
            .replace('{topic}', topic || 'default')
            .replace('{phase}', phase)
            .replace('{metric}', phase)
            .replace('{finding}', phase)
            .replace('{module}', topic || 'main')
            .replace('{section}', phase)
            .replace('{level}', '0')
            .replace('{improvement}', phase)
            .replace('{relationship}', phase)
            .replace('{context}', topic || 'default')
            .replace('{file}', phase)
            .replace('{next}', phase)
            .replace('{pattern}', phase)
            .replace('{coverage}', phase);
    }
    /**
     * Get integration statistics
     */
    getStats() {
        const profiles = Array.from(agentPerformanceProfiles.values());
        const totalExecutions = profiles.reduce((sum, p) => sum + p.executionCount, 0);
        const avgQuality = profiles.length > 0
            ? profiles.reduce((sum, p) => sum + p.qualityScore, 0) / profiles.length
            : 0;
        const cacheStats = modelCache.getStats();
        return {
            totalAgents: AGENT_CAPABILITIES.size,
            trackedAgents: profiles.length,
            totalFeedback: totalExecutions,
            avgQualityScore: avgQuality,
            modelCacheStats: {
                hits: cacheStats.hits,
                misses: cacheStats.misses,
                hitRate: `${(cacheStats.hitRate * 100).toFixed(1)}%`
            }
        };
    }
}
// Singleton instance
export const workerAgentIntegration = new WorkerAgentIntegration();
// ============================================================================
// Convenience Functions
// ============================================================================
export function getAgentForTrigger(trigger) {
    return workerAgentIntegration.selectBestAgent(trigger).agent;
}
export function recordAgentPerformance(trigger, agent, success, latencyMs, quality) {
    workerAgentIntegration.recordFeedback(trigger, agent, success, latencyMs, quality);
}
export function getIntegrationStats() {
    return workerAgentIntegration.getStats();
}
//# sourceMappingURL=worker-agent-integration.js.map