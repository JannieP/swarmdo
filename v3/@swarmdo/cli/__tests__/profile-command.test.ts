/**
 * profile command — the fs orchestration behind `swarmdo profile use/status`.
 * Verifies the settings.json env patch preserves foreign keys, swaps owned
 * levers cleanly on switch, and records the active profile in config.
 * (Efficiency shells out to the CLI; it no-ops under vitest and is non-fatal —
 * covered separately by the live demo + efficiency's own tests.)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import profileCommand from '../src/commands/profile.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'sd-profile-'));
  mkdirSync(path.join(dir, '.claude'), { recursive: true });
  writeFileSync(
    path.join(dir, '.claude', 'settings.json'),
    JSON.stringify({
      permissions: { allow: ['Read(./**)'] },
      env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1', MY_OWN_VAR: 'keepme' },
    }),
  );
});
afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

const sub = (name: string) => profileCommand.subcommands!.find((c) => c.name === name)!;
const run = (name: string, args: string[] = [], flags: Record<string, unknown> = {}) =>
  sub(name).action!({ args, flags: { _: [], ...flags } as any, cwd: dir, interactive: false } as any);

const settingsEnv = () => JSON.parse(readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8')).env;
const config = () => JSON.parse(readFileSync(path.join(dir, 'swarmdo.config.json'), 'utf8'));

describe('profile use: writes config + settings.json env + dotenv', () => {
  it('applies ultra: sets levers, preserves foreign env keys, records config', async () => {
    const r = await run('use', ['ultra']);
    expect(r.success).toBe(true);

    const env = settingsEnv();
    expect(env.SWARMDO_ULTRA).toBe('1');
    expect(env.SWARMDO_HARNESS).toBe('1');
    expect(env.SWARMDO_ROUTER_NEURAL).toBe('1');
    // foreign keys survive
    expect(env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe('1');
    expect(env.MY_OWN_VAR).toBe('keepme');

    expect(config().profile.active).toBe('ultra');
    expect(config().profile.base).toBe('max');
    expect(config().llm.enabled).toBe(true);

    // cross-CLI dotenv written
    expect(existsSync(path.join(dir, '.swarmdo', 'profile.env'))).toBe(true);
  });

  it('switching ultra → light drops ultra-only levers and adds ponytail', async () => {
    await run('use', ['ultra']);
    await run('use', ['light']);
    const env = settingsEnv();
    expect(env.SWARMDO_HARNESS).toBe('1');
    expect(env.SWARMDO_PONYTAIL).toBe('1');
    expect(env.SWARMDO_ULTRA).toBeUndefined(); // gone — no stale lever
    expect(env.SWARMDO_ROUTER_NEURAL).toBeUndefined();
    expect(env.MY_OWN_VAR).toBe('keepme'); // still preserved
    expect(config().llm.enabled).toBe(false); // flipped off
    expect(config().profile.active).toBe('light');
  });

  it('`default` resolves to the recommended (smart) profile', async () => {
    await run('use', ['default']);
    expect(config().profile.active).toBe('smart');
    expect(settingsEnv().SWARMDO_ROUTER_NEURAL).toBe('1');
    expect(settingsEnv().SWARMDO_ULTRA).toBeUndefined();
  });

  it('unknown profile is rejected without writing config', async () => {
    const r = await run('use', ['bogus']);
    expect(r.success).toBe(false);
    expect(existsSync(path.join(dir, 'swarmdo.config.json'))).toBe(false);
  });

  it('clear unsets the active profile', async () => {
    await run('use', ['smart']);
    await run('clear');
    expect(config().profile.active).toBeUndefined();
    expect(config().profile.enabled).toBe(false);
  });
});
