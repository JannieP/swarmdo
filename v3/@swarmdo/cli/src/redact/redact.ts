/**
 * redact.ts — deterministic secret detection + redaction for the agent data
 * path. swarmdo pipes tool output, memory, and context into LLMs constantly;
 * `compact` de-noises that stream but never redacts, and `security scan` is
 * CVE-oriented, not a content filter. This engine is the missing guard: it
 * catches API keys / tokens / private keys via a high-confidence rule catalog
 * plus a Shannon-entropy fallback for keyword-prefixed assignments, and masks
 * them before content reaches a model, a log, or memory.
 *
 * Pure + LLM-free by design — known-secret fixtures in, deterministic masked
 * bytes out. The CLI wrapper (../commands/redact.ts) and an MCP tool share it.
 */

export interface RedactRule {
  /** stable slug, e.g. 'aws-access-key' */
  id: string;
  /** human description for --scan output */
  description: string;
  /** global regex; the whole match (or capture group `group`) is the secret */
  regex: RegExp;
  /** if set, redact this capture group rather than the whole match */
  group?: number;
}

export interface Finding {
  ruleId: string;
  description: string;
  /** 1-based line number */
  line: number;
  /** 1-based column of the secret within the line */
  column: number;
  /** the raw secret text that matched */
  match: string;
  /** what it was replaced with */
  redacted: string;
}

export interface RedactOptions {
  /** keep this many leading chars of a secret, mask the rest (default 3) */
  keepPrefix?: number;
  /** the replacement token appended after the kept prefix (default '[REDACTED]') */
  token?: string;
  /** enable the entropy fallback for keyword=value assignments (default true) */
  entropy?: boolean;
  /** Shannon-entropy threshold (bits/char) above which a keyworded value is a secret (default 3.5) */
  entropyThreshold?: number;
  /** substrings/regexes; any secret whose match includes one is left untouched */
  allowlist?: Array<string | RegExp>;
}

export interface RedactResult {
  output: string;
  findings: Finding[];
}

/**
 * High-confidence catalog. Ordered — more specific rules (e.g. Anthropic
 * `sk-ant-`) come before broader ones (`sk-` OpenAI) so the specific rule wins
 * and we don't double-count. Patterns are conservative to keep false positives
 * low; the entropy fallback covers the long tail of custom secrets.
 */
