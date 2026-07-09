/**
 * testreport.ts — parse JUnit-XML / TAP test results into a compact failure
 * digest. The missing front-half of the test→fix loop: an agent runs the suite,
 * points this at the results, and gets exactly the failing test names + file:line
 * + assertion message — instead of re-reading hundreds of log lines — then feeds
 * that into `repair`. Inspired by dorny/test-reporter, action-junit-report,
 * gotestsum.
 *
 * Pure + deterministic: a results string in, a normalized summary out. The file
 * read / glob lives in ../commands/testreport.ts, so this is fixture-testable.
 * No XML dependency — well-formed JUnit escapes <>& in attribute values, so a
 * focused tokenizer over <testcase>/<failure> is safe.
 */

export type TestStatus = 'passed' | 'failed' | 'skipped';
export type TestFormat = 'junit' | 'tap';

export interface TestFailure {
  suite: string;
  name: string;
  file?: string;
  line?: number;
  message?: string;
  type?: string;
}

export interface TestSummary {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  durationMs: number;
  failures: TestFailure[];
  /**
   * TAP `# TODO` tests — "not expected to succeed" per the TAP spec, so a
   * `not ok … # TODO` is a KNOWN-incomplete stub, counted here as a success,
   * never a failure. Absent (0) for JUnit and TODO-free TAP.
   */
  todo?: number;
  /**
   * True if a TAP `Bail out!` line aborted the run. The counts are then
   * INCOMPLETE — the suite stopped early, so a "0 failed" here does NOT mean
   * the suite passed. Callers/CI must treat this as a failure.
   */
  bailedOut?: boolean;
  /** Optional reason text following `Bail out!`. */
  bailReason?: string;
}

/** Decode the five predefined XML entities. Pure. */
function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, '&'); // last, so &amp;lt; → &lt; not <
}

/**
 * Decode an element's text content, honoring CDATA sections. Text OUTSIDE
 * `<![CDATA[ … ]]>` is entity-decoded; text INSIDE is taken literally (per the
 * XML spec, CDATA content is never entity-expanded). Maven Surefire/Failsafe
 * wrap `<failure>`/`<error>` stack traces in CDATA, so without this the raw
 * `<![CDATA[`/`]]>` markers leak into the failure message. Pure.
 */
function decodeXmlContent(s: string): string {
  const OPEN = '<![CDATA[';
  const CLOSE = ']]>';
  if (!s.includes(OPEN)) return decodeXml(s);
  let out = '';
  let i = 0;
  while (i < s.length) {
    const start = s.indexOf(OPEN, i);
    if (start < 0) { out += decodeXml(s.slice(i)); break; }
    out += decodeXml(s.slice(i, start));
    const end = s.indexOf(CLOSE, start + OPEN.length);
    if (end < 0) { out += s.slice(start + OPEN.length); break; } // unterminated → rest is literal
    out += s.slice(start + OPEN.length, end);
    i = end + CLOSE.length;
  }
  return out;
}

/** Extract key="value" / key='value' attributes from a tag's attribute text. Pure. */
function parseAttrs(attrText: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrText)) !== null) {
    out[m[1]] = decodeXml(m[3] ?? m[4] ?? '');
  }
  return out;
}

/** Pull a `file:line` out of a stack-trace / assertion message. Pure. */
export function extractFileLine(text: string): { file?: string; line?: number } {
  if (!text) return {};
  // Prefer a parenthesised frame `(path:line:col)`, else a bare `path:line`.
  const paren = text.match(/\(([^()\s]+?):(\d+):(?:\d+)\)/);
  if (paren) return { file: paren[1], line: parseInt(paren[2], 10) };
  const bare = text.match(/([\w./\\-]+\.[a-zA-Z]{1,5}):(\d+)(?::\d+)?/);
  if (bare) return { file: bare[1], line: parseInt(bare[2], 10) };
  return {};
}

/** Parse JUnit XML (testsuites/testsuite/testcase). Pure. */
export function parseJUnit(xml: string): TestSummary {
  const failures: TestFailure[] = [];
  let passed = 0, failed = 0, skipped = 0, durationMs = 0;

  const caseRe = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  let c: RegExpExecArray | null;
  while ((c = caseRe.exec(xml)) !== null) {
    const attrs = parseAttrs(c[1]);
    const body = c[2] ?? '';
    const name = attrs.name ?? '(unnamed)';
    const suite = attrs.classname ?? attrs.suite ?? '';
    if (attrs.time) durationMs += Math.round(parseFloat(attrs.time) * 1000) || 0;

    const fail = body.match(/<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/);
    const isSkipped = /<skipped\b[^>]*\/?>/.test(body);
    if (fail) {
      failed++;
      const fAttrs = parseAttrs(fail[2]);
      const inner = decodeXmlContent(fail[3] ?? '').trim();
      const message = fAttrs.message || inner.split('\n')[0] || undefined;
      // Prefer explicit file/line attrs (pytest, some emitters), else sniff the trace.
      const loc = attrs.file
        ? { file: attrs.file, line: attrs.line ? parseInt(attrs.line, 10) : undefined }
        : extractFileLine(inner || fAttrs.message || '');
      failures.push({ suite, name, message, type: fAttrs.type, ...loc });
    } else if (isSkipped) {
      skipped++;
    } else {
      passed++;
    }
  }
  return { passed, failed, skipped, total: passed + failed + skipped, durationMs, failures };
}

