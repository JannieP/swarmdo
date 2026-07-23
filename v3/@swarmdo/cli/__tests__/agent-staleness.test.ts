/**
 * Regression guard for the phantom-"N agents alive" bug: a fresh session read
 * month-old agent records and counted them as active (no age/liveness check).
 * computeSwarmStatus must exclude records older than the TTL.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeSwarmStatus } from '../src/commands/hooks.ts';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('computeSwarmStatus — stale agent handling', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'swarmstat-'));
    mkdirSync(join(dir, '.swarmdo', 'agents'), { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const seed = (agents: Record<string, unknown>) =>
    writeFileSync(join(dir, '.swarmdo', 'agents', 'store.json'), JSON.stringify({ version: '3.0.0', agents }));
  const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

  it('does NOT count records older than the TTL (the reported bug: 6 month-old idle records)', () => {
    seed({
      fresh: { agentType: 'coder', status: 'idle', createdAt: iso(1000) },
      old1: { agentType: 'tester', status: 'idle', createdAt: iso(30 * 864e5) },
      old2: { agentType: 'planner', status: 'idle', createdAt: iso(30 * 864e5) },
    });
    expect(computeSwarmStatus(dir).activeAgents).toBe(1); // only fresh
  });

  it('excludes terminated, counts recent busy + idle', () => {
    seed({
      a: { agentType: 'coder', status: 'busy', createdAt: iso(1000) },
      b: { agentType: 'coder', status: 'idle', createdAt: iso(1000) },
      c: { agentType: 'coder', status: 'terminated', createdAt: iso(1000) },
    });
    expect(computeSwarmStatus(dir).activeAgents).toBe(2);
  });

  it('keeps records with no createdAt (undateable — conservative, do not over-reap)', () => {
    seed({ x: { agentType: 'coder', status: 'idle' } });
    expect(computeSwarmStatus(dir).activeAgents).toBe(1);
  });

  it('empty / absent store → 0', () => {
    expect(computeSwarmStatus(dir).activeAgents).toBe(0);
  });
});
