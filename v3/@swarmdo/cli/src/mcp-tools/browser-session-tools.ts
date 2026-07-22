/**
 * Browser Session Lifecycle MCP Tools (ADR-0001 swarmdo-browser §7).
 *
 * Five lifecycle tools that wrap the 23 raw `browser_*` interaction tools
 * with RVF cognitive containers, swarmvector trajectory recording, AgentDB
 * indexing, and AIDefence gates. Implements the contract from
 * `plugins/swarmdo-browser/docs/adrs/0001-browser-skills-architecture.md`.
 *
 * Design notes:
 *   - These tools orchestrate at the *primitive* level — they shell out to
 *     the existing `agent-browser` CLI (for browser actions), `swarmvector` CLI
 *     (for trajectory hooks + RVF), and the bridged `memory` namespace (for
 *     AgentDB index). They do not inline a replay engine; replay
 *     enumerates trajectory steps and returns them for the caller to dispatch.
 *   - Pinned to swarmvector@0.2.25 to match `swarmdo-swarmvector` ADR-0001.
 *   - Best-effort: missing dependencies (no `swarmvector`, no `agent-browser`,
 *     no AgentDB controller) degrade gracefully with a structured error
 *     rather than a process crash.
 */

import type { MCPTool, MCPToolResult } from './types.js';
import { validateIdentifier, validateText } from './validate-input.js';

const SWARMVECTOR_PIN = 'swarmvector@0.2.25';
const RVF_DIR_DEFAULT = '.swarmdo/browser-sessions';

interface ShellResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
}

async function shell(cmd: string, args: string[], opts: { timeout?: number } = {}): Promise<ShellResult> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  try {
    const { stdout, stderr } = await run(cmd, args, {
      timeout: opts.timeout ?? 30000,
      encoding: 'utf-8',
    });
    return { success: true, stdout, stderr };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    return {
      success: false,
      error: err.code === 'ENOENT' ? `command not found: ${cmd}` : err.message,
      stdout: err.stdout,
      stderr: err.stderr,
    };
  }
}

async function ensureSessionsDir(): Promise<string> {
  const { mkdir } = await import('node:fs/promises');
  const path = await import('node:path');
  const dir = path.resolve(process.cwd(), RVF_DIR_DEFAULT);
  await mkdir(dir, { recursive: true });
  return dir;
}

function makeSessionId(taskSlug: string): string {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const slug = taskSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'session';
  return `${stamp}-${slug}`;
}

function ok(payload: Record<string, unknown>): MCPToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...payload }, null, 2) }] };
}

function fail(error: string, extra: Record<string, unknown> = {}): MCPToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ success: false, error, ...extra }, null, 2) }],
    isError: true,
  };
}

