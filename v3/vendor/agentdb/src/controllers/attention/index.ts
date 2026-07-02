/**
 * Attention Controllers - Export Module
 *
 * Exports all attention mechanism controllers for memory systems:
 * - SelfAttentionController: Self-attention over memory entries
 * - CrossAttentionController: Cross-attention between query and contexts
 * - MultiHeadAttentionController: Multi-head attention with parallel heads
 */

// Legacy controllers
export { SelfAttentionController } from './SelfAttentionController.js';
export { CrossAttentionController } from './CrossAttentionController.js';
export { MultiHeadAttentionController } from './MultiHeadAttentionController.js';

// New refactored components
export { AttentionConfigManager } from './AttentionConfig.js';
export { AttentionMetricsTracker } from './AttentionMetrics.js';
export { AttentionCacheManager } from './AttentionCache.js';
export { AttentionWASMManager } from './AttentionWASM.js';
export { AttentionCoreCompute } from './AttentionCore.js';
export { AttentionHelpers } from './AttentionHelpers.js';

// Type exports - Legacy
export type {
  SelfAttentionConfig,
  AttentionScore,
  SelfAttentionResult,
  MemoryEntry as SelfAttentionMemoryEntry
} from './SelfAttentionController.js';

export type {
  CrossAttentionConfig,
  CrossAttentionScore,
  CrossAttentionResult,
  ContextEntry
} from './CrossAttentionController.js';

export type {
  MultiHeadAttentionConfig,
  HeadAttentionOutput,
  MultiHeadAttentionResult,
  MemoryEntry as MultiHeadMemoryEntry
} from './MultiHeadAttentionController.js';

// Type exports - New
export type {
  AttentionConfig,
  AttentionOptions,
  AttentionResult
} from './AttentionConfig.js';

export type {
  AttentionStats,
  AttentionMetrics
} from './AttentionMetrics.js';

export type {
  NAPIAttentionModule,
  WASMAttentionModule,
  RuntimeEnvironment
} from './AttentionWASM.js';
