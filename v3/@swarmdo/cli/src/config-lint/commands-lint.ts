/**
 * commands-lint.ts — static validation of Claude Code custom slash commands
 * (the `.claude/commands` tree) and skills (`.claude/skills/<name>/SKILL.md`).
 *
 * Slash commands / skills are the most-copied Claude Code power-user artifact,
 * and CC swallows their footguns silently: malformed YAML frontmatter makes CC
 * load the body with EMPTY metadata (so `/cmd` "works" typed but Claude can
 * never auto-match it), and two body rules bite in ways manual review misses —
 * an inline `` !`cmd` `` that isn't at a line start / after whitespace is left as
 * literal text and NEVER runs, and one whose command no `allowed-tools` Bash
 * rule covers prompts/blocks instead of running pre-approved. This catches those
 * before CC does. Sibling of agents-lint; same `Finding` shape.
 *
 * Pure: parsed text in, findings out. Reuses the permission-rule matcher
 * (parseRule/covers) so allowed-tools coverage matches Claude Code's own glob
 * semantics. Only truly-bounded fields are enum-checked (NOT `model`, which
 * accepts aliases and full IDs) to stay false-positive-safe.
 */

import { parse as parseYaml } from 'yaml';
import { parseRule, covers, type ParsedRule } from '../permissions/audit.js';
import type { Finding, Severity } from './lint.js';

const f = (file: string, severity: Severity, rule: string, message: string): Finding => ({ file, severity, rule, message });

/** Reasoning-effort levels a command/skill `effort:` field may name. */
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;

interface Parsed {
  /** null = no frontmatter present (valid for a plain-markdown command) */
  meta: Record<string, unknown> | null;
  body: string;
  /** set when an opening fence is present but the block is invalid */
  malformed?: string;
}

function parseFile(raw: string): Parsed {
  const text = raw.replace(/^\uFEFF/, '');
  const m = text.match(FRONTMATTER_RE);
  if (!m) {
    // An opening `---` with no closing fence is malformed; anything else is a
    // plain-markdown command (no frontmatter — perfectly valid).
    if (/^---[ \t]*\r?\n/.test(text)) return { meta: null, body: text, malformed: 'has an opening `---` but no closing `---` fence' };
    return { meta: null, body: text };
  }
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

interface Injection {
  cmd: string;
  active: boolean;
}

/**
 * Inline bash-injection placeholders `` !`cmd` `` in the body. Claude Code only
 * RUNS one whose `!` is at a line start or immediately after whitespace; if `!`
 * follows another character (e.g. `` KEY=!`cmd` ``) it is left as literal text.
 */
function bashInjections(body: string): Injection[] {
  const out: Injection[] = [];
  const re = /!`([^`\n]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const at = m.index;
    const active = at === 0 || /\s/.test(body[at - 1]);
    out.push({ cmd: m[1].trim(), active });
  }
  return out;
}

/** Parse the `allowed-tools` frontmatter (string list or YAML array) into rules;
 * null = the key is absent (no pre-approval declared, so coverage isn't checked). */
function allowedToolRules(meta: Record<string, unknown>): ParsedRule[] | null {
  const at = meta['allowed-tools'] ?? meta['allowedTools'];
  if (at === undefined) return null;
  const parts = Array.isArray(at) ? at.map(String) : typeof at === 'string' ? at.split(',') : [];
  const rules: ParsedRule[] = [];
  for (const p of parts) {
    const r = parseRule(p.trim());
    if ((r as ParsedRule).tool !== undefined) rules.push(r as ParsedRule);
  }
  return rules;
}

/** Lint ONE command/skill file's raw text. `kind` toggles the skill-only rule
 * that frontmatter (with name + description) is REQUIRED. Pure. */
export function lintCommandFile(file: string, raw: string, kind: 'command' | 'skill' = 'command'): Finding[] {
  const p = parseFile(raw);
  const out: Finding[] = [];

  if (p.malformed) {
    out.push(f(file, 'error', 'command-malformed-frontmatter', p.malformed));
  } else if (kind === 'skill' && !p.meta) {
    out.push(f(file, 'error', 'skill-missing-frontmatter', 'a SKILL.md must start with a `---` … `---` frontmatter block declaring `name` and `description`'));
  }

  const meta = p.meta;
  if (meta) {
    if (kind === 'skill' && (typeof meta.name !== 'string' || meta.name.trim() === '')) {
      out.push(f(file, 'error', 'skill-missing-name', 'frontmatter is missing a non-empty `name`'));
    }
    if (typeof meta.description !== 'string' || meta.description.trim() === '') {
      const how = kind === 'skill' ? 'decide when to invoke the skill' : 'list the command and model-invoke it';
      out.push(f(file, kind === 'skill' ? 'error' : 'warn', 'command-missing-description', `frontmatter has no non-empty \`description\` (Claude Code uses it to ${how})`));
    }
    if (meta.effort !== undefined && !EFFORT_LEVELS.includes(String(meta.effort))) {
      out.push(f(file, 'error', 'command-bad-effort', `effort "${String(meta.effort)}" is not one of: ${EFFORT_LEVELS.join(', ')}`));
    }
  }

  // Body cross-checks (both kinds). Coverage is only checked when allowed-tools
  // is declared — otherwise the author never opted into pre-approval.
  const rules = meta ? allowedToolRules(meta) : null;
  for (const inj of bashInjections(p.body)) {
    const tok = '!`' + inj.cmd + '`';
    if (!inj.active) {
      out.push(f(file, 'warn', 'command-inert-bash-injection', `inline bash ${tok} follows a non-whitespace character — Claude Code leaves it as literal text and never runs it (put \`!\` at a line start or after whitespace)`));
      continue;
    }
    if (rules && rules.length > 0 && !rules.some((r) => covers(r, { tool: 'Bash', specifier: inj.cmd }))) {
      out.push(f(file, 'warn', 'command-uncovered-bash-injection', `inline bash ${tok} is not covered by any \`allowed-tools\` Bash rule — it will prompt/block instead of running pre-approved`));
    }
  }

  return out;
}

export interface CommandFile {
  file: string;
  raw: string;
}

/** Lint a set of command files and skill files. Pure. */
export function lintCommandFiles(commands: CommandFile[], skills: CommandFile[] = []): Finding[] {
  const out: Finding[] = [];
  for (const c of commands) out.push(...lintCommandFile(c.file, c.raw, 'command'));
  for (const s of skills) out.push(...lintCommandFile(s.file, s.raw, 'skill'));
  return out;
}
