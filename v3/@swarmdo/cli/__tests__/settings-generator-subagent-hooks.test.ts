/**
 * #108 — `swarmdo init` must generate the spawn-side registration hook.
 *
 * This is a regression guard with history. A SubagentStart block used to ship
 * here and was deleted as "dead config" because `config lint` (v1.4.6) flagged
 * it against a HOOK_EVENTS list that was then missing the event. SubagentStart
 * is real (code.claude.com/docs/en/hooks: fires "when a subagent is spawned",
 * carries agent_id + agent_type), and config-lint/lint.ts now lists it. The
 * deletion was a false positive that removed the ONLY path registering a
 * Claude Code subagent into `.swarmdo/agents/store.json` — which is why the
 * statusline's Agents/Swarms counters read 0 forever, through #105 and after.
 *
 * If this test fails because the block was removed again: verify against the
 * docs first, not against a stale local list.
 */
import { describe, it, expect } from 'vitest';
import { generateSettings } from '../src/init/settings-generator.ts';
import type { InitOptions } from '../src/init/types.js';
import { DEFAULT_INIT_OPTIONS } from '../src/init/types.js';
import { HOOK_EVENTS } from '../src/config-lint/lint.ts';

type HookBlock = { matcher?: string; hooks: Array<{ command: string }> };
type Settings = { hooks?: Record<string, HookBlock[]> };

function settingsWithHooks(overrides: Partial<InitOptions> = {}): Settings {
  return generateSettings({
    ...DEFAULT_INIT_OPTIONS,
    // The hooks block only emits when helpers are bundled too — see
    // generateSettings (#1744): minimal stays minimal.
    components: { ...DEFAULT_INIT_OPTIONS.components, settings: true, helpers: true },
    ...overrides,
  } as InitOptions) as Settings;
}

/** Every command string across an event's blocks. */
function commandsFor(settings: Settings, event: string): string[] {
  return (settings.hooks?.[event] ?? []).flatMap((b) => b.hooks.map((h) => h.command));
}

describe('#108 generated subagent hooks', () => {
  it('emits a SubagentStart hook that registers the subagent', () => {
    const cmds = commandsFor(settingsWithHooks(), 'SubagentStart');
    expect(cmds.length, 'SubagentStart block is missing — see this file’s header before deleting it').toBeGreaterThan(0);
    expect(cmds.some((c) => c.includes('agent-register'))).toBe(true);
  });

  it('emits a SubagentStop hook that terminates the bound record', () => {
    const cmds = commandsFor(settingsWithHooks(), 'SubagentStop');
    expect(cmds.some((c) => c.includes('agent-terminate'))).toBe(true);
  });

  it('keeps the existing post-task metrics hook on SubagentStop', () => {
    // agent-terminate is additive: it must not displace metrics tracking.
    const cmds = commandsFor(settingsWithHooks(), 'SubagentStop');
    expect(cmds.some((c) => c.includes('post-task'))).toBe(true);
  });

  it('only emits hook events Claude Code actually supports', () => {
    // The check that should have caught the original false positive in both
    // directions: assert generated events against config-lint's list, which is
    // kept in sync with code.claude.com/docs/en/hooks.
    for (const event of Object.keys(settingsWithHooks().hooks ?? {})) {
      expect(HOOK_EVENTS, `generated an unknown hook event: ${event}`).toContain(event);
    }
  });

  it('SubagentStart is a valid Claude Code hook event', () => {
    expect(HOOK_EVENTS).toContain('SubagentStart');
  });
});
