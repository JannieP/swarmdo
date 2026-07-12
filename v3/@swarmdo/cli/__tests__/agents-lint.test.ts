import { describe, it, expect } from 'vitest';
import { lintAgentFile, lintAgents, AGENT_MODELS } from '../src/config-lint/agents-lint.ts';
import { lintAll } from '../src/config-lint/lint.ts';

const agent = (fm: string, body = 'You are a helpful reviewer.') => `---\n${fm}\n---\n${body}\n`;
const VALID = agent('name: reviewer\ndescription: Reviews code for bugs');

describe('lintAgentFile', () => {
  it('accepts a well-formed subagent file with no findings', () => {
    expect(lintAgentFile('.claude/agents/reviewer.md', VALID)).toEqual([]);
  });

  it('flags a missing description (exactly one error)', () => {
    const found = lintAgentFile('.claude/agents/x.md', agent('name: reviewer'));
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('error');
    expect(found[0].rule).toBe('agent-missing-description');
  });

  it('flags a missing name', () => {
    const found = lintAgentFile('.claude/agents/x.md', agent('description: does things'));
    expect(found.map((f) => f.rule)).toContain('agent-missing-name');
  });

  it('flags a model outside the allowed set', () => {
    const found = lintAgentFile('.claude/agents/x.md', agent('name: r\ndescription: d\nmodel: gpt-4'));
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe('agent-bad-model');
    expect(found[0].message).toContain('gpt-4');
  });

  it('accepts every allowed model', () => {
    for (const m of AGENT_MODELS) {
      expect(lintAgentFile('.claude/agents/x.md', agent(`name: r\ndescription: d\nmodel: ${m}`))).toEqual([]);
    }
  });

  it('flags malformed frontmatter (no fence, and bad YAML)', () => {
    expect(lintAgentFile('.claude/agents/x.md', 'just a body, no frontmatter')[0].rule).toBe('agent-malformed-frontmatter');
    // a tab-indented mapping value is invalid YAML
    const bad = lintAgentFile('.claude/agents/x.md', agent('name: r\n\tbroken: : :'));
    expect(bad[0].rule).toBe('agent-malformed-frontmatter');
  });

  it('warns on an empty body but does not error', () => {
    const found = lintAgentFile('.claude/agents/x.md', agent('name: r\ndescription: d', ''));
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('warn');
    expect(found[0].rule).toBe('agent-empty-body');
  });

  it('tolerates a leading BOM and CRLF line endings', () => {
    const crlf = '﻿---\r\nname: r\r\ndescription: d\r\n---\r\nbody\r\n';
    expect(lintAgentFile('.claude/agents/x.md', crlf)).toEqual([]);
  });
});

describe('lintAgents — cross-file duplicate name', () => {
  it('flags exactly one duplicate-name error naming both colliding files', () => {
    const found = lintAgents([
      { file: '.claude/agents/a.md', raw: agent('name: reviewer\ndescription: one') },
      { file: '.claude/agents/b.md', raw: agent('name: reviewer\ndescription: two') },
    ]);
    const dup = found.filter((f) => f.rule === 'agent-duplicate-name');
    expect(dup).toHaveLength(1);
    expect(dup[0].severity).toBe('error');
    expect(dup[0].message).toContain('.claude/agents/a.md');
    expect(dup[0].message).toContain('.claude/agents/b.md');
  });

  it('does not flag distinct names', () => {
    const found = lintAgents([
      { file: 'a.md', raw: agent('name: reviewer\ndescription: one') },
      { file: 'b.md', raw: agent('name: planner\ndescription: two') },
    ]);
    expect(found.filter((f) => f.rule === 'agent-duplicate-name')).toEqual([]);
  });

  it('meets the issue acceptance: valid / missing-desc / duplicate together', () => {
    const found = lintAgents([
      { file: 'good.md', raw: agent('name: alpha\ndescription: fine') },
      { file: 'nodesc.md', raw: agent('name: beta') },
      { file: 'dup1.md', raw: agent('name: reviewer\ndescription: x') },
      { file: 'dup2.md', raw: agent('name: reviewer\ndescription: y') },
    ]);
    expect(found.filter((f) => f.rule === 'agent-missing-description')).toHaveLength(1);
    const dup = found.filter((f) => f.rule === 'agent-duplicate-name');
    expect(dup).toHaveLength(1);
    // 'good.md' contributes no findings
    expect(found.some((f) => f.file === 'good.md')).toBe(false);
  });
});

describe('lintAll integration', () => {
  it('surfaces agent findings alongside the other config surfaces', () => {
    const report = lintAll({
      agentFiles: [{ file: '.claude/agents/bad.md', raw: agent('name: r\nmodel: nope\ndescription: d') }],
    });
    expect(report.errors).toBe(1);
    expect(report.findings[0].rule).toBe('agent-bad-model');
  });

  it('no agentFiles → no agent findings', () => {
    expect(lintAll({}).findings.filter((f) => f.rule.startsWith('agent-'))).toEqual([]);
  });
});
