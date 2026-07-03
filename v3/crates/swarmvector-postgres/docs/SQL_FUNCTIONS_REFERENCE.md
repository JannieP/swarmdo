# SwarmVector-Postgres SQL Functions Reference

Complete reference table of all 53+ SQL functions with descriptions and usage examples.

## Quick Reference Table

| Category | Function | Description | Example |
|----------|----------|-------------|---------|
| **Core** | `swarmvector_version()` | Get extension version | `SELECT swarmvector_version();` |
| **Core** | `swarmvector_simd_info()` | Get SIMD capabilities | `SELECT swarmvector_simd_info();` |

### Distance Functions (5)

| Function | Description | Usage |
|----------|-------------|-------|
| `swarmvector_l2_distance(a, b)` | Euclidean (L2) distance | `SELECT swarmvector_l2_distance('[1,2,3]', '[4,5,6]');` |
| `swarmvector_cosine_distance(a, b)` | Cosine distance (1 - similarity) | `SELECT swarmvector_cosine_distance('[1,0]', '[0,1]');` |
| `swarmvector_inner_product(a, b)` | Dot product distance | `SELECT swarmvector_inner_product('[1,2]', '[3,4]');` |
| `swarmvector_l1_distance(a, b)` | Manhattan (L1) distance | `SELECT swarmvector_l1_distance('[1,2]', '[3,4]');` |
| `swarmvector_hamming_distance(a, b)` | Hamming distance for binary | `SELECT swarmvector_hamming_distance(a, b);` |

### Vector Operations (5)

| Function | Description | Usage |
|----------|-------------|-------|
| `swarmvector_normalize(v)` | Normalize to unit length | `SELECT swarmvector_normalize('[3,4]');` → `[0.6,0.8]` |
| `swarmvector_norm(v)` | Get L2 norm (magnitude) | `SELECT swarmvector_norm('[3,4]');` → `5.0` |
| `swarmvector_add(a, b)` | Add two vectors | `SELECT swarmvector_add('[1,2]', '[3,4]');` → `[4,6]` |
| `swarmvector_sub(a, b)` | Subtract vectors | `SELECT swarmvector_sub('[5,6]', '[1,2]');` → `[4,4]` |
| `swarmvector_scalar_mul(v, s)` | Multiply by scalar | `SELECT swarmvector_scalar_mul('[1,2]', 2.0);` → `[2,4]` |

### Hyperbolic Geometry (8)

| Function | Description | Usage |
|----------|-------------|-------|
| `swarmvector_poincare_distance(a, b, c)` | Poincaré ball distance | `SELECT swarmvector_poincare_distance(a, b, -1.0);` |
| `swarmvector_lorentz_distance(a, b, c)` | Lorentz hyperboloid distance | `SELECT swarmvector_lorentz_distance(a, b, -1.0);` |
| `swarmvector_mobius_add(a, b, c)` | Möbius addition (hyperbolic translation) | `SELECT swarmvector_mobius_add(a, b, -1.0);` |
| `swarmvector_exp_map(base, tangent, c)` | Exponential map (tangent → manifold) | `SELECT swarmvector_exp_map(base, tangent, -1.0);` |
| `swarmvector_log_map(base, target, c)` | Logarithmic map (manifold → tangent) | `SELECT swarmvector_log_map(base, target, -1.0);` |
| `swarmvector_poincare_to_lorentz(v, c)` | Convert Poincaré to Lorentz | `SELECT swarmvector_poincare_to_lorentz(v, -1.0);` |
| `swarmvector_lorentz_to_poincare(v, c)` | Convert Lorentz to Poincaré | `SELECT swarmvector_lorentz_to_poincare(v, -1.0);` |
| `swarmvector_minkowski_dot(a, b)` | Minkowski inner product | `SELECT swarmvector_minkowski_dot(a, b);` |

### Sparse Vectors & BM25 (14)

