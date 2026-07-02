/**
 * SimdFallbacks - Optimized pure-JS fallbacks for SIMD operations
 *
 * All vector math, activation functions, and element-wise operations
 * with 4-wide loop unrolling for performance-critical paths.
 * Used by NativeAccelerator when @rufvector/rufllm is unavailable.
 */
export declare function jsCosineSimilarity(a: Float32Array, b: Float32Array): number;
export declare function jsDotProduct(a: Float32Array, b: Float32Array): number;
export declare function jsL2Distance(a: Float32Array, b: Float32Array): number;
export declare function jsHammingDistance(a: Uint8Array, b: Uint8Array): number;
export declare function jsInfoNceLoss(anchor: Float32Array, positive: Float32Array, negatives: Float32Array[], temperature: number): number;
export declare function jsAdamWStep(params: Float32Array, grads: Float32Array, m: Float32Array, v: Float32Array, step: number, lr: number, wd: number): void;
export declare function jsMatvec(matrix: number[][], vector: number[]): number[];
export declare function jsSoftmax(input: number[]): number[];
export declare function jsRelu(input: number[]): number[];
export declare function jsGelu(input: number[]): number[];
export declare function jsSigmoid(input: number[]): number[];
export declare function jsLayerNorm(input: number[], eps: number): number[];
export declare function jsAdd(a: number[], b: number[]): number[];
export declare function jsMul(a: number[], b: number[]): number[];
export declare function jsScale(a: number[], scalar: number): number[];
export declare function jsNormalizeVec(a: number[]): number[];
export declare function jsCrc32c(data: Uint8Array): number;
//# sourceMappingURL=SimdFallbacks.d.ts.map