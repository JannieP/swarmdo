/**
 * RufLLM Engine - Main orchestrator for self-learning LLM
 */
import { RufLLMConfig, GenerationConfig, QueryResponse, RoutingDecision, MemoryResult, RufLLMStats, Feedback, Embedding, BatchQueryRequest, BatchQueryResponse } from './types';
/**
 * RufLLM - Self-learning LLM orchestrator
 *
 * Combines SONA adaptive learning with HNSW memory,
 * FastGRNN routing, and SIMD-optimized inference.
 *
 * @example
 * ```typescript
 * import { RufLLM } from '@rufvector/rufllm';
 *
 * const llm = new RufLLM({ embeddingDim: 768 });
 *
 * // Query with automatic routing
 * const response = await llm.query('What is machine learning?');
 * console.log(response.text);
 *
 * // Provide feedback for learning
 * llm.feedback({ requestId: response.requestId, rating: 5 });
 * ```
 */
export declare class RufLLM {
    private native;
    private config;
    private fallbackState;
    /**
     * Create a new RufLLM instance
     */
    constructor(config?: RufLLMConfig);
    /**
     * Query the LLM with automatic routing
     */
    query(text: string, config?: GenerationConfig): QueryResponse;
    /**
     * Generate text with SIMD-optimized inference
     *
     * Note: If no trained model is loaded (demo mode), returns an informational
     * message instead of garbled output.
     */
    generate(prompt: string, config?: GenerationConfig): string;
    /**
     * Get routing decision for a query
     */
    route(text: string): RoutingDecision;
    /**
     * Search memory for similar content
     */
    searchMemory(text: string, k?: number): MemoryResult[];
    /**
     * Add content to memory
     */
    addMemory(content: string, metadata?: Record<string, unknown>): number;
    /**
     * Provide feedback for learning
     */
    feedback(fb: Feedback): boolean;
    /**
     * Get engine statistics
     */
    stats(): RufLLMStats;
    /**
     * Force router learning cycle
     */
    forceLearn(): string;
    /**
     * Get embedding for text
     */
    embed(text: string): Embedding;
    /**
     * Compute similarity between two texts
     */
    similarity(text1: string, text2: string): number;
    /**
     * Check if SIMD is available
     */
    hasSimd(): boolean;
    /**
     * Get SIMD capabilities
     */
    simdCapabilities(): string[];
    /**
     * Batch query multiple prompts
     */
    batchQuery(request: BatchQueryRequest): BatchQueryResponse;
    /**
     * Check if native module is loaded
     */
    isNativeLoaded(): boolean;
}
//# sourceMappingURL=engine.d.ts.map