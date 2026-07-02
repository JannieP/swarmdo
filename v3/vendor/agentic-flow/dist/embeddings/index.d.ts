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
export { OptimizedEmbedder, getOptimizedEmbedder, downloadModel, listAvailableModels, initEmbeddings, cosineSimilarity, euclideanDistance, normalizeVector, DEFAULT_CONFIG } from './optimized-embedder.js';
export { NeuralSubstrate, getNeuralSubstrate, SemanticDriftDetector, MemoryPhysics, EmbeddingStateMachine, SwarmCoordinator, CoherenceMonitor } from './neural-substrate.js';
export type { EmbedderConfig, DownloadProgress } from './optimized-embedder.js';
export type { DriftResult, MemoryEntry, AgentState, CoherenceResult, SubstrateHealth } from './neural-substrate.js';
//# sourceMappingURL=index.d.ts.map