| Function | Description | Usage |
|----------|-------------|-------|
| `swarmvector_sparse_create(idx, vals, dim)` | Create sparse vector | `SELECT swarmvector_sparse_create(ARRAY[0,5,10], ARRAY[0.5,0.3,0.2], 100);` |
| `swarmvector_sparse_from_dense(v, thresh)` | Dense to sparse conversion | `SELECT swarmvector_sparse_from_dense(dense_vec, 0.01);` |
| `swarmvector_sparse_to_dense(sv)` | Sparse to dense conversion | `SELECT swarmvector_sparse_to_dense(sparse_vec);` |
| `swarmvector_sparse_dot(a, b)` | Sparse dot product | `SELECT swarmvector_sparse_dot(sv1, sv2);` |
| `swarmvector_sparse_cosine(a, b)` | Sparse cosine similarity | `SELECT swarmvector_sparse_cosine(sv1, sv2);` |
| `swarmvector_sparse_l2_distance(a, b)` | Sparse L2 distance | `SELECT swarmvector_sparse_l2_distance(sv1, sv2);` |
| `swarmvector_sparse_add(a, b)` | Add sparse vectors | `SELECT swarmvector_sparse_add(sv1, sv2);` |
| `swarmvector_sparse_scale(sv, s)` | Scale sparse vector | `SELECT swarmvector_sparse_scale(sv, 2.0);` |
| `swarmvector_sparse_normalize(sv)` | Normalize sparse vector | `SELECT swarmvector_sparse_normalize(sv);` |
| `swarmvector_sparse_topk(sv, k)` | Get top-k elements | `SELECT swarmvector_sparse_topk(sv, 10);` |
| `swarmvector_sparse_nnz(sv)` | Count non-zero elements | `SELECT swarmvector_sparse_nnz(sv);` |
| `swarmvector_bm25_score(...)` | BM25 relevance score | `SELECT swarmvector_bm25_score(terms, doc_freqs, doc_len, avg_len, total);` |
| `swarmvector_tf_idf(tf, df, total)` | TF-IDF score | `SELECT swarmvector_tf_idf(term_freq, doc_freq, total_docs);` |
| `swarmvector_sparse_intersection(a, b)` | Intersection of sparse vectors | `SELECT swarmvector_sparse_intersection(sv1, sv2);` |

### Attention Mechanisms (10 primary + 29 variants)

| Function | Description | Usage |
|----------|-------------|-------|
| `swarmvector_attention_scaled_dot(q, k, v)` | Scaled dot-product attention | `SELECT swarmvector_attention_scaled_dot(query, keys, values);` |
| `swarmvector_attention_multi_head(q, k, v, h)` | Multi-head attention | `SELECT swarmvector_attention_multi_head(q, k, v, 8);` |
| `swarmvector_attention_flash(q, k, v, blk)` | Flash attention (memory efficient) | `SELECT swarmvector_attention_flash(q, k, v, 64);` |
| `swarmvector_attention_sparse(q, k, v, pat)` | Sparse attention | `SELECT swarmvector_attention_sparse(q, k, v, pattern);` |
| `swarmvector_attention_linear(q, k, v)` | Linear attention O(n) | `SELECT swarmvector_attention_linear(q, k, v);` |
| `swarmvector_attention_causal(q, k, v)` | Causal/masked attention | `SELECT swarmvector_attention_causal(q, k, v);` |
| `swarmvector_attention_cross(q, ck, cv)` | Cross attention | `SELECT swarmvector_attention_cross(query, ctx_keys, ctx_values);` |
| `swarmvector_attention_self(input, heads)` | Self attention | `SELECT swarmvector_attention_self(input, 8);` |
| `swarmvector_attention_local(q, k, v, win)` | Local/sliding window attention | `SELECT swarmvector_attention_local(q, k, v, 256);` |
| `swarmvector_attention_relative(q, k, v)` | Relative position attention | `SELECT swarmvector_attention_relative(q, k, v);` |

**Additional Attention Types:** `performer`, `linformer`, `bigbird`, `longformer`, `reformer`, `synthesizer`, `routing`, `mixture_of_experts`, `alibi`, `rope`, `xpos`, `grouped_query`, `sliding_window`, `dilated`, `axial`, `product_key`, `hash_based`, `random_feature`, `nystrom`, `clustered`, `sinkhorn`, `entmax`, `adaptive_span`, `compressive`, `feedback`, `talking_heads`, `realformer`, `rezero`, `fixup`

### Graph Neural Networks (5)

