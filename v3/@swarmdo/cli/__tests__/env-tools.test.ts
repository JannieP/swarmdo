import { describe, it, expect } from 'vitest';
import { envTools } from '../src/mcp-tools/env-tools.ts';

const tool = envTools.find((t) => t.name === 'env_check')!;

describe('env_check tool', () => {
  it('reports missing/unused/undocumented buckets', async () => {
    const r = (await tool.handler({
      sources: [{ path: 'a.ts', content: 'const x = process.env.API_KEY; const y = process.env.PORT;' }],
      env: 'API_KEY=x\nLEGACY=y\n',
      example: 'API_KEY=\n',
    })) as any;
    expect(r.missing).toEqual(['PORT']);     // referenced, not declared
    expect(r.unused).toEqual(['LEGACY']);    // declared, not referenced
    expect(r.undocumented).toEqual(['LEGACY']); // in .env, not in example
    expect(r.clean).toBe(false);
  });

  it('reports clean when everything reconciles', async () => {
    const r = (await tool.handler({
      sources: [{ path: 'a.ts', content: 'process.env.API_KEY' }],
      env: 'API_KEY=x\n',
      example: 'API_KEY=\n',
    })) as any;
    expect(r.clean).toBe(true);
  });

  it('honours ignore list', async () => {
    const r = (await tool.handler({
      sources: [{ path: 'a.ts', content: 'process.env.NODE_ENV' }],
      env: 'NODE_ENV=production\n',
      ignore: ['NODE_ENV'],
    })) as any;
    expect(r.clean).toBe(true);
  });

  it('errors without required inputs', async () => {
    expect(((await tool.handler({ env: 'X=1' })) as any).error).toBe(true);
    expect(((await tool.handler({ sources: [] })) as any).error).toBe(true);
  });

  it('is well-formed metadata in the env category', () => {
    expect(tool.category).toBe('env');
    expect(tool.inputSchema.required).toContain('env');
    expect(tool.description.length).toBeGreaterThan(20);
  });
});
