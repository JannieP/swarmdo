import { describe, it, expect } from 'vitest';
import {
  SWARMDO_PRESETS,
  resolvePreset,
  presetNames,
  deriveHighlights,
} from '../src/init/presets.ts';

describe('presets: ladder shape', () => {
  it('has 5 rungs, tiers 0..4 in order', () => {
    expect(SWARMDO_PRESETS.map((p) => p.name)).toEqual(['minimal', 'basic', 'standard', 'advanced', 'max']);
    expect(SWARMDO_PRESETS.map((p) => p.tier)).toEqual([0, 1, 2, 3, 4]);
  });
  it('marks exactly one recommended default (basic)', () => {
    const rec = SWARMDO_PRESETS.filter((p) => p.recommended);
    expect(rec).toHaveLength(1);
    expect(rec[0].name).toBe('basic');
  });
  it('every preset carries complete metadata', () => {
    for (const p of SWARMDO_PRESETS) {
      expect(p.title).toBeTruthy();
      expect(p.summary).toBeTruthy();
      expect(p.whenToUse).toBeTruthy();
      expect(p.options.runtime.topology).toBeTruthy();
    }
  });
});

describe('presets: resolvePreset', () => {
  it('resolves canonical names (case-insensitive)', () => {
    expect(resolvePreset('basic')!.name).toBe('basic');
    expect(resolvePreset('MAX')!.name).toBe('max');
    expect(resolvePreset('  standard ')!.name).toBe('standard');
  });
  it('resolves friendly aliases', () => {
    expect(resolvePreset('default')!.name).toBe('basic');
    expect(resolvePreset('full')!.name).toBe('max');
    expect(resolvePreset('intermediate')!.name).toBe('standard');
  });
  it('returns undefined for unknown names', () => {
    expect(resolvePreset('turbo')).toBeUndefined();
    expect(resolvePreset('')).toBeUndefined();
  });
  it('presetNames lists the canonical rungs', () => {
    expect(presetNames()).toEqual(['minimal', 'basic', 'standard', 'advanced', 'max']);
  });
});

describe('presets: monotonic capability', () => {
  const h = SWARMDO_PRESETS.map((p) => deriveHighlights(p.options));

  it('max agents never decreases up the ladder', () => {
    const agents = h.map((x) => x.maxAgents);
    expect(agents).toEqual([...agents].sort((a, b) => a - b));
    expect(agents[0]).toBeLessThan(agents[agents.length - 1]);
  });

  it('vector intelligence turns on at standard and stays on', () => {
    expect(h[0].memoryIntelligence).toBe(false); // minimal
    expect(h[1].memoryIntelligence).toBe(false); // basic
    expect(h[2].memoryIntelligence).toBe(true);  // standard
    expect(h[3].memoryIntelligence).toBe(true);  // advanced
    expect(h[4].memoryIntelligence).toBe(true);  // max
  });

  it('only max enables dual-mode and the swarm MCP', () => {
    expect(h[3].dualMode).toBe(false);
    expect(h[3].mcpSwarm).toBe(false);
    expect(h[4].dualMode).toBe(true);
    expect(h[4].mcpSwarm).toBe(true);
  });

  it('every rung ships the efficiency skills (caveman + ponytail)', () => {
    for (const p of SWARMDO_PRESETS) {
      expect(p.options.skills.efficiency).toBe(true);
    }
  });
});

describe('presets: deriveHighlights reads options faithfully', () => {
  it('reports "all" for the max skill/agent sets', () => {
    const h = deriveHighlights(resolvePreset('max')!.options);
    expect(h.skills).toContain('all');
    expect(h.agentSets).toContain('all');
  });
  it('lists individual enabled sets for basic', () => {
    const h = deriveHighlights(resolvePreset('basic')!.options);
    expect(h.skills).toContain('core');
    expect(h.skills).toContain('efficiency');
    expect(h.skills).not.toContain('all');
  });
});
