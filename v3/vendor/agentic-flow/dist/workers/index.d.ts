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
export * from './types.js';
export * from './trigger-detector.js';
export * from './worker-registry.js';
export * from './resource-governor.js';
export * from './dispatch-service.js';
export * from './ruvector-integration.js';
export * from './hooks-integration.js';
export * from './mcp-tools.js';
export * from './consolidated-phases.js';
export { DEFAULT_CAPABILITIES, DEFAULT_FILE_FILTER, DEFAULT_OUTPUT, WORKER_PRESETS, EXAMPLE_CONFIG, validateWorkerDefinition } from './custom-worker-config.js';
export type { PhaseConfig, CustomWorkerDefinition, CapabilityConfig, FileFilterConfig, OutputConfig, WorkerConfigFile, PhaseResult as CustomPhaseResult, PhaseType } from './custom-worker-config.js';
export { createPhaseContext, registerPhaseExecutor, getPhaseExecutor, executePhasePipeline } from './phase-executors.js';
export * from './custom-worker-factory.js';
export * from './worker-agent-integration.js';
export * from './worker-benchmarks.js';
export * from './ruvector-native-integration.js';
export { getTriggerDetector } from './trigger-detector.js';
export { getWorkerRegistry } from './worker-registry.js';
export { getResourceGovernor } from './resource-governor.js';
export { getWorkerDispatchService } from './dispatch-service.js';
export { getRuVectorWorkerIntegration } from './ruvector-integration.js';
export { customWorkerManager } from './custom-worker-factory.js';
export { workerAgentIntegration, getIntegrationStats, getAgentForTrigger, recordAgentPerformance } from './worker-agent-integration.js';
export { workerBenchmarks, runBenchmarks } from './worker-benchmarks.js';
export { formatWorkerInfo, formatPresetList } from './custom-worker-factory.js';
export { listPhaseExecutors } from './phase-executors.js';
export { listUnifiedPhases, runUnifiedPipeline } from './consolidated-phases.js';
//# sourceMappingURL=index.d.ts.map