| Function | Description | Usage |
|----------|-------------|-------|
| `swarmvector_gnn_gcn_layer(feat, adj, w)` | Graph Convolutional Network | `SELECT swarmvector_gnn_gcn_layer(features, adjacency, weights);` |
| `swarmvector_gnn_graphsage_layer(feat, neigh, w)` | GraphSAGE (inductive) | `SELECT swarmvector_gnn_graphsage_layer(feat, neighbors, weights);` |
| `swarmvector_gnn_gat_layer(feat, adj, attn)` | Graph Attention Network | `SELECT swarmvector_gnn_gat_layer(feat, adj, attention_weights);` |
| `swarmvector_gnn_message_pass(feat, edges, w)` | Message passing | `SELECT swarmvector_gnn_message_pass(node_feat, edge_idx, edge_w);` |
| `swarmvector_gnn_aggregate(msg, type)` | Aggregate messages | `SELECT swarmvector_gnn_aggregate(messages, 'mean');` |

### Agent Routing - Tiny Dancer (11)

| Function | Description | Usage |
|----------|-------------|-------|
| `swarmvector_route_query(embed, agents)` | Route query to best agent | `SELECT swarmvector_route_query(query_embed, agent_registry);` |
| `swarmvector_route_with_context(q, ctx, agents)` | Route with context | `SELECT swarmvector_route_with_context(query, context, agents);` |
| `swarmvector_multi_agent_route(q, agents, k)` | Multi-agent routing | `SELECT swarmvector_multi_agent_route(query, agents, 3);` |
| `swarmvector_register_agent(name, caps, embed)` | Register new agent | `SELECT swarmvector_register_agent('gpt4', caps, embedding);` |
| `swarmvector_update_agent_performance(id, metrics)` | Update agent metrics | `SELECT swarmvector_update_agent_performance(agent_id, metrics);` |
| `swarmvector_get_routing_stats()` | Get routing statistics | `SELECT * FROM swarmvector_get_routing_stats();` |
| `swarmvector_calculate_agent_affinity(q, agent)` | Calculate query-agent affinity | `SELECT swarmvector_calculate_agent_affinity(query, agent);` |
| `swarmvector_select_best_agent(q, agents)` | Select best agent | `SELECT swarmvector_select_best_agent(query, agent_list);` |
| `swarmvector_adaptive_route(q, ctx, lr)` | Adaptive routing with learning | `SELECT swarmvector_adaptive_route(query, context, 0.01);` |
| `swarmvector_fastgrnn_forward(in, hidden, w)` | FastGRNN acceleration | `SELECT swarmvector_fastgrnn_forward(input, hidden, weights);` |
| `swarmvector_get_agent_embeddings(agents)` | Get agent embeddings | `SELECT swarmvector_get_agent_embeddings(agent_ids);` |

### Self-Learning / ReasoningBank (7)

| Function | Description | Usage |
|----------|-------------|-------|
| `swarmvector_record_trajectory(in, out, ok, ctx)` | Record learning trajectory | `SELECT swarmvector_record_trajectory(input, output, true, ctx);` |
| `swarmvector_get_verdict(traj_id)` | Get verdict on trajectory | `SELECT swarmvector_get_verdict(trajectory_id);` |
| `swarmvector_distill_memory(trajs, ratio)` | Distill memory (compress) | `SELECT swarmvector_distill_memory(trajectories, 0.5);` |
| `swarmvector_adaptive_search(q, ctx, ef)` | Adaptive search with learning | `SELECT swarmvector_adaptive_search(query, context, 100);` |
| `swarmvector_learning_feedback(id, scores)` | Provide learning feedback | `SELECT swarmvector_learning_feedback(search_id, scores);` |
| `swarmvector_get_learning_patterns(ctx)` | Get learned patterns | `SELECT * FROM swarmvector_get_learning_patterns(context);` |
| `swarmvector_optimize_search_params(type, hist)` | Optimize search parameters | `SELECT swarmvector_optimize_search_params('semantic', history);` |

### Graph Storage & Cypher (8)