export const RULES: RedactRule[] = [
  { id: 'private-key', description: 'Private key block header', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { id: 'aws-access-key', description: 'AWS access key ID', regex: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[0-9A-Z]{16}\b/g },
  { id: 'github-pat', description: 'GitHub personal access token', regex: /\bghp_[0-9A-Za-z]{36}\b/g },
  { id: 'github-oauth', description: 'GitHub OAuth/app token', regex: /\b(?:gho|ghu|ghs|ghr)_[0-9A-Za-z]{36}\b/g },
  { id: 'github-fine-pat', description: 'GitHub fine-grained PAT', regex: /\bgithub_pat_[0-9A-Za-z_]{82}\b/g },
  { id: 'gitlab-pat', description: 'GitLab personal access token', regex: /\bglpat-[0-9A-Za-z_-]{20}\b/g },
  { id: 'anthropic-key', description: 'Anthropic API key', regex: /\bsk-ant-[0-9A-Za-z-]{16,}\b/g },
  { id: 'openai-key', description: 'OpenAI API key', regex: /\bsk-(?:proj-)?[0-9A-Za-z]{20,}\b/g },
  { id: 'google-api-key', description: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'google-oauth-token', description: 'Google OAuth access token', regex: /\bya29\.[0-9A-Za-z_-]{20,}/g },
  { id: 'slack-token', description: 'Slack token', regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g },
  { id: 'slack-webhook', description: 'Slack incoming webhook', regex: /https:\/\/hooks\.slack\.com\/services\/T[0-9A-Za-z_]+\/B[0-9A-Za-z_]+\/[0-9A-Za-z_]+/g },
  { id: 'stripe-key', description: 'Stripe secret/restricted key', regex: /\b(?:sk|rk)_live_[0-9A-Za-z]{24,}\b/g },
  { id: 'sendgrid-key', description: 'SendGrid API key', regex: /\bSG\.[0-9A-Za-z_-]{22}\.[0-9A-Za-z_-]{43}\b/g },
  { id: 'twilio-key', description: 'Twilio API key SID', regex: /\bSK[0-9a-fA-F]{32}\b/g },
  { id: 'npm-token', description: 'npm access token', regex: /\bnpm_[0-9A-Za-z]{36}\b/g },
  { id: 'jwt', description: 'JSON Web Token', regex: /\beyJ[0-9A-Za-z_-]{10,}\.eyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\b/g },
  // RFC 6750 Bearer credential. Last (most generic): specific token rules above
  // claim their range first. 16+ b64token chars keeps prose ("Bearer document")
  // from matching; only the token (group 1) is masked, not the `Bearer ` prefix.
  { id: 'bearer-token', description: 'HTTP Bearer token (RFC 6750)', regex: /\bBearer\s+([A-Za-z0-9\-._~+/]{16,}=*)/g, group: 1 },
];

/**
 * Keyword-prefixed assignment, e.g. `api_key = "..."` — the value is group 1.
 * Keyword set mirrors gitleaks' reference `generic-api-key` rule (adds bare
 * `key`, `credential`, `creds` so `PRIVATE_KEY=`/`ENCRYPTION_KEY=`/`DB_CREDENTIAL=`
 * secrets reach the entropy check). The `[:=]` immediately after the keyword
 * anchors it, so `keyboard=`/`monkey_val=` don't match; the entropy + length
 * gates keep low-entropy values (paths, short flags) from being flagged.
 */
const ASSIGNMENT_RE =
  /(?:pass(?:word|wd)?|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|auth[_-]?token|client[_-]?secret|credential|creds|key)["']?\s*[:=]\s*["']?([^\s"'`,;]{8,})/gi;

/** Shannon entropy in bits/char. Pure; used by the assignment fallback. */
export function shannonEntropy(s: string): number {
  if (!s) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/** Mask a secret: keep `keepPrefix` leading chars, then the token. */
export function maskSecret(secret: string, opts: RedactOptions = {}): string {
  const keep = Math.max(0, Math.min(opts.keepPrefix ?? 3, secret.length));
  const token = opts.token ?? '[REDACTED]';
  return secret.slice(0, keep) + token;
}

function isAllowlisted(match: string, allowlist?: Array<string | RegExp>): boolean {
  if (!allowlist || allowlist.length === 0) return false;
  return allowlist.some((a) => (typeof a === 'string' ? match.includes(a) : a.test(match)));
}

interface RawHit {
  ruleId: string;
  description: string;
  index: number; // absolute offset in text
  match: string;
}

/** Collect all rule + entropy hits across the text, deduped by offset. */
function collectHits(text: string, opts: RedactOptions): RawHit[] {
  const hits: RawHit[] = [];
  const claimed: Array<[number, number]> = []; // [start,end) ranges already taken

  const overlaps = (start: number, end: number) =>
    claimed.some(([s, e]) => start < e && end > s);

  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.regex.exec(text)) !== null) {
      const secret = rule.group != null ? m[rule.group] : m[0];
      if (secret == null) continue;
      const start = rule.group != null ? m.index + m[0].indexOf(secret) : m.index;
      const end = start + secret.length;
      if (overlaps(start, end)) continue;
      if (isAllowlisted(secret, opts.allowlist)) continue;
      claimed.push([start, end]);
      hits.push({ ruleId: rule.id, description: rule.description, index: start, match: secret });
      if (m.index === rule.regex.lastIndex) rule.regex.lastIndex++; // guard zero-width
    }
  }

  if (opts.entropy !== false) {
    const threshold = opts.entropyThreshold ?? 3.5;
    ASSIGNMENT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ASSIGNMENT_RE.exec(text)) !== null) {
      const value = m[1];
      const start = m.index + m[0].indexOf(value);
      const end = start + value.length;
      if (overlaps(start, end)) continue;
      if (isAllowlisted(value, opts.allowlist)) continue;
      if (shannonEntropy(value) < threshold) continue;
      claimed.push([start, end]);
      hits.push({ ruleId: 'high-entropy-assignment', description: 'High-entropy secret assignment', index: start, match: value });
    }
  }

  return hits.sort((a, b) => a.index - b.index);
}

/** Map an absolute offset to 1-based {line, column}. */
function lineColOf(text: string, index: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') { line++; last = i; }
  }
  return { line, column: index - last };
}

/** Scan without rewriting — returns findings only (for --scan / CI gating). */
export function scanText(text: string, opts: RedactOptions = {}): Finding[] {
  return collectHits(text, opts).map((h) => {
    const { line, column } = lineColOf(text, h.index);
    return { ruleId: h.ruleId, description: h.description, line, column, match: h.match, redacted: maskSecret(h.match, opts) };
  });
}

/** Redact secrets in `text`, returning the rewritten output + findings. */
export function redactText(text: string, opts: RedactOptions = {}): RedactResult {
  const hits = collectHits(text, opts);
  const findings: Finding[] = [];
  let out = '';
  let cursor = 0;
  for (const h of hits) {
    const { line, column } = lineColOf(text, h.index);
    const redacted = maskSecret(h.match, opts);
    out += text.slice(cursor, h.index) + redacted;
    cursor = h.index + h.match.length;
    findings.push({ ruleId: h.ruleId, description: h.description, line, column, match: h.match, redacted });
  }
  out += text.slice(cursor);
  return { output: out, findings };
}

/** One-line human summary for stderr. */
export function formatFindingsSummary(findings: Finding[]): string {
  if (findings.length === 0) return 'redact: no secrets found';
  const byRule = new Map<string, number>();
  for (const f of findings) byRule.set(f.ruleId, (byRule.get(f.ruleId) ?? 0) + 1);
  const parts = [...byRule.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r}:${n}`);
  return `redact: ${findings.length} secret${findings.length === 1 ? '' : 's'} redacted (${parts.join(', ')})`;
}
