/**
 * Integrations Module
 *
 * Provides integration bridges for external systems:
 * - agentic-flow@alpha for swarm coordination
 * - AgentDB for vector storage and similarity search
 * - RufVector PostgreSQL Bridge for advanced vector operations
 */

export {
  // Agentic Flow
  AgenticFlowBridge,
  getAgenticFlowBridge,
  AGENTIC_FLOW_EVENTS,
  type AgenticFlowConfig,
  type SwarmTopology,
  type AgentSpawnOptions,
  type SpawnedAgent,
  type TaskOrchestrationOptions,
  type OrchestrationResult,
  type AgenticFlowEvent,

  // AgentDB
  AgentDBBridge,
  getAgentDBBridge,
  resetBridges,
  type AgentDBConfig,
  type VectorEntry,
  type VectorSearchOptions,
  type VectorSearchResult,
} from './agentic-flow.js';

// RufVector PostgreSQL Bridge
export * as RufVectorTypes from './rufvector/index.js';
export {
  // Main Bridge Plugin
  RufVectorBridge,
  createRufVectorBridge,

  // Type Guards
  isDistanceMetric,
  isAttentionMechanism,
  isGNNLayerType,
  isHyperbolicModel,
  isVectorIndexType,
  isSuccess,
  isError,

  // Namespace
  RufVector,

  // Attention Mechanisms
  AttentionRegistry,
  AttentionFactory,
  AttentionExecutor,
  createDefaultRegistry,

  // GNN Layers
  GNNLayerRegistry,
  GraphOperations,
  createGNNLayer,
  createGNNLayerRegistry,
  createGraphOperations,

  // Hyperbolic Embeddings
  HyperbolicSpace,
  HyperbolicSQL,
  HyperbolicBatchProcessor,
  createHyperbolicSpace,

  // Self-Learning
  QueryOptimizer,
  IndexTuner,
  PatternRecognizer,
  LearningLoop,
  createSelfLearningSystem,
} from './rufvector/index.js';

// Re-export common RufVector types for convenience
export type {
  RufVectorConfig,
  VectorSearchOptions as RufVectorSearchOptions,
  VectorSearchResult as RufVectorSearchResult,
  AttentionMechanism,
  GNNLayerType,
  HyperbolicModel,
  IRufVectorClient,
} from './rufvector/index.js';
