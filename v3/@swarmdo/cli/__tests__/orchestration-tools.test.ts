/**
 * Orchestration MCP tools — offline regression guard (the live demo isn't in CI).
 * Invokes the real tool handlers through the --demo executor (deterministic).
 */
import { describe, it, expect } from 'vitest';
import { orchestrationTools } from '../src/mcp-tools/orchestration-tools.ts';

const verify = orchestrationTools.find((t) => t.name === 'orchestrate_verify')!;
const panel = orchestrationTools.find((t) => t.name === 'orchestrate_panel')!;
const required = (t: typeof verify) => (t.inputSchema as { required?: string[] }).required ?? [];

describe('orchestration MCP tools', () => {
  it('registers both tools with required inputs', () => {
    expect(orchestrationTools.map((t) => t.name)).toEqual(['orchestrate_verify', 'orchestrate_panel']);
    expect(required(verify)).toContain('claim');
    expect(required(panel)).toContain('task');
  });

  it('orchestrate_verify: absolutist claim → not verified', async () => {
    const r = await verify.handler({ claim: 'X is always true', demo: true });
    expect(r).toMatchObject({ verified: false });
  });

  it('orchestrate_verify: defensible claim → verified', async () => {
    const r = await verify.handler({ claim: 'the router picks a cheap model', demo: true });
    expect(r).toMatchObject({ verified: true, refutations: 0 });
  });

  it('orchestrate_verify: missing claim → error', async () => {
    const r = await verify.handler({ demo: true });
    expect(r).toMatchObject({ error: true });
  });

  it('orchestrate_panel: returns winner + agreement', async () => {
    const r = await panel.handler({ task: 'what port does the server use', demo: true });
    expect(r).toMatchObject({ agreement: 3, cast: 3 });
    expect((r as { winner: string }).winner).toContain('demo-answer');
  });
});
