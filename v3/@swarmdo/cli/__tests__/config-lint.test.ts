import { describe, it, expect } from 'vitest';
import {
  lintJson,
  lintSwarmdoConfig,
  lintSettingsHooks,
  lintMcpConfig,
  lintLegacyLayout,
  lintAll,
} from '../src/config-lint/lint.ts';

const rules = (fs: { rule: string }[]): string[] => fs.map((x) => x.rule);

describe('config-lint: lintJson', () => {
  it('absent file → no findings; broken JSON → error', () => {
    expect(lintJson('x.json', null).findings).toEqual([]);
    const { findings } = lintJson('x.json', '{oops');
    expect(rules(findings)).toEqual(['invalid-json']);
    expect(findings[0].severity).toBe('error');
  });
});

describe('config-lint: swarmdo.config.json', () => {
  it('accepts a valid config', () => {
    expect(lintSwarmdoConfig('c', { topology: 'hierarchical', maxAgents: 8, memoryBackend: 'hybrid' })).toEqual([]);
  });
  it('flags bad enums, ranges, and unknown keys', () => {
    const out = lintSwarmdoConfig('c', { topology: 'triangle', maxAgents: 0, memoryBackend: 'redis', turboMode: true });
    expect(rules(out).sort()).toEqual(['bad-max-agents', 'bad-memory-backend', 'bad-topology', 'unknown-key']);
  });
  it('reads nested memory.backend and rejects non-object roots', () => {
    expect(rules(lintSwarmdoConfig('c', { memory: { backend: 'floppy' } }))).toEqual(['bad-memory-backend']);
    expect(rules(lintSwarmdoConfig('c', [1]))).toEqual(['config-shape']);
  });
});

describe('config-lint: settings hooks', () => {
  it('accepts the schema init generates', () => {
    const ok = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'swarmdo hooks notify -d' }] }], PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'x' }] }] } };
    expect(lintSettingsHooks('s', ok)).toEqual([]);
  });
  it('flags unknown events (warn) and broken entries (error)', () => {
    const bad = { hooks: { Stopp: [{ hooks: [{ type: 'command', command: 'x' }] }], Stop: [{ hooks: [] }, { hooks: [{ type: 'shell', command: '' }] }] } };
    const out = lintSettingsHooks('s', bad);
    expect(rules(out).sort()).toEqual(['hook-command', 'hook-inner-shape', 'hook-type', 'unknown-hook-event']);
    expect(out.find((x) => x.rule === 'unknown-hook-event')!.severity).toBe('warn');
  });
  it('no hooks key → nothing to say', () => {
    expect(lintSettingsHooks('s', { model: 'opus' })).toEqual([]);
  });
  it('recognizes current Claude Code events — no false unknown-event warning (#50)', () => {
    // These are all valid modern events that the stale allowlist wrongly flagged.
    const modern = {
      hooks: Object.fromEntries(
        ['PostCompact', 'SubagentStart', 'PostToolUseFailure', 'PostToolBatch', 'PermissionRequest', 'PermissionDenied', 'Setup', 'StopFailure', 'TaskCreated', 'UserPromptExpansion', 'CwdChanged', 'FileChanged', 'ConfigChange', 'InstructionsLoaded', 'MessageDisplay', 'Elicitation', 'ElicitationResult', 'WorktreeCreate', 'WorktreeRemove']
          .map((ev) => [ev, [{ hooks: [{ type: 'command', command: 'x' }] }]]),
      ),
    };
    const out = lintSettingsHooks('s', modern);
    expect(out.filter((x) => x.rule === 'unknown-hook-event')).toEqual([]);
  });
});

describe('config-lint: .mcp.json', () => {
  it('accepts stdio and url servers', () => {
    const ok = { mcpServers: { a: { command: 'npx', args: ['swarmdo'] }, b: { type: 'sse', url: 'https://x.dev/sse' } } };
    expect(lintMcpConfig('m', ok)).toEqual([]);
  });
  it('flags missing command, bad url, bad env/args', () => {
    const bad = { mcpServers: { a: { command: ' ' }, b: { type: 'http', url: 'not-a-url' }, c: { command: 'x', args: 'nope', env: [] } } };
    expect(rules(lintMcpConfig('m', bad)).sort()).toEqual(['mcp-args-type', 'mcp-bad-url', 'mcp-env-type', 'mcp-missing-command']);
  });
  it('warns when mcpServers is absent', () => {
    expect(rules(lintMcpConfig('m', {}))).toEqual(['mcp-no-servers']);
  });
});

describe('config-lint: pre-1.4 layout', () => {
  it('clean post-1.4 layout → no findings', () => {
    expect(lintLegacyLayout(['sDo'], ['sdo-ponytail', 'sdo-caveman-compress', 'my-own-skill'])).toEqual([]);
  });
  it('flags flat commands (that have a sDo/ twin) and duplicate legacy skills', () => {
    // `swarm` and `swarmdo-help.md` are real swarmdo commands (they exist under sDo/) → leftovers
    const out = lintLegacyLayout(['sDo', 'swarm', 'swarmdo-help.md'], ['ponytail', 'sdo-ponytail', 'my-own-skill'], ['swarm', 'swarmdo-help.md']);
    expect(rules(out).sort()).toEqual(['duplicate-legacy-skill', 'pre-1.4-commands']);
    expect(out.every((x) => x.severity === 'warn')).toBe(true);
  });
  it('does NOT flag a non-swarmdo command dir coexisting with sDo/ (#66)', () => {
    // `.claude/commands/` is Claude Code's shared dir; a user/other-plugin command
    // with no sDo/ twin must not be called a pre-1.4 swarmdo leftover.
    expect(lintLegacyLayout(['sDo', 'my-team-commands'], [], ['swarm', 'sparc.md'])).toEqual([]);
    expect(lintLegacyLayout(['sDo', 'my-org-cmds.md'], [], ['swarmdo-help.md'])).toEqual([]);
  });
  it('does NOT flag unprefixed skills without an sdo- twin (user skills)', () => {
    expect(lintLegacyLayout(['sDo'], ['my-own-skill', 'another'])).toEqual([]);
  });
});

describe('config-lint: lintAll', () => {
  it('aggregates counts across surfaces', () => {
    const report = lintAll({
      swarmdoConfig: { file: 'swarmdo.config.json', raw: '{"topology":"triangle"}' },
      settingsFiles: [{ file: '.claude/settings.json', raw: '{"hooks":{"Weird":[]}}' }],
      mcpConfig: { file: '.mcp.json', raw: '{"mcpServers":{"a":{"command":""}}}' },
      commandsRoot: ['sDo', 'sparc.md'],
      sdoCommands: ['sparc.md'], // sparc.md has a sDo/ twin → flat copy is a leftover
      skills: [],
    });
    expect(report.errors).toBe(2);   // bad-topology + mcp-missing-command
    expect(report.warnings).toBe(2); // unknown-hook-event + pre-1.4-commands
    expect(report.findings).toHaveLength(4);
  });
});
