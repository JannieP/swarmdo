/**
 * agent-bridge/bridge.ts — link Claude Code Agent-tool agents to Swarmdo's
 * agent registry so the two systems share ONE view.
 *
 * The problem this solves: Swarmdo (MCP server + CLI + hooks) runs
 * out-of-process and CANNOT invoke Claude Code's `Agent` tool — only the main
 * Claude Code loop can spawn real LLM workers. So today a session can run four
 * Claude Code agents while `swarmdo agent list` stays empty: installed but
 * inert. The honest integration is a BINDING — when a real Claude Code agent is
 * spawned, register a bound record in Swarmdo's canonical store
 * (`.swarmdo/agents/store.json`, via the existing `agent_spawn`/registerAgent
 * path — NO parallel store) so `swarmdo agent list` / `swarm_status` reflect
 * reality, and reconcile the two sides on demand.
 *
 * Pure + deterministic: these functions build the registration input, classify
 * whether a prompt warrants a swarm, and diff the two rosters. All fs / MCP /
 * spawning lives in the command + hook layers, so this module is
 * fully fixture-testable.
 */

/** A real Claude Code agent, as the main loop sees it (name@session-…). */
export interface ClaudeAgentDescriptor {
  /** the Agent-tool name, e.g. "research-ccgap" */
  name: string;
  /** the Claude Code session id, e.g. "cec69c3c" (from `name@session-cec69c3c`) */
  sessionId?: string;
  /** the subagent_type, e.g. "general-purpose" / "coder" */
  agentType: string;
  /** one-line task/prompt summary */
  task?: string;
  /** last-known lifecycle state */
  status?: 'idle' | 'busy' | 'terminated';
}

/** The Swarmdo-side binding, stored inside an AgentRecord's `config.binding`. */
export interface AgentBinding {
  origin: 'claude-code';
  claudeName: string;
  sessionId?: string;
  task?: string;
  /** ISO timestamp the binding was created/refreshed */
  boundAt: string;
}

/** Minimal shape of a Swarmdo AgentRecord needed for reconciliation. */
export interface SwarmdoAgentLike {
  agentId: string;
  agentType: string;
  status?: string;
  config?: Record<string, unknown> & { binding?: AgentBinding };
}

/**
 * Deterministic Swarmdo agentId for a Claude Code agent — stable across
 * re-registration so binding the same agent twice UPDATES the record rather
 * than spawning a duplicate (registerAgent honors an explicit `agentId`). Pure.
 */
export function bridgeAgentId(d: ClaudeAgentDescriptor): string {
  const sess = d.sessionId ? d.sessionId.replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'nosess' : 'nosess';
  const safe = d.name.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'agent';
  return `cc-${sess}-${safe}`;
}

/**
 * Build the `agent_spawn` input that registers a bound Swarmdo record for a
 * Claude Code agent. Pure — returns the input object; the caller persists it via
 * the real registerAgent / `agent_spawn` path (so the swarm-join + graph-node +
 * store all happen exactly as for a native Swarmdo agent). `nowIso` is injected
 * for testability.
 */
export function buildSpawnInput(d: ClaudeAgentDescriptor, nowIso: string): Record<string, unknown> {
  const binding: AgentBinding = {
    origin: 'claude-code',
    claudeName: d.name,
    ...(d.sessionId ? { sessionId: d.sessionId } : {}),
    ...(d.task ? { task: d.task } : {}),
    boundAt: nowIso,
  };
  return {
    agentId: bridgeAgentId(d),
    agentType: d.agentType,
    domain: 'claude-code-bridge',
    ...(d.task ? { task: d.task } : {}),
    config: { binding },
  };
}

/** Is a Swarmdo record a Claude-Code binding (vs a native Swarmdo agent)? Pure. */
export function isBound(a: SwarmdoAgentLike): boolean {
  return a.config?.binding?.origin === 'claude-code';
}

export interface Reconciliation {
  /** claudeName present in BOTH the live roster and the Swarmdo store */
  mirrored: string[];
  /** live Claude Code agents with NO bound Swarmdo record (need registering) */
  unmirrored: string[];
  /** bound Swarmdo records whose Claude Code agent is gone (stale — reap) */
  orphaned: string[];
}

/**
 * Diff the live Claude Code roster against the Swarmdo store. Pure. Only
 * Claude-Code-bound records participate (native Swarmdo agents are ignored).
 * Returns sorted, de-duplicated name lists so output is deterministic.
 */
export function reconcile(swarmdoAgents: SwarmdoAgentLike[], liveClaudeNames: string[]): Reconciliation {
  const live = new Set(liveClaudeNames);
  const bound = swarmdoAgents.filter(isBound);
  const boundNames = new Set(bound.map((a) => a.config!.binding!.claudeName));
  const mirrored: string[] = [];
  const orphaned: string[] = [];
  for (const a of bound) {
    const nm = a.config!.binding!.claudeName;
    if (live.has(nm)) mirrored.push(nm);
    else orphaned.push(nm);
  }
  const unmirrored = liveClaudeNames.filter((nm) => !boundNames.has(nm));
  const uniqSort = (xs: string[]): string[] => [...new Set(xs)].sort();
  return { mirrored: uniqSort(mirrored), unmirrored: uniqSort(unmirrored), orphaned: uniqSort(orphaned) };
}

