import { describe, it, expect } from 'vitest';
import {
  bridgeAgentId,
  buildSpawnInput,
  isBound,
  reconcile,
  classifyPrompt,
  type ClaudeAgentDescriptor,
  type SwarmdoAgentLike,
} from '../src/agent-bridge/bridge.ts';

const NOW = '2026-07-12T12:00:00.000Z';

describe('bridgeAgentId', () => {
  it('is deterministic and stable across calls (idempotent binding)', () => {
    const d: ClaudeAgentDescriptor = { name: 'research-ccgap', sessionId: 'cec69c3c-8aa2', agentType: 'general-purpose' };
    expect(bridgeAgentId(d)).toBe('cc-cec69c3c-research-ccgap');
    expect(bridgeAgentId(d)).toBe(bridgeAgentId(d));
  });
  it('sanitizes unsafe name chars and truncates the session', () => {
    expect(bridgeAgentId({ name: 'weird name/@!', sessionId: 'ABCDEFGHIJKLMNOP', agentType: 'coder' })).toBe(
      'cc-ABCDEFGH-weird-name',
    );
  });
  it('falls back to nosess/agent when fields are empty', () => {
    expect(bridgeAgentId({ name: '', agentType: 'coder' })).toBe('cc-nosess-agent');
    expect(bridgeAgentId({ name: '@@@', agentType: 'coder' })).toBe('cc-nosess-agent');
  });
});

describe('buildSpawnInput', () => {
  it('produces an agent_spawn payload with the Claude-Code binding in config', () => {
    const d: ClaudeAgentDescriptor = { name: 'coder-1', sessionId: 'sess1234', agentType: 'coder', task: 'build X' };
    const input = buildSpawnInput(d, NOW);
    expect(input).toMatchObject({
      agentId: 'cc-sess1234-coder-1',
      agentType: 'coder',
      domain: 'claude-code-bridge',
      task: 'build X',
      config: { binding: { origin: 'claude-code', claudeName: 'coder-1', sessionId: 'sess1234', task: 'build X', boundAt: NOW } },
    });
  });
  it('omits optional fields cleanly when absent', () => {
    const input = buildSpawnInput({ name: 'a', agentType: 'researcher' }, NOW);
    expect(input.task).toBeUndefined();
    const binding = (input.config as any).binding;
    expect(binding).toEqual({ origin: 'claude-code', claudeName: 'a', boundAt: NOW });
    expect('sessionId' in binding).toBe(false);
  });
  it('round-trips through isBound', () => {
    const input = buildSpawnInput({ name: 'a', agentType: 'coder' }, NOW);
    expect(isBound({ agentId: input.agentId as string, agentType: 'coder', config: input.config as any })).toBe(true);
  });
});

describe('isBound', () => {
  it('is false for a native Swarmdo agent (no binding)', () => {
    expect(isBound({ agentId: 'agent-1', agentType: 'coder', config: {} })).toBe(false);
    expect(isBound({ agentId: 'agent-2', agentType: 'coder' })).toBe(false);
  });
});

describe('reconcile', () => {
  const bound = (name: string): SwarmdoAgentLike => ({
    agentId: bridgeAgentId({ name, agentType: 'coder' }),
    agentType: 'coder',
    config: { binding: { origin: 'claude-code', claudeName: name, boundAt: NOW } },
  });
  const native: SwarmdoAgentLike = { agentId: 'agent-native', agentType: 'coder', config: {} };

  it('splits the two rosters into mirrored / unmirrored / orphaned', () => {
    const store = [bound('alice'), bound('bob'), native];
    const live = ['alice', 'carol']; // bob is gone; carol is new; alice matches
    const r = reconcile(store, live);
    expect(r.mirrored).toEqual(['alice']);
    expect(r.unmirrored).toEqual(['carol']);
    expect(r.orphaned).toEqual(['bob']);
  });
  it('ignores native (unbound) Swarmdo agents entirely', () => {
    const r = reconcile([native], ['alice']);
    expect(r).toEqual({ mirrored: [], unmirrored: ['alice'], orphaned: [] });
  });
  it('is empty-safe and deterministic (sorted)', () => {
    expect(reconcile([], [])).toEqual({ mirrored: [], unmirrored: [], orphaned: [] });
    const r = reconcile([bound('z'), bound('a')], ['z', 'a', 'm']);
    expect(r.mirrored).toEqual(['a', 'z']);
    expect(r.unmirrored).toEqual(['m']);
  });
});

describe('classifyPrompt', () => {
  it('flags substantial agentic prompts and suggests roles', () => {
    const r = classifyPrompt('Build an integration between Claude agents and Swarmdo agents with tests');
    expect(r.requiresAgents).toBe(true);
    expect(r.suggestedRoles).toContain('coder');
  });
  it('routes security work to a security-led roster', () => {
    const r = classifyPrompt('Audit the auth module for injection and SSRF vulnerabilities and fix them');
    expect(r.requiresAgents).toBe(true);
    expect(r.suggestedRoles[0]).toBe('security-auditor');
  });
  it('routes refactors to an architect-led roster', () => {
    expect(classifyPrompt('Refactor the payment service across modules to remove duplication').suggestedRoles[0]).toBe(
      'system-architect',
    );
  });
  it('gives a feature build the full pipeline', () => {
    const r = classifyPrompt('Implement an end-to-end OAuth login feature with the API and UI');
    expect(r.suggestedRoles).toEqual(['researcher', 'system-architect', 'coder', 'tester', 'reviewer']);
  });
  it('does NOT fire on questions or conversational prompts', () => {
    expect(classifyPrompt('how do we know when the agents are swarmdo vs claude code?').requiresAgents).toBe(false);
    expect(classifyPrompt('what does this function do').requiresAgents).toBe(false);
    expect(classifyPrompt('').requiresAgents).toBe(false);
  });
  it('does NOT fire on trivial one-line edits despite an agentic verb', () => {
    expect(classifyPrompt('add a comment here').requiresAgents).toBe(false);
    expect(classifyPrompt('bump the version').requiresAgents).toBe(false);
  });
});
