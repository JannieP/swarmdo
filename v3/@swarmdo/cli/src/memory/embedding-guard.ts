/**
 * embedding-guard.ts — SWARMDO_REQUIRE_REAL_EMBEDDINGS=1 strict mode.
 *
 * Hash fallbacks are deterministic but carry NO semantics; silently
 * substituting them for real vectors is how semantic memory search stayed
 * broken for weeks without a single error (fixed in 342ee8977, repaired in
 * c1b147ebe). This guard is the enforcement lever: environments that NEED
 * real semantics (CI gates, production swarms) can make every hash
 * last-resort THROW loudly instead of degrading. Off by default — degrade
 * behavior is unchanged unless explicitly opted in.
 *
 * Upstream parity: claude-flow v3.25.1 shipped the identical switch
 * (RUFLO_REQUIRE_REAL_EMBEDDINGS) as a "correctness/honesty patch".
 */

export function requireRealEmbeddings(): boolean {
  const v = (process.env.SWARMDO_REQUIRE_REAL_EMBEDDINGS ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

/** Call at every hash-fallback site, right before producing a hash vector. */
export function assertHashFallbackAllowed(site: string): void {
  if (requireRealEmbeddings()) {
    throw new Error(
      `SWARMDO_REQUIRE_REAL_EMBEDDINGS forbids the hash-embedding fallback (${site}) — no real embedder was available`,
    );
  }
}
