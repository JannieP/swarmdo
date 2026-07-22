/**
 * `swarmdo orchestrate` — runnable surface for the deterministic orchestration
 * engine. Exposes the two lifted GAIA patterns:
 *   - verify <claim>  → adversarialVerify (skeptic panel, majority-refute kills)
 *   - panel  <task>   → judgePanel (N diversified attempts + majority vote)
 *
 * Uses the real provider-routed LLM wire when a provider is configured
 * (ANTHROPIC_API_KEY / OPENROUTER_API_KEY / OLLAMA_API_KEY / SWARMDO_PROVIDER);
 * `--model <slug>` is the cheap-routing lever. `--demo` swaps in a deterministic
 * local heuristic executor so the engine runs end-to-end with no key (also what
 * the feature's demonstration exercises).
 */
import type { Command, CommandContext, CommandResult } from '../types.js';
import type { AgentExecutor } from '../orchestration/engine.js';
import { adversarialVerify, judgePanel } from '../orchestration/patterns.js';

/**
 * Deterministic local "agent" — a real heuristic, not an LLM and not a test
 * mock. Refutes claims carrying absolutist red-flags; otherwise answers with a
 * task-derived string. Lets `orchestrate` (and its demonstration) run offline.
 */
const localDemoExecutor: AgentExecutor = async (input) => {
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

function hasProvider(): boolean {
  return !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OLLAMA_API_KEY ||
    process.env.SWARMDO_PROVIDER
  );
}

/** Resolve the executor + guard against "no provider and not a demo". */
function resolveExecutor(ctx: CommandContext): { executor?: AgentExecutor; error?: CommandResult } {
  const demo = ctx.flags.demo === true;
  if (demo) return { executor: localDemoExecutor };
  if (!hasProvider()) {
    console.error(
      'No LLM provider configured. Set ANTHROPIC_API_KEY / OPENROUTER_API_KEY / OLLAMA_API_KEY ' +
        '(or SWARMDO_PROVIDER), or pass --demo to run the local no-LLM demonstration.',
    );
    return { error: { success: false, exitCode: 1 } };
  }
  return { executor: undefined }; // undefined → engine's real default (callAnthropicMessages)
}

const modelFlag = (ctx: CommandContext): string | undefined =>
  typeof ctx.flags.model === 'string' ? ctx.flags.model : undefined;

const COMMON_OPTS = [
  { name: 'model', description: 'Model slug for the fan-out (cheap-routing lever)', type: 'string' as const },
  { name: 'demo', description: 'Run with a local deterministic executor (no LLM/provider needed)', type: 'boolean' as const },
  { name: 'json', description: 'Emit the raw result as JSON', type: 'boolean' as const },
];

export const orchestrateCommand: Command = {
  name: 'orchestrate',
  description: 'Deterministic multi-agent orchestration — adversarial verify + judge-panel vote',
  aliases: ['orch'],
  subcommands: [
    {
      name: 'verify',
      description: 'Adversarially verify a claim with a panel of independent skeptics',
      options: [
        { name: 'rounds', description: 'Number of skeptics (default: 3, one per lens)', type: 'number' },
        { name: 'strict', description: 'Exit non-zero (2) when the claim is NOT verified — for CI gating', type: 'boolean' },
        ...COMMON_OPTS,
      ],
      examples: [
        { command: 'swarmdo orchestrate verify "the cache is always faster" --demo', description: 'Local demo, no key' },
        { command: 'swarmdo orchestrate verify "auth uses PKCE" --model anthropic/claude-haiku-4.5', description: 'Cheap live model' },
      ],
      action: async (ctx: CommandContext): Promise<CommandResult> => {
        const claim = ctx.args.join(' ').trim();
        if (!claim) {
          console.error('Usage: swarmdo orchestrate verify "<claim>" [--rounds N] [--model slug] [--demo]');
          return { success: false, exitCode: 1 };
        }
        const { executor, error } = resolveExecutor(ctx);
        if (error) return error;
        const rounds = Number(ctx.flags.rounds) || undefined;
        const result = await adversarialVerify(claim, { rounds, model: modelFlag(ctx), executor });
        if (ctx.flags.json === true) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Claim:     ${claim}`);
          console.log(`Verdict:   ${result.verified ? '✓ VERIFIED (survived the skeptics)' : '✗ NOT VERIFIED'}`);
          console.log(`Skeptics:  ${result.refutations} of ${result.votes.filter(Boolean).length} refuted (rounds=${result.rounds})`);
          const reasons = result.votes.filter((v) => v && v.refuted && v.reason).map((v) => `  - ${v!.reason}`);
          if (reasons.length) console.log('Refutations:\n' + [...new Set(reasons)].join('\n'));
        }
        // Default: informational (exit 0). --strict: a failed verification exits
        // non-zero so `verify … --strict && next` gates in CI (mirrors `usage guard --strict`).
        if (ctx.flags.strict === true && !result.verified) {
          return { success: false, exitCode: 2, data: result };
        }
        return { success: true, data: result };
      },
    },
    {
      name: 'panel',
      description: 'Answer a task via N diversified attempts + majority vote',
      options: [
        { name: 'attempts', description: 'Number of diversified attempts (default: 3)', type: 'number' },
        ...COMMON_OPTS,
      ],
      examples: [
        { command: 'swarmdo orchestrate panel "what port does the MCP server use?" --demo', description: 'Local demo' },
      ],
      action: async (ctx: CommandContext): Promise<CommandResult> => {
        const task = ctx.args.join(' ').trim();
        if (!task) {
          console.error('Usage: swarmdo orchestrate panel "<task>" [--attempts N] [--model slug] [--demo]');
          return { success: false, exitCode: 1 };
        }
        const { executor, error } = resolveExecutor(ctx);
        if (error) return error;
        const attempts = Number(ctx.flags.attempts) || undefined;
        const result = await judgePanel(task, { attempts, model: modelFlag(ctx), executor });
        if (ctx.flags.json === true) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Task:      ${task}`);
          console.log(`Winner:    ${result.winner ?? '(no answer)'}`);
          console.log(`Agreement: ${result.agreement} of ${result.cast} attempts agreed`);
        }
        // A null winner means every attempt failed — a real error, exit 1.
        return { success: result.winner !== null, exitCode: result.winner === null ? 1 : 0, data: result };
      },
    },
  ],
};
