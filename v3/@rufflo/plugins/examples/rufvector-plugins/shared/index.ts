/**
 * Shared utilities for RufVector plugins
 */

export {
  // Interfaces
  IVectorDB,
  ILoRAEngine,
  LoRAAdapter,
  // Fallback implementations
  FallbackVectorDB,
  FallbackLoRAEngine,
  // Factory functions
  createVectorDB,
  createLoRAEngine,
  // Utilities
  cosineSimilarity,
  generateHashEmbedding,
  LazyInitializable,
} from './vector-utils.js';
