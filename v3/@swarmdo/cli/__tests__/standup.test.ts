import { describe, it, expect } from 'vitest';
import {
  daysToLastWorkingDay,
  sinceLastWorkingDay,
  parseStandupLog,
  dayKey,
  groupByDay,
  weekdayOf,
  formatStandup,
  type StandupCommit,
} from '../src/standup/standup.ts';

const SOH = '\x01';
const US = '\x1f';
const h = (hash: string, author: string, iso: string, subject: string) =>
  `${SOH}${hash}${US}${author}${US}${iso}${US}${subject}`;

describe('daysToLastWorkingDay', () => {
  it('is weekend-aware: Monday→Friday (3), Sunday→Friday (2), else yesterday (1)', () => {
    expect(daysToLastWorkingDay(0)).toBe(2); // Sunday
    expect(daysToLastWorkingDay(1)).toBe(3); // Monday
    expect(daysToLastWorkingDay(2)).toBe(1); // Tuesday
    expect(daysToLastWorkingDay(3)).toBe(1); // Wednesday
    expect(daysToLastWorkingDay(4)).toBe(1); // Thursday
    expect(daysToLastWorkingDay(5)).toBe(1); // Friday
    expect(daysToLastWorkingDay(6)).toBe(1); // Saturday
  });
  it('normalizes out-of-range day numbers into 0..6', () => {
    expect(daysToLastWorkingDay(7)).toBe(2); // 7 % 7 = 0 → Sunday
    expect(daysToLastWorkingDay(8)).toBe(3); // 8 % 7 = 1 → Monday
    expect(daysToLastWorkingDay(-6)).toBe(3); // → Monday
    expect(daysToLastWorkingDay(-7)).toBe(2); // → Sunday
  });
});

describe('sinceLastWorkingDay', () => {
  it('reads the LOCAL day-of-week off the reference date (whole-week sweep)', () => {
    // Iterate a full week and compute the expected value from the ACTUAL
    // getDay() — calendar-agnostic and timezone-agnostic (local construction).
    for (let i = 0; i < 7; i++) {
      const d = new Date(2026, 0, 4 + i); // Jan 4–10 2026, local midnight
      const dow = d.getDay();
      const expected = dow === 1 ? 3 : dow === 0 ? 2 : 1;
      expect(sinceLastWorkingDay(d).sinceDays).toBe(expected);
    }
  });
});

describe('parseStandupLog', () => {
  const LOG = [
    h('c1', 'alice', '2026-07-06T10:00:00Z', 'feat: add the thing'),
    '40\t10\tsrc/a.ts',
    '5\t0\tsrc/b.ts',
    '-\t-\tassets/logo.png', // binary → 0 churn but still counts as a file
    h('c2', 'bob', '2026-07-05T09:30:00Z', 'fix: subject with = and : chars'),
    '3\t3\tsrc/{old => new}/c.ts', // rename → resolves to new path
  ].join('\n');
  const commits = parseStandupLog(LOG);

  it('captures hash, author, subject, and sums the diffstat', () => {
    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({
      hash: 'c1',
      author: 'alice',
      subject: 'feat: add the thing',
      added: 45,
      deleted: 10,
      files: 3,
    });
  });
  it('parses ISO author dates to epoch ms', () => {
    expect(commits[0].date).toBe(Date.parse('2026-07-06T10:00:00Z'));
  });
  it('keeps subjects that contain the field-separator-adjacent chars', () => {
    expect(commits[1].subject).toBe('fix: subject with = and : chars');
    expect(commits[1]).toMatchObject({ added: 3, deleted: 3, files: 1 });
  });
  it('ignores stray numstat lines before any commit header', () => {
    expect(parseStandupLog('7\t2\torphan.ts\n')).toEqual([]);
  });
});

describe('dayKey', () => {
  it('formats a local YYYY-MM-DD that round-trips with local-constructed dates', () => {
    const ms = new Date(2026, 6, 13, 10, 30).getTime(); // local July 13 2026
    expect(dayKey(ms)).toBe('2026-07-13');
  });
  it('zero-pads month and day', () => {
    expect(dayKey(new Date(2026, 0, 5, 1, 0).getTime())).toBe('2026-01-05');
  });
});

describe('groupByDay', () => {
  const mk = (hash: string, dt: Date, subject: string, added = 1, deleted = 0): StandupCommit => ({
    hash,
    author: 'me',
    date: dt.getTime(),
    subject,
    added,
    deleted,
    files: 1,
  });
  const commits = [
    mk('a', new Date(2026, 6, 13, 9, 0), 'early monday', 10, 2),
    mk('b', new Date(2026, 6, 13, 17, 0), 'late monday', 4, 1),
    mk('c', new Date(2026, 6, 12, 12, 0), 'sunday work', 3, 3),
  ];
  const buckets = groupByDay(commits);

  it('produces one bucket per local day, newest day first', () => {
    expect(buckets.map((b) => b.day)).toEqual(['2026-07-13', '2026-07-12']);
  });
  it('orders commits newest-first within a day', () => {
    expect(buckets[0].commits.map((c) => c.hash)).toEqual(['b', 'a']);
  });
  it('accumulates per-day diffstat totals', () => {
    expect(buckets[0]).toMatchObject({ added: 14, deleted: 3, files: 2 });
    expect(buckets[1]).toMatchObject({ added: 3, deleted: 3, files: 1 });
  });
  it('returns [] for no commits', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('weekdayOf', () => {
  it('names the weekday for a day key', () => {
    // 2026-07-13 constructed locally has a deterministic getDay().
    const expected = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
      new Date(2026, 6, 13).getDay()
    ];
    expect(weekdayOf('2026-07-13')).toBe(expected);
  });
  it('returns empty string for an unparseable key', () => {
    expect(weekdayOf('not-a-date')).toBe('');
  });
});

describe('formatStandup', () => {
  it('renders day headings, commit subjects, and a totals footer', () => {
    // Local-constructed dates so both commits land on the same LOCAL day in
    // every timezone (UTC ISO strings would split across days near midnight).
    const c = (hash: string, dt: Date, subject: string): StandupCommit => ({
      hash,
      author: 'me',
      date: dt.getTime(),
      subject,
      added: 5,
      deleted: 1,
      files: 1,
    });
    const buckets = groupByDay([
      c('c1', new Date(2026, 6, 13, 9, 0), 'first'),
      c('c2', new Date(2026, 6, 13, 17, 0), 'second'),
    ]);
    const out = formatStandup(buckets);
    expect(out).toContain('first');
    expect(out).toContain('second');
    expect(out).toMatch(/across 1 day$/);
    expect(out).toContain('2 commits');
  });
  it('reports nothing for empty input', () => {
    expect(formatStandup([])).toBe('no commits in the window — nothing to report');
  });
});
