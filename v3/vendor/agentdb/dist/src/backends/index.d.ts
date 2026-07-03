/**
 * AgentDB Backends - Unified Vector Storage Interface
 *
 * Provides automatic backend selection between SwarmVector and HNSWLib
 * with graceful fallback and clear error messages.
 */
export type { VectorBackend, VectorConfig, SearchResult, SearchOptions, VectorStats } from './VectorBackend.js';
export { SwarmVectorBackend } from './swarmvector/SwarmVectorBackend.js';
export { SwarmVectorLearning } from './swarmvector/SwarmVectorLearning.js';
export { HNSWLibBackend } from './hnswlib/HNSWLibBackend.js';
export { createBackend, detectBackends, getRecommendedBackend, isBackendAvailable, getInstallCommand } from './factory.js';
export type { BackendType, BackendDetection } from './factory.js';
export type { LearningConfig, EnhancementOptions } from './swarmvector/SwarmVectorLearning.js';
//# sourceMappingURL=index.d.ts.map