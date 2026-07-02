/**
 * Background Workers Module
 * Non-blocking workers triggered by keywords that run silently
 *
 * REFACTORED: Consolidated phase system eliminates duplication
 * - consolidated-phases.ts: Single source of truth for all phases
 * - phase-executors.ts: Backwards-compatible wrapper + specialized phases
 * - ruvector-native-integration.ts: Native runner using consolidated phases
 *
 * Integrates with RuVector ecosystem:
 * - SONA: Self-learning trajectory tracking
 * - ReasoningBank: Pattern storage and retrieval
 * - HNSW: Vector indexing for semantic search
 */
// Core types and modules
export * from './types.js';
export * from './trigger-detector.js';
export * from './worker-registry.js';
export * from './resource-governor.js';
export * from './dispatch-service.js';
export * from './ruvector-integration.js';
export * from './hooks-integration.js';
export * from './mcp-tools.js';
// Consolidated phase system (primary)
export * from './consolidated-phases.js';
// Custom worker system (uses consolidated phases)
// Note: Exclude PhaseResult to avoid conflict with types.ts
export { DEFAULT_CAPABILITIES, DEFAULT_FILE_FILTER, DEFAULT_OUTPUT, WORKER_PRESETS, EXAMPLE_CONFIG, validateWorkerDefinition } from './custom-worker-config.js';
// Phase executors - exclude PhaseContext to avoid conflict
export { createPhaseContext, registerPhaseExecutor, getPhaseExecutor, executePhasePipeline } from './phase-executors.js';
export * from './custom-worker-factory.js';
// Worker-Agent integration and benchmarks
export * from './worker-agent-integration.js';
export * from './worker-benchmarks.js';
// RuVector native integration (uses consolidated phases)
export * from './ruvector-native-integration.js';
// Re-export singletons
export { getTriggerDetector } from './trigger-detector.js';
export { getWorkerRegistry } from './worker-registry.js';
export { getResourceGovernor } from './resource-governor.js';
export { getWorkerDispatchService } from './dispatch-service.js';
export { getRuVectorWorkerIntegration } from './ruvector-integration.js';
// Re-export custom worker singleton
export { customWorkerManager } from './custom-worker-factory.js';
// Re-export integration singletons
export { workerAgentIntegration, getIntegrationStats, getAgentForTrigger, recordAgentPerformance } from './worker-agent-integration.js';
export { workerBenchmarks, runBenchmarks } from './worker-benchmarks.js';
// Re-export useful utilities
export { formatWorkerInfo, formatPresetList } from './custom-worker-factory.js';
export { listPhaseExecutors } from './phase-executors.js'; // Dedicated export for this utility
export { listUnifiedPhases, runUnifiedPipeline } from './consolidated-phases.js';
//# sourceMappingURL=index.js.map