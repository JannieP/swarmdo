import { describe, it, expect } from 'vitest';
import {
  redactText,
  scanText,
  shannonEntropy,
  maskSecret,
  formatFindingsSummary,
  RULES,
} from '../src/redact/redact.ts';

describe('shannonEntropy', () => {
  it('is 0 for empty and single-char strings', () => {
    expect(shannonEntropy('')).toBe(0);
    expect(shannonEntropy('aaaa')).toBe(0);
  });
  it('rises with character diversity', () => {
    expect(shannonEntropy('aabb')).toBeCloseTo(1, 5);
    expect(shannonEntropy('x8Kf2Qp9Lm3Zv7Nw')).toBeGreaterThan(3.5);
  });
  it('normalizes by code points, not UTF-16 units, for astral chars (#95)', () => {
    // 8 / 16 distinct emoji → true entropy log2(8)=3 / log2(16)=4. The old
    // impl divided by s.length (2 UTF-16 units per emoji) → 2.0 / 2.5.
    expect(shannonEntropy('😀😁😂😃😄😅😆😇')).toBeCloseTo(3, 5);
    expect(shannonEntropy('😀😁😂😃😄😅😆😇😈😉😊😋😌😍😎😏')).toBeCloseTo(4, 5);
    expect(shannonEntropy('abcdefgh')).toBeCloseTo(3, 5); // ASCII unchanged
  });
});

describe('maskSecret', () => {
  it('keeps a prefix then appends the token', () => {
    expect(maskSecret('AKIAIOSFODNN7EXAMPLE')).toBe('AKI[REDACTED]');
    expect(maskSecret('secret', { keepPrefix: 0 })).toBe('[REDACTED]');
    expect(maskSecret('sk-abc', { keepPrefix: 2, token: '***' })).toBe('sk***');
  });
  it('never keeps more than the secret length', () => {
    expect(maskSecret('ab', { keepPrefix: 10 })).toBe('ab[REDACTED]');
  });
});

