import { describe, it, expect } from 'vitest';
import { parseRule, covers, auditPermissions, type ParsedRule } from '../src/permissions/audit.ts';

const p = (tool: string, specifier?: string): ParsedRule => ({ tool, specifier });
const rules = (a: import('../src/permissions/audit.ts').PermFinding[], rule: string) => a.filter((f) => f.rule === rule);

describe('parseRule', () => {
  it('parses bare tools and Tool(specifier)', () => {
    expect(parseRule('Bash')).toEqual({ tool: 'Bash' });
    expect(parseRule('Bash(git status)')).toEqual({ tool: 'Bash', specifier: 'git status' });
    expect(parseRule('  Bash(npm run *) ')).toEqual({ tool: 'Bash', specifier: 'npm run *' });
    expect(parseRule('mcp__swarmdo__memory_store')).toEqual({ tool: 'mcp__swarmdo__memory_store' });
  });
  it('reports malformed rules', () => {
    expect(parseRule('Bash(npm run')).toEqual({ error: 'unbalanced parentheses' });
    expect(parseRule('(x)')).toEqual({ error: 'missing tool name' });
    expect(parseRule('Bash()')).toEqual({ error: 'empty specifier' });
    expect(parseRule('')).toEqual({ error: 'empty rule' });
    expect(parseRule('12tool(x)')).toEqual({ error: 'invalid tool name' });
  });
});

describe('covers', () => {
  it('a bare tool or * specifier covers anything on the same tool', () => {
    expect(covers(p('Bash'), p('Bash', 'git status'))).toBe(true);
    expect(covers(p('Bash', '*'), p('Bash', 'rm -rf /'))).toBe(true);
  });
  it('glob-matches specifiers and respects direction', () => {
    expect(covers(p('Bash', 'npm run *'), p('Bash', 'npm run test:*'))).toBe(true);
    expect(covers(p('Bash', 'npm run test:*'), p('Bash', 'npm run *'))).toBe(false); // specific is broader
    expect(covers(p('Bash', 'git status'), p('Bash', 'git status'))).toBe(true); // exact
  });
  it('does not cross tools, and a scoped rule does not cover the whole tool', () => {
    expect(covers(p('Read', 'x'), p('Bash', 'x'))).toBe(false);
    expect(covers(p('Bash', 'x'), p('Bash'))).toBe(false);
  });
});

describe('auditPermissions', () => {
  it('flags an allow rule killed by an equal or broader deny (deny wins)', () => {
    expect(rules(auditPermissions({ allow: ['Bash(git status)'], deny: ['Bash(git status)'] }), 'conflict')).toHaveLength(1);
    const broad = rules(auditPermissions({ allow: ['Bash(rm -rf /)'], deny: ['Bash(*)'] }), 'conflict');
    expect(broad).toHaveLength(1);
    expect(broad[0].severity).toBe('error');
  });

  it('flags over-broad whole-tool grants', () => {
    expect(rules(auditPermissions({ allow: ['Bash(*)'] }), 'over-broad')).toHaveLength(1);
    expect(rules(auditPermissions({ allow: ['Bash'] }), 'over-broad')).toHaveLength(1);
  });

  it('flags an allow rule shadowed by a broader allow', () => {
    const f = rules(auditPermissions({ allow: ['Bash(npm run *)', 'Bash(npm run test:*)'] }), 'shadowed-allow');
    expect(f).toHaveLength(1);
    expect(f[0].subjects).toEqual(['Bash(npm run test:*)', 'Bash(npm run *)']);
  });

  it('flags exact duplicates and malformed rules', () => {
    expect(rules(auditPermissions({ allow: ['Read(./x)', 'Read(./x)'] }), 'duplicate')).toHaveLength(1);
    expect(rules(auditPermissions({ deny: ['Bash(oops'] }), 'malformed-rule')).toHaveLength(1);
  });

  it('returns nothing for a clean, non-overlapping ruleset', () => {
    expect(auditPermissions({ allow: ['Bash(git status)'], deny: ['Bash(rm *)'], ask: ['WebFetch(https://*)'] })).toEqual([]);
  });

  it('orders findings errors → warns → infos', () => {
    const f = auditPermissions({
      allow: ['Bash(*)', 'Bash(git log)', 'Bash(git log)', 'Read(./a)'],
      deny: ['Read(./a)'],
    });
    const severities = f.map((x) => x.severity);
    const firstInfo = severities.indexOf('info');
    const lastError = severities.lastIndexOf('error');
    expect(lastError).toBeLessThan(firstInfo === -1 ? Infinity : firstInfo);
    expect(rules(f, 'conflict').length).toBeGreaterThanOrEqual(1); // Read(./a) allow vs deny
    expect(rules(f, 'over-broad').length).toBe(1); // Bash(*)
    expect(rules(f, 'duplicate').length).toBe(1); // Bash(git log) ×2
  });
});
