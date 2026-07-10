import { describe, it, expect } from 'vitest';
import { decodeText } from '../src/commands/pack.ts';
import {
  packFiles,
  estimateTokens,
  buildTree,
  makeIgnoreMatcher,
  type PackFile,
} from '../src/pack/pack.ts';

const FILES: PackFile[] = [
  { path: 'src/b.ts', content: 'export const b = 2;\n' },
  { path: 'src/a.ts', content: 'export const a = 1;\n' },
  { path: 'README.md', content: '# hi\n' },
];

describe('estimateTokens', () => {
  it('is 0 for empty and ~chars/4 otherwise', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('buildTree', () => {
  it('renders a sorted directory tree, dirs before files', () => {
    const tree = buildTree(['src/a.ts', 'src/b.ts', 'README.md', 'src/sub/c.ts']);
    expect(tree).toContain('src/');
    expect(tree).toContain('README.md');
    // src (dir) sorts before README (file) because dirs are listed first
    expect(tree.indexOf('src/')).toBeLessThan(tree.indexOf('README.md'));
    expect(tree).toContain('sub/');
  });
});

describe('packFiles: formats', () => {
  it('markdown: sorts files, includes tree + fenced content', () => {
    const { output } = packFiles(FILES, { format: 'md' });
    expect(output).toContain('# Repository context');
    expect(output).toContain('## Files');
    expect(output).toContain('### README.md');
    expect(output).toContain('```typescript');
    // sorted: README.md before src/a.ts before src/b.ts
    expect(output.indexOf('### README.md')).toBeLessThan(output.indexOf('### src/a.ts'));
    expect(output.indexOf('### src/a.ts')).toBeLessThan(output.indexOf('### src/b.ts'));
  });

  it('markdown: --no-tree omits the tree section', () => {
    const { output } = packFiles(FILES, { format: 'md', tree: false });
    expect(output).not.toContain('## Files');
    expect(output).toContain('## Contents');
  });

  it('xml: escapes special chars and wraps files', () => {
    const { output } = packFiles([{ path: 'a.ts', content: 'const x = a < b && c > d;\n' }], { format: 'xml' });
    expect(output).toContain('<repository>');
    expect(output).toContain('<file path="a.ts">');
    expect(output).toContain('a &lt; b &amp;&amp; c &gt; d');
    expect(output).not.toContain('a < b &&');
  });

  it('xml: escapes double quotes in a path so they cannot break out of the attribute', () => {
    const { output } = packFiles([{ path: 'weird"name.ts', content: 'x' }], { format: 'xml', tree: false });
    expect(output).toContain('<file path="weird&quot;name.ts">');
    expect(output).not.toContain('path="weird"name'); // no raw quote inside the attribute value
  });

  it('json: is valid and round-trips file content', () => {
    const { output } = packFiles(FILES, { format: 'json' });
    const parsed = JSON.parse(output);
    expect(parsed.files).toHaveLength(3);
    expect(parsed.files[0].path).toBe('README.md');
    expect(parsed.files.find((f: any) => f.path === 'src/a.ts').content).toBe('export const a = 1;\n');
  });

  it('plain: separator-delimited', () => {
    const { output } = packFiles(FILES, { format: 'plain' });
    expect(output).toContain('======== README.md ========');
  });

  it('defaults to markdown', () => {
    expect(packFiles(FILES).output).toContain('# Repository context');
  });
});

describe('packFiles: stats', () => {
  it('reports per-file bytes/tokens and totals', () => {
    const { stats } = packFiles(FILES);
    expect(stats.files).toBe(3);
    expect(stats.perFile).toHaveLength(3);
    expect(stats.perFile[0].path).toBe('README.md');
    expect(stats.bytes).toBe(FILES.reduce((n, f) => n + Buffer.byteLength(f.content), 0));
    expect(stats.tokens).toBeGreaterThan(0);
  });
});

describe('packFiles: transform (redaction hook)', () => {
  it('applies the transform to each file before bundling', () => {
    const { output } = packFiles(
      [{ path: 'env.ts', content: 'const k = "SECRET";\n' }],
      { transform: (c) => c.replace('SECRET', '[REDACTED]') },
    );
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('SECRET');
  });
});

describe('packFiles: determinism', () => {
  it('produces byte-identical output for the same inputs regardless of order', () => {
    const a = packFiles(FILES).output;
    const b = packFiles([...FILES].reverse()).output;
    expect(a).toBe(b);
  });
});

describe('makeIgnoreMatcher', () => {
  it('matches plain names anywhere in the path', () => {
    const ig = makeIgnoreMatcher(['node_modules']);
    expect(ig('node_modules/pkg/index.js')).toBe(true);
    expect(ig('src/node_modules/x.js')).toBe(true);
    expect(ig('src/app.ts')).toBe(false);
  });
  it('matches *.ext globs', () => {
    const ig = makeIgnoreMatcher(['*.log']);
    expect(ig('debug.log')).toBe(true);
    expect(ig('logs/x.log')).toBe(true);
    expect(ig('app.ts')).toBe(false);
  });
  it('honours dir/ suffix and / anchor', () => {
    const igDir = makeIgnoreMatcher(['dist/']);
    expect(igDir('dist/bundle.js')).toBe(true);
    const igAnchor = makeIgnoreMatcher(['/config']);
    expect(igAnchor('config')).toBe(true);
    expect(igAnchor('src/config')).toBe(false);
  });
  it('supports ! negation (last match wins)', () => {
    const ig = makeIgnoreMatcher(['*.log', '!keep.log']);
    expect(ig('debug.log')).toBe(true);
    expect(ig('keep.log')).toBe(false);
  });
  it('matches a middle ** across zero or more directories (gitignore(5))', () => {
    const ig = makeIgnoreMatcher(['src/**/fixtures']);
    expect(ig('src/fixtures')).toBe(true);        // zero intermediate dirs
    expect(ig('src/a/fixtures')).toBe(true);      // one
    expect(ig('src/a/b/fixtures')).toBe(true);    // two+
    expect(ig('src/fixtures/data.json')).toBe(true);
    expect(ig('other/fixtures')).toBe(false);     // must start at src/
  });
  it('matches leading **/ in any directory and trailing /** for everything below', () => {
    const lead = makeIgnoreMatcher(['**/node_modules']);
    expect(lead('node_modules')).toBe(true);
    expect(lead('a/b/node_modules/x.js')).toBe(true);
    const trail = makeIgnoreMatcher(['build/**']);
    expect(trail('build/x/y.js')).toBe(true);
    expect(trail('build/x')).toBe(true);
    expect(trail('src/build.ts')).toBe(false);
  });
  it('treats non-segment consecutive stars as regular stars within a segment', () => {
    const ig = makeIgnoreMatcher(['a**b']);
    expect(ig('axxb')).toBe(true);   // stays within one segment
    expect(ig('a/b')).toBe(false);   // does NOT cross a slash
  });
  it('cannot re-include a file whose parent directory is excluded (gitignore(5))', () => {
    // git: `git check-ignore build/keep.txt` → still ignored; the negation has no effect
    const ig = makeIgnoreMatcher(['build/', '!build/keep.txt']);
    expect(ig('build/keep.txt')).toBe(true);
    expect(ig('build/other.js')).toBe(true);
    // but a negation DOES work when the parent dir itself isn't excluded
    const ig2 = makeIgnoreMatcher(['*.log', '!keep.log']);
    expect(ig2('keep.log')).toBe(false);
    // and re-including the dir first, then the file, works (parent not excluded)
    const ig3 = makeIgnoreMatcher(['dist/*', '!dist/README.md']);
    expect(ig3('dist/bundle.js')).toBe(true);
    expect(ig3('dist/README.md')).toBe(false); // dist/ itself not excluded, only its contents
  });
});

describe('decodeText: BOM-aware text decoding (#10)', () => {
  it('decodes UTF-16LE files instead of dropping them as binary', () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hello utf16', 'utf16le')]);
    expect(decodeText(buf)).toBe('hello utf16');
  });

  it('decodes UTF-16BE files', () => {
    const le = Buffer.from('big endian', 'utf16le');
    const be = Buffer.from(le).swap16();
    const buf = Buffer.concat([Buffer.from([0xfe, 0xff]), be]);
    expect(decodeText(buf)).toBe('big endian');
  });

  it('strips a UTF-8 BOM instead of leaking it into content', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('no bom here', 'utf8')]);
    expect(decodeText(buf)).toBe('no bom here');
  });

  it('still rejects genuinely-binary content (NUL, no BOM)', () => {
    expect(decodeText(Buffer.from([0x50, 0x4b, 0x00, 0x01, 0x02]))).toBeNull();
  });

  it('passes plain UTF-8 through unchanged', () => {
    expect(decodeText(Buffer.from('plain text', 'utf8'))).toBe('plain text');
  });

  it('rejects a truncated (odd-length) UTF-16 body as binary', () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from([0x41])]);
    expect(decodeText(buf)).toBeNull();
  });
});
