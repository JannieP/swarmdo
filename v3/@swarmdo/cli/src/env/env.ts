/**
 * env.ts — reconcile the environment variables a codebase *references* against
 * the ones a `.env` (and `.env.example`) *declares*. Catches the classic "deploy
 * broke because a var was missing / stale" drift before it ships.
 *
 * Three buckets:
 *   missing      — referenced in code, not declared in .env        (will break at runtime)
 *   unused       — declared in .env, never referenced in code      (dead config)
 *   undocumented — declared in .env, absent from .env.example      (onboarding gap)
 *
 * Pure + deterministic (regex extraction + dotenv parse + set diff), so it's
 * fully fixture-testable with zero LLM calls. The fs walk + file reads live in
 * ../commands/env.ts; this module just takes strings.
 */

export interface EnvRef {
  key: string;
  file: string;
  /** 1-based line */
  line: number;
}

export interface EnvReport {
  missing: string[];      // in code, not in .env
  unused: string[];       // in .env, not in code
  undocumented: string[]; // in .env, not in .env.example
  /** every key referenced in code → the sites that reference it */
  refs: Record<string, EnvRef[]>;
}

/**
 * Patterns that read an env var. Each capture group 1 is the var name. Covers
 * Node (`process.env.X`, `process.env['X']`), Vite (`import.meta.env.X`), Deno
 * (`Deno.env.get('X')`), and Python (`os.environ['X']`, `os.environ.get('X')`,
 * `os.getenv('X')`). Deterministic, line-based.
 */
const REF_PATTERNS: RegExp[] = [
  /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
  /process\.env\[\s*['"`]([^'"`]+)['"`]\s*\]/g,
  /import\.meta\.env\.([A-Za-z_][A-Za-z0-9_]*)/g,
  /import\.meta\.env\[\s*['"`]([^'"`]+)['"`]\s*\]/g,
  /Deno\.env\.get\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  /os\.environ\[\s*['"]([^'"]+)['"]\s*\]/g,
  /os\.environ\.get\(\s*['"]([^'"]+)['"]\s*\)/g,
  /os\.getenv\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** `const { A, B } = process.env` — the brace body (group 1) holds one or more refs. */
const DESTRUCTURE_RE = /\{\s*([^}]+)\}\s*=\s*process\.env\b(?![.[])/g;

/** Non-secret prefixes on `import.meta.env` that are Vite builtins, not user vars. */
const VITE_BUILTINS = new Set(['MODE', 'BASE_URL', 'PROD', 'DEV', 'SSR']);

/** Extract env-var references from one source file. Pure. */
export function extractEnvRefs(source: string, file: string): EnvRef[] {
  const out: EnvRef[] = [];
  const lines = source.split('\n');
  // Map a byte offset in `source` to its 1-based line, for the whole-source
  // destructure scan below (which can span lines). lineStart[i] = the offset
  // where line i+1 begins; binary-search for the last start <= offset.
  const lineStart: number[] = [0];
  for (let k = 0; k < source.length; k++) if (source[k] === '\n') lineStart.push(k + 1);
  const lineAt = (index: number): number => {
    let lo = 0, hi = lineStart.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStart[mid] <= index) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };

  // Member-style reads (process.env.X, os.getenv('X'), …) are inherently
  // single-line — scan line by line so each ref carries its own line number.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('env') && !line.includes('getenv')) continue;
    for (const re of REF_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const key = m[1];
        if (VITE_BUILTINS.has(key)) continue;
        out.push({ key, file, line: i + 1 });
      }
    }
  }

  // Destructuring reads: `const { PORT, DB_URL } = process.env`. Scanned over the
  // WHOLE source, not per line — a Prettier-wrapped list spans lines:
  //   const {\n  PORT,\n  DB_URL,\n} = process.env
  // The regex's `\s*`/`[^}]+` already match newlines, so running it per line was
  // exactly what hid multi-line destructures (a false-clean `env --ci`). The
  // `(?![.[])` guard keeps it to the bare object, not `= process.env.FOO`; each
  // property key maps back to its own line via its offset.
  DESTRUCTURE_RE.lastIndex = 0;
  let dm: RegExpExecArray | null;
  while ((dm = DESTRUCTURE_RE.exec(source)) !== null) {
    const bodyStart = dm.index + dm[0].indexOf(dm[1]);
    let partOffset = 0;
    for (const part of dm[1].split(',')) {
      // The env-var name is the property key — left of a rename `:` or default `=`.
      const key = part.trim().split(/[:=]/)[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(key) && !VITE_BUILTINS.has(key)) { // skip `...rest`, empties, builtins
        const kOff = part.indexOf(key);
        out.push({ key, file, line: lineAt(bodyStart + partOffset + (kOff < 0 ? 0 : kOff)) });
      }
      partOffset += part.length + 1; // + the comma consumed by split
    }
  }
  return out;
}

/**
 * Parse a `.env` file into an ordered list of declared keys. Handles `KEY=val`,
 * `export KEY=val`, quoted values, `# comments`, and blank lines. The key
 * charset + `:` separator mirror the reference `dotenv` package's grammar
 * (`[\w.-]+` with `=` or `: ` as separator), so dotted/hyphenated keys like
 * `APP.NAME` aren't silently dropped. Values are ignored — we only reconcile
 * key presence. Pure.
 */
export function parseDotenv(text: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([\w.-]+)(?:\s*=|:\s)/);
    if (!m) continue;
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    keys.push(m[1]);
  }
  return keys;
}

export interface ReconcileInput {
  refs: EnvRef[];
  /** keys declared in .env */
  declared: string[];
  /** keys declared in .env.example (optional) */
  example?: string[];
  /** keys to ignore in all buckets (e.g. NODE_ENV, CI) */
  ignore?: string[];
}

/** Compute the missing / unused / undocumented buckets. Pure. */
export function reconcile(input: ReconcileInput): EnvReport {
  const ignore = new Set(input.ignore ?? []);
  const refByKey: Record<string, EnvRef[]> = {};
  for (const r of input.refs) {
    if (ignore.has(r.key)) continue;
    (refByKey[r.key] ??= []).push(r);
  }
  const referenced = new Set(Object.keys(refByKey));
  const declared = new Set(input.declared.filter((k) => !ignore.has(k)));

  const missing = [...referenced].filter((k) => !declared.has(k)).sort();
  const unused = [...declared].filter((k) => !referenced.has(k)).sort();

  let undocumented: string[] = [];
  if (input.example) {
    const example = new Set(input.example);
    undocumented = [...declared].filter((k) => !example.has(k)).sort();
  }

  return { missing, unused, undocumented, refs: refByKey };
}

/** One-line human summary. */
export function formatEnvSummary(r: EnvReport, hasExample: boolean): string {
  const parts = [`${r.missing.length} missing`, `${r.unused.length} unused`];
  if (hasExample) parts.push(`${r.undocumented.length} undocumented`);
  return `env: ${parts.join(', ')}`;
}
