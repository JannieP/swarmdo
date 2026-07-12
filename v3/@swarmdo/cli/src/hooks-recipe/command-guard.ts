/**
 * command-guard.ts — classify a bash command as safe or blockable, for a
 * PreToolUse/Bash hook that emits Claude Code's `permissionDecision: "deny"`.
 *
 * swarmdo runs headless `claude -p --dangerously-skip-permissions` in its
 * daemon / worker / repair flows; that flag skips the interactive approval
 * prompt but NOT hooks, so a PreToolUse deny is the only remaining guardrail.
 * The denylist is deliberately CONSERVATIVE — it blocks a small set of clearly
 * destructive / irreversible / remote-exec commands and lets everything else
 * through, so a routine `rm -rf ./build`, `rm -rf node_modules`, or a
 * feature-branch force-push is never blocked. Pure + injection-free → fully
 * unit-tested. This is defense-in-depth, not a sandbox: a determined command
 * (indirection through a variable, an obscure tool) can still get through.
 */

export interface GuardVerdict {
  block: boolean;
  /** why it was blocked (present only when block === true) */
  reason?: string;
  /** the matched rule id (stable identifier, useful for tests/telemetry) */
  rule?: string;
}

/** `rm` invoked with BOTH a recursive and a force flag (combined `-rf`/`-fr` or separate). */
function isRecursiveForceRm(c: string): boolean {
  if (!/\brm\b/.test(c)) return false;
  const recursive = /(?:^|\s)-[a-z]*r[a-z]*(?=\s|$)/i.test(c) || /(?:^|\s)--recursive\b/.test(c);
  const force = /(?:^|\s)-[a-z]*f[a-z]*(?=\s|$)/i.test(c) || /(?:^|\s)--force\b/.test(c);
  return recursive && force;
}

/** Does the command target a root / home / top-level system path (the only rm targets we block)? */
function hasCriticalTarget(c: string): boolean {
  if (/--no-preserve-root\b/.test(c)) return true;
  // a bare `/`, `~`, `$HOME`/`${HOME}` token, optionally with a trailing `/` or `/*` or `*`
  if (/(?:^|\s)(?:\/|~|\$\{?HOME\}?)(?:\/\s|\/$|\/\*|\*|\s|$)/.test(c)) return true;
  // a top-level system directory
  if (/(?:^|\s)\/(?:etc|usr|bin|sbin|var|lib|lib64|boot|sys|proc|dev|root|opt)(?:\/|\s|\*|$)/.test(c)) return true;
  return false;
}

interface Rule { id: string; reason: string; test: (c: string) => boolean; }

/** The denylist. Order determines which reason is reported when several match. */
export const GUARD_RULES: Rule[] = [
  {
    id: 'rm-rf-critical',
    reason: 'recursive force-delete of a root, home, or system path (rm -rf /, ~, or --no-preserve-root)',
    test: (c) => isRecursiveForceRm(c) && hasCriticalTarget(c),
  },
  {
    id: 'pipe-to-shell',
    reason: 'piping remote content straight into a shell (curl/wget … | sh) — remote code execution',
    test: (c) => /(?:\bcurl\b|\bwget\b)[^|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|ksh|fish)\b/.test(c),
  },
  {
    id: 'force-push-protected',
    reason: 'force-push to a protected branch (main/master) — use --force-with-lease',
    test: (c) => /\bgit\s+push\b/.test(c) && /(?:--force(?!-with-lease)\b|(?:^|\s)-f\b)/.test(c) && /\b(?:main|master)\b/.test(c),
  },
  {
    id: 'chmod-world-writable',
    reason: 'world-writable permissions (chmod 777)',
    test: (c) => /\bchmod\s+(?:-[a-z]+\s+)*(?:0?777|a\+rwx|ugo\+rwx)\b/i.test(c),
  },
  {
    id: 'dd-to-device',
    reason: 'dd writing directly to a block device (of=/dev/…) — data-destroying',
    test: (c) => /\bdd\b[^|;&]*\bof=\/dev\/(?:sd|nvme|disk|hd|mmcblk|vd|xvd)/.test(c),
  },
  {
    id: 'mkfs',
    reason: 'formatting a filesystem (mkfs) — data-destroying',
    test: (c) => /\bmkfs(?:\.\w+)?\b/.test(c),
  },
  {
    id: 'redirect-to-device',
    reason: 'redirecting output onto a raw block device (> /dev/sd…) — data-destroying',
    test: (c) => /(?:^|\s)>{1,2}\s*\/dev\/(?:sd|nvme|disk|hd|mmcblk|vd|xvd)/.test(c),
  },
  {
    id: 'fork-bomb',
    reason: 'shell fork bomb',
    test: (c) => /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(c.replace(/\s+/g, ' ')),
  },
];

/** Classify a bash command; blocks on the first matching danger rule, else allows. */
export function classifyCommand(command: string): GuardVerdict {
  const c = (command ?? '').trim();
  if (!c) return { block: false };
  for (const r of GUARD_RULES) {
    // a bad regex must never crash the hook (and thus never wrongly block)
    try { if (r.test(c)) return { block: true, reason: r.reason, rule: r.id }; } catch { /* skip */ }
  }
  return { block: false };
}

/**
 * Extract the Bash command from a PreToolUse hook payload (the JSON Claude Code
 * pipes on stdin: `{ "tool_name": "Bash", "tool_input": { "command": "…" } }`).
 * Tolerant — returns '' when absent or unparseable, so the hook simply allows.
 */
export function extractBashCommand(payload: string): string {
  if (!payload || !payload.trim()) return '';
  try {
    const o = JSON.parse(payload) as { tool_input?: { command?: unknown }; command?: unknown };
    const cmd = o?.tool_input?.command ?? o?.command;
    return typeof cmd === 'string' ? cmd : '';
  } catch { return ''; }
}

/** The PreToolUse deny payload Claude Code honors to hard-block a tool call. */
export function denyOutput(reason: string): {
  hookSpecificOutput: { hookEventName: 'PreToolUse'; permissionDecision: 'deny'; permissionDecisionReason: string };
} {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}
