/**
 * MCP tools-profile tests — Sprint 2 Move 2'.
 *
 * Covers the pure profile resolution (profiles.ts) and the registry rebuild
 * (mcp-client applyToolProfile / applyToolGroups): lean is a strict, smaller
 * subset of full, group filtering is exact, and unknown profiles fail open.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { resolveProfileGroups, TOOLS_PROFILES, isToolsProfileName } from '../src/mcp-tools/profiles.js';
import { applyToolProfile, applyToolGroups, listMCPTools, TOOL_GROUP_KEYS } from '../src/mcp-client.js';

describe('profiles.ts resolution', () => {
  it('resolves lean/balanced/full', () => {
    expect(resolveProfileGroups('full')).toBe('all');
    expect(resolveProfileGroups('lean')).toEqual(TOOLS_PROFILES.lean);
    expect(Array.isArray(resolveProfileGroups('balanced'))).toBe(true);
  });
  it('fails open to all on unknown / undefined', () => {
    expect(resolveProfileGroups('bogus')).toBe('all');
    expect(resolveProfileGroups(undefined)).toBe('all');
  });
  it('isToolsProfileName guards correctly', () => {
    expect(isToolsProfileName('lean')).toBe(true);
    expect(isToolsProfileName('xl')).toBe(false);
  });
  it('lean ⊂ balanced (balanced is a superset)', () => {
    const lean = TOOLS_PROFILES.lean as readonly string[];
    const balanced = TOOLS_PROFILES.balanced as readonly string[];
    expect(lean.every(g => balanced.includes(g))).toBe(true);
    expect(balanced.length).toBeGreaterThan(lean.length);
  });
});

describe('mcp-client registry rebuild', () => {
  afterAll(() => { applyToolProfile('full'); }); // restore global registry for other suites

  it('full registers strictly more tools than lean', () => {
    const full = applyToolProfile('full').toolCount;
    const lean = applyToolProfile('lean').toolCount;
    expect(lean).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(lean);
  });

  it('lean exposes memory tools but not metaharness tools', () => {
    applyToolProfile('lean');
    const names = listMCPTools().map(t => t.name);
    expect(names.some(n => n.startsWith('memory_'))).toBe(true);
    expect(names.some(n => n.startsWith('metaharness_'))).toBe(false);
  });

  it('applyToolGroups filters to exactly the requested groups', () => {
    const { profileGroups, toolCount } = applyToolGroups(['agent']);
    expect(profileGroups).toEqual(['agent']);
    expect(toolCount).toBeGreaterThan(0);
    const names = listMCPTools().map(t => t.name);
    expect(names.every(n => n.startsWith('agent') || n === 'agents')).toBe(true);
  });

  it('TOOL_GROUP_KEYS covers the lean groups', () => {
    for (const g of TOOLS_PROFILES.lean as readonly string[]) {
      expect(TOOL_GROUP_KEYS).toContain(g);
    }
  });
});
