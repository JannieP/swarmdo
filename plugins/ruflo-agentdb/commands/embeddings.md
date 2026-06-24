---
name: embeddings
description: RuVector embedding engine status and operations -- ONNX, HNSW, RaBitQ quantization
---

Embedding engine commands:

1. Call `mcp__rufflo__embeddings_status` to check the ONNX embedding engine.
2. Show: model (all-MiniLM-L6-v2), dimensions (384), HNSW index status, cache hit rate.
3. If not initialized, suggest calling `mcp__rufflo__embeddings_init`.
4. For search, use `mcp__rufflo__embeddings_search` with the user's query (namespace-filtered).
5. For large-corpus search with memory pressure, use the RaBitQ quantized path (32× memory reduction):
   - `mcp__rufflo__embeddings_rabitq_build` (one-time, after corpus is loaded)
   - `mcp__rufflo__embeddings_rabitq_search` (Hamming-prefilter to top-N candidates)
   - `mcp__rufflo__embeddings_rabitq_status` for index health
6. For hierarchical data (taxonomies, code trees), use `mcp__rufflo__embeddings_hyperbolic` (Poincare ball model).
7. The substrate-level entry point `mcp__rufflo__embeddings_neural` exists; in normal use it's covered by `embeddings_init` + `embeddings_generate`.
