# Swarmvector Graph Node

[![npm](https://img.shields.io/npm/v/@swarmvector/graph.svg)](https://www.npmjs.com/package/@swarmvector/graph)
[![Crates.io](https://img.shields.io/crates/v/swarmvector-graph-node.svg)](https://crates.io/crates/swarmvector-graph-node)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Node.js bindings for SwarmVector Graph Database via NAPI-RS.**

`swarmvector-graph-node` provides native Node.js bindings for the Swarmvector graph database, enabling high-performance graph operations with Cypher queries directly from JavaScript/TypeScript. Part of the [Swarmvector](the upstream project (see NOTICE)) ecosystem.

## Why Swarmvector Graph Node?

- **Native Performance**: Rust speed in Node.js
- **Zero-Copy**: Efficient data transfer via NAPI-RS
- **Async/Await**: Full async support for non-blocking I/O
- **TypeScript**: Complete type definitions included
- **Neo4j Compatible**: Cypher query language support

## Features

### Core Capabilities

- **Graph CRUD**: Create nodes, edges, and hyperedges
- **Cypher Queries**: Execute Neo4j-compatible queries
- **Vector Search**: Semantic search on graph elements
- **Traversal**: BFS, DFS, shortest path algorithms
- **Batch Operations**: Bulk insert and query

### Advanced Features

- **Streaming Results**: Handle large result sets
- **Transaction Support**: ACID transactions (planned)
- **Connection Pooling**: Efficient resource management
- **Worker Threads**: Multi-threaded operations

## Installation

```bash
npm install @swarmvector/graph
# or
yarn add @swarmvector/graph
# or
pnpm add @swarmvector/graph
```

## Quick Start

### Create a Graph

```typescript
import { Graph, Node, Edge } from '@swarmvector/graph';

// Create a new graph
const graph = new Graph({
  dimensions: 384,  // For vector embeddings
  distanceMetric: 'cosine',
});

// Create nodes
const alice = await graph.createNode({
  labels: ['Person'],
  properties: { name: 'Alice', age: 30 },
});

const bob = await graph.createNode({
  labels: ['Person'],
  properties: { name: 'Bob', age: 25 },
});

// Create relationship
await graph.createEdge({
  label: 'KNOWS',
  source: alice.id,
  target: bob.id,
  properties: { since: 2020 },
});
```

### Cypher Queries

```typescript
import { Graph } from '@swarmvector/graph';

const graph = new Graph();

// Execute Cypher query
const results = await graph.query(`
  MATCH (p:Person)-[:KNOWS]->(friend:Person)
  WHERE p.name = 'Alice'
  RETURN friend.name AS name, friend.age AS age
`);

for (const row of results) {
  console.log(`Friend: ${row.name} (age ${row.age})`);
}
```

### Vector Search

```typescript
import { Graph } from '@swarmvector/graph';

const graph = new Graph({ dimensions: 384 });

// Create node with embedding
await graph.createNode({
  labels: ['Document'],
  properties: { title: 'Introduction to Graphs' },
  embedding: new Float32Array([0.1, 0.2, 0.3, /* ... */]),
});

// Semantic search
const similar = await graph.searchSimilar({
  vector: new Float32Array([0.1, 0.2, 0.3, /* ... */]),
  k: 10,
  labels: ['Document'],
});

for (const node of similar) {
  console.log(`${node.properties.title}: ${node.score}`);
}
```

## API Reference

### Graph Class

```typescript
class Graph {
  constructor(config?: GraphConfig);

  // Node operations
  createNode(node: NodeInput): Promise<Node>;
  getNode(id: string): Promise<Node | null>;
  updateNode(id: string, updates: Partial<NodeInput>): Promise<Node>;
  deleteNode(id: string): Promise<boolean>;

  // Edge operations
  createEdge(edge: EdgeInput): Promise<Edge>;
  getEdge(id: string): Promise<Edge | null>;
  deleteEdge(id: string): Promise<boolean>;

  // Query
  query(cypher: string, params?: Record<string, any>): Promise<Row[]>;

  // Search
  searchSimilar(options: SearchOptions): Promise<ScoredNode[]>;

  // Traversal
  neighbors(id: string, direction?: 'in' | 'out' | 'both'): Promise<Node[]>;
  shortestPath(from: string, to: string): Promise<Path | null>;
}
```

### Types

```typescript
interface GraphConfig {
  dimensions?: number;
  distanceMetric?: 'cosine' | 'euclidean' | 'dotProduct';
}

interface NodeInput {
  labels: string[];
  properties: Record<string, any>;
  embedding?: Float32Array;
}

interface Node {
  id: string;
  labels: string[];
  properties: Record<string, any>;
  embedding?: Float32Array;
}

interface EdgeInput {
  label: string;
  source: string;
  target: string;
  properties?: Record<string, any>;
}

interface SearchOptions {
  vector: Float32Array;
  k: number;
  labels?: string[];
  filter?: Record<string, any>;
}
```

## Building from Source

```bash
# Clone repository
git clone the upstream project (see NOTICE)
cd swarmvector/crates/swarmvector-graph-node

# Install dependencies
npm install

# Build native module
npm run build

# Run tests
npm test
```

## Platform Support

| Platform | Architecture | Status |
|----------|-------------|--------|
| Linux | x64 | ✅ |
| Linux | arm64 | ✅ |
| macOS | x64 | ✅ |
| macOS | arm64 (M1/M2) | ✅ |
| Windows | x64 | ✅ |

## Related Packages

- **[swarmvector-graph](../swarmvector-graph/)** - Core graph database engine
- **[swarmvector-graph-wasm](../swarmvector-graph-wasm/)** - WebAssembly bindings
- **[@swarmvector/core](https://www.npmjs.com/package/@swarmvector/core)** - Core vector bindings

## Documentation

- **[Main README](../../README.md)** - Complete project overview
- **[API Documentation](https://docs.rs/swarmvector-graph-node)** - Full API reference
- **[GitHub Repository](the upstream project (see NOTICE))** - Source code

## License

**MIT License** - see [LICENSE](../../LICENSE) for details.

---

<div align="center">

**Part of [Swarmvector](the upstream project (see NOTICE)) - Built by [the upstream author](https://swarmdo.com)**

[![Star on GitHub](https://img.shields.io/github/stars/upstream/swarmvector?style=social)](the upstream project (see NOTICE))

[Documentation](https://docs.rs/swarmvector-graph-node) | [npm](https://www.npmjs.com/package/@swarmvector/graph) | [GitHub](the upstream project (see NOTICE))

</div>
