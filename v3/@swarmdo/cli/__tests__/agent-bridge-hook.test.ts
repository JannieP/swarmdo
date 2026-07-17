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
import { execFileSync } from 'node:child_process';
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

describe('[SWARMDO] UserPromptSubmit advisory', () => {
  // This banner is injected into context on EVERY agentic prompt, so both its
  // correctness and its size are load-bearing. It used to spend three of its
  // four lines telling the main agent to run `agent bridge register` by hand —
  // advice that #108 made both wrong and redundant work, since SubagentStart
  // now registers every subagent automatically.
  const runRoute = (prompt: string): string =>
    execFileSync(process.execPath, [join(REPO_ROOT, '.claude', 'helpers', 'hook-handler.cjs'), 'route'], {
      input: JSON.stringify({ prompt }),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });

  const AGENTIC = 'refactor the auth module across files and add tests';

  it('fires on an agentic prompt and names the suggested roles', () => {
    const out = runRoute(AGENTIC);
    expect(out).toContain('[SWARMDO]');
    expect(out).toMatch(/coder|reviewer|architect/);
  });

  it('does NOT tell the agent to register by hand', () => {
    // The regression this guards: re-adding manual-registration instructions
    // would have the main agent duplicate what the SubagentStart hook already
    // did, on every single agentic prompt.
    const out = runRoute(AGENTIC);
    const banner = out.split('\n').filter((l) => l.includes('[SWARMDO]') || l.startsWith('  ')).join('\n');
    expect(banner).not.toContain('bridge register');
  });

  it('stays to one line — it is paid for on every agentic prompt', () => {
    const out = runRoute(AGENTIC);
    const bannerLines = out.split('\n').filter((l) => l.includes('[SWARMDO]'));
    expect(bannerLines.length).toBe(1);
    expect(bannerLines[0].length).toBeLessThan(200);
  });

  it('stays silent on a trivial prompt', () => {
    expect(runRoute('what is the version')).not.toContain('[SWARMDO]');
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
