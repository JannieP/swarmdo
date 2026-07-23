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
import { mergeSettingsForUpgrade } from '../src/init/executor.ts';

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

/**
 * Generating the correct block on a FRESH init (above) was never enough: a
 * project init'd BEFORE #108 carries `SubagentStart → hook-handler.cjs status`
 * (a no-op) and a `SubagentStop` with no `agent-terminate`, and the upgrade
 * merge copied existing hooks verbatim — so `swarmdo init --upgrade` faithfully
 * preserved the dead wiring and the statusline sat at 0/0 no matter how many
 * Task-tool subagents ran. This guards the repair in mergeSettingsForUpgrade.
 */
describe('upgrade merge repairs stale pre-#108 subagent wiring', () => {
  const staleCmd = (sub: string): string =>
    `sh -c 'D="\${CLAUDE_PROJECT_DIR:-.}"; [ -f "$D/.claude/helpers/hook-handler.cjs" ] || D="\${HOME}"; exec node "$D/.claude/helpers/hook-handler.cjs" ${sub}'`;
  const staleSettings = (): Record<string, unknown> => ({
    hooks: {
      SubagentStart: [{ hooks: [{ type: 'command', command: staleCmd('status'), timeout: 5000 }] }],
      SubagentStop: [{ hooks: [{ type: 'command', command: staleCmd('post-task'), timeout: 5000 }] }],
    },
  });
  const cmdsFor = (s: Record<string, unknown>, event: string): string[] => {
    const hooks = (s.hooks ?? {}) as Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
    return (hooks[event] ?? []).flatMap((b) => (b.hooks ?? []).map((h) => h.command ?? ''));
  };

  it('rewires the no-op SubagentStart status hook to agent-register', () => {
    const merged = mergeSettingsForUpgrade(staleSettings());
    const cmds = cmdsFor(merged, 'SubagentStart');
    expect(cmds.some((c) => c.includes('agent-register'))).toBe(true);
    // the dead `status` no-op must be gone, not left running alongside
    expect(cmds.some((c) => /hook-handler\.cjs" status'/.test(c))).toBe(false);
  });

  it('adds agent-terminate to SubagentStop while keeping post-task metrics', () => {
    const cmds = cmdsFor(mergeSettingsForUpgrade(staleSettings()), 'SubagentStop');
    expect(cmds.some((c) => c.includes('agent-terminate'))).toBe(true);
    expect(cmds.some((c) => c.includes('post-task'))).toBe(true);
  });

  it('is idempotent — a project already on the correct wiring is untouched', () => {
    const once = mergeSettingsForUpgrade(staleSettings());
    const twice = mergeSettingsForUpgrade(once);
    expect(cmdsFor(twice, 'SubagentStart').filter((c) => c.includes('agent-register'))).toHaveLength(1);
    expect(cmdsFor(twice, 'SubagentStop').filter((c) => c.includes('agent-terminate'))).toHaveLength(1);
  });

  it('emits the repaired wiring even when the project had no Subagent hooks at all', () => {
    const merged = mergeSettingsForUpgrade({ hooks: {} });
    expect(cmdsFor(merged, 'SubagentStart').some((c) => c.includes('agent-register'))).toBe(true);
    expect(cmdsFor(merged, 'SubagentStop').some((c) => c.includes('agent-terminate'))).toBe(true);
  });
});
