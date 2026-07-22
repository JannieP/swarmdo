/**
 * Reusable orchestration patterns — Phase 1 spike.
 *
 * Lifts the two verification/synthesis shapes the SwarmDo GAIA benchmark
 * harness already proved (adversarial critic, self-consistency vote) out of
 * bespoke `benchmarks/` code and onto the generic engine, so any orchestration
 * script can use them. Both take an injectable executor for offline testing.
 */
import { runParallel, callAgent, type AgentExecutor, type SchemaSpec } from './engine.js';

const VERDICT_SCHEMA: SchemaSpec = {
  required: ['refuted'],
  types: { refuted: 'boolean' },
};

export interface VerifyResult {
  verified: boolean;
  rounds: number;
  refutations: number;
  votes: Array<{ refuted: boolean; reason?: string } | null>;
}

/**
 * Adversarial verify (lifted from the GAIA critic). Spawns N independent
 * skeptics IN PARALLEL, each prompted to REFUTE the claim through a distinct
 * `lens` (a different failure mode) and to default to refuted=true when
 * uncertain. The claim survives only if fewer than a majority of the skeptics
 * that answered refute it — the opposite of confirmation bias.
 */
export async function adversarialVerify(
  claim: string,
  opts: { rounds?: number; lenses?: string[]; model?: string; context?: string; executor?: AgentExecutor } = {},
): Promise<VerifyResult> {
  const lenses = opts.lenses ?? ['correctness', 'edge-cases', 'evidence'];
  const rounds = Math.max(1, opts.rounds ?? lenses.length);

  const thunks = Array.from({ length: rounds }, (_unused, i) => async () => {
    const lens = lenses[i % lenses.length];
    const prompt =
      `You are a skeptical reviewer. Try to REFUTE the following claim through the "${lens}" lens.\n` +
      `Claim: ${claim}\n` +
      `If you find any real flaw — or you are uncertain — set refuted=true. ` +
      `Respond with ONLY {"refuted": boolean, "reason": string}.`;
    return callAgent(prompt, {
      schema: VERDICT_SCHEMA,
      temperature: 0,
      model: opts.model,
      systemPrompt: opts.context,
      executor: opts.executor,
    }) as Promise<{ refuted: boolean; reason?: string }>;
  });

  const votes = await runParallel(thunks, { concurrency: rounds });
  const cast = votes.filter(Boolean).length;
  const refutations = votes.filter((v) => v && v.refuted).length;
  // Survives only if a strict minority of the cast votes refute it.
  const verified = cast > 0 && refutations < Math.ceil(cast / 2);
  return { verified, rounds, refutations, votes };
}

export interface PanelResult {
  /** The raw text of an attempt from the winning (most-agreed) answer bucket, or null if all failed. */
  winner: string | null;
  /** How many attempts produced the winning normalized answer. */
  agreement: number;
  /** Total attempts that returned a usable answer. */
  cast: number;
  attempts: Array<string | null>;
}

/**
 * Judge panel / self-consistency vote (lifted from the GAIA voting wrapper).
 * Runs N diversified attempts of the same task IN PARALLEL, normalizes each
 * answer, and returns the majority winner. Turns a single fallible model call
 * into a voted answer with an agreement signal.
 */
export async function judgePanel(
  task: string,
  opts: {
    attempts?: number;
    personas?: string[];
    normalize?: (s: string) => string;
    model?: string;
    context?: string;
    executor?: AgentExecutor;
  } = {},
): Promise<PanelResult> {
  const personas = opts.personas ?? ['concise', 'careful', 'creative'];
  const attempts = Math.max(1, opts.attempts ?? personas.length);
  const normalize = opts.normalize ?? ((s) => s.trim().toLowerCase().replace(/[.\s]+$/, ''));

  const thunks = Array.from({ length: attempts }, (_unused, i) => async () => {
    const persona = personas[i % personas.length];
    return callAgent(task, {
      systemPrompt: [opts.context, `Answer as a ${persona} expert. End with the single final answer.`]
        .filter(Boolean)
        .join('\n\n'),
      temperature: 0.4,
      model: opts.model,
      executor: opts.executor,
    }) as Promise<string>;
  });

  const raw = await runParallel(thunks, { concurrency: attempts });
  const buckets = new Map<string, { count: number; sample: string }>();
  for (const r of raw) {
    if (r == null) continue;
    const key = normalize(String(r));
    const entry = buckets.get(key) ?? { count: 0, sample: String(r) };
    entry.count += 1;
    buckets.set(key, entry);
  }

  let winner: string | null = null;
  let agreement = 0;
  for (const { count, sample } of buckets.values()) {
    if (count > agreement) {
      agreement = count;
      winner = sample;
    }
  }
  return { winner, agreement, cast: raw.filter((r) => r != null).length, attempts: raw };
}
