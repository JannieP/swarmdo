import { describe, it, expect } from 'vitest';
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
});
