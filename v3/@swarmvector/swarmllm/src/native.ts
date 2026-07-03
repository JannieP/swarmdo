/**
 * Native bindings loader for SwarmLLM
 *
 * Automatically loads the correct native binary for the current platform.
 */

import { join } from 'path';

// Try to load the native module
let nativeModule: NativeSwarmLLM | null = null;

interface NativeSwarmLLM {
  // Native exports RuvLlmEngine (camelCase), we normalize to SwarmLLMEngine
  SwarmLLMEngine: new (config?: NativeConfig) => NativeEngine;
  SimdOperations: new () => NativeSimdOps;
  version: () => string;
  hasSimdSupport: () => boolean;
}

// Raw native module interface (actual export names)
interface RawNativeModule {
  RuvLlmEngine?: new (config?: NativeConfig) => NativeEngine;
  SwarmLLMEngine?: new (config?: NativeConfig) => NativeEngine;
  SimdOperations: new () => NativeSimdOps;
  version: () => string;
  hasSimdSupport: () => boolean;
}

interface NativeConfig {
  embedding_dim?: number;
  router_hidden_dim?: number;
  hnsw_m?: number;
  hnsw_ef_construction?: number;
  hnsw_ef_search?: number;
  learning_enabled?: boolean;
  quality_threshold?: number;
  ewc_lambda?: number;
}

interface NativeEngine {
  query(text: string, config?: NativeGenConfig): NativeQueryResponse;
  generate(prompt: string, config?: NativeGenConfig): string;
  route(text: string): NativeRoutingDecision;
  searchMemory(text: string, k?: number): NativeMemoryResult[];
  addMemory(content: string, metadata?: string): number;
  feedback(requestId: string, rating: number, correction?: string): boolean;
  stats(): NativeStats;
  forceLearn(): string;
  embed(text: string): number[];
  similarity(text1: string, text2: string): number;
  hasSimd(): boolean;
  simdCapabilities(): string[];
}

interface NativeGenConfig {
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
}

interface NativeQueryResponse {
  text: string;
  confidence: number;
  model: string;
  context_size: number;
  latency_ms: number;
  request_id: string;
}

interface NativeRoutingDecision {
  model: string;
  context_size: number;
  temperature: number;
  top_p: number;
  confidence: number;
}

interface NativeMemoryResult {
  id: number;
  score: number;
  content: string;
  metadata: string;
}

interface NativeStats {
  total_queries: number;
  memory_nodes: number;
  patterns_learned: number;
  avg_latency_ms: number;
  cache_hit_rate: number;
  router_accuracy: number;
}

interface NativeSimdOps {
  dotProduct(a: number[], b: number[]): number;
  cosineSimilarity(a: number[], b: number[]): number;
  l2Distance(a: number[], b: number[]): number;
  matvec(matrix: number[][], vector: number[]): number[];
  softmax(input: number[]): number[];
}

// Platform-specific package names
const PLATFORM_PACKAGES: Record<string, string> = {
  'darwin-x64': '@swarmvector/swarmllm-darwin-x64',
  'darwin-arm64': '@swarmvector/swarmllm-darwin-arm64',
  'linux-x64': '@swarmvector/swarmllm-linux-x64-gnu',
  'linux-arm64': '@swarmvector/swarmllm-linux-arm64-gnu',
  'win32-x64': '@swarmvector/swarmllm-win32-x64-msvc',
};

function getPlatformKey(): string {
  const platform = process.platform;
  const arch = process.arch;
  return `${platform}-${arch}`;
}

function loadNativeModule(): NativeSwarmLLM | null {
  if (nativeModule) {
    return nativeModule;
  }

  const platformKey = getPlatformKey();
  const packageName = PLATFORM_PACKAGES[platformKey];

  if (!packageName) {
    // Silently fail - JS fallback will be used
    return null;
  }

  // Try loading from optional dependencies
  const attempts = [
    // Swarmdo fork: bundled native binary shipped with this package
    () => require(join(__dirname, '..', '..', 'platforms', platformKey, 'swarmllm.node')),
    // Try the platform-specific package
    () => require(packageName),
    // Try loading from local .node file (CJS build)
    () => require(join(__dirname, '..', '..', 'swarmllm.node')),
    // Try loading from local .node file (root)
    () => require(join(__dirname, '..', 'swarmllm.node')),
  ];

  for (const attempt of attempts) {
    try {
      const raw = attempt() as RawNativeModule;
      // Normalize: native exports RuvLlmEngine, we expose as SwarmLLMEngine
      nativeModule = {
        SwarmLLMEngine: raw.SwarmLLMEngine ?? raw.RuvLlmEngine!,
        SimdOperations: raw.SimdOperations,
        version: raw.version,
        hasSimdSupport: raw.hasSimdSupport,
      };
      return nativeModule;
    } catch {
      // Continue to next attempt
    }
  }

  // Silently fall back to JS implementation
  return null;
}

// Export functions to get native bindings
export function getNativeModule(): NativeSwarmLLM | null {
  return loadNativeModule();
}

export function version(): string {
  const mod = loadNativeModule();
  return mod?.version() ?? '0.1.0-js';
}

export function hasSimdSupport(): boolean {
  const mod = loadNativeModule();
  return mod?.hasSimdSupport() ?? false;
}

// Export types for internal use
export type {
  NativeSwarmLLM,
  NativeConfig,
  NativeEngine,
  NativeGenConfig,
  NativeQueryResponse,
  NativeRoutingDecision,
  NativeMemoryResult,
  NativeStats,
  NativeSimdOps,
};
