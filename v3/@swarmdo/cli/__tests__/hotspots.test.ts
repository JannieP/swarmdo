import { describe, it, expect } from 'vitest';
import { parseGitLog, computeHotspots, formatHotspots, hotspotsToCsv, resolveRenamePath } from '../src/hotspots/hotspots.ts';

const SOH = '\x01';
const US = '\x1f';
const h = (hash: string, author: string, iso: string) => `${SOH}${hash}${US}${author}${US}${iso}`;

// A small synthetic history:
//   hot.ts    — 3 commits, 3 authors, heavy churn, edited "today"
//   warm.ts   — 2 commits, 1 author, medium churn
//   cold.ts   — 1 commit, 1 author, tiny churn, old
const NOW = Date.parse('2026-07-07T00:00:00Z');
const LOG = [
  h('c1', 'alice', '2026-07-06T10:00:00Z'),
  '40\t10\thot.ts',
  '5\t0\twarm.ts',
  h('c2', 'bob', '2026-07-05T10:00:00Z'),
  '30\t20\thot.ts',
  '-\t-\timage.png', // binary → 0 churn
  h('c3', 'carol', '2026-07-04T10:00:00Z'),
  '12\t3\thot.ts',
  '8\t2\twarm.ts',
  h('c4', 'alice', '2026-01-01T10:00:00Z'),
  '1\t1\tcold.ts',
].join('\n');

describe('parseGitLog', () => {
  const commits = parseGitLog(LOG);
  it('parses commit headers and numstat lines', () => {
    expect(commits).toHaveLength(4);
    expect(commits[0]).toMatchObject({ hash: 'c1', author: 'alice' });
    expect(commits[0].files).toEqual([
      { path: 'hot.ts', added: 40, deleted: 10 },
      { path: 'warm.ts', added: 5, deleted: 0 },
    ]);
  });
  it('treats binary (-) numstat as zero churn', () => {
    const bin = commits[1].files.find((f) => f.path === 'image.png')!;
    expect(bin).toEqual({ path: 'image.png', added: 0, deleted: 0 });
  });
  it('parses ISO author dates to epoch ms', () => {
    expect(commits[0].date).toBe(Date.parse('2026-07-06T10:00:00Z'));
  });
});

describe('resolveRenamePath', () => {
  it('passes plain paths through unchanged', () => {
    expect(resolveRenamePath('src/hotspots/hotspots.ts')).toBe('src/hotspots/hotspots.ts');
  });
  it('resolves the compact braces form to the new path', () => {
    // git: file moved from .claude/commands/agents/README.md → .claude/commands/sDo/agents/README.md
    expect(resolveRenamePath('.claude/commands/{ => sDo}/agents/README.md')).toBe('.claude/commands/sDo/agents/README.md');
    expect(resolveRenamePath('src/{old => new}/file.ts')).toBe('src/new/file.ts');
  });
  it('resolves a braces form with an empty new side (collapsing the double slash)', () => {
    // dir/old/f.ts → dir/f.ts
    expect(resolveRenamePath('dir/{old => }/f.ts')).toBe('dir/f.ts');
  });
  it('resolves the full-path form (no shared prefix/suffix) to the new path', () => {
    expect(resolveRenamePath('old/path.ts => new/other/path.ts')).toBe('new/other/path.ts');
  });
});

describe('parseGitLog rename handling', () => {
  it('attributes a rename commit to the file\'s current path, not a phantom', () => {
    // git log walks newest→oldest: the rename commit (r2) reports the braces
    // form; a later edit (r1) reports the plain new path. Both must fold into
    // one entry at the current path — no garbage `src/{old => new}/mod.ts`.
    const log = [
      h('r1', 'alice', '2026-07-06T10:00:00Z'),
      '3\t0\tsrc/new/mod.ts',
      h('r2', 'bob', '2026-07-05T10:00:00Z'),
      '4\t1\tsrc/{old => new}/mod.ts', // the rename commit (rename + edit)
    ].join('\n');
    const spots = computeHotspots(parseGitLog(log), NOW);
    // Old naive parser produced the phantom path and split the file in two.
    expect(spots.map((s) => s.path)).not.toContain('src/{old => new}/mod.ts');
    const mod = spots.find((s) => s.path === 'src/new/mod.ts')!;
    expect(mod).toBeDefined();
    expect(mod.commits).toBe(2); // edit + rename commit, one file
    expect(mod.churn).toBe(3 + 0 + 4 + 1);
    expect(mod.authors).toBe(2);
  });
  it('resolves the full-path rename form and binary renames in a real numstat mix', () => {
    const log = [
      h('m1', 'dev', '2026-07-06T10:00:00Z'),
      '0\t0\told/logo.png => assets/logo.png', // full-form binary rename (0/0)
      '2\t2\tsrc/a.ts',
    ].join('\n');
    const spots = computeHotspots(parseGitLog(log), NOW);
    const paths = spots.map((s) => s.path).sort();
    expect(paths).toEqual(['assets/logo.png', 'src/a.ts']);
    expect(paths).not.toContain('old/logo.png => assets/logo.png');
  });
});

