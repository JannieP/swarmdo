/**
 * SWARMDO_REQUIRE_REAL_EMBEDDINGS strict mode (embedding-guard.ts).
 *
 * Off by default (degrade behavior unchanged); when on, every hash
 * last-resort throws loudly instead of silently returning a semantically
 * meaningless vector. Upstream parity: claude-flow v3.25.1.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { requireRealEmbeddings, assertHashFallbackAllowed } from '../src/memory/embedding-guard.js';

afterEach(() => {
  delete process.env.SWARMDO_REQUIRE_REAL_EMBEDDINGS;
});

describe('requireRealEmbeddings', () => {
  it('is off by default and for explicit-off values', () => {
    expect(requireRealEmbeddings()).toBe(false);
    for (const v of ['0', 'false', 'off', '', 'no']) {
      process.env.SWARMDO_REQUIRE_REAL_EMBEDDINGS = v;
      expect(requireRealEmbeddings()).toBe(false);
    }
  });

  it('turns on for 1/true/on (case-insensitive)', () => {
    for (const v of ['1', 'true', 'TRUE', 'on', 'On']) {
      process.env.SWARMDO_REQUIRE_REAL_EMBEDDINGS = v;
      expect(requireRealEmbeddings()).toBe(true);
    }
  });
});

describe('assertHashFallbackAllowed', () => {
  it('is a no-op when strict mode is off', () => {
    expect(() => assertHashFallbackAllowed('test-site')).not.toThrow();
  });

  it('throws with the site name when strict mode is on', () => {
    process.env.SWARMDO_REQUIRE_REAL_EMBEDDINGS = '1';
    expect(() => assertHashFallbackAllowed('memory-initializer.generateLocalEmbedding'))
      .toThrow(/SWARMDO_REQUIRE_REAL_EMBEDDINGS.*memory-initializer\.generateLocalEmbedding/);
  });
});
