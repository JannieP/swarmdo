/**
 * Orchestration MCP tools — expose the deterministic verify/vote patterns to
 * agents (the primary consumer). Each fans out many parallel LLM calls on the
 * stateless provider wire and combines them; `demo:true` runs a local no-LLM
 * heuristic so the tool works with no provider configured.
 */
import type { MCPTool } from './types.js';
import { adversarialVerify, judgePanel } from '../orchestration/patterns.js';
import { localDemoExecutor } from '../orchestration/demo-executor.js';

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

const verifyTool: MCPTool = {
  name: 'orchestrate_verify',
  description:
    'Adversarially verify a claim: spawn N independent skeptics in parallel, each trying to REFUTE it through a different lens; the claim survives only if a minority refute. Use when a single yes/no answer is wrong because you need a claim checked before acting on it. demo:true runs a local no-LLM heuristic.',
  category: 'orchestrate',
  inputSchema: {
    type: 'object',
    properties: {
      claim: { type: 'string', description: 'The claim to verify' },
      rounds: { type: 'number', description: 'Number of skeptics (default 3, one per lens)' },
      model: { type: 'string', description: 'Model slug for the fan-out (cheap-routing lever)' },
      demo: { type: 'boolean', description: 'Run with a local deterministic executor (no LLM/provider)' },
    },
    required: ['claim'],
  },
  handler: async (params: Record<string, unknown>) => {
    const claim = str(params.claim);
    if (!claim) return { error: true, message: 'claim (string) is required' };
    const executor = params.demo === true ? localDemoExecutor : undefined;
    const r = await adversarialVerify(claim, { rounds: num(params.rounds), model: str(params.model), executor });
    return { verified: r.verified, refutations: r.refutations, rounds: r.rounds, votes: r.votes };
  },
};

const panelTool: MCPTool = {
  name: 'orchestrate_panel',
  description:
    'Answer a task via N diversified attempts run in parallel + majority vote, returning the winner and an agreement count. Use when a single model call is too unreliable because you want a voted answer with a confidence signal. demo:true runs a local no-LLM heuristic.',
  category: 'orchestrate',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The task/question to answer' },
      attempts: { type: 'number', description: 'Number of diversified attempts (default 3)' },
      model: { type: 'string', description: 'Model slug for the fan-out (cheap-routing lever)' },
      demo: { type: 'boolean', description: 'Run with a local deterministic executor (no LLM/provider)' },
    },
    required: ['task'],
  },
  handler: async (params: Record<string, unknown>) => {
    const task = str(params.task);
    if (!task) return { error: true, message: 'task (string) is required' };
    const executor = params.demo === true ? localDemoExecutor : undefined;
    const r = await judgePanel(task, { attempts: num(params.attempts), model: str(params.model), executor });
    return { winner: r.winner, agreement: r.agreement, cast: r.cast };
  },
};

export const orchestrationTools: MCPTool[] = [verifyTool, panelTool];
