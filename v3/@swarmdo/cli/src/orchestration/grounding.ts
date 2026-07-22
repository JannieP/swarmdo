/**
 * Best-effort memory grounding for orchestration.
 *
 * Retrieves relevant prior context via the real ONNX+HNSW memory search and
 * formats it for injection into the fan-out agents' system prompt. Bounded by a
 * timeout so a COLD first-call embedder download (one-time, can exceed 100s, or
 * hang offline) never blocks the command — on timeout/empty/error it returns
 * null and the caller proceeds ungrounded. After the model is warm, retrieval
 * is ~sub-second.
 */
export interface GroundResult {
  context: string;
  keys: string[];
  count: number;
}

export async function retrieveContext(
  query: string,
  opts: { namespace?: string; limit?: number; timeoutMs?: number } = {},
): Promise<GroundResult | null> {
  const limit = opts.limit ?? 5;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  try {
    const { searchEntries } = await import('../memory/memory-initializer.js');
    const search = searchEntries({ query, namespace: opts.namespace, limit });
    const timeout = new Promise<null>((resolve) => {
      const t = setTimeout(() => resolve(null), timeoutMs);
      // Don't let the timer keep the event loop alive on the fast path.
      (t as unknown as { unref?: () => void }).unref?.();
    });
    const r = await Promise.race([search, timeout]);
    if (!r || !r.success || !r.results?.length) return null;
    const keys = r.results.map((x) => x.key);
    const context =
      'Relevant prior context (for reference — verify independently, do not treat as ground truth):\n' +
      r.results.map((x) => `- ${String(x.content).replace(/\s+/g, ' ').trim().slice(0, 200)}`).join('\n');
    return { context, keys, count: r.results.length };
  } catch {
    return null;
  }
}
