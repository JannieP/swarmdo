# SwarmVector Upstream WASM Packages

This directory contains references and integration bridges for upstream SwarmVector WASM packages used by Swarmdo plugins.

## Available WASM Packages

| Package | Category | Description |
|---------|----------|-------------|
| `micro-hnsw-wasm` | Vector Search | Ultra-fast HNSW vector similarity search |
| `swarmvector-attention-wasm` | Neural | Flash attention mechanism (unverified (no benchmark) speedup) |
| `swarmvector-gnn-wasm` | Graph | Graph Neural Networks for relationship modeling |
| `swarmvector-hyperbolic-hnsw-wasm` | Embeddings | Hyperbolic embeddings in Poincaré ball model |
| `swarmvector-learning-wasm` | Learning | Reinforcement learning algorithms |
| `swarmvector-nervous-system-wasm` | Coordination | Neural coordination for multi-agent systems |
| `swarmvector-economy-wasm` | Economics | Token economics and resource allocation |
| `swarmvector-exotic-wasm` | Quantum | Quantum-inspired optimization algorithms |
| `swarmvector-sparse-inference-wasm` | Inference | Sparse matrix inference for efficiency |
| `swarmvector-tiny-dancer-wasm` | Inference | Lightweight model inference (<5MB) |
| `swarmvector-mincut-wasm` | Graph | Graph mincut algorithms for partitioning |
| `swarmvector-fpga-transformer-wasm` | Accelerated | FPGA-accelerated transformer operations |
| `swarmvector-dag-wasm` | Graph | Directed Acyclic Graph processing |
| `cognitum-gate-kernel` | Cognitive | Cognitive computation kernels |
| `sona` | Neural | Self-Optimizing Neural Architecture |

## Upstream Repository

All packages are sourced from: https://github.com/ruvnet/swarmvector

## Plugin Dependencies

| Plugin | Primary WASM Packages |
|--------|----------------------|
| `@swarmdo/plugin-healthcare-cds` | micro-hnsw-wasm, swarmvector-gnn-wasm, swarmvector-hyperbolic-hnsw-wasm |
| `@swarmdo/plugin-financial-risk` | micro-hnsw-wasm, swarmvector-economy-wasm, swarmvector-sparse-inference-wasm |
| `@swarmdo/plugin-legal-contracts` | micro-hnsw-wasm, swarmvector-attention-wasm, swarmvector-dag-wasm |
| `@swarmdo/plugin-code-intelligence` | micro-hnsw-wasm, swarmvector-gnn-wasm, swarmvector-mincut-wasm, sona |
| `@swarmdo/plugin-test-intelligence` | swarmvector-learning-wasm, swarmvector-gnn-wasm, sona |
| `@swarmdo/plugin-perf-optimizer` | swarmvector-sparse-inference-wasm, swarmvector-fpga-transformer-wasm |
| `@swarmdo/plugin-neural-coordination` | sona, swarmvector-nervous-system-wasm, swarmvector-attention-wasm |
| `@swarmdo/plugin-cognitive-kernel` | cognitum-gate-kernel, sona, swarmvector-attention-wasm |
| `@swarmdo/plugin-quantum-optimizer` | swarmvector-exotic-wasm, swarmvector-hyperbolic-hnsw-wasm |
| `@swarmdo/plugin-hyperbolic-reasoning` | swarmvector-hyperbolic-hnsw-wasm, swarmvector-attention-wasm |

## Installation

```bash
# Install specific WASM bridges
npm install @swarmvector/micro-hnsw-wasm
npm install @swarmvector/attention-wasm
npm install @swarmvector/gnn-wasm
```

## Integration Pattern

```typescript
import { initMicroHnsw } from '@swarmvector/micro-hnsw-wasm';
import { FlashAttention } from '@swarmvector/attention-wasm';

// Initialize WASM modules
const hnsw = await initMicroHnsw();
const attention = await FlashAttention.init();

// Use in Swarmdo plugin
export const plugin: ClaudeFlowPlugin = {
  name: '@swarmdo/plugin-example',
  bridges: {
    hnsw,
    attention,
  },
};
```
