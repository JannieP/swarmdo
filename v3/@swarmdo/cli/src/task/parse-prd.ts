/**
 * parse-prd.ts — decompose a PRD / spec document into an ordered, dependency-
 * linked task list. Capability modeled on Task Master's flagship `parse-prd`
 * (claude-task-master, 27k★): point it at a spec, an LLM breaks it into tasks
 * with dependencies, and they populate the task DAG swarmdo already ships
 * (task-deps.ts). This is the missing "front door" to that subsystem.
 *
 * The claude runner is injectable so the whole pipeline (prompt → JSON extract →
 * validate → topological sort) is unit-tested without any billable call. The
 * command layer (commands/task.ts) gates the real call behind SWARMDO_HEADLESS
 * and --confirm, exactly like `repair`.
 */

import { spawnSync } from 'node:child_process';

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';
const PRIORITIES: readonly TaskPriority[] = ['critical', 'high', 'normal', 'low'];

/** One task as decomposed from the PRD. `ref` is a document-local id (e.g. "T1")
 * used only to wire `dependsOn`; the command layer maps refs → real task ids. */
export interface ParsedTask {
  ref: string;
  title: string;
  description: string;
  priority: TaskPriority;
  dependsOn: string[];
}

export interface ParsePrdResult {
  tasks: ParsedTask[];
  costUsd: number | null;
  /** non-fatal notes: dropped-invalid, broken-cycle-edges, clamped-count */
  warnings: string[];
}

export interface ClaudeDecomposeRequest {
  prompt: string;
  model: string;
  maxBudgetUsd: number;
  timeoutMs: number;
  cwd: string;
}
export interface ClaudeDecomposeResult {
  ok: boolean;
  text: string;
  costUsd: number | null;
}
export type DecomposeRunner = (req: ClaudeDecomposeRequest) => ClaudeDecomposeResult;

/** Default runner: headless `claude --print --output-format json`, no tools
 * (pure text→JSON). Mirrors the nested-session conventions in tdd-repair.ts. */
export function defaultRunClaude(req: ClaudeDecomposeRequest): ClaudeDecomposeResult {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    CLAUDE_ENTRYPOINT: 'worker',
  };
  delete env.CLAUDE_SESSION_ID;
  delete env.CLAUDE_PARENT_SESSION_ID;

  const res = spawnSync(
    'claude',
    [
      '--print',
      '--output-format', 'json',
      '--model', req.model,
      '--max-budget-usd', String(req.maxBudgetUsd),
      '--allowedTools', '',
    ],
    {
      cwd: req.cwd,
      env,
      input: req.prompt,
      encoding: 'utf8',
      timeout: req.timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  const raw = `${res.stdout ?? ''}`;
  let costUsd: number | null = null;
  let text = raw;
  try {
    const parsed = JSON.parse(raw);
    costUsd = typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : null;
    text = typeof parsed.result === 'string' ? parsed.result : raw;
  } catch {
    // non-JSON (old CLI or error path) — keep raw text, unknown cost
  }
  return { ok: res.status === 0, text, costUsd };
}

export function buildDecomposePrompt(prd: string, maxTasks: number): string {
  return `You are decomposing a product/spec document into an ordered, dependency-linked implementation task list.

Return ONLY a JSON array (no prose, no markdown fences) of at most ${maxTasks} tasks. Each element:
{
  "ref": "T1",                     // stable local id, unique, used only for dependsOn wiring
  "title": "short imperative title",
  "description": "1-3 sentences: what to build and the acceptance criteria",
  "priority": "critical" | "high" | "normal" | "low",
  "dependsOn": ["T2"]              // refs of tasks that MUST complete first; [] if none
}

Rules:
- Order tasks so dependencies come before dependents. Keep the dependency graph acyclic.
- Only reference refs that exist in this array. Split large work into concrete, independently-verifiable tasks.
- Prefer fewer, well-scoped tasks over many trivial ones.

DOCUMENT:
${prd}`;
}

/** Pull the outermost JSON array out of an LLM reply that may wrap it in prose
 * or ```json fences. Returns the substring from the first '[' to its matching
 * ']' (bracket-depth aware, string/escape aware), or null. */
export function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Validate/coerce raw LLM objects into ParsedTask[]. Drops entries without a
 * title; assigns a fresh ref when missing; clamps priority; strips dependsOn
 * refs that don't resolve to another task. Records what it dropped. */
export function validateTasks(raw: unknown, warnings: string[]): ParsedTask[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const tasks: ParsedTask[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    if (!title) {
      warnings.push(`dropped task #${i + 1}: missing title`);
      return;
    }
    let ref = typeof o.ref === 'string' && o.ref.trim() ? o.ref.trim() : `T${i + 1}`;
    while (seen.has(ref)) ref = `${ref}_${i}`;
    seen.add(ref);
    const priority: TaskPriority = PRIORITIES.includes(o.priority as TaskPriority)
      ? (o.priority as TaskPriority)
      : 'normal';
    const description = typeof o.description === 'string' ? o.description.trim() : '';
    const dependsOn = Array.isArray(o.dependsOn)
      ? o.dependsOn.filter((d): d is string => typeof d === 'string' && d.trim().length > 0).map((d) => d.trim())
      : [];
    tasks.push({ ref, title, description, priority, dependsOn });
  });
  // Strip dependsOn refs that don't resolve to a task in the set.
  const refs = new Set(tasks.map((t) => t.ref));
  for (const t of tasks) {
    const kept = t.dependsOn.filter((d) => refs.has(d) && d !== t.ref);
    if (kept.length !== t.dependsOn.length) {
      warnings.push(`task ${t.ref}: dropped ${t.dependsOn.length - kept.length} unresolved/self dependency ref(s)`);
    }
    t.dependsOn = kept;
  }
  return tasks;
}

