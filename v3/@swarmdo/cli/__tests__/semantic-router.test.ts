import { describe, it, expect } from 'vitest';
import { SemanticRouter } from '../src/swarmvector/index.js';

/**
 * SemanticRouter metric selection. The router used to L2-normalize every vector
 * unconditionally, which silently turned `dotProduct`/`euclidean` into cosine
 * (and could flip the top-1 result). Normalization must apply ONLY to cosine.
 */
describe('SemanticRouter: metric selection', () => {
  // A=[5,4] has larger magnitude but B=[1,0.1] is more aligned with the query [1,0].
  const seed = (metric: 'cosine' | 'dotProduct' | 'euclidean') => {
    const r = new SemanticRouter({ dimension: 2, metric });
    r.addIntentWithEmbeddings('A', [new Float32Array([5, 4])]);
    r.addIntentWithEmbeddings('B', [new Float32Array([1, 0.1])]);
    return r.routeWithEmbedding(new Float32Array([1, 0]), 2);
  };

  it('dotProduct uses the raw magnitude-sensitive dot product (not cosine)', () => {
    const res = seed('dotProduct');
    expect(res[0].intent).toBe('A');            // raw dot: A·q=5 > B·q=1
    expect(res[0].score).toBeCloseTo(5, 5);     // exact dot product, not a [0,1] cosine
  });

  it('cosine (default behaviour) ranks by direction, ignoring magnitude', () => {
    const res = seed('cosine');
    expect(res[0].intent).toBe('B');            // B is more aligned with [1,0]
    expect(res[0].score).toBeCloseTo(0.995, 2); // cosine similarity, not a raw dot of 1
  });
});
