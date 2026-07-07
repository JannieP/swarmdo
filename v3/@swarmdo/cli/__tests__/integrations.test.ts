import { describe, it, expect } from 'vitest';
import {
  mergeCodexToml,
  mergeCopilotMcpJson,
  crossAgentAgentsMd,
  copilotInstructionsMd,
  evaluateStatus,
} from '../src/integrations/integrations.ts';

describe('integrations: codex toml merge', () => {
  it('creates the marked block from nothing and is idempotent', () => {
    const first = mergeCodexToml(null);
    expect(first.changed).toBe(true);
    expect(first.content).toContain('[mcp_servers.swarmdo]');
    expect(first.content).toContain('"swarmdo@latest"');
    const second = mergeCodexToml(first.content);
    expect(second.changed).toBe(false);
    expect(second.content).toBe(first.content);
  });
  it('appends after existing user config without touching it', () => {
    const user = '[model]\nname = "o4"\n';
    const merged = mergeCodexToml(user);
    expect(merged.content.startsWith(user)).toBe(true);
    expect(merged.content).toContain('[mcp_servers.swarmdo]');
  });
  it('respects a hand-written swarmdo server (no duplicate)', () => {
    const user = '[mcp_servers.swarmdo]\ncommand = "my-custom"\n';
    expect(mergeCodexToml(user)).toEqual({ content: user, changed: false });
  });
});

describe('integrations: copilot json merge', () => {
  it('creates config, preserves other servers, idempotent', () => {
    const first = mergeCopilotMcpJson(null);
    expect(first.changed).toBe(true);
    const cfg = JSON.parse(first.content);
    expect(cfg.mcpServers.swarmdo.command).toBe('npx');
    const withOther = JSON.stringify({ mcpServers: { github: { command: 'gh-mcp' } } });
    const merged = JSON.parse(mergeCopilotMcpJson(withOther).content);
    expect(merged.mcpServers.github.command).toBe('gh-mcp');
    expect(merged.mcpServers.swarmdo).toBeDefined();
    expect(mergeCopilotMcpJson(first.content).changed).toBe(false);
  });
  it('never clobbers an unparseable file', () => {
    const r = mergeCopilotMcpJson('{broken');
    expect(r.changed).toBe(false);
    expect(r.content).toBe('{broken');
  });
});

describe('integrations: generated docs', () => {
  it('AGENTS.md covers the cross-agent contract and protects Claude surfaces', () => {
    const md = crossAgentAgentsMd();
    for (const marker of ['AGENTS.md', 'memory_search', 'memory_store', 'swarm_init', 'mcp start', 'Do not edit `.claude/', 'CLAUDE.md']) {
      expect(md).toContain(marker);
    }
  });
  it('copilot instructions point at AGENTS.md', () => {
    expect(copilotInstructionsMd()).toContain('AGENTS.md');
  });
});

describe('integrations: status evaluation', () => {
  const base = {
    agentsMd: 'x', codexToml: '[mcp_servers.swarmdo]\n', copilotJson: JSON.stringify({ mcpServers: { swarmdo: {} } }),
    copilotInstructions: 'y', claudeMcpJson: JSON.stringify({ mcpServers: { swarmdo: {} } }), claudeDirExists: true,
  };
  it('all green when everything is wired', () => {
    expect(evaluateStatus(base).every((s) => s.ok)).toBe(true);
  });
  it('claude status is independent of the other targets (do-not-break check)', () => {
    const broken = evaluateStatus({ ...base, codexToml: null, copilotJson: null, copilotInstructions: null, agentsMd: null });
    const claude = broken.find((s) => s.target === 'claude')!;
    expect(claude.ok).toBe(true); // claude stays green even with zero other integrations
    expect(broken.find((s) => s.target === 'pi')!.ok).toBe(false);
  });
});
