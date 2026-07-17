/**
 * Every shipped agent definition and skill must have parseable YAML frontmatter.
 *
 * Three files did not. All failed the same way: `description:` held a long
 * unquoted scalar that later contained `": "` — typically the
 * `Examples: <example>Context: …` pattern — which YAML reads as a nested
 * mapping ("Nested mappings are not allowed in compact mappings"). Quoting the
 * value fixes it.
 *
 * Two of the three were invisible to `swarmdo config lint`, which collected
 * `.claude/agents` with a FLAT readdir while walking `.claude/commands`
 * recursively three lines below. Claude Code discovers agents recursively, so
 * every nested agent — `.claude/agents/goal/code-goal-planner.md` among them,
 * a live agent — went unlinted. That is fixed in commands/config.ts; this test
 * is the independent check that does not route through the linter's own
 * collection logic, so a future blind spot there cannot hide a broken file here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');

/** Recursively collect agent definitions + SKILL.md under a root. */
function collect(rel: string): string[] {
  const abs = join(REPO_ROOT, rel);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (dir: string, relDir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const childAbs = join(dir, e.name);
      const childRel = `${relDir}/${e.name}`;
      if (e.isDirectory()) {
        if (/node_modules|archive|dist/.test(childRel)) continue;
        walk(childAbs, childRel);
      } else if (e.name.endsWith('.md') && (childRel.includes('/agents/') || e.name === 'SKILL.md')) {
        out.push(childRel);
      }
    }
  };
  walk(abs, rel);
  return out;
}

const FILES = [
  ...collect('.claude'),
  ...collect('plugins'),
  ...collect('v3/@swarmdo/cli/.claude'),
];

describe('shipped agent + skill frontmatter', () => {
  it('finds files to check (guards against the glob silently matching nothing)', () => {
    // Without this, a broken collector would make every assertion below vacuous
    // — the same failure mode that let the linter's flat readdir hide 2 of 3.
    expect(FILES.length).toBeGreaterThan(100);
  });

  it('every frontmatter block parses as YAML', () => {
    const broken: string[] = [];
    for (const rel of FILES) {
      const raw = readFileSync(join(REPO_ROOT, rel), 'utf-8');
      const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!m) continue; // no frontmatter is a separate concern
      try {
        parseYaml(m[1]);
      } catch (e) {
        broken.push(`${rel}: ${String((e as Error).message).split('\n')[0]}`);
      }
    }
    expect(broken, `malformed frontmatter:\n${broken.join('\n')}`).toEqual([]);
  });

  it('a description containing ": " is quoted so it round-trips', () => {
    // The exact shape that broke all three files.
    for (const rel of FILES) {
      const raw = readFileSync(join(REPO_ROOT, rel), 'utf-8');
      const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!m) continue;
      let fm: Record<string, unknown>;
      try { fm = parseYaml(m[1]) ?? {}; } catch { continue; } // covered above
      const d = fm.description;
      if (typeof d !== 'string') continue;
      expect(d.length, `${rel} has an empty description`).toBeGreaterThan(0);
    }
  });
});
