/**
 * Kebab-twin flag mirroring (parser.ts parse()).
 *
 * The parser camelCases flag keys, but ~120 read sites across 31 command
 * files read the literal kebab form (`ctx.flags['max-iterations']`) — every
 * one silently fell back to its default while the flag "parsed fine".
 * Found when `swarmdo repair --max-iterations 2 --max-budget-usd 1` ran
 * with 4 iterations and a $5 ceiling. These tests pin the mirror contract.
 */

import { describe, it, expect } from 'vitest';
import { CommandParser } from '../src/parser.js';

function makeParser(): CommandParser {
  const p = new CommandParser({ allowUnknownFlags: false });
  p.registerCommand({
    name: 'demo',
    description: 'test command',
    options: [
      { name: 'max-iterations', description: 'n', type: 'number', default: 4 },
      { name: 'max-budget-usd', description: 'usd', type: 'number', default: 5 },
      { name: 'dry-run', description: 'plan only', type: 'boolean', default: false },
      { name: 'plain', description: 'single word', type: 'string' },
    ],
    action: async () => ({ success: true }),
  });
  return p;
}

describe('kebab flag twins', () => {
  it('exposes explicit kebab flags under BOTH key forms', () => {
    const r = makeParser().parse(['demo', '--max-iterations', '2', '--max-budget-usd', '1']);
    expect(r.flags.maxIterations).toBe(2);
    expect(r.flags['max-iterations']).toBe(2);
    expect(r.flags.maxBudgetUsd).toBe(1);
    expect(r.flags['max-budget-usd']).toBe(1);
  });

  it('leaves unset flags to the command layer (no phantom twins invented)', () => {
    // Command-option defaults are applied at execution, not in parse();
    // the mirror must not conjure keys that were never set.
    const r = makeParser().parse(['demo']);
    expect(r.flags.maxIterations).toBeUndefined();
    expect(r.flags['max-iterations']).toBeUndefined();
  });

  it('boolean and --no- forms mirror as well', () => {
    expect(makeParser().parse(['demo', '--dry-run']).flags['dry-run']).toBe(true);
    expect(makeParser().parse(['demo', '--no-dry-run']).flags['dry-run']).toBe(false);
  });

  it('does not invent twins for single-word flags and keeps positionals intact', () => {
    const r = makeParser().parse(['demo', 'pos1', '--plain', 'x']);
    expect(r.flags.plain).toBe('x');
    expect(Object.keys(r.flags).filter((k) => k.includes('plain'))).toEqual(['plain']);
    expect(r.positional).toContain('pos1');
  });

  it('kebab twins survive an =-form parse and mirror the same value object', () => {
    const r = makeParser().parse(['demo', '--max-budget-usd=2.5']);
    expect(r.flags.maxBudgetUsd).toBe(2.5);
    expect(r.flags['max-budget-usd']).toBe(2.5);
  });
});
