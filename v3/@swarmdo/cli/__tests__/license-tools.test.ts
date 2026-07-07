import { describe, it, expect } from 'vitest';
import { licenseTools } from '../src/mcp-tools/license-tools.ts';

const tool = licenseTools.find((t) => t.name === 'license_check')!;

const DEPS = [
  { name: 'a', version: '1.0.0', license: 'MIT' },
  { name: 'b', version: '2.0.0', license: 'GPL-3.0' },
  { name: 'c', version: '1.0.0', license: 'UNKNOWN' },
];

describe('license_check tool', () => {
  it('reports clean with no policy', async () => {
    const r = (await tool.handler({ deps: DEPS })) as any;
    expect(r.clean).toBe(true);
    expect(r.total).toBe(3);
    expect(r.byLicense.MIT).toBe(1);
  });

  it('flags not-allowed and unknown under an allowlist', async () => {
    const r = (await tool.handler({ deps: DEPS, allow: ['MIT'] })) as any;
    expect(r.clean).toBe(false);
    expect(r.violations.map((v: any) => v.name).sort()).toEqual(['b', 'c']);
  });

  it('flags a denied license', async () => {
    const r = (await tool.handler({ deps: DEPS, deny: ['GPL-3.0'] })) as any;
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].reason).toBe('denied');
  });

  it('allowUnknown lets UNKNOWN pass', async () => {
    const r = (await tool.handler({ deps: DEPS, allow: ['MIT', 'GPL-3.0'], allowUnknown: true })) as any;
    expect(r.clean).toBe(true);
  });

  it('errors without deps', async () => {
    expect(((await tool.handler({})) as any).error).toBe(true);
  });

  it('is well-formed metadata in the license category', () => {
    expect(tool.category).toBe('license');
    expect(tool.inputSchema.required).toContain('deps');
    expect(tool.description.length).toBeGreaterThan(20);
  });
});
