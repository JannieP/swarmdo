/**
 * pack.ts — bundle a repo (or a subset) into one AI-friendly context blob.
 *
 * swarmdo has no context-assembly primitive: `codegraph` indexes symbols for
 * *querying* and `compact` de-noises a *stream*, but neither emits promptable
 * source for *feeding a model*. `pack` walks the tree (respecting default skips
 * + a minimal .gitignore + glob include/exclude), and writes a bundle in
 * markdown / xml / json / plain with a directory tree and per-file + total
 * token estimates. Deterministic — same inputs, byte-identical output.
 *
 * Pure engine: the fs walk is injected as a file list + reader by the caller
 * (../commands/pack.ts), so this module has no fs dependency and is trivially
 * testable. Optional secret redaction reuses ../redact/redact.ts.
 */

export type PackFormat = 'md' | 'xml' | 'json' | 'plain';

export interface PackFile {
  /** repo-relative path, POSIX separators */
  path: string;
  content: string;
}

export interface PackOptions {
  format?: PackFormat;
  /** include a directory tree at the top (default true) */
  tree?: boolean;
  /** optional per-file transform (e.g. secret redaction) applied before bundling */
  transform?: (content: string, path: string) => string;
}

export interface PackFileStat {
  path: string;
  bytes: number;
  tokens: number;
}

export interface PackResult {
  output: string;
  stats: {
    files: number;
    bytes: number;
    tokens: number;
    perFile: PackFileStat[];
  };
}

/**
 * Cheap, deterministic token estimate (~4 chars/token, the widely-used rule of
 * thumb for English + code). Not a real BPE tokenizer — good enough for budget
 * warnings, and dependency-free.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Build an ASCII directory tree from a sorted file list. */
export function buildTree(paths: string[]): string {
  const root: Record<string, unknown> = {};
  for (const p of [...paths].sort()) {
    const parts = p.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (isFile) {
        if (!node['\0files']) node['\0files'] = [];
        (node['\0files'] as string[]).push(part);
      } else {
        node[part] = (node[part] as Record<string, unknown>) ?? {};
        node = node[part] as Record<string, unknown>;
      }
    }
  }
  const lines: string[] = [];
  const walk = (node: Record<string, unknown>, prefix: string) => {
    const dirs = Object.keys(node).filter((k) => k !== '\0files').sort();
    const files = ((node['\0files'] as string[]) ?? []).sort();
    const entries = [...dirs.map((d) => ['dir', d] as const), ...files.map((f) => ['file', f] as const)];
    entries.forEach(([kind, name], i) => {
      const last = i === entries.length - 1;
      lines.push(`${prefix}${last ? '└── ' : '├── '}${name}${kind === 'dir' ? '/' : ''}`);
      if (kind === 'dir') walk(node[name] as Record<string, unknown>, prefix + (last ? '    ' : '│   '));
    });
  };
  walk(root, '');
  return lines.join('\n');
}

/** Pick a fenced-code language hint from a file extension. */
function langOf(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
    json: 'json', md: 'markdown', py: 'python', rs: 'rust', go: 'go', sh: 'bash', yml: 'yaml', yaml: 'yaml',
    html: 'html', css: 'css', sql: 'sql', toml: 'toml',
  };
  return map[ext] ?? '';
}

function renderMarkdown(files: PackFile[], opts: PackOptions): string {
  const parts: string[] = ['# Repository context', ''];
  if (opts.tree !== false) {
    parts.push('## Files', '', '```', buildTree(files.map((f) => f.path)), '```', '');
  }
  parts.push('## Contents', '');
  for (const f of files) {
    const lang = langOf(f.path);
    parts.push(`### ${f.path}`, '', '```' + lang, f.content.replace(/\n$/, ''), '```', '');
  }
  return parts.join('\n');
}

