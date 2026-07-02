"use strict";
/**
 * RufLLM Engine - Main orchestrator for self-learning LLM
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RufLLM = void 0;
const native_1 = require("./native");
/**
 * Convert JS config to native config format
 */
function toNativeConfig(config) {
    if (!config)
        return undefined;
    return {
        embedding_dim: config.embeddingDim,
        router_hidden_dim: config.routerHiddenDim,
        hnsw_m: config.hnswM,
        hnsw_ef_construction: config.hnswEfConstruction,
        hnsw_ef_search: config.hnswEfSearch,
        learning_enabled: config.learningEnabled,
        quality_threshold: config.qualityThreshold,
        ewc_lambda: config.ewcLambda,
    };
}
/**
 * Convert JS generation config to native format
 */
function toNativeGenConfig(config) {
    if (!config)
        return undefined;
    return {
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        top_p: config.topP,
        top_k: config.topK,
        repetition_penalty: config.repetitionPenalty,
    };
}
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
class RufLLM {
    /**
     * Create a new RufLLM instance
     */
    constructor(config) {
        this.native = null;
        // Fallback state for when native module is not available
        this.fallbackState = {
            memory: new Map(),
            nextId: 1,
            queryCount: 0,
        };
        this.config = config ?? {};
        const mod = (0, native_1.getNativeModule)();
        if (mod) {
            try {
                this.native = new mod.RufLLMEngine(toNativeConfig(config));
            }
            catch {
                // Silently fall back to JS implementation
            }
        }
    }
    /**
     * Query the LLM with automatic routing
     */
    query(text, config) {
        if (this.native) {
            const result = this.native.query(text, toNativeGenConfig(config));
            return {
                text: result.text,
                confidence: result.confidence,
                model: result.model,
                contextSize: result.context_size,
                latencyMs: result.latency_ms,
                requestId: result.request_id,
            };
        }
        // Fallback implementation
        this.fallbackState.queryCount++;
        return {
            text: `[Fallback] Response to: ${text.slice(0, 50)}...`,
            confidence: 0.5,
            model: 'fallback',
            contextSize: 512,
            latencyMs: 1.0,
            requestId: `fb-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        };
    }
    /**
     * Generate text with SIMD-optimized inference
     *
     * Note: If no trained model is loaded (demo mode), returns an informational
     * message instead of garbled output.
     */
    generate(prompt, config) {
        if (this.native) {
            return this.native.generate(prompt, toNativeGenConfig(config));
        }
        // Fallback - provide helpful message instead of garbled output
        const maxTokens = config?.maxTokens ?? 256;
        const temp = config?.temperature ?? 0.7;
        const topP = config?.topP ?? 0.9;
        return `[RufLLM JavaScript Fallback Mode]
No native SIMD module loaded. Running in JavaScript fallback mode.

Your prompt: "${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}"

To enable native SIMD inference:
1. Install the native bindings: npm install @rufvector/rufllm-${process.platform}-${process.arch}
2. Or load a GGUF model file
3. Or connect to an external LLM API

Config: temp=${temp.toFixed(2)}, top_p=${topP.toFixed(2)}, max_tokens=${maxTokens}

This fallback provides routing, memory, and embedding features but not full text generation.`;
    }
    /**
     * Get routing decision for a query
     */
    route(text) {
        if (this.native) {
            const result = this.native.route(text);
            return {
                model: result.model,
                contextSize: result.context_size,
                temperature: result.temperature,
                topP: result.top_p,
                confidence: result.confidence,
            };
        }
        // Fallback
        return {
            model: 'M700',
            contextSize: 512,
            temperature: 0.7,
            topP: 0.9,
            confidence: 0.5,
        };
    }
    /**
     * Search memory for similar content
     */
    searchMemory(text, k = 10) {
        if (this.native) {
            const results = this.native.searchMemory(text, k);
            return results.map(r => ({
                id: r.id,
                score: r.score,
                content: r.content,
                metadata: JSON.parse(r.metadata || '{}'),
            }));
        }
        // Fallback - simple search
        return Array.from(this.fallbackState.memory.entries())
            .slice(0, k)
            .map(([id, data]) => ({
            id,
            score: 0.5,
            content: data.content,
            metadata: data.metadata,
        }));
    }
    /**
     * Add content to memory
     */
    addMemory(content, metadata) {
        if (this.native) {
            return this.native.addMemory(content, metadata ? JSON.stringify(metadata) : undefined);
        }
        // Fallback
        const id = this.fallbackState.nextId++;
        this.fallbackState.memory.set(id, {
            content,
            embedding: this.embed(content),
            metadata: metadata ?? {},
        });
        return id;
    }
    /**
     * Provide feedback for learning
     */
    feedback(fb) {
        if (this.native) {
            return this.native.feedback(fb.requestId, fb.rating, fb.correction);
        }
        return false;
    }
    /**
     * Get engine statistics
     */
    stats() {
        if (this.native) {
            const s = this.native.stats();
            // Map native stats (snake_case) to TypeScript interface (camelCase)
            // Handle both old and new field names for backward compatibility
            return {
                totalQueries: s.total_queries ?? 0,
                memoryNodes: s.memory_nodes ?? 0,
                patternsLearned: s.patterns_learned ?? s.training_steps ?? 0,
                avgLatencyMs: s.avg_latency_ms ?? 0,
                cacheHitRate: s.cache_hit_rate ?? 0,
                routerAccuracy: s.router_accuracy ?? 0.5,
            };
        }
        // Fallback
        return {
            totalQueries: this.fallbackState.queryCount,
            memoryNodes: this.fallbackState.memory.size,
            patternsLearned: 0,
            avgLatencyMs: 1.0,
            cacheHitRate: 0.0,
            routerAccuracy: 0.5,
        };
    }
    /**
     * Force router learning cycle
     */
    forceLearn() {
        if (this.native) {
            return this.native.forceLearn();
        }
        return 'Learning not available in fallback mode';
    }
    /**
     * Get embedding for text
     */
    embed(text) {
        if (this.native) {
            return this.native.embed(text);
        }
        // Fallback - simple hash-based embedding
        const dim = this.config.embeddingDim ?? 768;
        const embedding = new Array(dim).fill(0);
        for (let i = 0; i < text.length; i++) {
            const idx = (text.charCodeAt(i) * (i + 1)) % dim;
            embedding[idx] += 0.1;
        }
        // Normalize
        const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0)) || 1;
        return embedding.map(x => x / norm);
    }
    /**
     * Compute similarity between two texts
     */
    similarity(text1, text2) {
        if (this.native) {
            return this.native.similarity(text1, text2);
        }
        // Fallback - cosine similarity
        const emb1 = this.embed(text1);
        const emb2 = this.embed(text2);
        let dot = 0;
        let norm1 = 0;
        let norm2 = 0;
        for (let i = 0; i < emb1.length; i++) {
            dot += emb1[i] * emb2[i];
            norm1 += emb1[i] * emb1[i];
            norm2 += emb2[i] * emb2[i];
        }
        const denom = Math.sqrt(norm1) * Math.sqrt(norm2);
        const similarity = denom > 0 ? dot / denom : 0;
        // Clamp to [0, 1] to handle floating point errors
        return Math.max(0, Math.min(1, similarity));
    }
    /**
     * Check if SIMD is available
     */
    hasSimd() {
        if (this.native) {
            return this.native.hasSimd();
        }
        return false;
    }
    /**
     * Get SIMD capabilities
     */
    simdCapabilities() {
        if (this.native) {
            return this.native.simdCapabilities();
        }
        return ['Scalar (fallback)'];
    }
    /**
     * Batch query multiple prompts
     */
    batchQuery(request) {
        const start = Date.now();
        const responses = request.queries.map(q => this.query(q, request.config));
        return {
            responses,
            totalLatencyMs: Date.now() - start,
        };
    }
    /**
     * Check if native module is loaded
     */
    isNativeLoaded() {
        return this.native !== null;
    }
}
exports.RufLLM = RufLLM;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5naW5lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2VuZ2luZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7O0dBRUc7OztBQWVILHFDQUtrQjtBQUVsQjs7R0FFRztBQUNILFNBQVMsY0FBYyxDQUFDLE1BQXFCO0lBQzNDLElBQUksQ0FBQyxNQUFNO1FBQUUsT0FBTyxTQUFTLENBQUM7SUFFOUIsT0FBTztRQUNMLGFBQWEsRUFBRSxNQUFNLENBQUMsWUFBWTtRQUNsQyxpQkFBaUIsRUFBRSxNQUFNLENBQUMsZUFBZTtRQUN6QyxNQUFNLEVBQUUsTUFBTSxDQUFDLEtBQUs7UUFDcEIsb0JBQW9CLEVBQUUsTUFBTSxDQUFDLGtCQUFrQjtRQUMvQyxjQUFjLEVBQUUsTUFBTSxDQUFDLFlBQVk7UUFDbkMsZ0JBQWdCLEVBQUUsTUFBTSxDQUFDLGVBQWU7UUFDeEMsaUJBQWlCLEVBQUUsTUFBTSxDQUFDLGdCQUFnQjtRQUMxQyxVQUFVLEVBQUUsTUFBTSxDQUFDLFNBQVM7S0FDN0IsQ0FBQztBQUNKLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsaUJBQWlCLENBQUMsTUFBeUI7SUFDbEQsSUFBSSxDQUFDLE1BQU07UUFBRSxPQUFPLFNBQVMsQ0FBQztJQUU5QixPQUFPO1FBQ0wsVUFBVSxFQUFFLE1BQU0sQ0FBQyxTQUFTO1FBQzVCLFdBQVcsRUFBRSxNQUFNLENBQUMsV0FBVztRQUMvQixLQUFLLEVBQUUsTUFBTSxDQUFDLElBQUk7UUFDbEIsS0FBSyxFQUFFLE1BQU0sQ0FBQyxJQUFJO1FBQ2xCLGtCQUFrQixFQUFFLE1BQU0sQ0FBQyxpQkFBaUI7S0FDN0MsQ0FBQztBQUNKLENBQUM7QUFFRDs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQW1CRztBQUNILE1BQWEsTUFBTTtJQVdqQjs7T0FFRztJQUNILFlBQVksTUFBcUI7UUFiekIsV0FBTSxHQUF3QixJQUFJLENBQUM7UUFHM0MseURBQXlEO1FBQ2pELGtCQUFhLEdBQUc7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OztPQUVHO0lBQ0gsZ0JBQWdCO1FBQ2QsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDaEIsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDeEMsQ0FBQztRQUNELE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFRDs7T0FFRztJQUNILFVBQVUsQ0FBQyxPQUEwQjtRQUNuQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDekIsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUMxRSxPQUFPO1lBQ0wsU0FBUztZQUNULGNBQWMsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsS0FBSztTQUNuQyxDQUFDO0lBQ0osQ0FBQztJQUVEOztPQUVHO0lBQ0gsY0FBYztRQUNaLE9BQU8sSUFBSSxDQUFDLE1BQU0sS0FBSyxJQUFJLENBQUM7SUFDOUIsQ0FBQztDQUNGO0FBblNELHdCQW1TQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogUnVmTExNIEVuZ2luZSAtIE1haW4gb3JjaGVzdHJhdG9yIGZvciBzZWxmLWxlYXJuaW5nIExMTVxuICovXG5cbmltcG9ydCB7XG4gIFJ1ZkxMTUNvbmZpZyxcbiAgR2VuZXJhdGlvbkNvbmZpZyxcbiAgUXVlcnlSZXNwb25zZSxcbiAgUm91dGluZ0RlY2lzaW9uLFxuICBNZW1vcnlSZXN1bHQsXG4gIFJ1ZkxMTVN0YXRzLFxuICBGZWVkYmFjayxcbiAgRW1iZWRkaW5nLFxuICBCYXRjaFF1ZXJ5UmVxdWVzdCxcbiAgQmF0Y2hRdWVyeVJlc3BvbnNlLFxufSBmcm9tICcuL3R5cGVzJztcblxuaW1wb3J0IHtcbiAgZ2V0TmF0aXZlTW9kdWxlLFxuICBOYXRpdmVFbmdpbmUsXG4gIE5hdGl2ZUNvbmZpZyxcbiAgTmF0aXZlR2VuQ29uZmlnLFxufSBmcm9tICcuL25hdGl2ZSc7XG5cbi8qKlxuICogQ29udmVydCBKUyBjb25maWcgdG8gbmF0aXZlIGNvbmZpZyBmb3JtYXRcbiAqL1xuZnVuY3Rpb24gdG9OYXRpdmVDb25maWcoY29uZmlnPzogUnVmTExNQ29uZmlnKTogTmF0aXZlQ29uZmlnIHwgdW5kZWZpbmVkIHtcbiAgaWYgKCFjb25maWcpIHJldHVybiB1bmRlZmluZWQ7XG5cbiAgcmV0dXJuIHtcbiAgICBlbWJlZGRpbmdfZGltOiBjb25maWcuZW1iZWRkaW5nRGltLFxuICAgIHJvdXRlcl9oaWRkZW5fZGltOiBjb25maWcucm91dGVySGlkZGVuRGltLFxuICAgIGhuc3dfbTogY29uZmlnLmhuc3dNLFxuICAgIGhuc3dfZWZfY29uc3RydWN0aW9uOiBjb25maWcuaG5zd0VmQ29uc3RydWN0aW9uLFxuICAgIGhuc3dfZWZfc2VhcmNoOiBjb25maWcuaG5zd0VmU2VhcmNoLFxuICAgIGxlYXJuaW5nX2VuYWJsZWQ6IGNvbmZpZy5sZWFybmluZ0VuYWJsZWQsXG4gICAgcXVhbGl0eV90aHJlc2hvbGQ6IGNvbmZpZy5xdWFsaXR5VGhyZXNob2xkLFxuICAgIGV3Y19sYW1iZGE6IGNvbmZpZy5ld2NMYW1iZGEsXG4gIH07XG59XG5cbi8qKlxuICogQ29udmVydCBKUyBnZW5lcmF0aW9uIGNvbmZpZyB0byBuYXRpdmUgZm9ybWF0XG4gKi9cbmZ1bmN0aW9uIHRvTmF0aXZlR2VuQ29uZmlnKGNvbmZpZz86IEdlbmVyYXRpb25Db25maWcpOiBOYXRpdmVHZW5Db25maWcgfCB1bmRlZmluZWQge1xuICBpZiAoIWNvbmZpZykgcmV0dXJuIHVuZGVmaW5lZDtcblxuICByZXR1cm4ge1xuICAgIG1heF90b2tlbnM6IGNvbmZpZy5tYXhUb2tlbnMsXG4gICAgdGVtcGVyYXR1cmU6IGNvbmZpZy50ZW1wZXJhdHVyZSxcbiAgICB0b3BfcDogY29uZmlnLnRvcFAsXG4gICAgdG9wX2s6IGNvbmZpZy50b3BLLFxuICAgIHJlcGV0aXRpb25fcGVuYWx0eTogY29uZmlnLnJlcGV0aXRpb25QZW5hbHR5LFxuICB9O1xufVxuXG4vKipcbiAqIFJ1ZkxMTSAtIFNlbGYtbGVhcm5pbmcgTExNIG9yY2hlc3RyYXRvclxuICpcbiAqIENvbWJpbmVzIFNPTkEgYWRhcHRpdmUgbGVhcm5pbmcgd2l0aCBITlNXIG1lbW9yeSxcbiAqIEZhc3RHUk5OIHJvdXRpbmcsIGFuZCBTSU1ELW9wdGltaXplZCBpbmZlcmVuY2UuXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYHR5cGVzY3JpcHRcbiAqIGltcG9ydCB7IFJ1ZkxMTSB9IGZyb20gJ0BydWZ2ZWN0b3IvcnVmbGxtJztcbiAqXG4gKiBjb25zdCBsbG0gPSBuZXcgUnVmTExNKHsgZW1iZWRkaW5nRGltOiA3NjggfSk7XG4gKlxuICogLy8gUXVlcnkgd2l0aCBhdXRvbWF0aWMgcm91dGluZ1xuICogY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBsbG0ucXVlcnkoJ1doYXQgaXMgbWFjaGluZSBsZWFybmluZz8nKTtcbiAqIGNvbnNvbGUubG9nKHJlc3BvbnNlLnRleHQpO1xuICpcbiAqIC8vIFByb3ZpZGUgZmVlZGJhY2sgZm9yIGxlYXJuaW5nXG4gKiBsbG0uZmVlZGJhY2soeyByZXF1ZXN0SWQ6IHJlc3BvbnNlLnJlcXVlc3RJZCwgcmF0aW5nOiA1IH0pO1xuICogYGBgXG4gKi9cbmV4cG9ydCBjbGFzcyBSdWZMTE0ge1xuICBwcml2YXRlIG5hdGl2ZTogTmF0aXZlRW5naW5lIHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgY29uZmlnOiBSdWZMTE1Db25maWc7XG5cbiAgLy8gRmFsbGJhY2sgc3RhdGUgZm9yIHdoZW4gbmF0aXZlIG1vZHVsZSBpcyBub3QgYXZhaWxhYmxlXG4gIHByaXZhdGUgZmFsbGJhY2tTdGF0ZSA9IHtcbiAgICBtZW1vcnk6IG5ldyBNYXA8bnVtYmVyLCB7IGNvbnRlbnQ6IHN0cmluZzsgZW1iZWRkaW5nOiBudW1iZXJbXTsgbWV0YWRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0+KCksXG4gICAgbmV4dElkOiAxLFxuICAgIHF1ZXJ5Q291bnQ6IDAsXG4gIH07XG5cbiAgLyoqXG4gICAqIENyZWF0ZSBhIG5ldyBSdWZMTE0gaW5zdGFuY2VcbiAgICovXG4gIGNvbnN0cnVjdG9yKGNvbmZpZz86IFJ1ZkxMTUNvbmZpZykge1xuICAgIHRoaXMuY29uZmlnID0gY29uZmlnID8/IHt9O1xuXG4gICAgY29uc3QgbW9kID0gZ2V0TmF0aXZlTW9kdWxlKCk7XG4gICAgaWYgKG1vZCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgdGhpcy5uYXRpdmUgPSBuZXcgbW9kLlJ1ZkxMTUVuZ2luZSh0b05hdGl2ZUNvbmZpZyhjb25maWcpKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICAvLyBTaWxlbnRseSBmYWxsIGJhY2sgdG8gSlMgaW1wbGVtZW50YXRpb25cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUXVlcnkgdGhlIExMTSB3aXRoIGF1dG9tYXRpYyByb3V0aW5nXG4gICAqL1xuICBxdWVyeSh0ZXh0OiBzdHJpbmcsIGNvbmZpZz86IEdlbmVyYXRpb25Db25maWcpOiBRdWVyeVJlc3BvbnNlIHtcbiAgICBpZiAodGhpcy5uYXRpdmUpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMubmF0aXZlLnF1ZXJ5KHRleHQsIHRvTmF0aXZlR2VuQ29uZmlnKGNvbmZpZykpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdGV4dDogcmVzdWx0LnRleHQsXG4gICAgICAgIGNvbmZpZGVuY2U6IHJlc3VsdC5jb25maWRlbmNlLFxuICAgICAgICBtb2RlbDogcmVzdWx0Lm1vZGVsLFxuICAgICAgICBjb250ZXh0U2l6ZTogcmVzdWx0LmNvbnRleHRfc2l6ZSxcbiAgICAgICAgbGF0ZW5jeU1zOiByZXN1bHQubGF0ZW5jeV9tcyxcbiAgICAgICAgcmVxdWVzdElkOiByZXN1bHQucmVxdWVzdF9pZCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gRmFsbGJhY2sgaW1wbGVtZW50YXRpb25cbiAgICB0aGlzLmZhbGxiYWNrU3RhdGUucXVlcnlDb3VudCsrO1xuICAgIHJldHVybiB7XG4gICAgICB0ZXh0OiBgW0ZhbGxiYWNrXSBSZXNwb25zZSB0bzogJHt0ZXh0LnNsaWNlKDAsIDUwKX0uLi5gLFxuICAgICAgY29uZmlkZW5jZTogMC41LFxuICAgICAgbW9kZWw6ICdmYWxsYmFjaycsXG4gICAgICBjb250ZXh0U2l6ZTogNTEyLFxuICAgICAgbGF0ZW5jeU1zOiAxLjAsXG4gICAgICByZXF1ZXN0SWQ6IGBmYi0ke0RhdGUubm93KCl9LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMil9YCxcbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICAqIEdlbmVyYXRlIHRleHQgd2l0aCBTSU1ELW9wdGltaXplZCBpbmZlcmVuY2VcbiAgICpcbiAgICogTm90ZTogSWYgbm8gdHJhaW5lZCBtb2RlbCBpcyBsb2FkZWQgKGRlbW8gbW9kZSksIHJldHVybnMgYW4gaW5mb3JtYXRpb25hbFxuICAgKiBtZXNzYWdlIGluc3RlYWQgb2YgZ2FyYmxlZCBvdXRwdXQuXG4gICAqL1xuICBnZW5lcmF0ZShwcm9tcHQ6IHN0cmluZywgY29uZmlnPzogR2VuZXJhdGlvbkNvbmZpZyk6IHN0cmluZyB7XG4gICAgaWYgKHRoaXMubmF0aXZlKSB7XG4gICAgICByZXR1cm4gdGhpcy5uYXRpdmUuZ2VuZXJhdGUocHJvbXB0LCB0b05hdGl2ZUdlbkNvbmZpZyhjb25maWcpKTtcbiAgICB9XG5cbiAgICAvLyBGYWxsYmFjayAtIHByb3ZpZGUgaGVscGZ1bCBtZXNzYWdlIGluc3RlYWQgb2YgZ2FyYmxlZCBvdXRwdXRcbiAgICBjb25zdCBtYXhUb2tlbnMgPSBjb25maWc/Lm1heFRva2VucyA/PyAyNTY7XG4gICAgY29uc3QgdGVtcCA9IGNvbmZpZz8udGVtcGVyYXR1cmUgPz8gMC43O1xuICAgIGNvbnN0IHRvcFAgPSBjb25maWc/LnRvcFAgPz8gMC45O1xuXG4gICAgcmV0dXJuIGBbUnVmTExNIEphdmFTY3JpcHQgRmFsbGJhY2sgTW9kZV1cbk5vIG5hdGl2ZSBTSU1EIG1vZHVsZSBsb2FkZWQuIFJ1bm5pbmcgaW4gSmF2YVNjcmlwdCBmYWxsYmFjayBtb2RlLlxuXG5Zb3VyIHByb21wdDogXCIke3Byb21wdC5zbGljZSgwLCAxMDApfSR7cHJvbXB0Lmxlbmd0aCA+IDEwMCA/ICcuLi4nIDogJyd9XCJcblxuVG8gZW5hYmxlIG5hdGl2ZSBTSU1EIGluZmVyZW5jZTpcbjEuIEluc3RhbGwgdGhlIG5hdGl2ZSBiaW5kaW5nczogbnBtIGluc3RhbGwgQHJ1ZnZlY3Rvci9ydWZsbG0tJHtwcm9jZXNzLnBsYXRmb3JtfS0ke3Byb2Nlc3MuYXJjaH1cbjIuIE9yIGxvYWQgYSBHR1VGIG1vZGVsIGZpbGVcbjMuIE9yIGNvbm5lY3QgdG8gYW4gZXh0ZXJuYWwgTExNIEFQSVxuXG5Db25maWc6IHRlbXA9JHt0ZW1wLnRvRml4ZWQoMil9LCB0b3BfcD0ke3RvcFAudG9GaXhlZCgyKX0sIG1heF90b2tlbnM9JHttYXhUb2tlbnN9XG5cblRoaXMgZmFsbGJhY2sgcHJvdmlkZXMgcm91dGluZywgbWVtb3J5LCBhbmQgZW1iZWRkaW5nIGZlYXR1cmVzIGJ1dCBub3QgZnVsbCB0ZXh0IGdlbmVyYXRpb24uYDtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgcm91dGluZyBkZWNpc2lvbiBmb3IgYSBxdWVyeVxuICAgKi9cbiAgcm91dGUodGV4dDogc3RyaW5nKTogUm91dGluZ0RlY2lzaW9uIHtcbiAgICBpZiAodGhpcy5uYXRpdmUpIHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMubmF0aXZlLnJvdXRlKHRleHQpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgbW9kZWw6IHJlc3VsdC5tb2RlbCBhcyBhbnksXG4gICAgICAgIGNvbnRleHRTaXplOiByZXN1bHQuY29udGV4dF9zaXplLFxuICAgICAgICB0ZW1wZXJhdHVyZTogcmVzdWx0LnRlbXBlcmF0dXJlLFxuICAgICAgICB0b3BQOiByZXN1bHQudG9wX3AsXG4gICAgICAgIGNvbmZpZGVuY2U6IHJlc3VsdC5jb25maWRlbmNlLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBGYWxsYmFja1xuICAgIHJldHVybiB7XG4gICAgICBtb2RlbDogJ003MDAnLFxuICAgICAgY29udGV4dFNpemU6IDUxMixcbiAgICAgIHRlbXBlcmF0dXJlOiAwLjcsXG4gICAgICB0b3BQOiAwLjksXG4gICAgICBjb25maWRlbmNlOiAwLjUsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZWFyY2ggbWVtb3J5IGZvciBzaW1pbGFyIGNvbnRlbnRcbiAgICovXG4gIHNlYXJjaE1lbW9yeSh0ZXh0OiBzdHJpbmcsIGsgPSAxMCk6IE1lbW9yeVJlc3VsdFtdIHtcbiAgICBpZiAodGhpcy5uYXRpdmUpIHtcbiAgICAgIGNvbnN0IHJlc3VsdHMgPSB0aGlzLm5hdGl2ZS5zZWFyY2hNZW1vcnkodGV4dCwgayk7XG4gICAgICByZXR1cm4gcmVzdWx0cy5tYXAociA9PiAoe1xuICAgICAgICBpZDogci5pZCxcbiAgICAgICAgc2NvcmU6IHIuc2NvcmUsXG4gICAgICAgIGNvbnRlbnQ6IHIuY29udGVudCxcbiAgICAgICAgbWV0YWRhdGE6IEpTT04ucGFyc2Uoci5tZXRhZGF0YSB8fCAne30nKSxcbiAgICAgIH0pKTtcbiAgICB9XG5cbiAgICAvLyBGYWxsYmFjayAtIHNpbXBsZSBzZWFyY2hcbiAgICByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLmZhbGxiYWNrU3RhdGUubWVtb3J5LmVudHJpZXMoKSlcbiAgICAgIC5zbGljZSgwLCBrKVxuICAgICAgLm1hcCgoW2lkLCBkYXRhXSkgPT4gKHtcbiAgICAgICAgaWQsXG4gICAgICAgIHNjb3JlOiAwLjUsXG4gICAgICAgIGNvbnRlbnQ6IGRhdGEuY29udGVudCxcbiAgICAgICAgbWV0YWRhdGE6IGRhdGEubWV0YWRhdGEsXG4gICAgICB9KSk7XG4gIH1cblxuICAvKipcbiAgICogQWRkIGNvbnRlbnQgdG8gbWVtb3J5XG4gICAqL1xuICBhZGRNZW1vcnkoY29udGVudDogc3RyaW5nLCBtZXRhZGF0YT86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy5uYXRpdmUpIHtcbiAgICAgIHJldHVybiB0aGlzLm5hdGl2ZS5hZGRNZW1vcnkoY29udGVudCwgbWV0YWRhdGEgPyBKU09OLnN0cmluZ2lmeShtZXRhZGF0YSkgOiB1bmRlZmluZWQpO1xuICAgIH1cblxuICAgIC8vIEZhbGxiYWNrXG4gICAgY29uc3QgaWQgPSB0aGlzLmZhbGxiYWNrU3RhdGUubmV4dElkKys7XG4gICAgdGhpcy5mYWxsYmFja1N0YXRlLm1lbW9yeS5zZXQoaWQsIHtcbiAgICAgIGNvbnRlbnQsXG4gICAgICBlbWJlZGRpbmc6IHRoaXMuZW1iZWQoY29udGVudCksXG4gICAgICBtZXRhZGF0YTogbWV0YWRhdGEgPz8ge30sXG4gICAgfSk7XG4gICAgcmV0dXJuIGlkO1xuICB9XG5cbiAgLyoqXG4gICAqIFByb3ZpZGUgZmVlZGJhY2sgZm9yIGxlYXJuaW5nXG4gICAqL1xuICBmZWVkYmFjayhmYjogRmVlZGJhY2spOiBib29sZWFuIHtcbiAgICBpZiAodGhpcy5uYXRpdmUpIHtcbiAgICAgIHJldHVybiB0aGlzLm5hdGl2ZS5mZWVkYmFjayhmYi5yZXF1ZXN0SWQsIGZiLnJhdGluZywgZmIuY29ycmVjdGlvbik7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgZW5naW5lIHN0YXRpc3RpY3NcbiAgICovXG4gIHN0YXRzKCk6IFJ1ZkxMTVN0YXRzIHtcbiAgICBpZiAodGhpcy5uYXRpdmUpIHtcbiAgICAgIGNvbnN0IHMgPSB0aGlzLm5hdGl2ZS5zdGF0cygpO1xuICAgICAgLy8gTWFwIG5hdGl2ZSBzdGF0cyAoc25ha2VfY2FzZSkgdG8gVHlwZVNjcmlwdCBpbnRlcmZhY2UgKGNhbWVsQ2FzZSlcbiAgICAgIC8vIEhhbmRsZSBib3RoIG9sZCBhbmQgbmV3IGZpZWxkIG5hbWVzIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG4gICAgICByZXR1cm4ge1xuICAgICAgICB0b3RhbFF1ZXJpZXM6IHMudG90YWxfcXVlcmllcyA/PyAwLFxuICAgICAgICBtZW1vcnlOb2Rlczogcy5tZW1vcnlfbm9kZXMgPz8gMCxcbiAgICAgICAgcGF0dGVybnNMZWFybmVkOiBzLnBhdHRlcm5zX2xlYXJuZWQgPz8gKHMgYXMgYW55KS50cmFpbmluZ19zdGVwcyA/PyAwLFxuICAgICAgICBhdmdMYXRlbmN5TXM6IHMuYXZnX2xhdGVuY3lfbXMgPz8gMCxcbiAgICAgICAgY2FjaGVIaXRSYXRlOiBzLmNhY2hlX2hpdF9yYXRlID8/IDAsXG4gICAgICAgIHJvdXRlckFjY3VyYWN5OiBzLnJvdXRlcl9hY2N1cmFjeSA/PyAwLjUsXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIEZhbGxiYWNrXG4gICAgcmV0dXJuIHtcbiAgICAgIHRvdGFsUXVlcmllczogdGhpcy5mYWxsYmFja1N0YXRlLnF1ZXJ5Q291bnQsXG4gICAgICBtZW1vcnlOb2RlczogdGhpcy5mYWxsYmFja1N0YXRlLm1lbW9yeS5zaXplLFxuICAgICAgcGF0dGVybnNMZWFybmVkOiAwLFxuICAgICAgYXZnTGF0ZW5jeU1zOiAxLjAsXG4gICAgICBjYWNoZUhpdFJhdGU6IDAuMCxcbiAgICAgIHJvdXRlckFjY3VyYWN5OiAwLjUsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBGb3JjZSByb3V0ZXIgbGVhcm5pbmcgY3ljbGVcbiAgICovXG4gIGZvcmNlTGVhcm4oKTogc3RyaW5nIHtcbiAgICBpZiAodGhpcy5uYXRpdmUpIHtcbiAgICAgIHJldHVybiB0aGlzLm5hdGl2ZS5mb3JjZUxlYXJuKCk7XG4gICAgfVxuICAgIHJldHVybiAnTGVhcm5pbmcgbm90IGF2YWlsYWJsZSBpbiBmYWxsYmFjayBtb2RlJztcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXQgZW1iZWRkaW5nIGZvciB0ZXh0XG4gICAqL1xuICBlbWJlZCh0ZXh0OiBzdHJpbmcpOiBFbWJlZGRpbmcge1xuICAgIGlmICh0aGlzLm5hdGl2ZSkge1xuICAgICAgcmV0dXJuIHRoaXMubmF0aXZlLmVtYmVkKHRleHQpO1xuICAgIH1cblxuICAgIC8vIEZhbGxiYWNrIC0gc2ltcGxlIGhhc2gtYmFzZWQgZW1iZWRkaW5nXG4gICAgY29uc3QgZGltID0gdGhpcy5jb25maWcuZW1iZWRkaW5nRGltID8/IDc2ODtcbiAgICBjb25zdCBlbWJlZGRpbmcgPSBuZXcgQXJyYXkoZGltKS5maWxsKDApO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0ZXh0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBpZHggPSAodGV4dC5jaGFyQ29kZUF0KGkpICogKGkgKyAxKSkgJSBkaW07XG4gICAgICBlbWJlZGRpbmdbaWR4XSArPSAwLjE7XG4gICAgfVxuXG4gICAgLy8gTm9ybWFsaXplXG4gICAgY29uc3Qgbm9ybSA9IE1hdGguc3FydChlbWJlZGRpbmcucmVkdWNlKChzdW0sIHgpID0+IHN1bSArIHggKiB4LCAwKSkgfHwgMTtcbiAgICByZXR1cm4gZW1iZWRkaW5nLm1hcCh4ID0+IHggLyBub3JtKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb21wdXRlIHNpbWlsYXJpdHkgYmV0d2VlbiB0d28gdGV4dHNcbiAgICovXG4gIHNpbWlsYXJpdHkodGV4dDE6IHN0cmluZywgdGV4dDI6IHN0cmluZyk6IG51bWJlciB7XG4gICAgaWYgKHRoaXMubmF0aXZlKSB7XG4gICAgICByZXR1cm4gdGhpcy5uYXRpdmUuc2ltaWxhcml0eSh0ZXh0MSwgdGV4dDIpO1xuICAgIH1cblxuICAgIC8vIEZhbGxiYWNrIC0gY29zaW5lIHNpbWlsYXJpdHlcbiAgICBjb25zdCBlbWIxID0gdGhpcy5lbWJlZCh0ZXh0MSk7XG4gICAgY29uc3QgZW1iMiA9IHRoaXMuZW1iZWQodGV4dDIpO1xuXG4gICAgbGV0IGRvdCA9IDA7XG4gICAgbGV0IG5vcm0xID0gMDtcbiAgICBsZXQgbm9ybTIgPSAwO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBlbWIxLmxlbmd0aDsgaSsrKSB7XG4gICAgICBkb3QgKz0gZW1iMVtpXSAqIGVtYjJbaV07XG4gICAgICBub3JtMSArPSBlbWIxW2ldICogZW1iMVtpXTtcbiAgICAgIG5vcm0yICs9IGVtYjJbaV0gKiBlbWIyW2ldO1xuICAgIH1cblxuICAgIGNvbnN0IGRlbm9tID0gTWF0aC5zcXJ0KG5vcm0xKSAqIE1hdGguc3FydChub3JtMik7XG4gICAgY29uc3Qgc2ltaWxhcml0eSA9IGRlbm9tID4gMCA/IGRvdCAvIGRlbm9tIDogMDtcbiAgICAvLyBDbGFtcCB0byBbMCwgMV0gdG8gaGFuZGxlIGZsb2F0aW5nIHBvaW50IGVycm9yc1xuICAgIHJldHVybiBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCBzaW1pbGFyaXR5KSk7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2sgaWYgU0lNRCBpcyBhdmFpbGFibGVcbiAgICovXG4gIGhhc1NpbWQoKTogYm9vbGVhbiB7XG4gICAgaWYgKHRoaXMubmF0aXZlKSB7XG4gICAgICByZXR1cm4gdGhpcy5uYXRpdmUuaGFzU2ltZCgpO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvKipcbiAgICogR2V0IFNJTUQgY2FwYWJpbGl0aWVzXG4gICAqL1xuICBzaW1kQ2FwYWJpbGl0aWVzKCk6IHN0cmluZ1tdIHtcbiAgICBpZiAodGhpcy5uYXRpdmUpIHtcbiAgICAgIHJldHVybiB0aGlzLm5hdGl2ZS5zaW1kQ2FwYWJpbGl0aWVzKCk7XG4gICAgfVxuICAgIHJldHVybiBbJ1NjYWxhciAoZmFsbGJhY2spJ107XG4gIH1cblxuICAvKipcbiAgICogQmF0Y2ggcXVlcnkgbXVsdGlwbGUgcHJvbXB0c1xuICAgKi9cbiAgYmF0Y2hRdWVyeShyZXF1ZXN0OiBCYXRjaFF1ZXJ5UmVxdWVzdCk6IEJhdGNoUXVlcnlSZXNwb25zZSB7XG4gICAgY29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuICAgIGNvbnN0IHJlc3BvbnNlcyA9IHJlcXVlc3QucXVlcmllcy5tYXAocSA9PiB0aGlzLnF1ZXJ5KHEsIHJlcXVlc3QuY29uZmlnKSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlc3BvbnNlcyxcbiAgICAgIHRvdGFsTGF0ZW5jeU1zOiBEYXRlLm5vdygpIC0gc3RhcnQsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDaGVjayBpZiBuYXRpdmUgbW9kdWxlIGlzIGxvYWRlZFxuICAgKi9cbiAgaXNOYXRpdmVMb2FkZWQoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMubmF0aXZlICE9PSBudWxsO1xuICB9XG59XG4iXX0=