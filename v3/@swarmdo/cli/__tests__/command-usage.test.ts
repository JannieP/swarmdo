import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  parseCommandInvocations,
  parseSubagentInvocations,
  joinUsage,
  discoverAuthored,
  encodeProjectDir,
  mergeCounts,
} from '../src/command-usage/usage.ts';

// raw JSONL line builders (shape mirrors real transcripts)
const userLine = (text: string): string => JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });
const asstLine = (text: string): string => JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
const taskLine = (subagent: string): string => JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Task', input: { subagent_type: subagent } }] } });

describe('parseCommandInvocations (AC1)', () => {
  it('counts de-slashed command names, scoped to user lines', () => {
    const lines = [
      userLine('<command-name>/goal</command-name>'),
      userLine('<command-name>/goal</command-name>'),
      userLine('<command-name>/foo</command-name>'),
    ];
    expect(Object.fromEntries(parseCommandInvocations(lines))).toEqual({ goal: 2, foo: 1 });
  });
  it('does NOT count the marker when it appears on an assistant line', () => {
    const lines = [asstLine('quoting <command-name>/goal</command-name> in my reply')];
    expect(parseCommandInvocations(lines).size).toBe(0);
  });
  it('preserves colon namespacing and skips the … placeholder', () => {
    const lines = [userLine('<command-name>/swarm:README</command-name>'), userLine('<command-name>…</command-name>')];
    expect(Object.fromEntries(parseCommandInvocations(lines))).toEqual({ 'swarm:README': 1 });
  });
});

describe('parseSubagentInvocations (AC2)', () => {
  it('counts subagent_type across tool_use lines', () => {
    const lines = [taskLine('researcher'), taskLine('researcher'), taskLine('researcher'), taskLine('coder')];
    expect(Object.fromEntries(parseSubagentInvocations(lines))).toEqual({ researcher: 3, coder: 1 });
  });
});

describe('joinUsage (AC3)', () => {
  it('splits defined × counts into hot / cold / orphan (de-slashed match)', () => {
    const r = joinUsage(['/build', '/deploy'], { build: 5, gaol: 2 });
    expect(r.hot).toEqual([{ name: '/build', count: 5 }]);
    expect(r.cold).toEqual(['/deploy']);
    expect(r.orphan).toEqual(['gaol']); // invoked but not defined
  });
  it('works for agents (no slash) and sorts hot desc, cold/orphan asc', () => {
    const r = joinUsage(['reviewer', 'coder', 'tester'], new Map([['coder', 2], ['reviewer', 9], ['ghost', 1]]));
    expect(r.hot).toEqual([{ name: 'reviewer', count: 9 }, { name: 'coder', count: 2 }]);
    expect(r.cold).toEqual(['tester']);
    expect(r.orphan).toEqual(['ghost']);
  });
  it('empty-safe (AC5): no counts → everything cold, no orphan; no defined → empty', () => {
    expect(joinUsage(['/a', '/b'], {})).toEqual({ hot: [], cold: ['/a', '/b'], orphan: [] });
    expect(joinUsage([], { x: 3 })).toEqual({ hot: [], cold: [], orphan: ['x'] });
    expect(joinUsage([], {})).toEqual({ hot: [], cold: [], orphan: [] });
  });
});

describe('mergeCounts', () => {
  it('sums per-file maps into the accumulator', () => {
    const dest = new Map([['a', 1]]);
    mergeCounts(dest, new Map([['a', 2], ['b', 5]]));
    expect(Object.fromEntries(dest)).toEqual({ a: 3, b: 5 });
  });
});

describe('encodeProjectDir', () => {
  it('encodes a cwd the way Claude Code names its transcript dir', () => {
    expect(encodeProjectDir('/Users/jan/Projects/ruflo')).toBe('-Users-jan-Projects-ruflo');
  });
});

describe('discoverAuthored (namespaced commands + basename agents)', () => {
  it('maps subdir command files to colon names and agents to basenames', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmdusage-'));
    try {
      fs.mkdirSync(path.join(dir, '.claude/commands/sDo'), { recursive: true });
      fs.mkdirSync(path.join(dir, '.claude/agents/analysis'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.claude/commands/goal.md'), '# goal');
      fs.writeFileSync(path.join(dir, '.claude/commands/sDo/statusline.md'), '# sl');
      fs.writeFileSync(path.join(dir, '.claude/commands/README.txt'), 'not md'); // ignored
      fs.writeFileSync(path.join(dir, '.claude/agents/coder.md'), '# coder');
      fs.writeFileSync(path.join(dir, '.claude/agents/analysis/code-analyzer.md'), '# ca');
      const r = discoverAuthored(dir);
      expect(r.commands).toEqual(['goal', 'sDo:statusline']);
      expect(r.agents).toEqual(['code-analyzer', 'coder']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('returns empty arrays when there is no .claude surface', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmdusage-empty-'));
    try {
      expect(discoverAuthored(dir)).toEqual({ commands: [], agents: [] });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