/** Kahn topological sort: dependencies before dependents. Any edges left in a
 * cycle are broken (reported) so the result is always a valid acyclic order —
 * the task DAG rejects cycles, so we must not emit one. */
export function topoSort(tasks: ParsedTask[], warnings: string[]): ParsedTask[] {
  const byRef = new Map(tasks.map((t) => [t.ref, t]));
  const indeg = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const t of tasks) indeg.set(t.ref, 0);
  for (const t of tasks) {
    for (const d of t.dependsOn) {
      if (!byRef.has(d)) continue;
      indeg.set(t.ref, (indeg.get(t.ref) ?? 0) + 1);
      dependents.set(d, [...(dependents.get(d) ?? []), t.ref]);
    }
  }
  // Stable queue: preserve original order among ready tasks.
  const ready = tasks.filter((t) => (indeg.get(t.ref) ?? 0) === 0).map((t) => t.ref);
  const ordered: ParsedTask[] = [];
  while (ready.length > 0) {
    const ref = ready.shift() as string;
    ordered.push(byRef.get(ref) as ParsedTask);
    for (const dep of dependents.get(ref) ?? []) {
      const n = (indeg.get(dep) ?? 0) - 1;
      indeg.set(dep, n);
      if (n === 0) ready.push(dep);
    }
  }
  if (ordered.length < tasks.length) {
    // Remaining tasks are in a cycle — append them in original order with their
    // unresolved dependency edges dropped so the DAG stays acyclic.
    const placed = new Set(ordered.map((t) => t.ref));
    for (const t of tasks) {
      if (placed.has(t.ref)) continue;
      const broken = t.dependsOn.filter((d) => !placed.has(d) && byRef.has(d));
      if (broken.length > 0) {
        warnings.push(`task ${t.ref}: broke dependency cycle by dropping edge(s) to ${broken.join(', ')}`);
        t.dependsOn = t.dependsOn.filter((d) => !broken.includes(d));
      }
      ordered.push(t);
      placed.add(t.ref);
    }
  }
  return ordered;
}

export interface DecomposeOptions {
  model: string;
  maxBudgetUsd: number;
  timeoutMs: number;
  cwd: string;
  maxTasks: number;
}

/** Full pipeline: prompt → run → extract JSON → validate → topological sort. */
export function decomposePrd(
  prd: string,
  opts: DecomposeOptions,
  runner: DecomposeRunner = defaultRunClaude,
): ParsePrdResult {
  const warnings: string[] = [];
  const prompt = buildDecomposePrompt(prd, opts.maxTasks);
  const res = runner({ prompt, model: opts.model, maxBudgetUsd: opts.maxBudgetUsd, timeoutMs: opts.timeoutMs, cwd: opts.cwd });
  if (!res.ok && !res.text) {
    return { tasks: [], costUsd: res.costUsd, warnings: ['claude returned no output'] };
  }
  const jsonStr = extractJsonArray(res.text);
  if (!jsonStr) {
    return { tasks: [], costUsd: res.costUsd, warnings: ['no JSON array found in the model response'] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { tasks: [], costUsd: res.costUsd, warnings: ['model response was not valid JSON'] };
  }
  let tasks = validateTasks(parsed, warnings);
  if (tasks.length > opts.maxTasks) {
    warnings.push(`clamped ${tasks.length} tasks to the --max-tasks limit of ${opts.maxTasks}`);
    tasks = tasks.slice(0, opts.maxTasks);
    const refs = new Set(tasks.map((t) => t.ref));
    for (const t of tasks) t.dependsOn = t.dependsOn.filter((d) => refs.has(d));
  }
  tasks = topoSort(tasks, warnings);
  return { tasks, costUsd: res.costUsd, warnings };
}
