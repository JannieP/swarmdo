/**
 * `swarmdo orchestrate` command — exit-code + wiring regression guard.
 * Runs the real command actions through the built-in --demo executor (offline,
 * deterministic). Locks in the exit-code fix the live demonstration surfaced:
 * a failed verify is informational (exit 0) unless --strict (exit 2).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { orchestrateCommand } from '../src/commands/orchestrate.ts';
import type { CommandContext } from '../src/types.ts';

function ctx(args: string[], flags: Record<string, unknown>): CommandContext {
  return { args, flags: { _: [], ...flags } as CommandContext['flags'], cwd: process.cwd(), interactive: false };
}
const verify = orchestrateCommand.subcommands!.find((s) => s.name === 'verify')!;
const panel = orchestrateCommand.subcommands!.find((s) => s.name === 'panel')!;

describe('orchestrate command', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('verify: not-verified without --strict is informational (success:true, exit 0)', async () => {
    const r = await verify.action!(ctx(['the', 'cache', 'is', 'always', 'faster'], { demo: true }));
    expect(r).toMatchObject({ success: true });
    expect((r as { data: { verified: boolean } }).data.verified).toBe(false);
  });

  it('verify: not-verified with --strict gates (success:false, exitCode 2)', async () => {
    const r = await verify.action!(ctx(['this', 'is', 'always', 'true'], { demo: true, strict: true }));
    expect(r).toMatchObject({ success: false, exitCode: 2 });
  });

  it('verify: verified with --strict passes (success:true)', async () => {
    const r = await verify.action!(ctx(['the', 'parser', 'handles', 'quoted', 'args'], { demo: true, strict: true }));
    expect(r).toMatchObject({ success: true });
    expect((r as { data: { verified: boolean } }).data.verified).toBe(true);
  });

  it('verify: empty claim errors (success:false, exitCode 1)', async () => {
    const r = await verify.action!(ctx([], { demo: true }));
    expect(r).toMatchObject({ success: false, exitCode: 1 });
  });

  it('panel: returns a majority winner (success:true)', async () => {
    const r = await panel.action!(ctx(['what', 'transport', 'does', 'mcp', 'use'], { demo: true }));
    expect(r).toMatchObject({ success: true });
    expect((r as { data: { winner: string; agreement: number } }).data.winner).toContain('demo-answer');
    expect((r as { data: { agreement: number } }).data.agreement).toBe(3);
  });
});
