import { describe, it, expect } from 'vitest';
import { testreportTools } from '../src/mcp-tools/testreport-tools.ts';

const tool = testreportTools.find((t) => t.name === 'testreport')!;

describe('testreport tool', () => {
  it('parses JUnit content into a structured summary', async () => {
    const xml = `<testsuite><testcase classname="s" name="a"/><testcase name="b"><failure message="boom" type="E">at (x.ts:3:1)</failure></testcase></testsuite>`;
    const r = (await tool.handler({ content: xml })) as any;
    expect(r.error).toBeUndefined();
    expect(r.format).toBe('junit');
    expect(r).toMatchObject({ passed: 1, failed: 1 });
    expect(r.failures[0]).toMatchObject({ name: 'b', message: 'boom', file: 'x.ts', line: 3 });
  });

  it('auto-detects TAP and honors a format override', async () => {
    const tap = '1..1\nnot ok 1 - nope';
    expect(((await tool.handler({ content: tap })) as any).format).toBe('tap');
    // force junit on TAP-looking text → no testcases → zero total
    expect(((await tool.handler({ content: tap, format: 'junit' })) as any).total).toBe(0);
  });

  it('rejects missing content', async () => {
    expect(((await tool.handler({})) as any).error).toBe(true);
  });

  it('is well-formed metadata in the testreport category', () => {
    expect(tool.category).toBe('testreport');
    expect(tool.inputSchema.required).toEqual(['content']);
    expect(tool.description.length).toBeGreaterThan(20);
  });
});