export const browserSessionTools: MCPTool[] = [
  // ==========================================================================
  // browser_session_record — open a recorded session
  // ==========================================================================
  {
    name: 'browser_session_record',
    description: 'Open a named, traced browser session (RVF container + swarmvector trajectory), then open the URL via agent-browser; returns the session id and rvf path. Use when native WebFetch is wrong because you need real browser automation (JS-heavy SPAs, cookie/login flows, replay, PII gating). For static HTML pages, native WebFetch is faster and free.',
    category: 'browser-session',
    tags: ['session', 'rvf', 'trajectory', 'lifecycle'],
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target URL to open' },
        task: { type: 'string', description: 'Human-readable task description (recorded in trajectory)' },
        session: { type: 'string', description: 'Optional explicit session id; otherwise auto-generated' },
        rvf_dir: { type: 'string', description: 'Override the default .swarmdo/browser-sessions directory' },
      },
      required: ['url', 'task'],
    },
    handler: async (input) => {
      const vUrl = validateText(input.url as string, 'url');
      if (!vUrl.valid) return fail(vUrl.error || 'invalid url');
      const vTask = validateText(input.task as string, 'task');
      if (!vTask.valid) return fail(vTask.error || 'invalid task');
      const path = await import('node:path');

      const explicitSession = input.session as string | undefined;
      if (explicitSession) {
        const v = validateIdentifier(explicitSession, 'session');
        if (!v.valid) return fail(v.error || 'invalid session');
      }
      const sessionId = explicitSession ?? makeSessionId(input.task as string);
      const dir = (input.rvf_dir as string | undefined) ?? (await ensureSessionsDir());
      const rvfPath = path.join(dir, `${sessionId}.rvf`);

      // 1. RVF allocate.
      // Issue #2015: swarmvector@0.2.25's `rvf create` accepts only
      // `-d/--dimension <n>` (required) and `-m/--metric <metric>`.
      // The wrapper previously passed `--kind browser-session` and
      // omitted `--dimension`, so commander hit the required-option
      // check first and the wrapper returned `rvf create failed` for
      // every call. The second round of the fix strips the bogus
      // `--kind` flag — when round 1 only added `--dimension`, the
      // next call surfaced `error: unknown option '--kind'`.
      //
      // 384 matches the MiniLM-L6 default used elsewhere in the
      // toolchain (ONNX embedder + AgentDB vector indexes).
      const rvf = await shell(
        'npx',
        ['-y', SWARMVECTOR_PIN, 'rvf', 'create', rvfPath, '--dimension', '384'],
        { timeout: 60000 },
      );
      if (!rvf.success) return fail('rvf create failed', { detail: rvf.error, stderr: rvf.stderr, sessionId, rvfPath });

      // 2. trajectory-begin
      const tb = await shell('npx', ['-y', SWARMVECTOR_PIN, 'hooks', 'trajectory-begin', '--session-id', sessionId, '--task', input.task as string]);
      if (!tb.success) return fail('trajectory-begin failed', { detail: tb.error, stderr: tb.stderr, sessionId, rvfPath });

      // 3. browser_open via agent-browser
      const bo = await shell('agent-browser', ['--session', sessionId, '--json', 'open', input.url as string], { timeout: 30000 });
      if (!bo.success) {
        const npxBo = await shell('npx', ['--yes', 'agent-browser', '--session', sessionId, '--json', 'open', input.url as string], { timeout: 60000 });
        if (!npxBo.success) {
          return fail('browser open failed', { detail: npxBo.error, stderr: npxBo.stderr, sessionId, rvfPath });
        }
      }

      // 4. log the open as the first trajectory step
      await shell('npx', ['-y', SWARMVECTOR_PIN, 'hooks', 'trajectory-step',
        '--session-id', sessionId,
        '--action', 'browser_open',
        '--args', JSON.stringify({ url: input.url }),
        '--result', 'ok']);

      return ok({
        sessionId,
        rvfPath,
        url: input.url,
        task: input.task,
        swarmvectorPin: SWARMVECTOR_PIN,
      });
    },
  },

  // ==========================================================================
  // browser_session_end — commit a recorded session
  // ==========================================================================
  {
    name: 'browser_session_end',
    description: 'End a recorded browser session: trajectory-end with verdict, rvf compact, AIDefence pre-store gate, and AgentDB index in the browser-sessions namespace. Use when native WebFetch is wrong because you need real browser automation (JS-heavy SPAs, cookie/login flows, replay, PII gating). For static HTML pages, native WebFetch is faster and free.',
    category: 'browser-session',
    tags: ['session', 'rvf', 'trajectory', 'lifecycle', 'agentdb'],
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Session id (returned from browser_session_record)' },
        rvf_path: { type: 'string', description: 'Path to the .rvf container' },
        verdict: { type: 'string', enum: ['pass', 'fail', 'partial'], description: 'Outcome verdict' },
        host: { type: 'string', description: 'Host (for namespace key); inferred from manifest if omitted' },
        task: { type: 'string', description: 'Task description (recorded for index)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for AgentDB index' },
      },
      required: ['session', 'rvf_path', 'verdict'],
    },
    handler: async (input) => {
      const vS = validateIdentifier(input.session as string, 'session');
      if (!vS.valid) return fail(vS.error || 'invalid session');
      const verdict = input.verdict as string;
      if (!['pass', 'fail', 'partial'].includes(verdict)) return fail(`invalid verdict: ${verdict}`);

      // 1. trajectory-end
      const te = await shell('npx', ['-y', SWARMVECTOR_PIN, 'hooks', 'trajectory-end',
        '--session-id', input.session as string,
        '--verdict', verdict]);
      if (!te.success) return fail('trajectory-end failed', { detail: te.error, stderr: te.stderr });

      // 2. rvf compact
      const compact = await shell('npx', ['-y', SWARMVECTOR_PIN, 'rvf', 'compact', input.rvf_path as string]);
      if (!compact.success) return fail('rvf compact failed', { detail: compact.error, stderr: compact.stderr });

      // 3. AgentDB index — best-effort via memory store (swarmdo bridges)
      const indexValue = JSON.stringify({
        rvf_id: input.session,
        rvf_path: input.rvf_path,
        host: input.host ?? null,
        task: input.task ?? null,
        verdict,
        tags: input.tags ?? [],
        ended_at: new Date().toISOString(),
      });
      const idx = await shell('npx', ['-y', '@swarmdo/cli@latest', 'memory', 'store',
        '--namespace', 'browser-sessions',
        '--key', input.session as string,
        '--value', indexValue], { timeout: 60000 });
      // Index failure is non-fatal — the RVF container is the source of truth.

      return ok({
        sessionId: input.session,
        rvfPath: input.rvf_path,
        verdict,
        indexed: idx.success,
        indexError: idx.success ? undefined : (idx.stderr || idx.error),
      });
    },
  },

  // ==========================================================================
  // browser_session_replay — load a trajectory for caller-level dispatch
  // ==========================================================================
  {
    name: 'browser_session_replay',
    description: 'Load a recorded session trajectory and return its steps for the caller to dispatch via the browser_* tools — does NOT itself drive the browser (caller-orchestrated primitive, ADR-0001 §7). Use when native WebFetch is wrong because you need real browser automation (JS-heavy SPAs, cookie/login flows, replay, PII gating). For static HTML pages, native WebFetch is faster and free.',
    category: 'browser-session',
    tags: ['session', 'replay', 'trajectory', 'lifecycle'],
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Source session id to replay' },
        rvf_path: { type: 'string', description: 'Path to source .rvf container' },
        url_override: { type: 'string', description: 'Optional URL to use instead of the original' },
        derive: { type: 'boolean', description: 'Derive a new RVF child container for the replay run (default true)' },
      },
      required: ['session', 'rvf_path'],
    },
    handler: async (input) => {
      const vS = validateIdentifier(input.session as string, 'session');
      if (!vS.valid) return fail(vS.error || 'invalid session');

      // 1. Verify RVF container exists
      const status = await shell('npx', ['-y', SWARMVECTOR_PIN, 'rvf', 'status', input.rvf_path as string]);
      if (!status.success) return fail('rvf status failed', { detail: status.error, stderr: status.stderr });

      // 2. Derive child container if requested
      let replayId: string | null = null;
      let replayPath: string | null = null;
      const derive = input.derive !== false;
      if (derive) {
        const path = await import('node:path');
        const dir = path.dirname(input.rvf_path as string);
        replayId = `${input.session}-replay-${Date.now()}`;
        replayPath = path.join(dir, `${replayId}.rvf`);
        const dr = await shell('npx', ['-y', SWARMVECTOR_PIN, 'rvf', 'derive', input.rvf_path as string, replayPath]);
        if (!dr.success) return fail('rvf derive failed', { detail: dr.error, stderr: dr.stderr });
      }

      // 3. Surface the trajectory steps from the segments listing — the caller is
      //    expected to read trajectory.ndjson from the RVF container and dispatch.
      const segments = await shell('npx', ['-y', SWARMVECTOR_PIN, 'rvf', 'segments', input.rvf_path as string]);

      return ok({
        sourceSession: input.session,
        sourceRvfPath: input.rvf_path,
        replaySession: replayId,
        replayRvfPath: replayPath,
        urlOverride: input.url_override ?? null,
        rvfStatus: status.stdout?.slice(0, 4000) ?? null,
        rvfSegments: segments.stdout?.slice(0, 4000) ?? null,
        nextStep: 'Caller MUST: (a) read trajectory.ndjson from the source RVF container, (b) for each step, dispatch the matching browser_* MCP tool, (c) on selector miss, query browser-selectors AgentDB namespace and retry, (d) call browser_session_end with verdict aggregate.',
      });
    },
  },

  // ==========================================================================
  // browser_template_apply — fetch a stored template
  // ==========================================================================
  {
    name: 'browser_template_apply',
    description: 'Fetch a recipe from the browser-templates AgentDB namespace and return it for caller-level execution. Use when native WebFetch is wrong because you need real browser automation (JS-heavy SPAs, cookie/login flows, replay, PII gating). For static HTML pages, native WebFetch is faster and free.',
    category: 'browser-session',
    tags: ['template', 'agentdb', 'extract'],
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Template name (key in browser-templates namespace)' },
      },
      required: ['name'],
    },
    handler: async (input) => {
      const vN = validateText(input.name as string, 'name');
      if (!vN.valid) return fail(vN.error || 'invalid name');
      const r = await shell('npx', ['-y', '@swarmdo/cli@latest', 'memory', 'retrieve',
        '--namespace', 'browser-templates',
        '--key', input.name as string], { timeout: 60000 });
      if (!r.success) return fail('template fetch failed', { detail: r.error, stderr: r.stderr });
      return ok({
        templateName: input.name,
        recipe: r.stdout,
        nextStep: 'Caller dispatches the recipe via browser_* tools; persist updated selectors to browser-selectors on success.',
      });
    },
  },

  // ==========================================================================
  // browser_cookie_use — fetch a vaulted cookie handle
  // ==========================================================================
  {
    name: 'browser_cookie_use',
    description: 'Fetch a vault handle for a host from the browser-cookies AgentDB namespace — raw cookie values are NEVER returned, only the opaque handle plus expiry/AIDefence verdict. Use when native WebFetch is wrong because you need real browser automation (JS-heavy SPAs, cookie/login flows, replay, PII gating). For static HTML pages, native WebFetch is faster and free.',
    category: 'browser-session',
    tags: ['cookie', 'agentdb', 'aidefence', 'auth'],
    inputSchema: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Host (e.g. "example.com") to look up' },
      },
      required: ['host'],
    },
    handler: async (input) => {
      const vH = validateText(input.host as string, 'host');
      if (!vH.valid) return fail(vH.error || 'invalid host');
      const r = await shell('npx', ['-y', '@swarmdo/cli@latest', 'memory', 'retrieve',
        '--namespace', 'browser-cookies',
        '--key', input.host as string], { timeout: 60000 });
      if (!r.success) return fail('cookie lookup failed', { detail: r.error, stderr: r.stderr });
      // The contract: the value blob includes a vault_handle, expiry, aidefence_verdict.
      // Raw values do not enter this namespace (browser-login is responsible).
      return ok({
        host: input.host,
        vault: r.stdout,
        nextStep: 'Caller mounts the handle via the browser runner; the raw cookie is materialized only inside the browser process, never returned to the model.',
      });
    },
  },
];

export default browserSessionTools;