describe('rule catalog detection', () => {
  const cases: Array<[string, string]> = [
    ['aws-access-key', 'AKIAIOSFODNN7EXAMPLE'],
    ['github-pat', 'ghp_' + 'a'.repeat(36)],
    ['github-oauth', 'gho_' + 'b'.repeat(36)],
    ['github-fine-pat', 'github_pat_' + 'c'.repeat(82)],
    ['gitlab-pat', 'glpat-' + 'D'.repeat(20)],
    ['anthropic-key', 'sk-ant-api03-' + 'e'.repeat(20)],
    ['openai-key', 'sk-proj-' + 'F'.repeat(40)],
    ['google-api-key', 'AIza' + 'g'.repeat(35)],
    ['google-oauth-token', 'ya29.' + 'a0AfH6SMBx'.repeat(3)],
    ['slack-token', 'xoxb-' + '1234567890-abcdefghij'],
    ['stripe-key', 'sk_live_' + 'h'.repeat(24)],
    ['npm-token', 'npm_' + 'i'.repeat(36)],
  ];
  it.each(cases)('detects %s', (ruleId, secret) => {
    const findings = scanText(`token=${secret} end`, { entropy: false });
    expect(findings.map((f) => f.ruleId)).toContain(ruleId);
    const hit = findings.find((f) => f.ruleId === ruleId)!;
    expect(hit.match).toBe(secret);
  });

  it('every rule in the catalog has a unique id', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('redacts a bare `Authorization: Bearer <token>` header (RFC 6750) — masking only the token', () => {
    const tok = 'abc123DEF456ghi789JKL012';
    const { output, findings } = redactText(`Authorization: Bearer ${tok}`, { entropy: false });
    expect(findings.map((f) => f.ruleId)).toContain('bearer-token');
    expect(findings.find((f) => f.ruleId === 'bearer-token')!.match).toBe(tok);
    expect(output).toContain('Bearer '); // the scheme word is preserved
    expect(output).not.toContain(tok);   // only the credential is masked
  });
  it('tags a `Bearer ya29.…` token as the more specific google-oauth-token', () => {
    const { findings } = redactText('curl -H "Authorization: Bearer ya29.a0AfH6SMBxExampleExampleExample"', { entropy: false });
    expect(findings.map((f) => f.ruleId)).toContain('google-oauth-token');
    expect(findings.map((f) => f.ruleId)).not.toContain('bearer-token'); // deduped by range
  });
  it('does not redact the word "Bearer" in prose (needs a 16+ char token)', () => {
    expect(redactText('the Bearer of the message', { entropy: false }).findings).toHaveLength(0);
  });
});

describe('redactText', () => {
  it('masks a secret in place, preserving surrounding text', () => {
    const { output, findings } = redactText('export AWS_KEY=AKIAIOSFODNN7EXAMPLE # prod', { entropy: false });
    expect(output).toBe('export AWS_KEY=AKI[REDACTED] # prod');
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('aws-access-key');
    expect(findings[0].line).toBe(1);
  });

  it('redacts multiple secrets across lines with correct line numbers', () => {
    const text = ['line one', 'gh=ghp_' + 'a'.repeat(36), 'x', 'stripe=sk_live_' + 'z'.repeat(24)].join('\n');
    const { findings } = redactText(text, { entropy: false });
    expect(findings).toHaveLength(2);
    expect(findings[0].line).toBe(2);
    expect(findings[1].line).toBe(4);
  });

  it('detects private key block headers', () => {
    const { findings } = redactText('-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n', { entropy: false });
    expect(findings.map((f) => f.ruleId)).toContain('private-key');
  });

  it('leaves clean text untouched', () => {
    const clean = 'just some normal log output\nno secrets here at all\n';
    const { output, findings } = redactText(clean);
    expect(output).toBe(clean);
    expect(findings).toHaveLength(0);
  });

  it('does not double-count overlapping specific rules', () => {
    // anthropic key starts with sk- but must match anthropic-key, not openai-key
    const { findings } = redactText('key=sk-ant-api03-' + 'e'.repeat(20), { entropy: false });
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('anthropic-key');
  });
});

describe('entropy fallback', () => {
  it('flags a high-entropy keyworded assignment', () => {
    const { findings } = redactText('api_key = "x8Kf2Qp9Lm3Zv7Nw5Rt1Yb4"');
    expect(findings.some((f) => f.ruleId === 'high-entropy-assignment')).toBe(true);
  });
  it('ignores a low-entropy keyworded value', () => {
    const { findings } = redactText('password = "aaaaaaaaaa"');
    expect(findings).toHaveLength(0);
  });
  it('is off when entropy:false', () => {
    const { findings } = redactText('api_key = "x8Kf2Qp9Lm3Zv7Nw5Rt1Yb4"', { entropy: false });
    expect(findings).toHaveLength(0);
  });
  it('ignores high-entropy strings with no secret keyword', () => {
    const { findings } = redactText('commit = "x8Kf2Qp9Lm3Zv7Nw5Rt1Yb4"');
    expect(findings).toHaveLength(0);
  });
  it('flags bare key / credential / creds assignments (gitleaks generic-api-key parity)', () => {
    for (const kw of ['PRIVATE_KEY', 'ENCRYPTION_KEY', 'SESSION_KEY', 'DB_CREDENTIAL', 'AWS_CREDS']) {
      const { findings } = redactText(`${kw}=x8Kf2Qp9Lm3Zv7Nw5Rt1Yb4`);
      expect(findings.some((f) => f.ruleId === 'high-entropy-assignment'), `${kw} should be flagged`).toBe(true);
    }
  });
  it('does not over-match words that merely end in "key" without a following =', () => {
    // `keyboard`/`monkey_name` are not `key=` — the `[:=]` anchor protects them
    expect(redactText('keyboard shortcut = save').findings).toHaveLength(0);
    expect(redactText('monkey_name = "george"').findings).toHaveLength(0);
  });
  it('does not flag a common word that ENDS in a keyword glued to `=` (#86)', () => {
    // `monkey`/`donkey`/`whiskey`/`turkey` end in `key`; `compass`/`bypass` end in
    // `pass`. Before the fix the trailing keyword + `=` matched and flagged the
    // high-entropy value as a secret. The `(?<![A-Za-z])` guard requires the
    // keyword not be glued to a preceding letter.
    for (const word of ['monkey', 'donkey', 'whiskey', 'turkey', 'compass', 'bypass']) {
      expect(redactText(`${word}=x8Kf2Qp9Lm3Zv7Nw5Rt1Yb4`).findings, `${word}= must not be flagged`).toHaveLength(0);
    }
    // …while a real key name (start-anchored, or `_`/`-`-separated) still is:
    expect(redactText('key=x8Kf2Qp9Lm3Zv7Nw5Rt1Yb4').findings.some((f) => f.ruleId === 'high-entropy-assignment')).toBe(true);
    expect(redactText('x-api-key: x8Kf2Qp9Lm3Zv7Nw5Rt1Yb4').findings.some((f) => f.ruleId === 'high-entropy-assignment')).toBe(true);
  });
  it('stops the value at `&`/`?`/`#` so a query-string secret does not leak', () => {
    // Regression: the value used to over-capture across `&` into the AWS key;
    // the inflated span overlapped the key's already-claimed range and was
    // dropped entirely, leaving `client_secret`'s value unredacted (a real leak).
    const { output, findings } = redactText('client_secret=zX9pQ2wErT8uI3oP&api_key=AKIAIOSFODNN7EXAMPLE');
    expect(findings.map((f) => f.ruleId).sort()).toEqual(['aws-access-key', 'high-entropy-assignment']);
    expect(output).not.toContain('zX9pQ2wErT8uI3oP'); // the first secret is masked, not leaked
  });
  it('clips (not drops) a value glued to a recognized token by `/ : . =` so the leading secret cannot leak (#100)', () => {
    // The value class must allow `/ : . = + ~` for base64/base64url secrets, so a
    // recognized token following one of those over-captures into the entropy
    // span. That span overlaps the token's already-claimed range; before the fix
    // the whole entropy finding was DROPPED, leaking the leading secret cleartext.
    for (const sep of ['/', ':', '.', '=']) {
      const { output, findings } = redactText(`secret=aXk9Lm2Qp7Rt4Vw${sep}ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`);
      expect(findings.map((f) => f.ruleId).sort(), `sep ${sep}`).toEqual(['github-pat', 'high-entropy-assignment']);
      expect(output, `sep ${sep}`).not.toContain('aXk9Lm2Qp7Rt4Vw'); // leading secret masked, not leaked
      expect(output, `sep ${sep} keeps separator`).toContain(`${sep}ghp`); // the trailing token keeps its own redaction
    }
  });
  it('leaves a lone base64 value (with / + =) fully redacted — the clip only fires on a following claimed token (#100)', () => {
    // No recognized token follows → no overlap → the base64 secret (incl. `/ + =`)
    // is captured and masked as before, not truncated at its internal `/`.
    const { output, findings } = redactText('secret=aGVsbG8rd29ybGQvc2VjcmV0K3ZhbHVlPQ==');
    expect(findings.some((f) => f.ruleId === 'high-entropy-assignment')).toBe(true);
    expect(output).not.toContain('d29ybGQ'); // interior of the base64 body is masked, not left after a `/` split
  });
  it('does not swallow following non-secret data after an `&`', () => {
    // The redirect_uri is not a secret keyword and must survive intact.
    const { output } = redactText('client_secret=zX9pQ2wErT8uI3oP&redirect_uri=https://app.example.com/callback');
    expect(output).toContain('redirect_uri=https://app.example.com/callback');
    expect(output).not.toContain('zX9pQ2wErT8uI3oP');
  });
});

describe('allowlist', () => {
  it('leaves an allowlisted secret untouched (string)', () => {
    const secret = 'AKIAIOSFODNN7EXAMPLE';
    const { findings } = redactText(`k=${secret}`, { entropy: false, allowlist: [secret] });
    expect(findings).toHaveLength(0);
  });
  it('supports regex allowlist entries', () => {
    const { findings } = redactText('k=ghp_' + 'a'.repeat(36), { entropy: false, allowlist: [/^ghp_a+$/] });
    expect(findings).toHaveLength(0);
  });
});

describe('scanText vs redactText parity', () => {
  it('scanText finds the same secrets redactText masks', () => {
    const text = 'a=AKIAIOSFODNN7EXAMPLE b=ghp_' + 'a'.repeat(36);
    const scan = scanText(text, { entropy: false });
    const { findings } = redactText(text, { entropy: false });
    expect(scan.map((f) => f.ruleId)).toEqual(findings.map((f) => f.ruleId));
  });
});

describe('formatFindingsSummary', () => {
  it('reports none cleanly', () => {
    expect(formatFindingsSummary([])).toBe('redact: no secrets found');
  });
  it('summarises counts by rule', () => {
    const findings = scanText('a=AKIAIOSFODNN7EXAMPLE\nb=AKIAIOSFODNN7EXAMPLQ', { entropy: false });
    const s = formatFindingsSummary(findings);
    expect(s).toMatch(/2 secrets redacted/);
    expect(s).toMatch(/aws-access-key:2/);
  });
});

describe('passphrase assignment keyword (#49)', () => {
  const HIGH_ENTROPY = 'x8Kf2Qp9Lm3Zv7Nw5Rt1Yb4';
  it('redacts a passphrase= assignment (was a false-negative)', () => {
    const { output, findings } = redactText(`passphrase=${HIGH_ENTROPY}`);
    expect(findings.some((f) => f.ruleId === 'high-entropy-assignment')).toBe(true);
    expect(output).not.toContain(HIGH_ENTROPY);
  });
  it('redacts PASSPHRASE: too (case-insensitive)', () => {
    const { findings } = redactText(`PASSPHRASE: ${HIGH_ENTROPY}`);
    expect(findings.some((f) => f.ruleId === 'high-entropy-assignment')).toBe(true);
  });
  it('still redacts password= / passwd= (no regression)', () => {
    expect(redactText(`password=${HIGH_ENTROPY}`).findings.length).toBeGreaterThan(0);
    expect(redactText(`passwd=${HIGH_ENTROPY}`).findings.length).toBeGreaterThan(0);
  });
  it('does not match a bare phrase= (not a secret keyword)', () => {
    const { findings } = redactText(`phrase=${HIGH_ENTROPY}`, { entropy: true });
    expect(findings.some((f) => f.ruleId === 'high-entropy-assignment')).toBe(false);
  });
  it('redacts a high-entropy value made of astral chars, not just ASCII (#95)', () => {
    // 16 distinct emoji → true entropy 4.0 (> 3.5). The pre-fix entropy
    // under-count (2.5) judged it low-entropy and let the secret pass through.
    const EMOJI = '😀😁😂😃😄😅😆😇😈😉😊😋😌😍😎😏';
    const { output, findings } = redactText(`passphrase=${EMOJI}`);
    expect(findings.some((f) => f.ruleId === 'high-entropy-assignment')).toBe(true);
    expect(output).not.toContain(EMOJI);
  });
});
