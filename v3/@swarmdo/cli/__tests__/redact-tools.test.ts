import { describe, it, expect } from 'vitest';
import { redactTools } from '../src/mcp-tools/redact-tools.ts';

function tool(name: string) {
  const t = redactTools.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
}

const AWS = 'AKIAIOSFODNN7EXAMPLE';

describe('redact_text tool', () => {
  it('masks secrets and returns findings', async () => {
    const r = (await tool('redact_text').handler({ text: `key=${AWS}`, entropy: false })) as any;
    expect(r.redacted).toBe('key=AKI[REDACTED]');
    expect(r.count).toBe(1);
    expect(r.findings[0].ruleId).toBe('aws-access-key');
  });
  it('honours keepPrefix 0 (full mask)', async () => {
    const r = (await tool('redact_text').handler({ text: `key=${AWS}`, entropy: false, keepPrefix: 0 })) as any;
    expect(r.redacted).toBe('key=[REDACTED]');
  });
  it('respects allowlist', async () => {
    const r = (await tool('redact_text').handler({ text: `key=${AWS}`, entropy: false, allowlist: [AWS] })) as any;
    expect(r.count).toBe(0);
    expect(r.redacted).toBe(`key=${AWS}`);
  });
  it('errors without text', async () => {
    const r = (await tool('redact_text').handler({})) as any;
    expect(r.error).toBe(true);
  });
});

describe('redact_scan tool', () => {
  it('reports clean text', async () => {
    const r = (await tool('redact_scan').handler({ text: 'nothing to see' })) as any;
    expect(r.clean).toBe(true);
    expect(r.count).toBe(0);
  });
  it('reports secrets without rewriting', async () => {
    const r = (await tool('redact_scan').handler({ text: `t=${AWS}`, entropy: false })) as any;
    expect(r.clean).toBe(false);
    expect(r.count).toBe(1);
    expect(r).not.toHaveProperty('redacted');
  });
  it('errors without text', async () => {
    const r = (await tool('redact_scan').handler({})) as any;
    expect(r.error).toBe(true);
  });
});

describe('tool metadata', () => {
  it('both tools are well-formed and in the redact category', () => {
    expect(redactTools).toHaveLength(2);
    for (const t of redactTools) {
      expect(t.name).toMatch(/^redact_/);
      expect(t.description.length).toBeGreaterThan(20);
      expect(t.category).toBe('redact');
      expect(typeof t.handler).toBe('function');
      expect(t.inputSchema.required).toContain('text');
    }
  });
});
