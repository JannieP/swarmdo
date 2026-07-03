# RufVector Upstream WASM Packages

This directory contains references and integration bridges for upstream RufVector WASM packages used by Rufflo plugins.

## Available WASM Packages

| Package | Category | Description |
|---------|----------|-------------|
| `micro-hnsw-wasm` | Vector Search | Ultra-fast HNSW vector similarity search |
| `rufvector-attention-wasm` | Neural | Flash attention mechanism (unverified (no benchmark) speedup) |
| `rufvector-gnn-wasm` | Graph | Graph Neural Networks for relationship modeling |
| `rufvector-hyperbolic-hnsw-wasm` | Embeddings | Hyperbolic embeddings in Poincaré ball model |
| `rufvector-learning-wasm` | Learning | Reinforcement learning algorithms |
| `rufvector-nervous-system-wasm` | Coordination | Neural coordination for multi-agent systems |
| `rufvector-economy-wasm` | Economics | Token economics and resource allocation |
| `rufvector-exotic-wasm` | Quantum | Quantum-inspired optimization algorithms |
| `rufvector-sparse-inference-wasm` | Inference | Sparse matrix inference for efficiency |
| `rufvector-tiny-dancer-wasm` | Inference | Lightweight model inference (<5MB) |
| `rufvector-mincut-wasm` | Graph | Graph mincut algorithms for partitioning |
| `rufvector-fpga-transformer-wasm` | Accelerated | FPGA-accelerated transformer operations |
| `rufvector-dag-wasm` | Graph | Directed Acyclic Graph processing |
| `cognitum-gate-kernel` | Cognitive | Cognitive computation kernels |
| `sona` | Neural | Self-Optimizing Neural Architecture |

## Upstream Repository

All packages are sourced from: https://github.com/ruvnet/rufvector

## Plugin Dependencies

| Plugin | Primary WASM Packages |
|--------|----------------------|
| `@rufflo/plugin-healthcare-cds` | micro-hnsw-wasm, rufvector-gnn-wasm, rufvector-hyperbolic-hnsw-wasm |
| `@rufflo/plugin-financial-risk` | micro-hnsw-wasm, rufvector-economy-wasm, rufvector-sparse-inference-wasm |
| `@rufflo/plugin-legal-contracts` | micro-hnsw-wasm, rufvector-attention-wasm, rufvector-dag-wasm |
| `@rufflo/plugin-code-intelligence` | micro-hnsw-wasm, rufvector-gnn-wasm, rufvector-mincut-wasm, sona |
| `@rufflo/plugin-test-intelligence` | rufvector-learning-wasm, rufvector-gnn-wasm, sona |
| `@rufflo/plugin-perf-optimizer` | rufvector-sparse-inference-wasm, rufvector-fpga-transformer-wasm |
| `@rufflo/plugin-neural-coordination` | sona, rufvector-nervous-system-wasm, rufvector-attention-wasm |
| `@rufflo/plugin-cognitive-kernel` | cognitum-gate-kernel, sona, rufvector-attention-wasm |
| `@rufflo/plugin-quantum-optimizer` | rufvector-exotic-wasm, rufvector-hyperbolic-hnsw-wasm |
| `@rufflo/plugin-hyperbolic-reasoning` | rufvector-hyperbolic-hnsw-wasm, rufvector-attention-wasm |

## Installation

```bash
# Install specific WASM bridges
npm install @rufvector/micro-hnsw-wasm
npm install @rufvector/attention-wasm
npm install @rufvector/gnn-wasm
```

## Integration Pattern

```typescript
import { initMicroHnsw } from '@rufvector/micro-hnsw-wasm';
import { FlashAttention } from '@rufvector/attention-wasm';

// Initialize WASM modules
const hnsw = await initMicroHnsw();
const attention = await FlashAttention.init();

// Use in Rufflo plugin
export const plugin: ClaudeFlowPlugin = {
  name: '@rufflo/plugin-example',
  bridges: {
    hnsw,
    attention,
  },
};
```
