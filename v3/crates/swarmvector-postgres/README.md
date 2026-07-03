# SwarmVector-Postgres

[![Crates.io](https://img.shields.io/crates/v/swarmvector-postgres.svg)](https://crates.io/crates/swarmvector-postgres)
[![Documentation](https://docs.rs/ruvector-postgres/badge.svg)](https://docs.rs/ruvector-postgres)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14--17-blue.svg)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-available-blue.svg)](https://hub.docker.com/r/ruvnet/swarmvector-postgres)
[![npm](https://img.shields.io/npm/v/@swarmvector/core.svg)](https://www.npmjs.com/package/@swarmvector/core)
[![Security](https://img.shields.io/badge/Security-Audited-green.svg)](docs/SECURITY_AUDIT_REPORT.md)

**A drop-in pgvector replacement that learns from your queries and gets smarter over time.**

Most PostgreSQL vector extensions give you storage and search -- and that is it. SwarmVector-Postgres adds 143 SQL functions that bring graph neural networks, attention mechanisms, hyperbolic embeddings, self-healing indexes, and local embedding generation directly into your existing database. No sidecar service, no external API calls. Install the extension and `SELECT` your way to better results.

| | SwarmVector-Postgres | pgvector | Separate vector service |
|---|---|---|---|
| **Search quality** | GNN and 46 attention mechanisms improve results over time | Static HNSW/IVFFlat | Depends on service |
| **Embeddings** | Generate locally inside Postgres -- 6 models, no API costs | External API required | External API required |
| **Graph queries** | Full Cypher engine + SPARQL 1.1 in SQL | Not available | Rarely available |
| **Hybrid search** | Vector + BM25 fusion (RRF, linear blending) built in | Not available | Some services |
| **Self-healing** | Detects and repairs index corruption automatically | Manual maintenance | Varies |
| **Multi-tenancy** | Row-level tenant isolation out of the box | Build it yourself | Paid tiers |
| **Advanced math** | Wasserstein OT, spectral clustering, persistent homology | Not available | Not available |
| **SIMD** | Full AVX-512/NEON acceleration | Partial | N/A |
| **Cost** | Free forever -- open source (MIT) | Free | Per-query or per-vector pricing |

## Key Features

| Feature | What It Does | Why It Matters |
|---|---|---|
| **143 SQL functions** | Vector ops, GNN layers, attention, solvers, graph queries -- all as `SELECT` calls | Use familiar SQL instead of learning a new API |
| **Local embeddings** | 6 fastembed models run inside PostgreSQL | No API keys, no latency, no per-call costs |
| **46 attention mechanisms** | Flash, linear, sparse, cross, hyperbolic, mincut-gated | Transformer-grade inference without leaving the database |
| **Sublinear solvers** | PageRank, conjugate gradient, Laplacian solver in O(log n) to O(sqrt n) | Graph analytics that scale to millions of nodes |
| **Hyperbolic geometry** | Poincare and Lorentz distance for hierarchical data | Better results on taxonomies, org charts, knowledge graphs |
| **Self-learning (SONA)** | Micro-LoRA trajectories with EWC++ forgetting prevention | Search parameters tune themselves to your workload |
| **Self-healing indexes** | Automated integrity checks with Stoer-Wagner mincut validation | Indexes repair themselves -- less ops work for you |
| **Gated transformers** | Mincut-coherence control with early exit and mixture-of-depths | 30-50% latency reduction when coherence is high |
| **Neural DAG learning** | 59 SQL functions for query plan optimization | The database learns which execution plans work best |

## Installation

### Docker (Recommended)

```bash
# Start the container
docker run -d --name swarmvector-pg \
  -e POSTGRES_PASSWORD=secret \
  -p 5432:5432 \
  ruvnet/swarmvector-postgres:latest

# Connect with psql
PGPASSWORD=secret psql -h localhost -p 5432 -U postgres

# Or use the swarmvector app user (created automatically)
PGPASSWORD=swarmvector psql -h localhost -p 5432 -U swarmvector -d postgres
```

The container initializes with:
- Extension `swarmvector` pre-installed and tested
- User `swarmvector` with password `swarmvector` for application use
- SIMD acceleration (AVX2/AVX-512) auto-detected

### npm (Node.js Bindings)

```bash
# Install the core package with native bindings
npm install @swarmvector/core

# Or install the full swarmvector package
npm install swarmvector
```

```javascript
const { VectorDB, cosineDistance } = require('@swarmvector/core');

// Create a vector database
const db = new VectorDB({ dimensions: 384 });

// Add vectors
db.add([0.1, 0.2, 0.3, ...]);

// Search
const results = db.search(queryVector, { k: 10 });
```

### From Source

```bash
# Install pgrx
cargo install cargo-pgrx --version "0.12.9" --locked
cargo pgrx init --pg16 $(which pg_config)

# Build and install
cd crates/swarmvector-postgres
cargo pgrx install --release
```

### CLI Tool

```bash
npm install -g @swarmvector/postgres-cli
swarmvector-pg -c "postgresql://localhost:5432/mydb" install
```

## Quick Start

```sql
-- Create the extension
CREATE EXTENSION swarmvector;

-- Create a table with vector column
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    content TEXT,
    embedding swarmvector(1536)
);

-- Create an HNSW index
CREATE INDEX ON documents USING ruhnsw (embedding swarmvector_l2_ops);

-- Find similar documents
SELECT content, embedding <-> '[0.15, 0.25, ...]'::swarmvector AS distance
FROM documents
ORDER BY distance
LIMIT 10;
```

## 143 SQL Functions

SwarmVector exposes all advanced AI capabilities as native PostgreSQL functions.

### Core Vector Operations

```sql
-- Distance metrics
SELECT swarmvector_cosine_distance(a, b);
SELECT swarmvector_l2_distance(a, b);
SELECT swarmvector_inner_product(a, b);
SELECT swarmvector_manhattan_distance(a, b);

-- Vector operations
SELECT swarmvector_normalize(embedding);
SELECT swarmvector_add(a, b);
SELECT swarmvector_scalar_mul(embedding, 2.0);
```

### Hyperbolic Geometry (8 functions)

Perfect for hierarchical data like taxonomies, knowledge graphs, and org charts.

```sql
-- Poincare ball model
SELECT swarmvector_poincare_distance(a, b, -1.0);  -- curvature -1

-- Lorentz hyperboloid model
SELECT swarmvector_lorentz_distance(a, b, -1.0);

-- Hyperbolic operations
SELECT swarmvector_mobius_add(a, b, -1.0);       -- Hyperbolic translation
SELECT swarmvector_exp_map(base, tangent, -1.0); -- Tangent to manifold
SELECT swarmvector_log_map(base, target, -1.0);  -- Manifold to tangent

-- Model conversion
SELECT swarmvector_poincare_to_lorentz(poincare_vec, -1.0);
SELECT swarmvector_lorentz_to_poincare(lorentz_vec, -1.0);

-- Minkowski inner product
SELECT swarmvector_minkowski_dot(a, b);
```

### Sparse Vectors & BM25 (14 functions)

Full sparse vector support with text scoring.

```sql
-- Create sparse vectors
SELECT swarmvector_sparse_create(ARRAY[0, 5, 10], ARRAY[0.5, 0.3, 0.2], 100);
SELECT swarmvector_sparse_from_dense(dense_vector, 0.01);  -- threshold

-- Sparse operations
SELECT swarmvector_sparse_dot(a, b);
SELECT swarmvector_sparse_cosine(a, b);
SELECT swarmvector_sparse_l2_distance(a, b);
SELECT swarmvector_sparse_add(a, b);
SELECT swarmvector_sparse_scale(vec, 2.0);
SELECT swarmvector_sparse_normalize(vec);
SELECT swarmvector_sparse_topk(vec, 10);  -- Top-k elements

-- Text scoring
SELECT swarmvector_bm25_score(query_terms, doc_freqs, doc_len, avg_doc_len, total_docs);
SELECT swarmvector_tf_idf(term_freq, doc_freq, total_docs);
```

### 46 Attention Mechanisms

Full transformer-style attention in PostgreSQL.

```sql
-- Scaled dot-product attention
SELECT swarmvector_attention_scaled_dot(query, keys, values);

-- Multi-head attention
SELECT swarmvector_attention_multi_head(query, keys, values, num_heads);

-- Flash attention (memory efficient)
SELECT swarmvector_attention_flash(query, keys, values, block_size);

-- Sparse attention patterns
SELECT swarmvector_attention_sparse(query, keys, values, sparsity_pattern);

-- Linear attention (O(n) complexity)
SELECT swarmvector_attention_linear(query, keys, values);

-- Causal/masked attention
SELECT swarmvector_attention_causal(query, keys, values);

-- Cross attention
SELECT swarmvector_attention_cross(query, context_keys, context_values);

-- Self attention
SELECT swarmvector_attention_self(input, num_heads);
```

### Sublinear Solvers (11 functions)

Graph analytics powered by swarmvector-solver's O(log n) to O(sqrt(n)) algorithms.

```sql
-- PageRank (Forward Push, O(1/epsilon))
SELECT swarmvector_pagerank('{"edges":[[0,1],[1,2],[2,0]]}'::jsonb);

-- Personalized PageRank from a source node
SELECT swarmvector_pagerank_personalized('{"edges":[[0,1],[1,2],[2,0]]}'::jsonb, 0);

-- Solve sparse linear system Ax=b (Neumann or CG)
SELECT swarmvector_solve_sparse(matrix_json, ARRAY[1.0, 2.0]::real[], 'cg');

-- Conjugate Gradient for SPD systems
SELECT swarmvector_conjugate_gradient(matrix_json, rhs);

-- Graph Laplacian solver
SELECT swarmvector_solve_laplacian(laplacian_json, rhs);

-- Effective resistance between nodes
SELECT swarmvector_effective_resistance(laplacian_json, 0, 1);

-- Matrix sparsity analysis
SELECT swarmvector_matrix_analyze(matrix_json);

-- List available solver algorithms
SELECT * FROM swarmvector_solver_info();
```

### Math Distances & Spectral (12 functions)

Statistical distances, optimal transport, and spectral graph processing.

```sql
-- Wasserstein (Earth Mover's) distance
SELECT swarmvector_wasserstein_distance(ARRAY[0.5,0.5]::real[], ARRAY[0.3,0.7]::real[]);

-- Sinkhorn optimal transport with regularization
SELECT swarmvector_sinkhorn_distance(cost_json, weights_a, weights_b);

-- KL divergence and Jensen-Shannon divergence
SELECT swarmvector_kl_divergence(ARRAY[0.5,0.5]::real[], ARRAY[0.3,0.7]::real[]);
SELECT swarmvector_jensen_shannon(ARRAY[0.5,0.5]::real[], ARRAY[0.3,0.7]::real[]);

-- Spectral clustering
SELECT swarmvector_spectral_cluster(adjacency_json, 3);  -- k=3 clusters

-- Chebyshev polynomial graph filter
SELECT swarmvector_chebyshev_filter(adj_json, signal, 'low_pass', 10);

-- Heat kernel graph diffusion
SELECT swarmvector_graph_diffusion(adj_json, signal);

-- Product manifold distance (Euclidean x Hyperbolic x Spherical)
SELECT swarmvector_product_manifold_distance(a, b, 3, 2, 1);

-- Spherical (great-circle) distance
SELECT swarmvector_spherical_distance(ARRAY[1,0,0]::real[], ARRAY[0,1,0]::real[]);
```

### Topological Data Analysis (7 functions)

Persistent homology and topological feature extraction from point clouds.

```sql
-- Persistent homology via Vietoris-Rips filtration
SELECT swarmvector_persistent_homology('[[1,0],[0,1],[-1,0],[0,-1]]'::jsonb, 1, 3.0);

-- Betti numbers at a given radius
SELECT swarmvector_betti_numbers('[[0,0],[1,0],[0,1]]'::jsonb, 1.5);

-- Bottleneck distance between persistence diagrams
SELECT swarmvector_bottleneck_distance(diagram_a, diagram_b);

-- Wasserstein distance between persistence diagrams
SELECT swarmvector_persistence_wasserstein(diagram_a, diagram_b, 2);

-- Topological summary (Betti + persistence statistics + entropy)
SELECT swarmvector_topological_summary(points_json, 1);

-- Embedding drift detection via topology
SELECT swarmvector_embedding_drift(old_embeddings, new_embeddings);

-- Build Vietoris-Rips simplicial complex
SELECT swarmvector_vietoris_rips(points_json, 2.0, 2);
```

### Sona Learning (4 functions)

Self-Optimizing Neural Architecture with micro-LoRA and EWC++ forgetting prevention.

```sql
-- Record a learning trajectory
SELECT swarmvector_sona_learn('my_table', trajectory_json);

-- Apply learned LoRA transform to an embedding
SELECT swarmvector_sona_apply('my_table', embedding);

-- Check EWC++ forgetting metrics
SELECT swarmvector_sona_ewc_status('my_table');

-- Get Sona engine statistics
SELECT swarmvector_sona_stats('my_table');
```

### Domain Expansion (1 function)

Cross-domain transfer learning with contextual bandits.

```sql
-- Transfer embeddings to a target domain
SELECT swarmvector_domain_transfer(embeddings_json, 'target_domain');
```

### Graph Neural Networks (5 functions)

GNN layers for graph-structured data.

```sql
-- GCN (Graph Convolutional Network)
SELECT swarmvector_gnn_gcn_layer(features, adjacency, weights);

-- GraphSAGE (inductive learning)
SELECT swarmvector_gnn_graphsage_layer(features, neighbor_features, weights);

-- GAT (Graph Attention Network)
SELECT swarmvector_gnn_gat_layer(features, adjacency, attention_weights);

-- Message passing
SELECT swarmvector_gnn_message_pass(node_features, edge_index, edge_weights);

-- Aggregation
SELECT swarmvector_gnn_aggregate(messages, aggregation_type);  -- mean, max, sum
```

### Agent Routing - Tiny Dancer (11 functions)

Intelligent query routing to specialized AI agents.

```sql
-- Route query to best agent
SELECT swarmvector_route_query(query_embedding, agent_registry);

-- Route with context
SELECT swarmvector_route_with_context(query, context, agents);

-- Multi-agent routing
SELECT swarmvector_multi_agent_route(query, agents, top_k);

-- Agent management
SELECT swarmvector_register_agent(name, capabilities, embedding);
SELECT swarmvector_update_agent_performance(agent_id, metrics);
SELECT swarmvector_get_routing_stats();

-- Affinity calculation
SELECT swarmvector_calculate_agent_affinity(query, agent);
SELECT swarmvector_select_best_agent(query, agent_list);

-- Adaptive routing
SELECT swarmvector_adaptive_route(query, context, learning_rate);

-- FastGRNN acceleration
SELECT swarmvector_fastgrnn_forward(input, hidden, weights);
```

### Local Embeddings (6 functions)

Generate embeddings directly in PostgreSQL - no external API calls needed.

```sql
-- Generate embedding from text (default: all-MiniLM-L6-v2)
SELECT swarmvector_embed('Hello, world!');

-- Use specific model
SELECT swarmvector_embed('Hello, world!', 'bge-small-en-v1.5');

-- Batch embedding (efficient for multiple texts)
SELECT swarmvector_embed_batch(ARRAY['First doc', 'Second doc', 'Third doc']);

-- List available models
SELECT swarmvector_list_models();

-- Get model information (dimensions, description)
SELECT swarmvector_model_info('all-MiniLM-L6-v2');

-- Preload model into cache for faster subsequent calls
SELECT swarmvector_preload_model('bge-base-en-v1.5');
```

**Supported Models:**

| Model | Dimensions | Use Case |
|-------|------------|----------|
| `all-MiniLM-L6-v2` | 384 | Fast, general-purpose (default) |
| `bge-small-en-v1.5` | 384 | MTEB #1, English |
| `bge-base-en-v1.5` | 768 | Higher accuracy, English |
| `bge-large-en-v1.5` | 1024 | Highest accuracy, English |
| `nomic-embed-text-v1` | 768 | Long context (8192 tokens) |
| `nomic-embed-text-v1.5` | 768 | Updated long context |

**Example: Automatic Embedding on Insert**

```sql
-- Create table with trigger for auto-embedding
CREATE TABLE articles (
    id SERIAL PRIMARY KEY,
    title TEXT,
    content TEXT,
    embedding swarmvector(384)
);

-- Insert with automatic embedding generation
INSERT INTO articles (title, content, embedding)
VALUES (
    'Introduction to AI',
    'Artificial intelligence is transforming...',
    swarmvector_embed('Artificial intelligence is transforming...')
);

-- Semantic search
SELECT title, embedding <=> swarmvector_embed('machine learning basics') AS distance
FROM articles
ORDER BY distance
LIMIT 5;
```

### Self-Learning / ReasoningBank (7 functions)

Adaptive search parameter optimization.

```sql
-- Record learning trajectory
SELECT swarmvector_record_trajectory(input, output, success, context);

-- Get verdict on approach
SELECT swarmvector_get_verdict(trajectory_id);

-- Memory distillation
SELECT swarmvector_distill_memory(trajectories, compression_ratio);

-- Adaptive search
SELECT swarmvector_adaptive_search(query, context, ef_search);

-- Learning feedback
SELECT swarmvector_learning_feedback(search_id, relevance_scores);

-- Get learned patterns
SELECT swarmvector_get_learning_patterns(context);

-- Optimize search parameters
SELECT swarmvector_optimize_search_params(query_type, historical_data);
```

### Neural DAG Learning (59 functions)

Query optimization with neural self-learning DAG analysis. The system learns from query patterns and automatically optimizes execution plans.

```sql
-- Configuration
SELECT rudag_set_config(
    learning_rate := 0.01,
    attention_mechanism := 'mincut_gated',
    trajectory_capacity := 10000,
    ewc_lambda := 5000.0
);
SELECT rudag_get_config();
SELECT rudag_reset_config();

-- DAG Analysis
SELECT rudag_analyze_query('SELECT * FROM vectors WHERE embedding <-> $1 < 0.5');
SELECT rudag_get_bottlenecks(query_id);
SELECT rudag_compute_critical_path(query_id);
SELECT rudag_estimate_cost(query_id);

-- Attention Mechanisms (7 types)
SELECT rudag_attention_topological(query_id);      -- Position-based
SELECT rudag_attention_causal_cone(query_id);      -- Downstream impact
SELECT rudag_attention_critical_path(query_id);    -- Latency focus
SELECT rudag_attention_mincut_gated(query_id);     -- Flow-aware (default)
SELECT rudag_attention_hierarchical(query_id);     -- Deep hierarchies
SELECT rudag_attention_parallel_branch(query_id);  -- Wide execution
SELECT rudag_attention_temporal(query_id);         -- Time-series

-- Learning Status
SELECT rudag_status();                  -- Current learning state
SELECT rudag_pattern_count();           -- Learned patterns
SELECT rudag_trajectory_count();        -- Recorded trajectories
SELECT rudag_get_statistics();          -- Comprehensive stats

-- Pattern Management
SELECT rudag_get_patterns(limit_n := 100);
SELECT rudag_search_patterns(query_embedding, top_k := 10);
SELECT rudag_export_patterns();         -- JSON export
SELECT rudag_import_patterns(json_data);

-- Trajectory Recording
SELECT rudag_record_trajectory(query_id, execution_time, baseline_time);
SELECT rudag_get_trajectories(limit_n := 100);
SELECT rudag_clear_trajectories();

-- Background Learning
SELECT rudag_trigger_learning();        -- Force learning cycle
SELECT rudag_get_learning_progress();

-- Self-Healing Integration
SELECT rudag_healing_status();
SELECT rudag_detect_anomalies();
SELECT rudag_trigger_repair(strategy := 'reindex');
SELECT rudag_get_repair_history();

-- QuDAG Distributed Learning (quantum-resistant)
SELECT rudag_qudag_status();            -- Network connection status
SELECT rudag_qudag_sync_patterns();     -- Sync with network
SELECT rudag_qudag_receive_patterns();  -- Get network patterns
SELECT rudag_qudag_get_peers();         -- Connected peers
SELECT rudag_qudag_stake_info();        -- rUv token staking
SELECT rudag_qudag_governance_vote(proposal_id, approve := true);
```

**Key Features:**
- **MinCut as Control Signal**: Bottleneck tension drives attention switching and healing
- **SONA Learning**: MicroLoRA adaptation (<100μs) with EWC++ catastrophic forgetting prevention
- **7 Attention Mechanisms**: Auto-selected based on query characteristics and MinCut stress
- **Predictive Healing**: Rising cut tension triggers early intervention before failures
- **QuDAG Integration**: Distributed pattern learning with ML-KEM-768 quantum-resistant crypto

### Graph Storage & Cypher (8 functions)

Graph operations with Cypher query support.

```sql
-- Create graph elements
SELECT swarmvector_graph_create_node(labels, properties, embedding);
SELECT swarmvector_graph_create_edge(from_node, to_node, edge_type, properties);

-- Graph queries
SELECT swarmvector_graph_get_neighbors(node_id, edge_type, depth);
SELECT swarmvector_graph_shortest_path(start_node, end_node);
SELECT swarmvector_graph_pagerank(edge_table, damping, iterations);

-- Cypher queries
SELECT swarmvector_cypher_query('MATCH (n:Person)-[:KNOWS]->(m) RETURN n, m');

-- Traversal
SELECT swarmvector_graph_traverse(start_node, direction, max_depth);

-- Similarity search on graph
SELECT swarmvector_graph_similarity_search(query_embedding, node_type, top_k);
```

### SPARQL & RDF (14 functions)

W3C-standard SPARQL 1.1 query language for RDF data.

```sql
-- Create RDF triple store
SELECT swarmvector_create_rdf_store('knowledge_graph');

-- Insert triples
SELECT swarmvector_insert_triple(
    'knowledge_graph',
    '<http://example.org/person/1>',
    '<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>',
    '<http://example.org/Person>'
);

-- Bulk load N-Triples
SELECT swarmvector_load_ntriples('knowledge_graph', '
    <http://example.org/person/1> <http://xmlns.com/foaf/0.1/name> "Alice" .
    <http://example.org/person/1> <http://xmlns.com/foaf/0.1/knows> <http://example.org/person/2> .
');

-- SPARQL SELECT query
SELECT swarmvector_sparql('knowledge_graph', '
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    SELECT ?person ?name
    WHERE {
        ?person a <http://example.org/Person> .
        ?person foaf:name ?name .
    }
', 'json');

-- SPARQL ASK query
SELECT swarmvector_sparql('knowledge_graph',
    'ASK { <http://example.org/person/1> ?p ?o }',
    'json'
);

-- Get store statistics
SELECT swarmvector_rdf_stats('knowledge_graph');

-- Query triples by pattern (NULL = wildcard)
SELECT swarmvector_query_triples('knowledge_graph',
    NULL, -- any subject
    '<http://xmlns.com/foaf/0.1/name>', -- predicate
    NULL  -- any object
);

-- SPARQL UPDATE operations
SELECT swarmvector_sparql_update('knowledge_graph', '
    INSERT DATA {
        <http://example.org/person/3> <http://xmlns.com/foaf/0.1/name> "Charlie" .
    }
');
```

**SPARQL Features:**
- SELECT, CONSTRUCT, ASK, DESCRIBE query forms
- Property paths (sequence `/`, alternative `|`, inverse `^`, transitive `*`, `+`)
- FILTER expressions with 50+ built-in functions
- Aggregates (COUNT, SUM, AVG, MIN, MAX, GROUP_CONCAT)
- OPTIONAL, UNION, MINUS graph patterns
- Named graphs support
- Result formats: JSON, XML, CSV, TSV
- **~198K triples/sec** insertion, **~5.5M queries/sec** lookups

### Gated Transformers (13 functions)

Ultra-low-latency transformer inference with mincut-gated coherence control.

```sql
-- Get gate decision from integrity mincut signals
SELECT gated_transformer_gate_decision(
    lambda := 150,        -- Current mincut value
    lambda_prev := 160,   -- Previous mincut
    boundary_count := 5,  -- Witness edge count
    layer := 3            -- Current transformer layer
);
-- Returns: {"decision": "Allow", "reason": "None", "tier": 3, ...}

-- Check early exit conditions
SELECT gated_transformer_early_exit_check(
    lambda := 180,
    layer := 8,
    total_layers := 12
);
-- Returns: {"can_exit": true, "confidence": 0.92, "exit_layer": 8, ...}

-- Mixture-of-Depths token routing (50% FLOPs reduction)
SELECT gated_transformer_route_tokens(
    lambda := 150,
    token_count := 512,
    layer_capacity := 0.5  -- Route only 50% of tokens through compute
);
-- Returns: [{"index": 0, "route": "Compute"}, {"index": 1, "route": "Skip"}, ...]

-- Configuration management
SELECT gated_transformer_config();  -- Get current config
SELECT gated_transformer_set_config(
    lambda_min := 50,
    lambda_critical := 20,
    check_interval := 64
);

-- Policy management
SELECT gated_transformer_gate_policy();  -- Get current policy
SELECT gated_transformer_set_policy(
    enable_tiering := true,
    enable_kv_flush := true,
    enable_freeze := false
);

-- Bridge with integrity module
SELECT gated_transformer_from_integrity('my_hnsw_index');

-- Get combined coherence score
SELECT gated_transformer_coherence_score(
    lambda := 150,
    lambda_prev := 160,
    boundary_count := 5
);
-- Returns: 0.875 (normalized 0-1 coherence)
```

**Gated Transformer Features:**
- **Dynamic Compute Allocation**: Mixture-of-Depths routes tokens for 50% FLOPs reduction
- **Early Exit**: Layer-skipping with 30-50% latency reduction when coherence is high
- **Tiered Decisions**: 5 tiers from Full→Reduced→Conservative→Minimal→Critical
- **KV-Cache Management**: Automatic flush/freeze based on coherence signals
- **Boundary Detection**: Witness edge tracking for structural integrity

### Hybrid Search (7 functions)

Vector + keyword fusion with multiple ranking strategies.

```sql
-- Linear fusion (alpha blending)
SELECT swarmvector_hybrid_linear(
    vector_results,   -- Array of (id, score) from vector search
    keyword_results,  -- Array of (id, score) from BM25
    alpha := 0.7      -- 0.7 vector weight, 0.3 keyword weight
);

-- Reciprocal Rank Fusion (RRF)
SELECT swarmvector_hybrid_rrf(
    vector_results,
    keyword_results,
    k := 60  -- RRF constant
);

-- Combined search with auto-fusion
SELECT swarmvector_hybrid_search(
    query_text := 'machine learning optimization',
    query_embedding := $embedding,
    table_name := 'documents',
    text_column := 'content',
    vector_column := 'embedding',
    limit_k := 10
);

-- Get/Set hybrid search parameters
SELECT swarmvector_get_hybrid_alpha();  -- Returns current alpha
SELECT swarmvector_set_hybrid_alpha(0.6);
SELECT swarmvector_get_hybrid_rrf_k();
SELECT swarmvector_set_hybrid_rrf_k(40);
```

### Multi-Tenancy (17 functions)

Row-level security with automatic tenant isolation.

```sql
-- Set current tenant context
SELECT swarmvector_set_tenant('tenant_123');
SELECT swarmvector_get_tenant();

-- Create tenant-isolated table
SELECT swarmvector_create_tenant_table(
    'documents',
    'id SERIAL PRIMARY KEY, content TEXT, embedding swarmvector(384)'
);

-- Automatic tenant filtering (via RLS policies)
INSERT INTO documents (content, embedding)
VALUES ('Hello', '[0.1, 0.2, ...]'::swarmvector);
-- Automatically tagged with tenant_id

-- Query only sees current tenant's data
SELECT * FROM documents
WHERE embedding <-> $query < 0.5;

-- Tenant management
SELECT swarmvector_list_tenants();
SELECT swarmvector_tenant_stats('tenant_123');
SELECT swarmvector_migrate_tenant('old_tenant', 'new_tenant');

-- Cross-tenant queries (admin only)
SELECT swarmvector_admin_query_all_tenants('documents', 'SELECT count(*) FROM documents');
```

### Self-Healing (23 functions)

Automated index repair with integrity validation.

```sql
-- Check index health
SELECT swarmvector_index_health('documents_embedding_idx');
-- Returns: {"status": "healthy", "fragmentation": 0.05, "orphaned_nodes": 0}

-- Automatic repair
SELECT swarmvector_auto_repair('documents_embedding_idx');

-- Schedule maintenance
SELECT swarmvector_schedule_maintenance(
    'documents_embedding_idx',
    interval := '1 day',
    repair_threshold := 0.1  -- Repair if fragmentation > 10%
);

-- Self-healing operations
SELECT swarmvector_compact_index('documents_embedding_idx');
SELECT swarmvector_rebalance_hnsw('documents_embedding_idx');
SELECT swarmvector_rebuild_ivf_centroids('documents_embedding_idx');
SELECT swarmvector_validate_graph_connectivity('documents_embedding_idx');

-- Monitor healing status
SELECT swarmvector_healing_status();
SELECT swarmvector_last_repair_log('documents_embedding_idx');

-- Integrity checks
SELECT swarmvector_check_orphaned_vectors('documents');
SELECT swarmvector_check_duplicate_vectors('documents', threshold := 0.001);
```

### Integrity Control (4 functions)

Stoer-Wagner mincut-based quality assurance for vector indices.

```sql
-- Get integrity status
SELECT swarmvector_integrity_status();
-- Returns: {"enabled": true, "active_contracts": 1, "contracts": ["default"]}

-- Create integrity contract (SLA)
SELECT swarmvector_integrity_create_contract(
    id := 'production_sla',
    name := 'Production SLA',
    min_recall := 0.95,        -- Minimum recall requirement
    max_latency_ms := 100,     -- Maximum query latency
    min_mincut := 0.1          -- Minimum graph connectivity
);

-- Validate against contract
SELECT swarmvector_integrity_validate(
    'production_sla',
    recall := 0.97,
    latency_ms := 45,
    mincut := 0.15
);
-- Returns: {"passed": true, "recall": 0.97, "latency_ms": 45, "mincut": 0.15, "failures": []}

-- Compute mincut for graph connectivity
SELECT swarmvector_mincut(
    n := 100,  -- Number of nodes
    edges_json := '[{"u": 0, "v": 1, "w": 1.0}, ...]'::jsonb
);
-- Returns minimum cut value (Stoer-Wagner algorithm)
```

## Vector Types

### `swarmvector(n)` - Dense Vector

```sql
CREATE TABLE items (embedding swarmvector(1536));
-- Storage: 8 + (4 x dimensions) bytes
```

### `halfvec(n)` - Half-Precision Vector

```sql
CREATE TABLE items (embedding halfvec(1536));
-- Storage: 8 + (2 x dimensions) bytes (50% savings)
```

### `sparsevec(n)` - Sparse Vector

```sql
CREATE TABLE items (embedding sparsevec(50000));
INSERT INTO items VALUES ('{1:0.5, 100:0.8, 5000:0.3}/50000');
-- Storage: 12 + (8 x non_zero_elements) bytes
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
CREATE INDEX ON items USING ruhnsw (embedding swarmvector_l2_ops)
WITH (m = 16, ef_construction = 64);

SET swarmvector.ef_search = 100;  -- Tune search quality
```

### IVFFlat (Inverted File Flat)

```sql
CREATE INDEX ON items USING ruivfflat (embedding swarmvector_l2_ops)
WITH (lists = 100);

SET swarmvector.ivfflat_probes = 10;  -- Tune search quality
```

## Performance Benchmarks

*AMD EPYC 7763 (64 cores), 256GB RAM:*

| Operation | 10K vectors | 100K vectors | 1M vectors |
|-----------|-------------|--------------|------------|
| HNSW Build | 0.8s | 8.2s | 95s |
| HNSW Search (top-10) | 0.3ms | 0.5ms | 1.2ms |
| Cosine Distance | 0.01ms | 0.01ms | 0.01ms |
| Poincare Distance | 0.02ms | 0.02ms | 0.02ms |
| GCN Forward | 2.1ms | 18ms | 180ms |
| BM25 Score | 0.05ms | 0.08ms | 0.15ms |

*Single distance calculation (1536 dimensions):*

| Metric | AVX2 Time | Speedup vs Scalar |
|--------|-----------|-------------------|
| L2 (Euclidean) | 38 ns | 3.7x |
| Cosine | 51 ns | 3.7x |
| Inner Product | 36 ns | 3.7x |

## Use Cases

### Semantic Search with RAG

```sql
SELECT content, embedding <=> $query_embedding AS similarity
FROM documents
WHERE category = 'technical'
ORDER BY similarity
LIMIT 5;
```

### Knowledge Graph with Hierarchical Embeddings

```sql
-- Use hyperbolic embeddings for taxonomy
SELECT name, swarmvector_poincare_distance(embedding, $query, -1.0) AS distance
FROM taxonomy_nodes
ORDER BY distance
LIMIT 10;
```

### Hybrid Search (Vector + BM25)

```sql
SELECT
    content,
    0.7 * (1.0 / (1.0 + embedding <-> $query_vector)) +
    0.3 * swarmvector_bm25_score(terms, doc_freqs, length, avg_len, total) AS score
FROM documents
ORDER BY score DESC
LIMIT 10;
```

### Multi-Agent Query Routing

```sql
SELECT swarmvector_route_query(
    $user_query_embedding,
    (SELECT array_agg(row(name, capabilities)) FROM agents)
) AS best_agent;
```

### Graph Neural Network Inference

```sql
SELECT swarmvector_gnn_gcn_layer(
    node_features,
    adjacency_matrix,
    trained_weights
) AS updated_features
FROM graph_nodes;
```

## CLI Tool

Install the CLI for easy management:

```bash
npm install -g @swarmvector/postgres-cli

# Commands
swarmvector-pg install                    # Install extension
swarmvector-pg vector create table --dim 384 --index hnsw
swarmvector-pg hyperbolic poincare-distance --a "[0.1,0.2]" --b "[0.3,0.4]"
swarmvector-pg gnn gcn --features "[[...]]" --adj "[[...]]"
swarmvector-pg graph query "MATCH (n) RETURN n"
swarmvector-pg routing route --query "[...]" --agents agents.json
swarmvector-pg learning adaptive-search --context "[...]"
swarmvector-pg bench run --type all --size 10000
```

## Related Packages

- [`@swarmvector/postgres-cli`](https://www.npmjs.com/package/@swarmvector/postgres-cli) - CLI for SwarmVector PostgreSQL
- [`swarmvector-core`](https://crates.io/crates/swarmvector-core) - Core vector operations library
- [`swarmvector-tiny-dancer`](https://crates.io/crates/swarmvector-tiny-dancer) - Agent routing library

## Documentation

| Document | Description |
|----------|-------------|
| [docs/API.md](docs/API.md) | Complete SQL API reference |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture |
| [docs/SIMD_OPTIMIZATION.md](docs/SIMD_OPTIMIZATION.md) | SIMD details |
| [docs/guides/ATTENTION_QUICK_REFERENCE.md](docs/guides/ATTENTION_QUICK_REFERENCE.md) | Attention mechanisms |
| [docs/GNN_QUICK_REFERENCE.md](docs/GNN_QUICK_REFERENCE.md) | GNN layers |
| [docs/ROUTING_QUICK_REFERENCE.md](docs/ROUTING_QUICK_REFERENCE.md) | Tiny Dancer routing |
| [docs/LEARNING_MODULE_README.md](docs/LEARNING_MODULE_README.md) | ReasoningBank |

## Requirements

- PostgreSQL 14, 15, 16, or 17
- x86_64 (AVX2/AVX-512) or ARM64 (NEON)
- Linux, macOS, or Windows (WSL)

## License

MIT License - See [LICENSE](../../LICENSE)

## Contributing

Contributions welcome! See [CONTRIBUTING.md](../../CONTRIBUTING.md)

---

Part of [SwarmVector](https://github.com/ruvnet/swarmvector) -- the self-learning vector database.
