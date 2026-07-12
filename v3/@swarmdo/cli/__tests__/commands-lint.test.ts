import { describe, it, expect } from 'vitest';
import { lintCommandFile, lintCommandFiles, EFFORT_LEVELS } from '../src/config-lint/commands-lint.ts';
import { lintAll } from '../src/config-lint/lint.ts';

const rules = (fs: { rule: string }[]) => fs.map((x) => x.rule);

describe('commands-lint: issue #99 acceptance', () => {
  it('inert bash-injection (! after a non-whitespace char) → exactly one warn', () => {
    const raw = '---\ndescription: Deploy\n---\nRef: KEY=!`git rev-parse HEAD`\n';
    const findings = lintCommandFile('.claude/commands/deploy.md', raw);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: 'command-inert-bash-injection', severity: 'warn' });
    expect(findings[0].message).toContain('git rev-parse HEAD');
  });

  it('active injection not covered by allowed-tools → exactly one warn', () => {
    const raw = '---\ndescription: Deploy\nallowed-tools: Read\n---\nSummarize !`gh pr diff`\n';
    const findings = lintCommandFile('.claude/commands/deploy.md', raw);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: 'command-uncovered-bash-injection', severity: 'warn' });
  });

  it('bad effort enum → exactly one error listing the valid set', () => {
    const raw = '---\ndescription: Deploy\neffort: ultra\n---\nDo the thing\n';
    const findings = lintCommandFile('.claude/commands/deploy.md', raw);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: 'command-bad-effort', severity: 'error' });
    expect(findings[0].message).toContain(EFFORT_LEVELS.join(', '));
  });

  it('a clean command → no findings', () => {
    const raw = '---\ndescription: Deploy\nallowed-tools: Bash(gh *)\n---\nSummarize !`gh pr diff`\n';
    expect(lintCommandFile('.claude/commands/deploy.md', raw)).toEqual([]);
  });
});

describe('commands-lint: frontmatter', () => {
  it('flags a malformed frontmatter block (unclosed fence, bad YAML, non-mapping)', () => {
    expect(rules(lintCommandFile('c.md', '---\ndescription: x\nno closing fence'))).toContain('command-malformed-frontmatter');
    expect(rules(lintCommandFile('c.md', '---\n\tbad: 1\n---\nbody'))).toContain('command-malformed-frontmatter'); // tab indent = YAML error
    expect(rules(lintCommandFile('c.md', '---\n- a\n- b\n---\nbody'))).toContain('command-malformed-frontmatter'); // a list, not a mapping
  });

  it('a plain-markdown command (no frontmatter) is valid; body checks still run', () => {
    expect(lintCommandFile('c.md', 'Just a prompt, no frontmatter.\n')).toEqual([]);
    const inert = lintCommandFile('c.md', 'Ref: x=!`date`\n');
    expect(rules(inert)).toEqual(['command-inert-bash-injection']);
  });

  it('warns on a command with frontmatter but no description — not on a frontmatter-less one', () => {
    expect(rules(lintCommandFile('c.md', '---\nallowed-tools: Read\n---\nbody\n'))).toContain('command-missing-description');
    expect(rules(lintCommandFile('c.md', 'plain body\n'))).not.toContain('command-missing-description');
  });
});

describe('commands-lint: body bash-injection', () => {
  it('recognizes ! at line start or after whitespace as active, else inert', () => {
    // active (line start / after space) + no allowed-tools → no coverage finding
    expect(rules(lintCommandFile('c.md', '!`ls`\n'))).toEqual([]);
    expect(rules(lintCommandFile('c.md', 'run !`ls`\n'))).toEqual([]);
    // after a non-whitespace char → inert
    expect(rules(lintCommandFile('c.md', 'x=!`ls`\n'))).toEqual(['command-inert-bash-injection']);
  });

  it('bare Bash and Bash(glob) cover an active injection; Read does not', () => {
    const mk = (at: string) => `---\ndescription: d\nallowed-tools: ${at}\n---\nGo !\`gh pr diff\`\n`;
    expect(rules(lintCommandFile('c.md', mk('Bash')))).not.toContain('command-uncovered-bash-injection');
    expect(rules(lintCommandFile('c.md', mk('Bash(gh *)')))).not.toContain('command-uncovered-bash-injection');
    expect(rules(lintCommandFile('c.md', mk('Read')))).toContain('command-uncovered-bash-injection');
  });

  it('does not enum-check model (aliases + full IDs both valid)', () => {
    expect(rules(lintCommandFile('c.md', '---\ndescription: d\nmodel: opusplan\n---\nbody\n'))).not.toContain('command-bad-model');
  });
});

describe('commands-lint: skills', () => {
  it('requires frontmatter with a name; a well-formed skill is clean', () => {
    expect(rules(lintCommandFile('s/SKILL.md', 'body only\n', 'skill'))).toContain('skill-missing-frontmatter');
    expect(rules(lintCommandFile('s/SKILL.md', '---\ndescription: d\n---\nbody\n', 'skill'))).toContain('skill-missing-name');
    expect(lintCommandFile('s/SKILL.md', '---\nname: my-skill\ndescription: d\n---\nbody\n', 'skill')).toEqual([]);
  });
});

describe('commands-lint: wiring', () => {
  it('lintCommandFiles runs command + skill kinds', () => {
    const found = lintCommandFiles(
      [{ file: 'c.md', raw: '---\ndescription: d\neffort: nope\n---\nx\n' }],
      [{ file: 's/SKILL.md', raw: 'no frontmatter\n' }],
    );
    expect(rules(found)).toEqual(expect.arrayContaining(['command-bad-effort', 'skill-missing-frontmatter']));
  });

  it('lintAll surfaces commandFiles findings and counts them', () => {
    const r = lintAll({ commandFiles: [{ file: 'c.md', raw: '---\ndescription: d\neffort: nope\n---\nx\n' }] });
    expect(rules(r.findings)).toContain('command-bad-effort');
    expect(r.errors).toBeGreaterThan(0);
  });
});
