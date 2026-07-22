/**
 * Deterministic multi-agent orchestration engine — Phase 1 spike.
 *
 * Supplies the three primitives swarmdo's sequential `workflow` engine lacks:
 *   - `runParallel`  — bounded-concurrency fan-out (the workflow `parallel`
 *                      step is deferred/skipped today)
 *   - `runPipeline`  — per-item staged flow with NO barrier between stages
 *   - `callAgent`    — schema-validated agent output with one corrective retry
 *
 * All built on the real single-agent wire (`executeAgentTask`) via an
 * INJECTABLE executor, so orchestration logic is unit-testable offline with a
 * mock — no live LLM, no provider keys. This lifts the shapes already proven
 * in the GAIA benchmark harness (parallel attempts + vote, adversarial critic)
 * out of `benchmarks/` and into a reusable product primitive.
 *
 * Determinism note: like Claude Code's Workflow engine, orchestration scripts
 * built on this must avoid Date.now()/Math.random() so runs stay reproducible
 * and resumable. The engine itself introduces no such non-determinism.
 */

// Type-only import — erased at runtime, so this module has no static dependency
// on the heavy provider/store stack behind executeAgentTask.
import type { AgentExecuteInput, AgentExecuteResult } from '../mcp-tools/agent-execute-core.js';

export type { AgentExecuteInput, AgentExecuteResult };

/** A single-agent executor: prompt in, result out. */
export type AgentExecutor = (input: AgentExecuteInput) => Promise<AgentExecuteResult>;

/**
 * Default executor = the real provider-routed single-agent wire, lazily
 * imported only when actually invoked (keeps this module cheap to load and
 * lets tests inject a mock without pulling in the provider stack).
 */
export const defaultExecutor: AgentExecutor = async (input) => {
  const mod = await import('../mcp-tools/agent-execute-core.js');
  return mod.executeAgentTask(input);
};

/**
 * Bounded-concurrency fan-out. Runs every thunk with at most `concurrency`
 * in flight and preserves input order. A thunk that throws resolves to `null`
 * (the batch never rejects), so callers `.filter(Boolean)`.
 */
export async function runParallel<T>(
  thunks: Array<() => Promise<T>>,
  opts: { concurrency?: number } = {},
): Promise<Array<T | null>> {
  const concurrency = Math.max(1, opts.concurrency ?? 8);
  const results: Array<T | null> = new Array(thunks.length).fill(null);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= thunks.length) return;
      try {
        results[i] = await thunks[i]();
      } catch {
        results[i] = null;
      }
    }
  }
  const pool = Array.from({ length: Math.min(concurrency, thunks.length) }, () => worker());
  await Promise.all(pool);
  return results;
}

/**
 * Per-item staged flow with NO barrier between stages: each item flows through
 * every stage independently, so item A can be in stage 3 while item B is still
 * in stage 1 (wall-clock = slowest single chain, not sum-of-slowest-per-stage).
 * Each stage receives (prevResult, originalItem, index). A stage that throws
 * drops that item to `null` and skips its remaining stages.
 */
export async function runPipeline<I>(
  items: I[],
  ...stages: Array<(prev: unknown, item: I, index: number) => Promise<unknown>>
): Promise<Array<unknown | null>> {
  return Promise.all(
    items.map(async (item, i) => {
      let acc: unknown = item;
      try {
        for (const stage of stages) acc = await stage(acc, item, i);
        return acc;
      } catch {
        return null;
      }
    }),
  );
}

export interface SchemaSpec {
  /** Top-level keys the agent's JSON output MUST contain. */
  required?: string[];
  /** Optional per-key type check. */
  types?: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'>;
}

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaError';
  }
}

/** Minimal structural validator — no dependency. Throws SchemaError on mismatch. */
export function validateSchema(value: unknown, schema: SchemaSpec): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SchemaError('expected a JSON object');
  }
  const obj = value as Record<string, unknown>;
  for (const key of schema.required ?? []) {
    if (!(key in obj)) throw new SchemaError(`missing required key: ${key}`);
  }
  for (const [key, expected] of Object.entries(schema.types ?? {})) {
    if (!(key in obj)) continue;
    const v = obj[key];
    const actual = Array.isArray(v) ? 'array' : typeof v;
    if (actual !== expected) throw new SchemaError(`key "${key}": expected ${expected}, got ${actual}`);
  }
}

/** Pull the first JSON object out of an LLM's text (handles ```json fences + surrounding prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new SchemaError('no JSON object found in agent output');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export interface AgentCallOpts {
  agentId?: string;
  systemPrompt?: string;
  /** When set, the output is parsed as JSON, validated, and retried ONCE on failure. */
  schema?: SchemaSpec;
  maxTokens?: number;
  temperature?: number;
  executor?: AgentExecutor;
}

/**
 * Run one agent. Without `schema`, returns the raw text output. With `schema`,
 * force structured output: parse the JSON, validate it, and on any parse/
 * validation failure retry ONCE with a corrective nudge before throwing. This
 * is the structured-output gate the product path currently lacks.
 */
export async function callAgent(prompt: string, opts: AgentCallOpts = {}): Promise<unknown> {
  const executor = opts.executor ?? defaultExecutor;
  const base: AgentExecuteInput = {
    agentId: opts.agentId ?? 'orchestration-agent',
    prompt,
    systemPrompt: opts.systemPrompt,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
  };

  const runOnce = async (input: AgentExecuteInput): Promise<unknown> => {
    const r = await executor(input);
    if (!r.success) throw new Error(r.error ?? 'agent execution failed');
    const text = r.output ?? '';
    if (!opts.schema) return text;
    const parsed = extractJson(text);
    validateSchema(parsed, opts.schema);
    return parsed;
  };

  if (!opts.schema) return runOnce(base);

  try {
    return await runOnce(base);
  } catch {
    const keys = opts.schema.required?.length ? ` containing keys: ${opts.schema.required.join(', ')}` : '';
    const nudge = `${prompt}\n\nRespond with ONLY a single JSON object${keys}. No prose, no code fence.`;
    return runOnce({ ...base, prompt: nudge, temperature: 0 });
  }
}
