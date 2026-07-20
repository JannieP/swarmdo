/**
 * project-toggles.ts — read/write feature toggles in swarmdo.config.json.
 *
 * Backs `swarmdo obsidian on|off|status` and `swarmdo llm on|off|status`, and
 * the statusline's `🧬 LLM` indicator. Each toggle is a `{ enabled: boolean }`
 * section (alongside the existing `openrouter` block). Pure fs, no deps —
 * cheap enough for the statusline to read on the delegated data path.
 */
import fs from 'node:fs';
import path from 'node:path';

export function toggleConfigPath(cwd: string = process.cwd()): string {
  return path.join(cwd, 'swarmdo.config.json');
}

export function loadProjectConfig(cwd: string = process.cwd()): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(toggleConfigPath(cwd), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function saveProjectConfig(cfg: Record<string, unknown>, cwd: string = process.cwd()): void {
  fs.writeFileSync(toggleConfigPath(cwd), JSON.stringify(cfg, null, 2) + '\n');
}

/** Set `<section>.enabled` (merging any extra fields), preserving the rest of the config. */
export function setToggle(
  section: string,
  enabled: boolean,
  extra: Record<string, unknown> = {},
  cwd: string = process.cwd(),
): void {
  const cfg = loadProjectConfig(cwd);
  const prev = (cfg[section] && typeof cfg[section] === 'object' ? cfg[section] : {}) as Record<string, unknown>;
  cfg[section] = { ...prev, ...extra, enabled };
  saveProjectConfig(cfg, cwd);
}

/** Read `<section>.enabled` (false when absent). Cheap — safe on the statusline path. */
export function toggleEnabled(section: string, cwd: string = process.cwd()): boolean {
  const s = loadProjectConfig(cwd)[section];
  return !!(s && typeof s === 'object' && (s as Record<string, unknown>).enabled);
}

/** Read a string field from a toggle section (e.g. obsidian.vault). */
export function toggleField(section: string, field: string, cwd: string = process.cwd()): string | undefined {
  const s = loadProjectConfig(cwd)[section] as Record<string, unknown> | undefined;
  const v = s && typeof s === 'object' ? s[field] : undefined;
  return typeof v === 'string' ? v : undefined;
}
