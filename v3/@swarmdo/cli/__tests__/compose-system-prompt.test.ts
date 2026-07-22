/**
 * composeSystemPrompt — the base coding-agent harness (learned-strategy
 * implementation) composed with the ponytail persona and the caller's prompt.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { composeSystemPrompt } from '../src/mcp-tools/agent-execute-core.ts';

describe('composeSystemPrompt — harness + ponytail + caller', () => {
  let prevH: string | undefined;
  let prevP: string | undefined;
  beforeEach(() => {
    prevH = process.env.SWARMDO_HARNESS;
    prevP = process.env.SWARMDO_PONYTAIL;
    delete process.env.SWARMDO_HARNESS;
    delete process.env.SWARMDO_PONYTAIL;
  });
  afterEach(() => {
    if (prevH === undefined) delete process.env.SWARMDO_HARNESS; else process.env.SWARMDO_HARNESS = prevH;
    if (prevP === undefined) delete process.env.SWARMDO_PONYTAIL; else process.env.SWARMDO_PONYTAIL = prevP;
  });

  it('applies the coding-agent harness by default (no ponytail, no caller prompt)', () => {
    const out = composeSystemPrompt({});
    expect(out).toBeDefined();
    expect(out).toMatch(/verified-done state/);
    expect(out).toMatch(/Verify by running/);
  });

  it('SWARMDO_HARNESS=0 opts out — undefined when nothing else is supplied', () => {
    process.env.SWARMDO_HARNESS = '0';
    expect(composeSystemPrompt({})).toBeUndefined();
  });

  it('appends the caller systemPrompt after the harness', () => {
    const out = composeSystemPrompt({ systemPrompt: 'ROLE: reviewer' })!;
    expect(out.indexOf('verified-done')).toBeLessThan(out.indexOf('ROLE: reviewer'));
    expect(out).toContain('ROLE: reviewer');
  });

  it('composes harness → ponytail → caller in that order', () => {
    const out = composeSystemPrompt({ ponytail: true, systemPrompt: 'ROLE: reviewer' })!;
    const iH = out.indexOf('verified-done');
    const iP = out.indexOf('lazy senior developer');
    const iC = out.indexOf('ROLE: reviewer');
    expect(iH).toBeGreaterThanOrEqual(0);
    expect(iP).toBeGreaterThan(iH);
    expect(iC).toBeGreaterThan(iP);
  });

  it('harness off + ponytail on → just ponytail, no harness', () => {
    process.env.SWARMDO_HARNESS = 'off';
    const out = composeSystemPrompt({ ponytail: true })!;
    expect(out).toMatch(/lazy senior developer/);
    expect(out).not.toMatch(/verified-done state/);
  });
});
