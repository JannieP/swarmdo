/**
 * Integrations Module
 *
 * Provides integration bridges for external systems:
 * - agentic-flow@alpha for swarm coordination
 * - AgentDB for vector storage and similarity search
 * - SwarmVector PostgreSQL Bridge for advanced vector operations
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

// SwarmVector PostgreSQL Bridge
export * as SwarmVectorTypes from './swarmvector/index.js';
export {
  // Main Bridge Plugin
  SwarmVectorBridge,
  createSwarmVectorBridge,

  // Type Guards
  isDistanceMetric,
  isAttentionMechanism,
  isGNNLayerType,
  isHyperbolicModel,
  isVectorIndexType,
  isSuccess,
  isError,

  // Namespace
  SwarmVector,

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
} from './swarmvector/index.js';

// Re-export common SwarmVector types for convenience
export type {
  SwarmVectorConfig,
  VectorSearchOptions as SwarmVectorSearchOptions,
  VectorSearchResult as SwarmVectorSearchResult,
  AttentionMechanism,
  GNNLayerType,
  HyperbolicModel,
  ISwarmVectorClient,
} from './swarmvector/index.js';
