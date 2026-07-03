/**
 * AgentDB WASM-Only Entry Point
 *
 * Use this entry point on systems without C++ build tools.
 * Excludes hnswlib-node and provides pure WASM vector backends.
 *
 * Usage:
 *   import { AgentDB } from 'agentdb/wasm';
 *   const db = new AgentDB({ forceWasm: true });
 *
 * This entry point:
 * - Uses SwarmVector (WASM-based) for vector search
 * - Uses sql.js (WASM-based) for SQLite
 * - Does NOT require any native module compilation
 * - Works on Windows without Visual Studio Build Tools
 * - Works in browsers and edge runtimes
 */
export { AgentDB } from './core/AgentDB.js';
import { AgentDB as AgentDBClass } from './core/AgentDB.js';
export default AgentDBClass;
export { CausalMemoryGraph } from './controllers/CausalMemoryGraph.js';
export { CausalRecall } from './controllers/CausalRecall.js';
export { ExplainableRecall } from './controllers/ExplainableRecall.js';
export { NightlyLearner } from './controllers/NightlyLearner.js';
export { ReflexionMemory } from './controllers/ReflexionMemory.js';
export { SkillLibrary } from './controllers/SkillLibrary.js';
export { LearningSystem } from './controllers/LearningSystem.js';
export { ReasoningBank } from './controllers/ReasoningBank.js';
export { EmbeddingService } from './controllers/EmbeddingService.js';
export { EnhancedEmbeddingService } from './controllers/EnhancedEmbeddingService.js';
export { WASMVectorSearch } from './controllers/WASMVectorSearch.js';
export { AttentionService } from './controllers/AttentionService.js';
export { MemoryController } from './controllers/MemoryController.js';
export { SelfAttentionController } from './controllers/attention/SelfAttentionController.js';
export { CrossAttentionController } from './controllers/attention/CrossAttentionController.js';
export { MultiHeadAttentionController } from './controllers/attention/MultiHeadAttentionController.js';
export { createDatabase } from './db-fallback.js';
export { BatchOperations } from './optimizations/BatchOperations.js';
export { QueryOptimizer } from './optimizations/QueryOptimizer.js';
export { QueryCache } from './core/QueryCache.js';
export type { QueryCacheConfig, CacheEntry, CacheStatistics } from './core/QueryCache.js';
export { validateTableName, validateColumnName, validatePragmaCommand, buildSafeWhereClause, buildSafeSetClause, ValidationError, } from './security/input-validation.js';
export { type QuantizationStats, type QuantizedVector, type ProductQuantizerConfig, type PQEncodedVector, type QuantizedVectorStoreConfig, type QuantizedSearchResult, quantize8bit, quantize4bit, dequantize8bit, dequantize4bit, calculateQuantizationError, getQuantizationStats, ProductQuantizer, QuantizedVectorStore, createScalar8BitStore, createScalar4BitStore, createProductQuantizedStore, } from './quantization/index.js';
export { KeywordIndex, HybridSearch, createKeywordIndex, createHybridSearch, type HybridSearchOptions, type HybridSearchResult, type HybridQuery, type BM25Config, } from './search/index.js';
export { BenchmarkSuite, Benchmark, VectorInsertBenchmark, VectorSearchBenchmark, MemoryUsageBenchmark, ConcurrencyBenchmark, QuantizationBenchmark, runBenchmarks, runSelectedBenchmarks, formatReportAsMarkdown, formatComparisonAsMarkdown, type LatencyStats, type BenchmarkResult, type BenchmarkReport, type ComparisonReport, type BenchmarkConfig, } from './benchmark/index.js';
export type { VectorBackend, VectorConfig, SearchResult, SearchOptions, VectorStats } from './backends/VectorBackend.js';
export { SwarmVectorBackend } from './backends/swarmvector/SwarmVectorBackend.js';
export { SwarmVectorLearning } from './backends/swarmvector/SwarmVectorLearning.js';
export { RvfBackend } from './backends/rvf/RvfBackend.js';
export { createBackend, detectBackends, getRecommendedBackend, isBackendAvailable, getInstallCommand } from './backends/factory.js';
export type { BackendType, BackendDetection, RvfDetection } from './backends/factory.js';
export type { VectorBackendAsync } from './backends/VectorBackend.js';
export type { RvfConfig, IndexStats, WitnessVerification } from './backends/rvf/RvfBackend.js';
export { AgentDBSolver } from './backends/rvf/RvfSolver.js';
export type { SolverTrainOptions, SolverTrainResult, SolverCycleMetrics, SolverModeResult, SolverAcceptanceManifest, SolverAcceptanceOptions, SolverPolicyState, } from './backends/rvf/RvfSolver.js';
export { SonaLearningBackend } from './backends/rvf/SonaLearningBackend.js';
export type { SonaConfig, LearnedPattern, SonaStats, } from './backends/rvf/SonaLearningBackend.js';
export { TemporalCompressor, IndexHealthMonitor } from './backends/rvf/AdaptiveIndexTuner.js';
export type { CompressionTier, CompressedEntry, IndexHealth, CompressionStats, } from './backends/rvf/AdaptiveIndexTuner.js';
export { ContrastiveTrainer } from './backends/rvf/ContrastiveTrainer.js';
export type { ContrastiveSample, TrainBatchResult, TrainingStats, CurriculumStage, ContrastiveConfig, } from './backends/rvf/ContrastiveTrainer.js';
export { SemanticQueryRouter } from './backends/rvf/SemanticQueryRouter.js';
export type { RouteMatch, IntentConfig, RouterConfig, RouterStats, } from './backends/rvf/SemanticQueryRouter.js';
export { FederatedSessionManager, SessionHandle } from './backends/rvf/FederatedSessionManager.js';
export type { FederatedConfig, SessionState, TrajectoryRecord, SessionStats, FederatedStats, FederatedPattern, } from './backends/rvf/FederatedSessionManager.js';
//# sourceMappingURL=wasm-loader.d.ts.map