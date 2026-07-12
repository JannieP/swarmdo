/**
 * agents-lint.ts — static validation of Claude Code subagent definitions
 * (`.claude/agents/*.md`).
 *
 * Each subagent file is YAML frontmatter (`name` + `description` required;
 * `tools`, `model` optional) plus a system-prompt body. Claude Code SILENTLY
 * ignores a subagent whose frontmatter is malformed, whose `name` collides with
 * another file, or whose `model` is invalid — so "why isn't my subagent
 * loading?" is an undebuggable footgun, and users mass-copy these files from
 * large community collections where typos ride along. This catches those
 * before CC does.
 *
 * Pure: parsed text in, findings out — same `Finding` shape + report machinery
 * as the rest of config-lint; the command layer only reads files.
 */

import { parse as parseYaml } from 'yaml';
import type { Finding, Severity } from './lint.js';

const f = (file: string, severity: Severity, rule: string, message: string): Finding => ({ file, severity, rule, message });

/** Models a Claude Code subagent `model:` field may name. */
export const AGENT_MODELS = ['sonnet', 'opus', 'haiku', 'inherit'];

// Leading (optional BOM) `---` fence, YAML body (non-greedy) up to a closing
// `---` on its own line, then the optional system-prompt body. CRLF-tolerant.
const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;

interface ParsedAgent {
  meta: Record<string, unknown> | null;
  body: string;
  /** set when the frontmatter block is missing or not a YAML mapping */
  malformed?: string;
}

function parseAgent(raw: string): ParsedAgent {
  const m = raw.replace(/^\uFEFF/, "").match(FRONTMATTER_RE);
  if (!m) return { meta: null, body: '', malformed: 'no YAML frontmatter block (a subagent file must start with `---` … `---`)' };
  const body = m[2] ?? '';
  let fm: unknown;
  try {
    fm = parseYaml(m[1]);
  } catch (e) {
    return { meta: null, body, malformed: `frontmatter is not valid YAML: ${(e as Error).message}` };
  }
  if (fm === null || typeof fm !== 'object' || Array.isArray(fm)) {
    return { meta: null, body, malformed: 'frontmatter must be a YAML mapping of key: value' };
  }
  return { meta: fm as Record<string, unknown>, body };
}

function lintParsed(file: string, p: ParsedAgent): Finding[] {
  if (p.malformed) return [f(file, 'error', 'agent-malformed-frontmatter', p.malformed)];
  const out: Finding[] = [];
  const meta = p.meta!;

  if (typeof meta.name !== 'string' || meta.name.trim() === '') {
    out.push(f(file, 'error', 'agent-missing-name', 'frontmatter is missing a non-empty `name`'));
  }
  if (typeof meta.description !== 'string' || meta.description.trim() === '') {
    out.push(f(file, 'error', 'agent-missing-description', 'frontmatter is missing a non-empty `description` (Claude Code routes to a subagent by its description)'));
  }
  if (meta.model !== undefined && !AGENT_MODELS.includes(String(meta.model))) {
    out.push(f(file, 'error', 'agent-bad-model', `model "${String(meta.model)}" is not one of: ${AGENT_MODELS.join(', ')}`));
  }
  if (p.body.trim() === '') {
    out.push(f(file, 'warn', 'agent-empty-body', 'no system prompt below the frontmatter — the subagent has no instructions'));
  }
  return out;
}

/** Lint ONE subagent file's raw text. Pure. */
export function lintAgentFile(file: string, raw: string): Finding[] {
  return lintParsed(file, parseAgent(raw));
}

export interface AgentFile {
  file: string;
  raw: string;
}

/**
 * Lint a set of subagent files: every per-file rule PLUS cross-file duplicate
 * `name` detection (Claude Code loads only one of a colliding pair). Pure.
 */
export function lintAgents(files: AgentFile[]): Finding[] {
  const out: Finding[] = [];
  const nameToFiles = new Map<string, string[]>();
  for (const { file, raw } of files) {
    const p = parseAgent(raw);
    out.push(...lintParsed(file, p));
    const name = p.meta && typeof p.meta.name === 'string' ? p.meta.name.trim() : '';
    if (name) {
      const arr = nameToFiles.get(name) ?? [];
      arr.push(file);
      nameToFiles.set(name, arr);
    }
  }
  for (const [name, group] of nameToFiles) {
    if (group.length > 1) {
      out.push(f(group[0], 'error', 'agent-duplicate-name', `subagent name "${name}" is declared by ${group.length} files (${group.join(', ')}) — Claude Code loads only one; rename the rest`));
    }
  }
  return out;
}
