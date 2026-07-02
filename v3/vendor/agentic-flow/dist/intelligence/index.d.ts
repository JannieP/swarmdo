/**
 * RuVector Intelligence Layer - Unified Exports
 *
 * Exposes the full power of RuVector ecosystem:
 *
 * Features Used:
 * - @rufvector/sona: Micro-LoRA, Base-LoRA, EWC++, ReasoningBank, Trajectories
 * - @rufvector/attention: Multi-head, Flash, Hyperbolic, MoE, Graph, DualSpace
 * - ruvector core: HNSW indexing, vector similarity search
 *
 * Note: @rufvector/sona and @rufvector/attention are optional on Windows
 */
export { RuVectorIntelligence, createIntelligenceLayer, IntelligencePresets, sonaAvailable, attentionAvailable, type RuVectorIntelligenceConfig, type Trajectory, type TrajectoryStep, type AgentRoutingResult, type LearningOutcome, type OperationResult, } from './RuVectorIntelligence.js';
export interface SonaConfig {
    embeddingDim?: number;
    hiddenDim?: number;
    microLoraRank?: number;
    baseLoraRank?: number;
    ewcLambda?: number;
}
export interface LearnedPattern {
    id: string;
    pattern: number[];
    confidence: number;
    timestamp: number;
}
export declare enum AttentionType {
    MultiHead = "multi_head",
    Flash = "flash",
    Hyperbolic = "hyperbolic",
    MoE = "moe",
    GraphRoPe = "graph_rope",
    DualSpace = "dual_space"
}
export interface MoEConfig {
    numExperts?: number;
    topK?: number;
    routerDim?: number;
}
export { EnhancedAgentBooster, getEnhancedBooster, enhancedApply, benchmark as benchmarkEnhancedBooster, type EnhancedEditRequest, type EnhancedEditResult, type LearnedPattern as BoosterPattern, type BoosterStats, type ErrorPattern, type PrefetchResult, } from './agent-booster-enhanced.js';
export { WasmPatternIndex, WasmAgentRouter, getWasmPatternIndex, getWasmAgentRouter, initWasmAcceleration, getWasmAccelerationStatus, type PatternEntry, type AgentProfile, } from './wasm-acceleration.js';
export { TinyDancerRouter, getTinyDancerRouter, initTinyDancer, isTinyDancerAvailable, type RouteResult, type RouterMetrics, type TinyDancerConfig, } from '../routing/TinyDancerRouter.js';
export { OnnxEmbeddingsWasm, getOnnxEmbeddingsWasm, initOnnxEmbeddingsWasm, isOnnxWasmAvailable, isSIMDEnabled, embed as onnxEmbed, embedBatch as onnxEmbedBatch, cosineSimilarity as onnxCosineSimilarity, type OnnxEmbeddingResult, type OnnxBatchResult, type OnnxEmbeddingsStats, } from '../wasm/onnx-embeddings-wasm.js';
export { initRuVectorWasm, isWasmInitialized, isWasmSupported, RuVectorHnswIndex, RuVectorSemanticMatcher, generateIdentity, signData, verifySignature, type WasmIdentityKeys, type HnswSearchResult, type SemanticMatch, } from '../wasm/ruvector-edge.js';
export { initEdgeFull, isEdgeFullAvailable, getEdgeFull, getEdgeFullStats, EdgeFullHnswIndex, EdgeFullGraphDB, EdgeFullSonaEngine, EdgeFullOnnxEmbeddings, EdgeFullDagWorkflow, cosineSimilarity as edgeFullCosineSimilarity, dotProduct, normalize, isSIMDEnabled as edgeFullSIMDEnabled, type EdgeFullStats, } from '../wasm/edge-full.js';
export { EmbeddingService, getEmbeddingService, embed, embedBatch, textSimilarity, simpleEmbed, semanticSearch, findDuplicates, clusterTexts, pretrainCodePatterns, pretrainFromRepo, type EmbeddingBackend, type EmbeddingStats, type SimilarityResult, type SearchResult, type DuplicateGroup, } from './EmbeddingService.js';
//# sourceMappingURL=index.d.ts.map