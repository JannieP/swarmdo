# AgentDB v2 Backend Abstraction Layer

**Version:** 2.0.0-alpha
**Status:** Implementation In Progress

## Overview

This directory contains the backend abstraction layer for AgentDB v2, providing a unified interface for vector operations across multiple implementations (SwarmVector, HNSWLib).

## Directory Structure

```
backends/
├── README.md                    # This file
├── index.ts                     # Public exports
├── VectorBackend.ts             # Core vector interface
├── LearningBackend.ts           # GNN learning interface (optional)
├── GraphBackend.ts              # Graph database interface (optional)
├── detector.ts                  # Backend auto-detection
├── factory.ts                   # Backend creation and initialization
├── swarmvector/
│   ├── index.ts
│   ├── SwarmVectorBackend.ts      # SwarmVector implementation
│   ├── SwarmVectorLearning.ts     # GNN implementation
│   └── SwarmVectorGraph.ts        # Graph implementation (planned)
└── hnswlib/
    ├── index.ts
    └── HNSWLibBackend.ts       # HNSWLib adapter
```

## Quick Start

### Installation

```bash
# Recommended: SwarmVector (150x faster)
npm install @swarmvector/core

# Optional: GNN learning
npm install @swarmvector/gnn

# Optional: Graph database
npm install @swarmvector/graph-node

# Fallback: HNSWLib
npm install hnswlib-node
```

### Basic Usage

```typescript
import { createBackend } from '@agentdb/backends';

// Auto-detect best available backend
const backend = await createBackend('auto', {
  dimension: 384,
  metric: 'cosine'
});

// Insert vectors
backend.insert('id1', embedding1, { source: 'pattern1' });

// Search
const results = backend.search(queryEmbedding, 10, {
  threshold: 0.7
});

// Save/load
await backend.save('./agentdb/index');
await backend.load('./agentdb/index');

// Cleanup
backend.close();
```

## Core Interfaces

### VectorBackend

All vector backends implement this interface:

```typescript
interface VectorBackend {
  readonly name: 'swarmvector' | 'hnswlib';
  
  insert(id: string, embedding: Float32Array, metadata?: Record<string, any>): void;
  insertBatch(items: Array<{id, embedding, metadata?}>): void;
  search(query: Float32Array, k: number, options?: SearchOptions): SearchResult[];
  remove(id: string): boolean;
  
  save(path: string): Promise<void>;
  load(path: string): Promise<void>;
  
  getStats(): VectorStats;
  close(): void;
}
```

### LearningBackend (Optional)

GNN-based learning for query enhancement:

```typescript
interface LearningBackend {
  enhance(query: Float32Array, neighbors: Float32Array[], weights: number[]): Float32Array;
  addSample(sample: TrainingSample): void;
  train(options?: {epochs?: number}): Promise<TrainingResult>;
  saveModel(path: string): Promise<void>;
  loadModel(path: string): Promise<void>;
  getStats(): LearningStats;
}
```

### GraphBackend (Optional)

Property graph database with vector integration:

```typescript
interface GraphBackend {
  execute(cypher: string, params?: Record<string, any>): Promise<QueryResult>;
  createNode(labels: string[], properties: Record<string, any>): Promise<string>;
  createRelationship(from: string, to: string, type: string, properties?): Promise<string>;
  traverse(startId: string, pattern: string, options?: TraversalOptions): Promise<GraphNode[]>;
  vectorSearch(query: Float32Array, k: number, contextNodeId?: string): Promise<GraphNode[]>;
}
```

## Backend Implementations

### SwarmVector (Recommended)

**Package:** `@swarmvector/core`

**Features:**
- ✅ Native Rust bindings (Linux, macOS, Windows)
- ✅ WASM fallback for unsupported platforms
- ✅ 150x faster search vs brute-force
- ✅ SIMD acceleration
- ✅ Tiered compression (4-32x memory reduction)

**Performance:**
- Search: 0.5-2ms per query (native), 5-10ms (WASM)
- Insert: 10-50ms for 1000 vectors (batch)
- Memory: ~4 bytes per dimension per vector (with compression)

### HNSWLib (Fallback)

**Package:** `hnswlib-node`

**Features:**
- ✅ Stable C++ implementation
- ✅ Proven HNSW algorithm
- ✅ Wide platform support
- ❌ No GNN support
- ❌ No Graph support

**Performance:**
- Search: 1-3ms per query
- Insert: 20-100ms for 1000 vectors (batch)
- Memory: ~12 bytes per dimension per vector

## Auto-Detection

The factory automatically detects available backends:

```typescript
import { detectBackends } from '@agentdb/backends';

const detection = await detectBackends();

console.log(detection);
// {
//   available: 'swarmvector',
//   swarmvector: {
//     core: true,
//     gnn: true,
//     graph: false,
//     native: true
//   },
//   hnswlib: true
// }
```

Priority:
1. Check for `@swarmvector/core` (preferred)
2. Check for optional `@swarmvector/gnn` and `@swarmvector/graph-node`
3. Fallback to `hnswlib-node` if SwarmVector unavailable
4. Clear error messages if no backend available

## Configuration

