/**
 * agent-bridge-hook.cjs — bind real Claude Code subagents into Swarmdo's
 * canonical agent registry, automatically.
 *
 * #108. `src/agent-bridge/bridge.ts` was written to solve "a session can run
 * four Claude Code agents while `swarmdo agent list` stays empty", and is pure
 * by design because "All fs / MCP / spawning lives in the command + hook
 * layers". The command layer got built (`swarmdo agent bridge register`); the
 * hook layer never did. So nothing ever registered a Task/Agent-tool subagent,
 * `.swarmdo/agents/store.json` stayed `{"agents":{}}`, and the statusline's
 * `🐝 Swarms N   🤖 Agents M` sat at 0/0 forever. This file is that missing
 * hook layer.
 *
 * Why shell out to the CLI instead of writing the store here: registering is
 * not just a store write — `agent_bridge_register` also auto-forms a swarm from
 * config and enrolls the agent (agent-tools.ts:462), which is what makes the
 * Swarms counter move too. bridge.ts's own rule is to go through the canonical
 * registerAgent path — "NO parallel store". Reimplementing that in CJS would
 * fork the registry. The CLI costs ~850ms to boot (it loads ONNX), far too slow
 * to block every subagent spawn, so calls are fired detached and unref'd: the
 * hook returns immediately and the registry lands ~1s later. The statusline
 * polls every 5s, so eventual consistency is invisible here.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Mirror of src/agent-bridge/bridge.ts `bridgeAgentId` — kept in sync by hand,
 * because this hook is standalone CommonJS and cannot import the ESM engine
 * (the same constraint router.cjs already works under for classifyPrompt).
 * __tests__/agent-bridge-hook.test.ts asserts the two implementations agree.
 *
 * Deterministic, so SubagentStart and SubagentStop derive the SAME id from the
 * same agent_id and the stop reliably terminates the record the start created.
 */
function bridgeAgentId(d) {
  const sess = d.sessionId
    ? d.sessionId.replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'nosess'
    : 'nosess';
  const safe = String(d.name || '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'agent';
  return `cc-${sess}-${safe}`;
}

/**
 * Locate an installed CLI bin. Mirror of statusline.cjs resolveCliBin() — same
 * candidate order, same reason (#2337): never `npx @latest` from a hook.
 * Returns null when nothing is installed, in which case we no-op rather than
 * pay a registry round-trip on every subagent spawn.
 */
function resolveCliBin(cwd) {
  try {
    const home = os.homedir();
    const base = cwd || process.cwd();
    const candidates = [
      path.join(home, '.claude', 'plugins', 'marketplaces', 'swarmdo', 'bin', 'cli.js'),
      path.join(base, 'node_modules', '@swarmdo', 'cli', 'bin', 'cli.js'),
      path.join(base, 'node_modules', 'swarmdo', 'bin', 'cli.js'),
      path.join(base, 'v3', '@swarmdo', 'cli', 'bin', 'cli.js'),
    ];
    try {
      const binDir = path.dirname(process.execPath);
      const globalModuleDirs = [
        path.join(binDir, '..', 'lib', 'node_modules'),
        path.join(binDir, 'node_modules'),
        '/opt/homebrew/lib/node_modules',
        '/usr/local/lib/node_modules',
      ];
      for (const prefix of [process.env.npm_config_prefix, process.env.PREFIX, path.join(home, '.npm-global')]) {
        if (prefix) globalModuleDirs.push(path.join(prefix, 'lib', 'node_modules'));
      }
      for (const gm of globalModuleDirs) {
        candidates.push(
          path.join(gm, 'swarmdo', 'bin', 'cli.js'),
          path.join(gm, '@swarmdo', 'cli', 'bin', 'cli.js'),
        );
      }
    } catch { /* ignore */ }
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Is this hook payload a real subagent event we should act on? `agent_id` is
 * present ONLY when the hook fires for a subagent, so it doubles as the guard
 * against main-thread invocations. Pure.
 */
function isSubagentEvent(hookInput) {
  const id = hookInput && (hookInput.agent_id || hookInput.agentId);
  return typeof id === 'string' && id.length > 0;
}

/**
 * Build the `agent bridge register` argv for a SubagentStart payload, or null
 * when the payload is not a subagent event. Pure — the spawn happens in
 * register(). Registering is idempotent on name+session, so a duplicate
 * SubagentStart updates the bound record rather than forking a second one.
 */
function buildRegisterArgs(hookInput) {
  if (!isSubagentEvent(hookInput)) return null;
  const agentId = hookInput.agent_id || hookInput.agentId;
  const sessionId = hookInput.session_id || hookInput.sessionId || '';
  const agentType = hookInput.agent_type || hookInput.agentType || 'general-purpose';
  const args = ['agent', 'bridge', 'register', '-n', agentId, '-t', agentType];
  if (sessionId) args.push('-s', sessionId);
  return args;
}

/**
 * Build the `agent stop` argv for a SubagentStop payload, or null when the
 * payload is not a subagent event. `agent stop` sets status='terminated'
 * (agent-tools.ts:721), which is precisely what computeSwarmStatus filters on,
 * so the Agents count decrements when a subagent finishes. `-f` because a hook
 * has no TTY and must not hit the interactive confirm. Pure.
 */
function buildTerminateArgs(hookInput) {
  if (!isSubagentEvent(hookInput)) return null;
  const id = bridgeAgentId({
    name: hookInput.agent_id || hookInput.agentId,
    sessionId: hookInput.session_id || hookInput.sessionId,
  });
  return ['agent', 'stop', id, '-f'];
}

/**
 * Fire a CLI subcommand and forget it. Detached + unref'd + stdio ignored so
 * the hook process can exit immediately without waiting on the CLI's ~850ms
 * boot, and without the child dying alongside it.
 */
function spawnDetached(args, cwd) {
  const cliBin = resolveCliBin(cwd);
  if (!cliBin) return false;
  try {
    const child = spawn(process.execPath, [cliBin, ...args], {
      cwd: cwd || process.cwd(),
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** SubagentStart → bind the subagent (and auto-form its swarm). */
function register(hookInput, cwd) {
  const args = buildRegisterArgs(hookInput);
  if (!args) return false;
  return spawnDetached(args, cwd || (hookInput && hookInput.cwd));
}

/** SubagentStop → mark the bound record terminated. */
function terminate(hookInput, cwd) {
  const args = buildTerminateArgs(hookInput);
  if (!args) return false;
  return spawnDetached(args, cwd || (hookInput && hookInput.cwd));
}

module.exports = {
  bridgeAgentId,
  resolveCliBin,
  isSubagentEvent,
  buildRegisterArgs,
  buildTerminateArgs,
  spawnDetached,
  register,
  terminate,
};