/** Parse TAP (Test Anything Protocol) output. Pure. */
export function parseTAP(text: string): TestSummary {
  const failures: TestFailure[] = [];
  let passed = 0, failed = 0, skipped = 0, todo = 0;
  let bailedOut = false;
  let bailReason: string | undefined;
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // `Bail out!` (column 1, per the TAP spec) aborts the run — stop parsing;
    // anything after it is not a valid result.
    const bail = line.match(/^Bail out!(?:\s+(.*))?$/);
    if (bail) { bailedOut = true; bailReason = bail[1]?.trim() || undefined; break; }
    const m = line.match(/^(ok|not ok)\b\s*(\d+)?\s*-?\s*(.*)$/);
    if (!m) continue;
    const ok = m[1] === 'ok';
    let desc = m[3].trim();
    const directive = desc.match(/#\s*(SKIP|TODO)\b(.*)$/i);
    if (directive) desc = desc.slice(0, directive.index).trim();

    if (directive && /skip/i.test(directive[1])) {
      skipped++;
      continue;
    }
    // TODO tests are "not expected to succeed" — a `not ok … # TODO` is a known
    // stub, not a real failure (TAP spec). Count it as todo, never a failure.
    if (directive && /todo/i.test(directive[1])) {
      todo++;
      continue;
    }
    if (ok) {
      passed++;
    } else {
      failed++;
      // Look ahead for an indented YAML diagnostic block for message/file/line.
      let message: string | undefined;
      let file: string | undefined;
      let lineNo: number | undefined;
      for (let j = i + 1; j < lines.length; j++) {
        const d = lines[j];
        if (!/^\s/.test(d) && d.trim() !== '') break; // dedented → block ended
        const mm = d.match(/^\s*message:\s*(.+)$/); if (mm) message = mm[1].replace(/^["']|["']$/g, '').trim();
        const fm = d.match(/^\s*(?:file|at):\s*(.+)$/); if (fm) { const fl = extractFileLine(fm[1]); if (fl.file) { file = fl.file; lineNo = fl.line; } }
        const lm = d.match(/^\s*line:\s*(\d+)/); if (lm) lineNo = parseInt(lm[1], 10);
        if (/^\s*\.\.\.\s*$/.test(d)) break; // end of YAML block
      }
      failures.push({ suite: '', name: desc || '(unnamed)', message, file, line: lineNo });
    }
  }
  return { passed, failed, skipped, total: passed + failed + skipped + todo, durationMs: 0, failures, ...(todo && { todo }), ...(bailedOut && { bailedOut, bailReason }) };
}

/** Sniff the format from a path extension, then content. Pure. */
export function detectFormat(content: string, path?: string): TestFormat {
  if (path) {
    if (/\.tap$/i.test(path)) return 'tap';
    if (/\.xml$/i.test(path)) return 'junit';
  }
  if (/<testsuite|<testcase/i.test(content)) return 'junit';
  if (/^\s*(TAP version|1\.\.\d|ok\b|not ok\b)/m.test(content)) return 'tap';
  return 'junit';
}

/** Parse by explicit or detected format. Pure. */
export function parseTestReport(content: string, format: TestFormat): TestSummary {
  return format === 'tap' ? parseTAP(content) : parseJUnit(content);
}

/** Merge several summaries (multi-file globs). Pure. */
export function mergeSummaries(list: TestSummary[]): TestSummary {
  const merged = list.reduce<TestSummary>(
    (acc, s) => ({
      passed: acc.passed + s.passed,
      failed: acc.failed + s.failed,
      skipped: acc.skipped + s.skipped,
      total: acc.total + s.total,
      durationMs: acc.durationMs + s.durationMs,
      failures: acc.failures.concat(s.failures),
    }),
    { passed: 0, failed: 0, skipped: 0, total: 0, durationMs: 0, failures: [] },
  );
  const todoSum = list.reduce((n, s) => n + (s.todo ?? 0), 0);
  if (todoSum > 0) merged.todo = todoSum;
  // Any bailed file taints the whole run; keep the first reason seen.
  const bailed = list.find((s) => s.bailedOut);
  if (bailed) { merged.bailedOut = true; merged.bailReason = bailed.bailReason; }
  return merged;
}

/** Human-readable digest. Pure. */
export function formatSummary(s: TestSummary, opts: { top?: number } = {}): string {
  const todoSeg = s.todo ? ` · ${s.todo} todo` : '';
  const head = `${s.passed} passed · ${s.failed} failed · ${s.skipped} skipped${todoSeg} (${s.total} total, ${s.durationMs}ms)`;
  const bailLine = s.bailedOut
    ? `⚠ suite ABORTED (Bail out!${s.bailReason ? `: ${s.bailReason}` : ''}) — results incomplete`
    : '';
  if (s.failures.length === 0) {
    if (s.bailedOut) return `${bailLine}\n${head}`;
    return head + (s.failed === 0 ? ' ✓' : '');
  }
  const shown = opts.top && opts.top > 0 ? s.failures.slice(0, opts.top) : s.failures;
  const lines = s.bailedOut ? [bailLine, head, ''] : [head, ''];
  for (const f of shown) {
    const where = f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : '';
    lines.push(`✗ ${f.suite ? f.suite + ' › ' : ''}${f.name}${where ? `  (${where})` : ''}`);
    if (f.message) lines.push(`    ${f.message.split('\n')[0]}`);
  }
  if (shown.length < s.failures.length) lines.push(`… and ${s.failures.length - shown.length} more`);
  return lines.join('\n');
}
