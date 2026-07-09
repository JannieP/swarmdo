import { describe, it, expect } from 'vitest';
import { extractEnvRefs, parseDotenv, reconcile, formatEnvSummary } from '../src/env/env.ts';

describe('extractEnvRefs', () => {
  it('captures Node, Vite, Deno and Python access forms', () => {
    const src = [
      'const a = process.env.API_KEY;',
      "const b = process.env['DATABASE_URL'];",
      'const c = import.meta.env.VITE_TITLE;',
      "const d = Deno.env.get('PORT');",
      "x = os.environ['SECRET']",
      "y = os.environ.get('REGION')",
      "z = os.getenv('TIMEOUT')",
      'const nope = config.value;',
    ].join('\n');
    const keys = extractEnvRefs(src, 'f.ts').map((r) => r.key).sort();
    expect(keys).toEqual(['API_KEY', 'DATABASE_URL', 'PORT', 'REGION', 'SECRET', 'TIMEOUT', 'VITE_TITLE']);
  });

  it('records 1-based line numbers', () => {
    const refs = extractEnvRefs('\n\nconst x = process.env.FOO;', 'f.ts');
    expect(refs[0]).toMatchObject({ key: 'FOO', line: 3 });
  });

  it('skips Vite builtins (MODE/PROD/DEV/…)', () => {
    const refs = extractEnvRefs('if (import.meta.env.PROD) {} const t = import.meta.env.VITE_X;', 'f.ts');
    expect(refs.map((r) => r.key)).toEqual(['VITE_X']);
  });
});

describe('parseDotenv', () => {
  it('parses keys, ignoring comments/blanks/export/quotes', () => {
    const env = [
      '# a comment',
      '',
      'API_KEY=abc123',
      'export DATABASE_URL="postgres://x"',
      "PORT='3000'",
      'MALFORMED LINE',
      'API_KEY=dupe',
    ].join('\n');
    expect(parseDotenv(env)).toEqual(['API_KEY', 'DATABASE_URL', 'PORT']);
  });
  it('parses dotted/hyphenated keys and the `: ` separator (dotenv grammar)', () => {
    const env = ['APP.NAME=x', 'feature-flag=on', 'COLON_KEY: value', 'export SVC.URL=y'].join('\n');
    expect(parseDotenv(env)).toEqual(['APP.NAME', 'feature-flag', 'COLON_KEY', 'SVC.URL']);
  });
  it('does not mis-parse a URL value or a YAML list item as a key', () => {
    expect(parseDotenv('- item')).toEqual([]);       // no separator
    expect(parseDotenv('KEY=http://x.com/a')).toEqual(['KEY']); // value with a colon
  });
});

describe('reconcile', () => {
  const refs = [
    { key: 'API_KEY', file: 'a.ts', line: 1 },
    { key: 'PORT', file: 'a.ts', line: 2 },
    { key: 'PORT', file: 'b.ts', line: 5 },
  ];

  it('flags missing (in code, not in .env)', () => {
    const r = reconcile({ refs, declared: ['API_KEY'] });
    expect(r.missing).toEqual(['PORT']);
  });

  it('flags unused (in .env, not in code)', () => {
    const r = reconcile({ refs, declared: ['API_KEY', 'PORT', 'LEGACY_FLAG'] });
    expect(r.unused).toEqual(['LEGACY_FLAG']);
    expect(r.missing).toEqual([]);
  });

  it('flags undocumented (in .env, not in .env.example)', () => {
    const r = reconcile({ refs, declared: ['API_KEY', 'PORT', 'SECRET'], example: ['API_KEY', 'PORT'] });
    expect(r.undocumented).toEqual(['SECRET']);
  });

  it('no undocumented bucket without an example', () => {
    const r = reconcile({ refs, declared: ['API_KEY', 'PORT'] });
    expect(r.undocumented).toEqual([]);
  });

  it('honours ignore list in every bucket', () => {
    const r = reconcile({
      refs: [...refs, { key: 'NODE_ENV', file: 'a.ts', line: 9 }],
      declared: ['API_KEY', 'PORT', 'NODE_ENV'],
      ignore: ['NODE_ENV'],
    });
    expect(r.missing).toEqual([]);
    expect(r.unused).toEqual([]);
    expect(Object.keys(r.refs)).not.toContain('NODE_ENV');
  });

  it('groups refs by key with all sites', () => {
    const r = reconcile({ refs, declared: [] });
    expect(r.refs.PORT).toHaveLength(2);
    expect(r.refs.PORT.map((x) => x.file)).toEqual(['a.ts', 'b.ts']);
  });
});

describe('formatEnvSummary', () => {
  it('omits undocumented when no example', () => {
    const r = reconcile({ refs: [], declared: ['X'] });
    expect(formatEnvSummary(r, false)).toBe('env: 0 missing, 1 unused');
  });
  it('includes undocumented with example', () => {
    const r = reconcile({ refs: [{ key: 'A', file: 'f', line: 1 }], declared: ['B'], example: [] });
    expect(formatEnvSummary(r, true)).toBe('env: 1 missing, 1 unused, 1 undocumented');
  });
});