describe('computeHotspots', () => {
  const spots = computeHotspots(parseGitLog(LOG), NOW);
  it('aggregates commits / churn / authors per file', () => {
    const hot = spots.find((s) => s.path === 'hot.ts')!;
    expect(hot.commits).toBe(3);
    expect(hot.churn).toBe(40 + 10 + 30 + 20 + 12 + 3);
    expect(hot.authors).toBe(3);
    expect(hot.lastTouched).toBe(Date.parse('2026-07-06T10:00:00Z'));
  });
  it('folds commits by author name — one person = one author (the command feeds %aN/mailmap-resolved names)', () => {
    // The command captures `%aN` (mailmap-resolved), so name variants of one
    // person arrive already-canonical; the engine counts distinct names.
    const log = [
      h('m1', 'Jan Pieterse', '2026-07-06T10:00:00Z'), '5\t1\tf.ts',
      h('m2', 'Jan Pieterse', '2026-07-05T10:00:00Z'), '2\t0\tf.ts',
      h('m3', 'Jan Pieterse', '2026-07-04T10:00:00Z'), '1\t0\tf.ts',
    ].join('\n');
    const f = computeHotspots(parseGitLog(log), NOW).find((s) => s.path === 'f.ts')!;
    expect(f.commits).toBe(3);
    expect(f.authors).toBe(1); // was 3 pre-mailmap when names were "Jan P"/"jan-p"/"J. Pieterse"
  });
  it('ranks the high-churn/multi-author/recent file first', () => {
    expect(spots[0].path).toBe('hot.ts');
    // cold.ts (old, single commit) must rank below warm.ts
    const warmIdx = spots.findIndex((s) => s.path === 'warm.ts');
    const coldIdx = spots.findIndex((s) => s.path === 'cold.ts');
    expect(warmIdx).toBeLessThan(coldIdx);
  });
  it('risk is a positive, deterministic number and decays with age', () => {
    const hot = spots.find((s) => s.path === 'hot.ts')!;
    const cold = spots.find((s) => s.path === 'cold.ts')!;
    expect(hot.risk).toBeGreaterThan(0);
    expect(hot.risk).toBeGreaterThan(cold.risk);
    // determinism: same inputs → same score
    expect(computeHotspots(parseGitLog(LOG), NOW)[0].risk).toBe(spots[0].risk);
  });

  it('minCommits filters out one-off files', () => {
    const spots2 = computeHotspots(parseGitLog(LOG), NOW, { minCommits: 2 });
    expect(spots2.find((s) => s.path === 'cold.ts')).toBeUndefined();
    expect(spots2.find((s) => s.path === 'image.png')).toBeUndefined();
    expect(spots2.map((s) => s.path).sort()).toEqual(['hot.ts', 'warm.ts']);
  });

  it('honors sort key and top', () => {
    const byChurn = computeHotspots(parseGitLog(LOG), NOW, { by: 'churn', top: 1 });
    expect(byChurn).toHaveLength(1);
    expect(byChurn[0].path).toBe('hot.ts'); // highest churn
  });

  it('sorts ties by path for stability', () => {
    const twoWay = [h('x', 'a', '2026-07-06T00:00:00Z'), '1\t0\tb.ts', '1\t0\ta.ts'].join('\n');
    const s = computeHotspots(parseGitLog(twoWay), NOW, { by: 'commits' });
    expect(s.map((x) => x.path)).toEqual(['a.ts', 'b.ts']); // identical stats → path asc
  });
});

describe('formatHotspots', () => {
  it('renders a ranked table with a header', () => {
    const out = formatHotspots(computeHotspots(parseGitLog(LOG), NOW), NOW);
    expect(out).toContain('rank');
    expect(out).toContain('hot.ts');
    expect(out.split('\n')[1]).toContain('hot.ts'); // first data row is the top hotspot
  });
  it('handles an empty history', () => {
    expect(formatHotspots([], NOW)).toContain('no hotspots');
  });
});

describe('hotspots: hotspotsToCsv', () => {
  it('exports headers + rows with ISO dates, quoting paths with commas', () => {
    const spots = [
      { path: 'src/a.ts', commits: 5, churn: 100, authors: 2, firstTouched: Date.parse('2026-01-15T00:00:00Z'), lastTouched: Date.parse('2026-07-03T12:00:00Z'), risk: 42.5 },
      { path: 'src/b,c.ts', commits: 1, churn: 0, authors: 1, firstTouched: 0, lastTouched: 0, risk: 0 },
    ];
    const lines = hotspotsToCsv(spots).split('\n');
    expect(lines[0]).toBe('path,risk,commits,churn,authors,firstTouched,lastTouched');
    expect(lines[1]).toBe('src/a.ts,42.5,5,100,2,2026-01-15,2026-07-03');
    // comma in path → quoted; zero epochs → empty date fields
    expect(lines[2]).toBe('"src/b,c.ts",0,1,0,1,,');
  });
  it('emits just the header for an empty ranking', () => {
    expect(hotspotsToCsv([])).toBe('path,risk,commits,churn,authors,firstTouched,lastTouched');
  });
});
