/**
 * SwarmVector Intelligence Layer - Unified Exports
 *
 * Exposes the full power of SwarmVector ecosystem:
 *
 * Features Used:
 * - @swarmvector/sona: Micro-LoRA, Base-LoRA, EWC++, ReasoningBank, Trajectories
 * - @swarmvector/attention: Multi-head, Flash, Hyperbolic, MoE, Graph, DualSpace
 * - swarmvector core: HNSW indexing, vector similarity search
 *
 * Note: @swarmvector/sona and @swarmvector/attention are optional on Windows
 */
export { SwarmVectorIntelligence, createIntelligenceLayer, IntelligencePresets, sonaAvailable, attentionAvailable, } from './SwarmVectorIntelligence.js';
// Attention types (optional - @swarmvector/attention may not be available)
export var AttentionType;
(function (AttentionType) {
    AttentionType["MultiHead"] = "multi_head";
    AttentionType["Flash"] = "flash";
    AttentionType["Hyperbolic"] = "hyperbolic";
    AttentionType["MoE"] = "moe";
    AttentionType["GraphRoPe"] = "graph_rope";
    AttentionType["DualSpace"] = "dual_space";
})(AttentionType || (AttentionType = {}));
// Enhanced Agent Booster v2 with full SwarmVector intelligence
export { EnhancedAgentBooster, getEnhancedBooster, enhancedApply, benchmark as benchmarkEnhancedBooster, } from './agent-booster-enhanced.js';
// WASM Acceleration - 150x faster pattern search
export { WasmPatternIndex, WasmAgentRouter, getWasmPatternIndex, getWasmAgentRouter, initWasmAcceleration, getWasmAccelerationStatus, } from './wasm-acceleration.js';
// TinyDancer - FastGRNN Neural Routing
export { TinyDancerRouter, getTinyDancerRouter, initTinyDancer, isTinyDancerAvailable, } from '../routing/TinyDancerRouter.js';
// ONNX Embeddings WASM - Browser-compatible embeddings
export { OnnxEmbeddingsWasm, getOnnxEmbeddingsWasm, initOnnxEmbeddingsWasm, isOnnxWasmAvailable, isSIMDEnabled, embed as onnxEmbed, embedBatch as onnxEmbedBatch, cosineSimilarity as onnxCosineSimilarity, } from '../wasm/onnx-embeddings-wasm.js';
// SwarmVector Edge - WASM-accelerated primitives
export { initSwarmVectorWasm, isWasmInitialized, isWasmSupported, SwarmVectorHnswIndex, SwarmVectorSemanticMatcher, generateIdentity, signData, verifySignature, } from '../wasm/swarmvector-edge.js';
// SwarmVector Edge-Full - Complete WASM toolkit
export { initEdgeFull, isEdgeFullAvailable, getEdgeFull, getEdgeFullStats, EdgeFullHnswIndex, EdgeFullGraphDB, EdgeFullSonaEngine, EdgeFullOnnxEmbeddings, EdgeFullDagWorkflow, cosineSimilarity as edgeFullCosineSimilarity, dotProduct, normalize, isSIMDEnabled as edgeFullSIMDEnabled, } from '../wasm/edge-full.js';
// Embedding Service - Unified embedding interface
export { EmbeddingService, getEmbeddingService, embed, embedBatch, textSimilarity, simpleEmbed, semanticSearch, findDuplicates, clusterTexts, pretrainCodePatterns, pretrainFromRepo, } from './EmbeddingService.js';
//# sourceMappingURL=index.js.map