/**
 * Embeddings Module
 *
 * Optimized embedding generation for agentic-flow with:
 * - ONNX model download and caching
 * - LRU embedding cache (256 entries)
 * - SIMD-friendly vector operations
 * - Multiple model support
 * - Neural Embedding Substrate (synthetic nervous system)
 */
export * from './optimized-embedder.js';
export * from './neural-substrate.js';
// Re-export key functions
export { OptimizedEmbedder, getOptimizedEmbedder, downloadModel, listAvailableModels, initEmbeddings, cosineSimilarity, euclideanDistance, normalizeVector, DEFAULT_CONFIG } from './optimized-embedder.js';
// Re-export Neural Substrate
export { NeuralSubstrate, getNeuralSubstrate, SemanticDriftDetector, MemoryPhysics, EmbeddingStateMachine, SwarmCoordinator, CoherenceMonitor } from './neural-substrate.js';
//# sourceMappingURL=index.js.map