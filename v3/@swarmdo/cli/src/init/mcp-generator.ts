/**
 * MCP Configuration Generator
 * Creates .mcp.json for Claude Code MCP server integration
 * Handles cross-platform compatibility (Windows requires cmd /c wrapper)
 */

import type { InitOptions, MCPConfig } from './types.js';

/**
 * Check if running on Windows
 */
function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Generate platform-specific MCP server entry
 * - Windows: uses 'cmd /c npx' directly
 * - Unix: uses 'npx' directly (simple, reliable)
 */
function createMCPServerEntry(
  npxArgs: string[],
  env: Record<string, string>,
  additionalProps: Record<string, unknown> = {}
): object {
  if (isWindows()) {
    return {
      command: 'cmd',
      args: ['/c', 'npx', '-y', ...npxArgs],
      env,
      ...additionalProps,
    };
  }

  // Unix: direct npx invocation — simple and reliable
  return {
    command: 'npx',
    args: ['-y', ...npxArgs],
    env,
    ...additionalProps,
  };
}

/**
 * Generate MCP configuration
 */
export function generateMCPConfig(options: InitOptions): object {
  const config = options.mcp;
  const mcpServers: Record<string, object> = {};

  const npmEnv = {
    npm_config_update_notifier: 'false',
  };

  // Swarmdo MCP server (core) — uses swarmdo wrapper for portable npm-resolved invocation.
  // #2206: key MUST be 'swarmdo' so all plugins resolve as mcp__swarmdo__*.
  // The command args (swarmdo@latest mcp start) are the correct wrapper invocation — only the
  // registration KEY changes here.
  if (config.claudeFlow) {
    mcpServers['swarmdo'] = createMCPServerEntry(
      ['swarmdo@latest', 'mcp', 'start'],
      {
        ...npmEnv,
        SWARMDO_MODE: 'v3',
        SWARMDO_HOOKS_ENABLED: 'true',
        SWARMDO_TOPOLOGY: options.runtime.topology,
        SWARMDO_MAX_AGENTS: String(options.runtime.maxAgents),
        SWARMDO_MEMORY_BACKEND: options.runtime.memoryBackend,
      },
      { autoStart: config.autoStart }
    );
  }

  // Ruf-Swarm MCP server (enhanced coordination)
  if (config.swarmdoSwarm) {
    mcpServers['swarmdo-swarm'] = createMCPServerEntry(
      ['swarmdo-swarm', 'mcp', 'start'],
      { ...npmEnv },
      { optional: true }
    );
  }


  return { mcpServers };
}

/**
 * Generate .mcp.json as formatted string
 */
export function generateMCPJson(options: InitOptions): string {
  const config = generateMCPConfig(options);
  return JSON.stringify(config, null, 2);
}

/**
 * Generate MCP server add commands for manual setup
 */
export function generateMCPCommands(options: InitOptions): string[] {
  const commands: string[] = [];
  const config = options.mcp;

  if (isWindows()) {
    if (config.claudeFlow) {
      // #2206: registration name must be 'swarmdo' to match mcp__swarmdo__* tool naming
      commands.push('claude mcp add swarmdo -- cmd /c npx -y swarmdo@latest mcp start');
    }
    if (config.swarmdoSwarm) {
      commands.push('claude mcp add swarmdo-swarm -- cmd /c npx -y swarmdo-swarm mcp start');
    }
  } else {
    if (config.claudeFlow) {
      // #2206: registration name must be 'swarmdo' to match mcp__swarmdo__* tool naming
      commands.push("claude mcp add swarmdo -- npx -y swarmdo@latest mcp start");
    }
    if (config.swarmdoSwarm) {
      commands.push("claude mcp add swarmdo-swarm -- npx -y swarmdo-swarm mcp start");
    }
  }

  return commands;
}

/**
 * Get platform-specific setup instructions
 */
export function getPlatformInstructions(): { platform: string; note: string } {
  if (isWindows()) {
    return {
      platform: 'Windows',
      note: 'MCP configuration uses cmd /c wrapper for npx compatibility.',
    };
  }
  return {
    platform: process.platform === 'darwin' ? 'macOS' : 'Linux',
    note: 'MCP configuration uses npx directly.',
  };
}