function escapeXml(s: string): string {
  // All five predefined XML entities — the quote escapes matter because this
  // value is also interpolated into a double-quoted `path="…"` attribute, where
  // an unescaped `"` in a file path would break out of the attribute.
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderXml(files: PackFile[], opts: PackOptions): string {
  const parts: string[] = ['<repository>'];
  if (opts.tree !== false) {
    parts.push('  <tree>', escapeXml(buildTree(files.map((f) => f.path))), '  </tree>');
  }
  parts.push('  <files>');
  for (const f of files) {
    parts.push(`    <file path="${escapeXml(f.path)}">`, escapeXml(f.content.replace(/\n$/, '')), '    </file>');
  }
  parts.push('  </files>', '</repository>');
  return parts.join('\n');
}

function renderJson(files: PackFile[]): string {
  return JSON.stringify({ files: files.map((f) => ({ path: f.path, content: f.content })) }, null, 2);
}

function renderPlain(files: PackFile[]): string {
  const parts: string[] = [];
  for (const f of files) {
    parts.push('='.repeat(8) + ' ' + f.path + ' ' + '='.repeat(8), f.content.replace(/\n$/, ''), '');
  }
  return parts.join('\n');
}

/** Bundle files into a single context blob per `format`. */
export function packFiles(input: PackFile[], opts: PackOptions = {}): PackResult {
  const files = input
    .map((f) => ({ path: f.path, content: opts.transform ? opts.transform(f.content, f.path) : f.content }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const format = opts.format ?? 'md';
  let output: string;
  switch (format) {
    case 'xml': output = renderXml(files, opts); break;
    case 'json': output = renderJson(files); break;
    case 'plain': output = renderPlain(files); break;
    default: output = renderMarkdown(files, opts);
  }

  const perFile: PackFileStat[] = files.map((f) => ({
    path: f.path,
    bytes: Buffer.byteLength(f.content, 'utf8'),
    tokens: estimateTokens(f.content),
  }));
  return {
    output,
    stats: {
      files: files.length,
      bytes: perFile.reduce((n, f) => n + f.bytes, 0),
      tokens: estimateTokens(output),
      perFile,
    },
  };
}

/**
 * Convert a .gitignore glob body to a regex source (no anchors). Handles a
 * double-star with correct gitignore(5) depth semantics: a double-star path
 * segment matches zero or more directories (so `a/[star][star]/b` matches
 * `a/b`, `a/x/b`, `a/x/y/b`); a leading one matches in any directory; a
 * trailing one matches everything below. Single `*`/`?` stay within one path
 * segment; other consecutive asterisks degrade to regular stars, per the spec.
 * Pure.
 */
function globToRegExp(body: string): string {
  const esc = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
  const parts = body.split('/');
  let re = '';
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    if (parts[i] === '**') {
      if (last) { re += '.*'; } // trailing /** — everything below
      else { re += '(?:[^/]*/)*'; continue; } // absorbs the following slash → zero-or-more dirs
    } else {
      re += esc(parts[i]);
    }
    if (!last) re += '/';
  }
  return re;
}

/**
 * Minimal .gitignore-style matcher. Handles the common cases — plain names,
 * `dir/`, `*.ext` globs, `**` depth globs (gitignore(5) semantics), leading `/`
 * anchors, and `!` negation. Not the full spec (no nested ignore files).
 */
export function makeIgnoreMatcher(patterns: string[]): (relPath: string, isDir?: boolean) => boolean {
  const rules = patterns
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith('#'))
    .map((p) => {
      const negate = p.startsWith('!');
      let body = negate ? p.slice(1) : p;
      const dirOnly = body.endsWith('/');
      if (dirOnly) body = body.slice(0, -1);
      const leadingSlash = body.startsWith('/');
      if (leadingSlash) body = body.slice(1);
      // gitignore(5): a slash ANYWHERE (not just leading) anchors the pattern to
      // the root — `src/fixtures` matches `src/fixtures` but NOT `a/src/fixtures`.
      // Only a slash-free pattern (`dir`, `*.ext`) matches at any depth.
      const anchored = leadingSlash || body.includes('/');
      const re = new RegExp('^' + globToRegExp(body) + (dirOnly ? '(/|$)' : '($|/)'));
      return { negate, anchored, dirOnly, re };
    });

  // Ignored status of a single path (last-match-wins over the ordered rules).
  // `isDirComponent` is whether the entry named by the path's LAST segment is a
  // directory: a trailing-slash (dir-only) pattern matches directories ONLY per
  // gitignore(5), so `build/` must NOT fire on a regular file named `build`.
  const ruleVerdict = (path: string, isDirComponent: boolean): boolean => {
    let ignored = false;
    for (const r of rules) {
      if (r.dirOnly && !isDirComponent) continue; // dir-only pattern can't match a file
      const candidates = r.anchored ? [path] : [path, ...path.split('/').map((_, i, a) => a.slice(i).join('/'))];
      if (candidates.some((c) => r.re.test(c))) ignored = !r.negate;
    }
    return ignored;
  };

  return (relPath: string, isDir = false): boolean => {
    // Walk ancestor dirs top-down: once a parent directory is excluded, the file
    // stays excluded — a negation cannot re-include under an excluded parent
    // (gitignore(5): "not possible to re-include a file if a parent directory of
    // that file is excluded").
    const parts = relPath.split('/').filter(Boolean);
    let parentIgnored = false;
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      if (parentIgnored) {
        if (isLast) return true;
        continue; // excluded ancestor carries down
      }
      // Ancestor prefixes are directories by construction; only the final entry's
      // type comes from the caller (a filesystem walker knows dir vs file).
      const componentIsDir = isLast ? isDir : true;
      const verdict = ruleVerdict(parts.slice(0, i + 1).join('/'), componentIsDir);
      if (isLast) return verdict;
      parentIgnored = verdict; // this directory prefix carries forward
    }
    return false;
  };
}
