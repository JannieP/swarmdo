/**
 * permissions/audit.ts — static analyzer for Claude Code permission rules (#80).
 *
 * Claude Code reads `permissions.allow` / `deny` / `ask` arrays from
 * `.claude/settings.json` (+ `settings.local.json` + `~/.claude/settings.json`),
 * each entry a `Tool` or `Tool(specifier)` rule, with precedence deny > ask >
 * allow. Users hand-edit these and get them wrong: a rule in both allow and deny
 * (silently dead), a specific allow already covered by a broader one, or an
 * over-broad `Bash(*)` that re-grants what deny was fencing off.
 *
 * This is the PURE rule layer — parse + set logic, no fs/network — so the whole
 * analysis is unit-testable; the command reads the settings files.
 */

export type PermSeverity = 'error' | 'warn' | 'info';

export interface PermFinding {
  severity: PermSeverity;
  /** kebab-case finding type */
  rule: string;
  message: string;
  /** the rule string(s) the finding is about */
  subjects: string[];
}

export interface ParsedRule {
  tool: string;
  /** undefined = a bare tool rule (grants the whole tool) */
  specifier?: string;
}

export type ParseResult = ParsedRule | { error: string };

export interface PermissionSets {
  allow?: string[];
  deny?: string[];
  ask?: string[];
}

/** Parse one `Tool` or `Tool(specifier)` rule. */
export function parseRule(raw: string): ParseResult {
  const s = (raw ?? '').trim();
  if (!s) return { error: 'empty rule' };
  const open = s.indexOf('(');
  if (open === -1) {
    // Bare tool, e.g. `Bash` or `WebFetch`.
    if (!/^[A-Za-z_][\w-]*$/.test(s)) return { error: 'invalid tool name' };
    return { tool: s };
  }
  if (!s.endsWith(')')) return { error: 'unbalanced parentheses' };
  const tool = s.slice(0, open);
  if (!tool) return { error: 'missing tool name' };
  if (!/^[A-Za-z_][\w-]*$/.test(tool)) return { error: 'invalid tool name' };
  const specifier = s.slice(open + 1, s.length - 1);
  if (specifier.trim() === '') return { error: 'empty specifier' };
  return { tool, specifier };
}

function isParsed(r: ParseResult): r is ParsedRule {
  return (r as ParsedRule).tool !== undefined;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Turn a specifier glob (`*` = any run) into an anchored matcher. */
function specifierMatches(broadSpec: string, target: string): boolean {
  const re = new RegExp('^' + broadSpec.split('*').map(escapeRegex).join('.*') + '$');
  return re.test(target);
}

/**
 * Does `broad` grant everything `specific` grants (same tool)? A bare tool or a
 * `*` specifier covers anything on that tool; otherwise the broad specifier is
 * glob-matched against the specific one (exact equality included).
 */
export function covers(broad: ParsedRule, specific: ParsedRule): boolean {
  if (broad.tool !== specific.tool) return false;
  if (broad.specifier === undefined) return true; // bare tool grants all
  if (broad.specifier === '*') return true;
  if (specific.specifier === undefined) return false; // broad is scoped, specific is the whole tool
  return specifierMatches(broad.specifier, specific.specifier);
}

/** True for a rule that grants an entire tool (`Bash` or `Bash(*)`). */
function isWholeTool(r: ParsedRule): boolean {
  return r.specifier === undefined || r.specifier === '*';
}

interface Entry {
  raw: string;
  parsed: ParsedRule;
}

/**
 * Analyze a merged permission ruleset. Reports: allow↔deny conflicts (dead allow
 * rules), allow rules shadowed by a broader allow, over-broad whole-tool grants,
 * exact duplicates, and malformed rules. Order: errors, then warns, then infos.
 */
export function auditPermissions(perms: PermissionSets): PermFinding[] {
  const findings: PermFinding[] = [];
  const parsed: Record<'allow' | 'deny' | 'ask', Entry[]> = { allow: [], deny: [], ask: [] };

  for (const list of ['allow', 'deny', 'ask'] as const) {
    for (const raw of perms[list] ?? []) {
      const r = parseRule(raw);
      if (!isParsed(r)) {
        findings.push({ severity: 'error', rule: 'malformed-rule', message: `${list} rule "${raw}" is malformed: ${(r as { error: string }).error}`, subjects: [raw] });
      } else {
        parsed[list].push({ raw, parsed: r });
      }
    }
  }

  // conflict: an allow rule that some deny rule covers is dead (deny wins).
  for (const a of parsed.allow) {
    const killer = parsed.deny.find((d) => covers(d.parsed, a.parsed));
    if (killer) {
      findings.push({ severity: 'error', rule: 'conflict', message: `allow "${a.raw}" is dead — deny "${killer.raw}" overrides it (deny wins)`, subjects: [a.raw, killer.raw] });
    }
  }

  // over-broad: an allow rule granting a whole tool defeats scoped denies.
  for (const a of parsed.allow) {
    if (isWholeTool(a.parsed)) {
      findings.push({ severity: 'warn', rule: 'over-broad', message: `allow "${a.raw}" grants every ${a.parsed.tool} call — narrow it or a scoped deny can't fence it off`, subjects: [a.raw] });
    }
  }

  // exact duplicates within a list.
  for (const list of ['allow', 'deny', 'ask'] as const) {
    const seen = new Set<string>();
    const dupped = new Set<string>();
    for (const e of parsed[list]) {
      if (seen.has(e.raw)) dupped.add(e.raw);
      else seen.add(e.raw);
    }
    for (const raw of dupped) {
      findings.push({ severity: 'info', rule: 'duplicate', message: `${list} rule "${raw}" is listed more than once`, subjects: [raw] });
    }
  }

  // shadowed-allow: a scoped allow rule already covered by a broader, different allow.
  for (const a of parsed.allow) {
    if (isWholeTool(a.parsed)) continue; // whole-tool grants are flagged as over-broad, not shadowed
    const broader = parsed.allow.find((b) => b.raw !== a.raw && covers(b.parsed, a.parsed));
    if (broader) {
      findings.push({ severity: 'info', rule: 'shadowed-allow', message: `allow "${a.raw}" is redundant — already covered by "${broader.raw}"`, subjects: [a.raw, broader.raw] });
    }
  }

  const order: Record<PermSeverity, number> = { error: 0, warn: 1, info: 2 };
  return findings.sort((x, y) => order[x.severity] - order[y.severity]);
}
