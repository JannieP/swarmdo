/**
 * Regression: the memory embedding loader must use the WORKING rufvector.embed()
 * API (the one neural-tools + demo use) before falling to hash. Previously the
 * loader only tried getOptimizedOnnxEmbedder().embed(), whose ONNX session init
 * fails in environments where rufvector.embed() itself works fine — so memory
 * embeddings silently degraded to semantically-useless `mock` hash vectors,
 * breaking semantic memory/pattern search.
 *
 * Skips honestly when rufvector ONNX genuinely isn't available (edge/CI without
 * the native build) — there, hash IS the correct backend.
 */
import { describe, it, expect } from 'vitest';

const rufvectorOnnx = await import('rufvector')
  .then((rv: any) => typeof rv.isOnnxAvailable === 'function' && rv.isOnnxAvailable())
  .catch(() => false);

describe.skipIf(!rufvectorOnnx)('memory embeddings use real rufvector ONNX (not hash) when available', () => {
  it('generateLocalEmbedding reports backend=onnx', async () => {
    const m = await import('../src/memory/memory-initializer.js');
    const r = await m.generateLocalEmbedding('oauth refresh token rotation');
    expect(r.backend).toBe('onnx');
    // and the vector is non-trivial
    expect(r.embedding.filter((v: number) => v !== 0).length).toBeGreaterThan(10);
  });
});
