/**
 * #108 — the WRITE path for the statusline's `🐝 Swarms N   🤖 Agents M`.
 *
 * statusline-swarm-count.test.ts seeds `.swarmdo/agents/store.json` by hand and
 * asserts computeSwarmStatus reads it. Those 5 cases pass and always would:
 * they never ask whether anything WRITES the registry. Nothing did — no hook
 * called the bridge — so the reader was correct and the counters were 0 in
 * production regardless. These tests cover the half that was broken.
 *
 * The registration itself is a detached CLI spawn (see agent-bridge-hook.cjs
 * for why), so the pure argv-builders are the seam: assert what we WOULD run,
 * without booting an 850ms CLI per case.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { bridgeAgentId as engineBridgeAgentId } from '../src/agent-bridge/bridge.ts';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const require_ = createRequire(import.meta.url);
const hook = require_(join(REPO_ROOT, '.claude', 'helpers', 'agent-bridge-hook.cjs'));

/** A realistic SubagentStart/SubagentStop payload. */
const SUBAGENT_EVENT = {
  session_id: 'cec69c3c-1234-5678-9abc-def012345678',
  cwd: '/repo',
  hook_event_name: 'SubagentStart',
  agent_id: 'a5d4234b5136f33e0',
  agent_type: 'Explore',
};

describe('bridgeAgentId mirror', () => {
  // agent-bridge-hook.cjs hand-mirrors bridge.ts because a CJS hook cannot
  // import the ESM engine. Hand-mirroring drifts; router.cjs carries the same
  // liability for classifyPrompt. If these ever disagree, SubagentStop computes
  // a different id than SubagentStart wrote and agents never terminate.
  const cases = [
    { name: 'a5d4234b5136f33e0', sessionId: 'cec69c3c-1234-5678' },
    { name: 'research-ccgap', sessionId: 'cec69c3c' },
    { name: 'weird name/with:chars', sessionId: 'ab-cd-ef-12-34' },
    { name: 'agent', sessionId: undefined },
    { name: '---', sessionId: '!!!!' },
    { name: 'x', sessionId: '' },
  ];

  for (const c of cases) {
    it(`agrees with the engine for ${JSON.stringify(c)}`, () => {
      expect(hook.bridgeAgentId(c)).toBe(engineBridgeAgentId(c as never));
    });
  }
});

describe('isSubagentEvent', () => {
  it('accepts a payload carrying agent_id', () => {
    expect(hook.isSubagentEvent(SUBAGENT_EVENT)).toBe(true);
  });

  // agent_id is present ONLY inside a subagent call, so it is the guard that
  // stops a main-thread hook firing from registering a phantom agent.
  it('rejects a main-thread payload with no agent_id', () => {
    expect(hook.isSubagentEvent({ session_id: 'abc', hook_event_name: 'SubagentStop' })).toBe(false);
  });

  it('rejects empty/absent payloads', () => {
    expect(hook.isSubagentEvent({})).toBe(false);
    expect(hook.isSubagentEvent(null)).toBe(false);
    expect(hook.isSubagentEvent({ agent_id: '' })).toBe(false);
  });
});

describe('buildRegisterArgs (SubagentStart)', () => {
  it('registers the subagent under its agent_id, typed and session-scoped', () => {
    expect(hook.buildRegisterArgs(SUBAGENT_EVENT)).toEqual([
      'agent', 'bridge', 'register',
      '-n', 'a5d4234b5136f33e0',
      '-t', 'Explore',
      '-s', 'cec69c3c-1234-5678-9abc-def012345678',
    ]);
  });

  it('defaults the type when agent_type is absent', () => {
    const args = hook.buildRegisterArgs({ agent_id: 'x', session_id: 's' });
    expect(args.slice(args.indexOf('-t'), args.indexOf('-t') + 2)).toEqual(['-t', 'general-purpose']);
  });

  it('omits -s rather than passing an empty session', () => {
    expect(hook.buildRegisterArgs({ agent_id: 'x', agent_type: 'coder' })).toEqual([
      'agent', 'bridge', 'register', '-n', 'x', '-t', 'coder',
    ]);
  });

  it('returns null for a non-subagent payload', () => {
    expect(hook.buildRegisterArgs({ session_id: 'abc' })).toBeNull();
  });
});

describe('buildTerminateArgs (SubagentStop)', () => {
  it('stops the SAME id the register side created', () => {
    // The correlation that makes the count decrement: agent_id is stable across
    // the start/stop pair, so both sides derive one id.
    const expectedId = engineBridgeAgentId({
      name: SUBAGENT_EVENT.agent_id,
      sessionId: SUBAGENT_EVENT.session_id,
    } as never);
    expect(hook.buildTerminateArgs(SUBAGENT_EVENT)).toEqual(['agent', 'stop', expectedId, '-f']);
  });

  it('passes -f so a TTY-less hook never blocks on the interactive confirm', () => {
    expect(hook.buildTerminateArgs(SUBAGENT_EVENT)).toContain('-f');
  });

  it('returns null for a non-subagent payload', () => {
    expect(hook.buildTerminateArgs({ session_id: 'abc' })).toBeNull();
  });
});
