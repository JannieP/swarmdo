/**
 * llm.ts — `swarmdo llm on|off|status`
 *
 * Toggles the local SwarmLLM inference backend for this project. `on`/`off`
 * write `llm.enabled` to swarmdo.config.json — the SAME flag the statusline's
 * `🧬 LLM` indicator reads, so the icon reflects a real on/off switch (not just
 * "the WASM happens to be installed"). `status` also probes actual availability.
 *
 * SwarmLLM is swarmdo's native micro-inference engine (MicroLoRA / SONA / HNSW,
 * ADR-086) — local, air-gapped, sub-cent per call. See `docs/USERGUIDE.md`.
 */
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { setToggle, toggleEnabled } from '../config/project-toggles.js';

async function probeAvailable(): Promise<{ available: boolean; version: string | null }> {
  try {
    const { getSwarmllmStatus } = await import('../swarmvector/swarmllm-wasm.js');
    const s = await getSwarmllmStatus();
    return { available: !!s.available, version: s.version ?? null };
  } catch {
    return { available: false, version: null };
  }
}

async function run(ctx: CommandContext): Promise<CommandResult> {
  const cwd = ctx.cwd || process.cwd();
  const action = (ctx.args[0] || 'status').toLowerCase();

  if (action === 'on') {
    setToggle('llm', true, {}, cwd);
    output.printSuccess('SwarmLLM local inference ON — statusline shows 🧬 LLM');
    const { available, version } = await probeAvailable();
    if (available) output.writeln(`  backend available${version ? ` (v${version})` : ''} — MicroLoRA / SONA / HNSW ready`);
    else output.writeln(output.warning('  backend NOT available here — @swarmvector/swarmllm-wasm is missing or failed to load; enable persisted, but calls will error until it is installed/fixed'));
    return { success: true, exitCode: 0 };
  }

  if (action === 'off') {
    setToggle('llm', false, {}, cwd);
    output.printSuccess('SwarmLLM local inference OFF — 🧬 LLM hidden');
    return { success: true, exitCode: 0 };
  }

  // status
  const on = toggleEnabled('llm', cwd);
  const { available, version } = await probeAvailable();
  output.writeln(`  ${on ? '◉ on ' : '○ off'}  SwarmLLM local inference`);
  output.writeln(`         backend: ${available ? `available${version ? ` (v${version})` : ''}` : 'unavailable (package missing / not initialized)'}`);
  output.writeln(output.dim('  toggle: swarmdo llm on|off  ·  engine: MicroLoRA / SONA / HNSW (local, air-gapped)'));
  return { success: true, exitCode: 0 };
}

export const llmCommand: Command = {
  name: 'llm',
  description: 'Toggle the local SwarmLLM inference backend for this project (on|off|status)',
  examples: [
    { command: 'swarmdo llm on', description: 'Enable local SwarmLLM (statusline shows 🧬 LLM)' },
    { command: 'swarmdo llm status', description: 'Show on/off + backend availability' },
    { command: 'swarmdo llm off', description: 'Disable local SwarmLLM' },
  ],
  action: run,
};

export default llmCommand;
