/**
 * The statusline `🤖 Swarm N` live count must reflect the canonical agent
 * registry (what `agent_spawn` / `swarm_init` / `agent bridge register` / the
 * hive-mind write), NOT `ps aux | grep -c agentic-flow`. The old heuristic
 * never moved when a swarm spun up (in-process / bridged agents are not a
 * separate `agentic-flow` process) and false-positived on any process whose
 * args mention "agentic-flow" (a grep, an editor buffer, the ONNX embedder).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { computeSwarmStatus } from '../src/commands/hooks.ts';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'swarmdo-swarmcount-')); });
afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

function writeStore(rel: string, obj: unknown): void {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(obj), 'utf-8');
}

describe('statusline swarm count — reads the agent registry, not ps', () => {
  it('reports zero (no phantom agents) when no registry exists', () => {
    expect(computeSwarmStatus(dir)).toEqual({ activeAgents: 0, coordinationActive: false });
  });

  it('counts non-terminated agents from the canonical store', () => {
    writeStore(join('.swarmdo', 'agents', 'store.json'), {
      version: '3.0.0',
      agents: {
        a1: { agentId: 'a1', status: 'idle' },
        a2: { agentId: 'a2', status: 'busy' },
        a3: { agentId: 'a3', status: 'terminated' }, // excluded
      },
    });
    const s = computeSwarmStatus(dir);
    expect(s.activeAgents).toBe(2);
    expect(s.coordinationActive).toBe(true);
  });

  it('merges hive-mind workers (.swarmdo/agents.json) with the store', () => {
    writeStore(join('.swarmdo', 'agents', 'store.json'), { agents: { a1: { status: 'busy' } } });
    writeStore(join('.swarmdo', 'agents.json'), { agents: { h1: { status: 'idle' }, h2: { status: 'terminated' } } });
    expect(computeSwarmStatus(dir).activeAgents).toBe(2); // a1 + h1
  });

  it('a bridged Claude Code agent (idle) shows up — the case the ps heuristic missed', () => {
    writeStore(join('.swarmdo', 'agents', 'store.json'), {
      agents: { bridged: { status: 'idle', config: { binding: { origin: 'claude-code' } } } },
    });
    expect(computeSwarmStatus(dir).activeAgents).toBe(1);
  });

  it('tolerates a corrupt store without throwing', () => {
    const p = join(dir, '.swarmdo', 'agents', 'store.json');
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, '{not valid json', 'utf-8');
    expect(computeSwarmStatus(dir)).toEqual({ activeAgents: 0, coordinationActive: false });
  });
});
