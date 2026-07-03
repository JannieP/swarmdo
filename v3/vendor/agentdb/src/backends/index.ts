/**
 * AgentDB Backends - Unified Vector Storage Interface
 *
 * Provides automatic backend selection between SwarmVector and HNSWLib
 * with graceful fallback and clear error messages.
 */

// Core interfaces
export type {
  VectorBackend,
  VectorConfig,
  SearchResult,
  SearchOptions,
  VectorStats
} from './VectorBackend.js';

// Backend implementations
export { SwarmVectorBackend } from './swarmvector/SwarmVectorBackend.js';
export { SwarmVectorLearning } from './swarmvector/SwarmVectorLearning.js';
export { HNSWLibBackend } from './hnswlib/HNSWLibBackend.js';

// Factory and detection
export {
  createBackend,
  detectBackends,
  getRecommendedBackend,
  isBackendAvailable,
  getInstallCommand
} from './factory.js';

export type { BackendType, BackendDetection } from './factory.js';
export type { LearningConfig, EnhancementOptions } from './swarmvector/SwarmVectorLearning.js';