/**
 * agentIds of Claude-Code-bound records whose bound agent is NOT in the live
 * roster — the orphans to reap so stale bindings don't accumulate across
 * sessions. Native (unbound) Swarmdo agents are never selected. Pure; sorted
 * for deterministic pruning. Complements `reconcile` (which reports orphan
 * NAMES) by giving the store keys the prune path deletes.
 */
export function orphanedAgentIds(swarmdoAgents: SwarmdoAgentLike[], liveClaudeNames: string[]): string[] {
  const live = new Set(liveClaudeNames);
  return swarmdoAgents
    .filter((a) => isBound(a) && !live.has(a.config!.binding!.claudeName))
    .map((a) => a.agentId)
    .sort();
}

// ── prompt → swarm intent ───────────────────────────────────────────────────
// Encodes the CLAUDE.md "AUTO-INVOKE SWARM" heuristic as a pure classifier so
// the UserPromptSubmit hook can decide, deterministically, whether a prompt
// warrants spinning up bound agents (and which roles) instead of just printing
// a single-agent recommendation.

export interface SwarmIntent {
  /** true when the prompt is substantial enough to warrant bound agents */
  requiresAgents: boolean;
  /** short human reason (which signal fired) */
  reason: string;
  /** suggested agent roles, most-important first (empty when !requiresAgents) */
  suggestedRoles: string[];
}

// Work that benefits from a swarm — verbs that imply multi-step build/change.
const AGENTIC_RE =
  /\b(implement|build|create|add(?:ing)?|develop|refactor\w*|migrat\w*|redesign|re-?architect\w*|architect\w*|feature|integrat\w*|overhaul|rewrite|port|scaffold|end-to-end|multi-file|test suite|coverage|audit|harden\w*|vulnerab\w*|cve|fix\w*|debug\w*|optimi[sz]e|performance)\b/i;
// Signals the task is trivial / conversational — a single edit or a question.
const TRIVIAL_RE =
  /\b(what|why|how|explain|describe|show|list|find|search|where|which|typo|readme|comment|one-?liner|quick question|rename|bump (?:the )?version|status|help)\b/i;
// Role-selecting signals (checked in priority order).
const ROLE_SIGNALS: Array<{ re: RegExp; roles: string[] }> = [
  { re: /\b(security|vulnerab\w*|cve|auth\w*|inject\w*|xss|ssrf)\b/i, roles: ['security-auditor', 'coder', 'reviewer'] },
  { re: /\b(refactor\w*|migrat\w*|redesign|re-?architect\w*|overhaul|rewrite)\b/i, roles: ['system-architect', 'coder', 'reviewer'] },
  { re: /\b(perf\w*|optimi[sz]e|benchmark|latency|throughput)\b/i, roles: ['perf-analyzer', 'coder', 'tester'] },
  { re: /\b(test|coverage|tdd|spec)\b/i, roles: ['tester', 'coder', 'reviewer'] },
  { re: /\b(feature|implement|build|integrat\w*|end-to-end|api)\b/i, roles: ['researcher', 'system-architect', 'coder', 'tester', 'reviewer'] },
];

/**
 * Decide whether a prompt warrants a bound-agent swarm, and which roles. Pure.
 * requiresAgents is true when an agentic verb fires AND the prompt is long
 * enough that it isn't a one-line question — a trivial/conversational signal
 * alone (with no agentic verb) suppresses it. Deterministic; no LLM.
 */
export function classifyPrompt(prompt: string): SwarmIntent {
  const p = (prompt || '').trim();
  if (!p) return { requiresAgents: false, reason: 'empty prompt', suggestedRoles: [] };
  const agentic = AGENTIC_RE.test(p);
  const trivial = TRIVIAL_RE.test(p);
  // A short prompt (< 24 chars) with no agentic verb is almost always a question.
  if (!agentic) return { requiresAgents: false, reason: trivial ? 'conversational / single-step' : 'no agentic intent detected', suggestedRoles: [] };
  // Agentic verb present but the prompt is a bare one-liner AND reads trivial →
  // treat as a quick edit, not a swarm (e.g. "add a comment", "rename the flag").
  if (trivial && p.length < 40) return { requiresAgents: false, reason: 'agentic verb but reads as a quick single edit', suggestedRoles: [] };
  let roles: string[] = ['coder'];
  for (const sig of ROLE_SIGNALS) {
    if (sig.re.test(p)) { roles = sig.roles; break; }
  }
  return { requiresAgents: true, reason: 'agentic task — swarm recommended', suggestedRoles: roles };
}