| Function | Description | Usage |
|----------|-------------|-------|
| `swarmvector_graph_create_node(labels, props, embed)` | Create graph node | `SELECT swarmvector_graph_create_node('Person', '{"name":"Alice"}', embed);` |
| `swarmvector_graph_create_edge(from, to, type, props)` | Create graph edge | `SELECT swarmvector_graph_create_edge(1, 2, 'KNOWS', '{}');` |
| `swarmvector_graph_get_neighbors(node, type, depth)` | Get node neighbors | `SELECT * FROM swarmvector_graph_get_neighbors(1, 'KNOWS', 2);` |
| `swarmvector_graph_shortest_path(start, end)` | Find shortest path | `SELECT swarmvector_graph_shortest_path(1, 10);` |
| `swarmvector_graph_pagerank(edges, damp, iters)` | Compute PageRank | `SELECT * FROM swarmvector_graph_pagerank('edges', 0.85, 20);` |
| `swarmvector_cypher_query(query)` | Execute Cypher query | `SELECT * FROM swarmvector_cypher_query('MATCH (n) RETURN n');` |
| `swarmvector_graph_traverse(start, dir, depth)` | Traverse graph | `SELECT * FROM swarmvector_graph_traverse(1, 'outgoing', 3);` |
| `swarmvector_graph_similarity_search(embed, type, k)` | Vector search on graph | `SELECT * FROM swarmvector_graph_similarity_search(embed, 'Person', 10);` |

### Quantization (4)

| Function | Description | Usage |
|----------|-------------|-------|
| `swarmvector_quantize_scalar(v)` | Scalar quantization (int8) | `SELECT swarmvector_quantize_scalar(embedding);` |
| `swarmvector_quantize_product(v, subvecs)` | Product quantization | `SELECT swarmvector_quantize_product(embedding, 8);` |
| `swarmvector_quantize_binary(v)` | Binary quantization | `SELECT swarmvector_quantize_binary(embedding);` |
| `swarmvector_dequantize(qv)` | Dequantize vector | `SELECT swarmvector_dequantize(quantized_vec);` |

### Index Management (3)

| Function | Description | Usage |
|----------|-------------|-------|
| `swarmvector_index_stats(name)` | Get index statistics | `SELECT * FROM swarmvector_index_stats('idx_name');` |
| `swarmvector_index_maintenance(name)` | Perform index maintenance | `SELECT swarmvector_index_maintenance('idx_name');` |
| `swarmvector_index_rebuild(name)` | Rebuild index | `SELECT swarmvector_index_rebuild('idx_name');` |

## Operators Quick Reference

| Operator | Metric | Description | Example |
|----------|--------|-------------|---------|
| `<->` | L2 | Euclidean distance | `ORDER BY embedding <-> query` |
| `<=>` | Cosine | Cosine distance | `ORDER BY embedding <=> query` |
| `<#>` | IP | Inner product (negative) | `ORDER BY embedding <#> query` |
| `<+>` | L1 | Manhattan distance | `ORDER BY embedding <+> query` |

## Data Types

| Type | Description | Storage | Max Dimensions |
|------|-------------|---------|----------------|
| `swarmvector(n)` | Dense float32 vector | 8 + 4×n bytes | 16,000 |
| `halfvec(n)` | Dense float16 vector | 8 + 2×n bytes | 16,000 |
| `sparsevec(n)` | Sparse vector | 12 + 8×nnz bytes | 1,000,000 |

## Common Usage Patterns

### Semantic Search

```sql
SELECT content, embedding <=> $query AS distance
FROM documents
ORDER BY distance
LIMIT 10;
```

### Hybrid Search (Vector + BM25)

```sql
SELECT content,
  0.7 * (1.0 / (1.0 + embedding <-> $vec)) +
  0.3 * swarmvector_bm25_score(terms, freqs, len, avg_len, total) AS score
FROM documents
ORDER BY score DESC LIMIT 10;
```

### Hierarchical Search with Hyperbolic

```sql
SELECT name, swarmvector_poincare_distance(embedding, $query, -1.0) AS dist
FROM taxonomy
ORDER BY dist LIMIT 10;
```

### Agent Routing

```sql
SELECT swarmvector_route_query($user_query_embedding,
  (SELECT array_agg(row(name, capabilities)) FROM agents)
) AS best_agent;
```

### Graph + Vector Search

```sql
SELECT * FROM swarmvector_graph_similarity_search($embedding, 'Document', 10);
```

## See Also

- [API.md](./API.md) - Detailed API documentation
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [README.md](../README.md) - Getting started guide