### Default Configuration

```typescript
{
  dimension: 384,        // Vector dimension
  metric: 'cosine',      // Distance metric: 'cosine', 'l2', 'ip'
  maxElements: 100000,   // Maximum vectors
  M: 16,                 // HNSW connections per layer
  efConstruction: 200,   // Build quality
  efSearch: 100          // Search quality
}
```

### Backend-Specific Tuning

**SwarmVector:**
```typescript
{
  dimension: 384,
  metric: 'cosine',
  efConstruction: 200,   // Higher = better quality, slower build
  efSearch: 100,         // Higher = better quality, slower search
  // Compression enabled automatically
}
```

**HNSWLib:**
```typescript
{
  dimension: 384,
  metric: 'cosine',
  M: 16,                 // Higher = better quality, more memory
  efConstruction: 200,
  efSearch: 100
}
```

## Migration from HNSWIndex

### Before (v1)

```typescript
import { HNSWIndex } from '@agentdb';

const index = new HNSWIndex(db, { dimension: 384, metric: 'cosine' });
await index.buildIndex('pattern_embeddings');
const results = await index.search(query, 10);
```

### After (v2)

```typescript
import { createBackend } from '@agentdb/backends';

const backend = await createBackend('auto', { dimension: 384, metric: 'cosine' });
const results = backend.search(query, 10);
```

**Key Differences:**
1. String IDs instead of numeric IDs
2. Synchronous `search()` instead of async
3. Backend auto-detection
4. Consistent interface across implementations

## Advanced Features

### GNN Learning

```typescript
import { SwarmVectorLearning } from '@agentdb/backends';

const learning = new SwarmVectorLearning({
  enabled: true,
  inputDim: 384,
  heads: 4,
  learningRate: 0.001
});

// Enhance query with GNN attention
const enhanced = learning.enhance(query, neighbors, weights);

// Add training samples
learning.addSample({ embedding: query, label: 1, weight: 0.9 });

// Train model
const result = await learning.train({ epochs: 50 });
console.log(`Loss: ${result.finalLoss}, Improvement: ${result.improvement}%`);
```

### Graph Queries

```typescript
import { SwarmVectorGraph } from '@agentdb/backends';

const graph = new SwarmVectorGraph();

// Create nodes
const node1 = await graph.createNode(['Memory'], { content: 'User likes dark mode' });
const node2 = await graph.createNode(['Memory'], { content: 'User works late' });

// Create relationship
await graph.createRelationship(node1, node2, 'RELATES_TO', { strength: 0.8 });

// Traverse
const related = await graph.traverse(node1, '()-[:RELATES_TO]->(:Memory)', { maxDepth: 2 });

// Hybrid search
const results = await graph.vectorSearch(queryEmbedding, 10, node1);
```

## Performance Benchmarking

```typescript
import { createBackend } from '@agentdb/backends';

const backend = await createBackend('auto', { dimension: 384, metric: 'cosine' });

// Insert 10k vectors
const items = Array.from({ length: 10000 }, (_, i) => ({
  id: `vec${i}`,
  embedding: new Float32Array(384).map(() => Math.random())
}));

console.time('insertBatch');
backend.insertBatch(items);
console.timeEnd('insertBatch');
// SwarmVector: ~50ms, HNSWLib: ~200ms

// Search
console.time('search');
const results = backend.search(queryEmbedding, 10);
console.timeEnd('search');
// SwarmVector: ~1.5ms, HNSWLib: ~3ms

// Stats
const stats = backend.getStats();
console.log(`Backend: ${stats.backend}`);
console.log(`Vectors: ${stats.count}`);
console.log(`Memory: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)} MB`);
// SwarmVector: ~15MB, HNSWLib: ~45MB
```

## Testing

Run backend tests:

```bash
# Unit tests
npm test backends

# Integration tests
npm test backends:integration

# Benchmark tests
npm run benchmark:backends
```

## Related Documentation

- [Backend Architecture](/workspaces/agentic-flow/docs/agentdb-v2-backend-architecture.md)
- [Component Interactions](/workspaces/agentic-flow/docs/agentdb-v2-component-interactions.md)
- [ADR-001: Backend Abstraction](/workspaces/agentic-flow/plans/agentdb-v2/ADR-001-backend-abstraction.md)
- [Overall Architecture](/workspaces/agentic-flow/plans/agentdb-v2/ARCHITECTURE.md)

## Troubleshooting

### Backend Not Found

```
Error: No vector backend available.
Install one of:
  - npm install @swarmvector/core (recommended)
  - npm install hnswlib-node (fallback)
```

**Solution:** Install at least one backend package.

### Native Bindings Failed

```
Warning: Using WASM fallback. Performance may be degraded.
```

**Solution:** This is normal for unsupported platforms. WASM provides compatibility at reduced performance.

### GNN Not Available

```
Warning: GNN learning not available
```

**Solution:** Install `@swarmvector/gnn` for learning features, or continue without GNN (optional).

## Support

- **Issues:** the upstream project (see NOTICE)
- **SwarmVector:** the upstream project (see NOTICE)
- **HNSWLib:** https://github.com/nmslib/hnswlib
