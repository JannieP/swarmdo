/**
 * Shared local executor for the orchestration engine — a deterministic heuristic
 * "agent" (not an LLM, not a test mock) so `orchestrate` (CLI) and its MCP tools
 * can run end-to-end offline via the `--demo` / `demo:true` path.
 */
import type { AgentExecutor } from './engine.js';

/** Refutes claims carrying absolutist red-flags; otherwise answers with a task-derived string. */
export const localDemoExecutor: AgentExecutor = async (input) => {
  const text = input.prompt.toLowerCase();
  if (text.includes('refuted')) {
    const redFlags = ['always', 'never', 'guaranteed', '100%', 'everyone', 'no one', 'impossible', 'certainly'];
    const refuted = redFlags.some((w) => text.includes(w));
    return {
      success: true,
      output: JSON.stringify({
        refuted,
        reason: refuted ? 'claim uses an absolutist / unfalsifiable phrasing' : 'no obvious flaw found',
      }),
    };
  }
  const answer = input.prompt.replace(/\s+/g, ' ').trim().slice(0, 60);
  return { success: true, output: `demo-answer: ${answer}` };
};

/** True when any LLM provider is configured (else callers should require --demo). */
export function hasProvider(): boolean {
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OLLAMA_API_KEY ||
    process.env.SWARMDO_PROVIDER
  );
}
