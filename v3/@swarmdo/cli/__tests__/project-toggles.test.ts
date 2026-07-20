/**
 * project-toggles — the config helper behind `swarmdo obsidian/llm on|off|status`
 * and the statusline 🧬 LLM icon. Pure fs against a temp dir.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setToggle, toggleEnabled, toggleField, loadProjectConfig } from '../src/config/project-toggles.ts';

describe('project-toggles', () => {
  it('sets enabled + extra, preserves the rest of the config, and reads back', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sd-toggles-'));
    try {
      // pre-existing unrelated config must survive
      writeFileSync(path.join(dir, 'swarmdo.config.json'), JSON.stringify({ openrouter: { enabled: true } }));

      setToggle('obsidian', true, { vault: 'myvault' }, dir);
      expect(toggleEnabled('obsidian', dir)).toBe(true);
      expect(toggleField('obsidian', 'vault', dir)).toBe('myvault');
      expect((loadProjectConfig(dir).openrouter as Record<string, unknown>).enabled).toBe(true); // preserved

      setToggle('obsidian', false, {}, dir); // off keeps the extra fields
      expect(toggleEnabled('obsidian', dir)).toBe(false);
      expect(toggleField('obsidian', 'vault', dir)).toBe('myvault');

      expect(toggleEnabled('llm', dir)).toBe(false); // absent section → false
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('missing config file → enabled false, field undefined (no throw)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sd-toggles-none-'));
    try {
      expect(toggleEnabled('llm', dir)).toBe(false);
      expect(toggleField('obsidian', 'vault', dir)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
