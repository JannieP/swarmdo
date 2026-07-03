/**
 * GitHub Copilot integration config test — Move C.
 *
 * Guards the shipped example `.vscode/mcp.json` (docs/integrations/github-copilot/):
 * valid JSON, correct VS Code MCP schema (root `servers`, stdio), and — the
 * load-bearing bit — that the `--tools-profile` value it references is a REAL
 * profile in profiles.ts. If someone renames/removes the lean profile, this
 * fails instead of silently shipping a broken Copilot doc.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isToolsProfileName } from '../src/mcp-tools/profiles.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const configPath = join(repoRoot, 'docs', 'integrations', 'github-copilot', 'mcp.json');

describe('Copilot example mcp.json', () => {
  it('exists and is valid JSON', () => {
    expect(existsSync(configPath)).toBe(true);
    expect(() => JSON.parse(readFileSync(configPath, 'utf8'))).not.toThrow();
  });

  it('uses the VS Code MCP schema (root `servers`, stdio swarmdo server)', () => {
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(cfg.servers).toBeDefined();
    expect(cfg.mcpServers).toBeUndefined(); // common wrong key
    const swarmdo = cfg.servers.swarmdo;
    expect(swarmdo).toBeDefined();
    expect(swarmdo.type).toBe('stdio');
    expect(swarmdo.command).toBe('npx');
    expect(swarmdo.args).toEqual(expect.arrayContaining(['swarmdo', 'mcp', 'start', '--tools-profile']));
  });

  it('references a REAL tools-profile (ties the doc to profiles.ts)', () => {
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    const args: string[] = cfg.servers.swarmdo.args;
    const idx = args.indexOf('--tools-profile');
    expect(idx).toBeGreaterThan(-1);
    const profile = args[idx + 1];
    expect(isToolsProfileName(profile)).toBe(true);
  });

  it('declares a secret input for the API key (not hard-coded)', () => {
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    const raw = JSON.stringify(cfg);
    expect(raw).not.toMatch(/sk-ant-/); // no real key committed
    expect(raw).toMatch(/\$\{input:/); // uses the input-variable form
    expect(Array.isArray(cfg.inputs)).toBe(true);
    expect(cfg.inputs.some((i: { password?: boolean }) => i.password === true)).toBe(true);
  });
});
