# RufVector-Postgres

**The most advanced PostgreSQL vector database extension.** A high-performance, drop-in replacement for pgvector with 77+ SQL functions, SIMD acceleration, 39 attention mechanisms, Graph Neural Networks, hyperbolic embeddings, and self-learning capabilities.

## v2.0.0 (December 2025)

- **IVFFlat Index**: Full inverted list storage with proper page management
- **HNSW Index**: Fixed query execution with heap scan integration
- **Security Audit**: 3 critical SQL injection vulnerabilities fixed
- **Multi-tenant**: Validated tenant isolation with parameterized queries

## Quick Start

```bash
# Start RufVector-Postgres
docker run -d --name rufvector \
  -e POSTGRES_PASSWORD=secret \
  -p 5432:5432 \
  ruvnet/rufvector-postgres:latest

# Connect and use
psql -h localhost -U rufvector -d rufvector_test

# Create extension
CREATE EXTENSION rufvector;
```

## Why RufVector vs pgvector?

| Feature | pgvector | RufVector-Postgres |
|---------|----------|-------------------|
| **Vector Search** | HNSW, IVFFlat | HNSW, IVFFlat (optimized) |
| **Distance Metrics** | 3 | **8+** (including hyperbolic) |
| **Attention Mechanisms** | None | **39 types** (scaled-dot, multi-head, flash, sparse) |
| **Graph Neural Networks** | None | **GCN, GraphSAGE, GAT** |
| **Hyperbolic Embeddings** | None | **Poincare, Lorentz** (for hierarchies) |
| **Sparse Vectors** | Partial | **Full support + BM25** |
| **Self-Learning** | None | **ReasoningBank** (adaptive search) |
| **Agent Routing** | None | **Tiny Dancer** (11 functions) |
| **Graph/Cypher** | None | **Full support** |
| **SIMD Acceleration** | Partial | **Full AVX-512/NEON** |
| **Quantization** | None | **Scalar, Product, Binary** |

## Features

### Core Vector Operations
- L2, Cosine, Inner Product, Manhattan distances
- Vector normalization, addition, scalar multiplication
- SIMD-accelerated (AVX2/AVX-512/NEON)

### Hyperbolic Embeddings
Perfect for hierarchical data (taxonomies, org charts, knowledge graphs):
```sql
SELECT rufvector_poincare_distance(a, b, -1.0);
SELECT rufvector_mobius_add(a, b, -1.0);
```

### Sparse Vectors & BM25
Full sparse vector support with text scoring:
```sql
SELECT rufvector_sparse_dot(a, b);
SELECT rufvector_bm25_score(query, doc_freqs, doc_len, avg_len, total);
```

### 39 Attention Mechanisms
Transformer-style attention in PostgreSQL:
```sql
SELECT rufvector_attention_scaled_dot(query, keys, values);
SELECT rufvector_attention_multi_head(query, keys, values, 8);
```

### Graph Neural Networks
GNN inference directly in PostgreSQL:
```sql
SELECT rufvector_gnn_gcn_layer(features, adjacency, weights);
SELECT rufvector_gnn_graphsage_layer(features, neighbors, weights);
```

### Self-Learning (ReasoningBank)
Adaptive search parameter optimization:
```sql
SELECT rufvector_record_trajectory(input, output, success, context);
SELECT rufvector_adaptive_search(query, context, ef_search);
```

## Tutorial 1: Semantic Search

```sql
-- Create extension
CREATE EXTENSION rufvector;

-- Create table with vector column
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    content TEXT,
    embedding rufvector(1536)
);

-- Insert some documents (embeddings from your ML model)
INSERT INTO documents (content, embedding) VALUES
    ('PostgreSQL is a powerful database', '[0.1, 0.2, ...]'),
    ('Vector search enables AI applications', '[0.3, 0.1, ...]');

-- Create HNSW index for fast search
CREATE INDEX ON documents USING ruhnsw (embedding rufvector_l2_ops)
WITH (m = 16, ef_construction = 64);

-- Search for similar documents
SELECT content, embedding <-> $query_embedding AS distance
FROM documents
ORDER BY distance
LIMIT 10;
```

## Tutorial 2: Hybrid Search (Vector + BM25)

```sql
-- Combine vector similarity with text scoring
SELECT
    content,
    0.7 * (1.0 / (1.0 + embedding <-> $query_vector)) +
    0.3 * rufvector_bm25_score(terms, doc_freqs, length, avg_len, total) AS score
FROM documents
ORDER BY score DESC
LIMIT 10;
```

## Tutorial 3: Knowledge Graph with Hyperbolic Embeddings

```sql
-- Hyperbolic embeddings preserve hierarchy better than Euclidean
-- Perfect for taxonomies, org charts, knowledge graphs

-- Create taxonomy table
CREATE TABLE taxonomy_nodes (
    id SERIAL PRIMARY KEY,
    name TEXT,
    parent_id INTEGER,
    embedding rufvector(128)  -- Poincare embeddings
);

-- Find similar nodes using hyperbolic distance
SELECT name, rufvector_poincare_distance(embedding, $query, -1.0) AS distance
FROM taxonomy_nodes
ORDER BY distance
LIMIT 10;
```

## Tutorial 4: Multi-Agent Query Routing

```sql
-- Register AI agents with their capabilities
SELECT rufvector_register_agent('code_expert', ARRAY['coding', 'debugging'], $embedding);
SELECT rufvector_register_agent('math_expert', ARRAY['math', 'statistics'], $embedding);

-- Route user query to best agent
SELECT rufvector_route_query($user_query_embedding,
    (SELECT array_agg(row(name, capabilities)) FROM agents)
) AS best_agent;
```

## Distance Operators

| Operator | Distance | Use Case |
|----------|----------|----------|
| `<->` | L2 (Euclidean) | General similarity |
| `<=>` | Cosine | Text embeddings |
| `<#>` | Inner Product | Normalized vectors |
| `<+>` | Manhattan (L1) | Sparse features |

## Index Types

### HNSW (Hierarchical Navigable Small World)
```sql
CREATE INDEX ON items USING ruhnsw (embedding rufvector_l2_ops)
WITH (m = 16, ef_construction = 64);

SET rufvector.ef_search = 100;  -- Tune search quality
```

### IVFFlat
```sql
CREATE INDEX ON items USING ruivfflat (embedding rufvector_l2_ops)
WITH (lists = 100);

SET rufvector.ivfflat_probes = 10;
```

## Performance

| Operation | 10K vectors | 100K vectors | 1M vectors |
|-----------|-------------|--------------|------------|
| HNSW Build | 0.8s | 8.2s | 95s |
| HNSW Search (top-10) | 0.3ms | 0.5ms | 1.2ms |
| Cosine Distance | 0.01ms | 0.01ms | 0.01ms |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | rufvector | Database user |
| `POSTGRES_PASSWORD` | rufvector | Database password |
| `POSTGRES_DB` | rufvector_test | Default database |

## CLI Tool

```bash
npm install -g @rufvector/postgres-cli

rufvector-pg install --method docker
rufvector-pg vector create table --dim 384 --index hnsw
rufvector-pg bench run --type all --size 10000
```

## Links

- [GitHub](https://github.com/ruvnet/rufvector)
- [npm CLI](https://www.npmjs.com/package/@rufvector/postgres-cli)
- [crates.io](https://crates.io/crates/rufvector-postgres)
- [Documentation](https://docs.rs/ruvector-postgres)

## License

MIT License
