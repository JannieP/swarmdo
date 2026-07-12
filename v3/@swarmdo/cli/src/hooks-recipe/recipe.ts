/**
 * recipe.ts — ready-made Claude Code hook recipes, installed into settings.
 *
 * The most-requested Claude Code hook is "ping me when Claude finishes"; swarmdo
 * already has the delivery half (`swarmdo hooks notify -d`, a real desktop toast),
 * so this wires it into a Stop/Notification hook for you. The merge is pure,
 * additive, and idempotent — it never clobbers existing hooks or other settings,
 * and re-running is a no-op — so it is unit-tested without touching disk. The
 * command layer defaults to a dry-run preview and only writes on --apply.
 */

export interface HookRecipe {
  name: string;
  /** Claude Code hook event: Stop, Notification, PostToolUse, … */
  event: string;
  /** tool matcher (only for PreToolUse/PostToolUse); omitted for Stop/Notification */
  matcher?: string;
  command: string;
  title: string;
  description: string;
}

export const RECIPES: HookRecipe[] = [
  {
    name: 'notify-done',
    event: 'Stop',
    command: 'swarmdo hooks notify -d -m "Claude finished"',
    title: 'Desktop ping when Claude finishes',
    description: 'Fires an OS-native desktop notification each time Claude finishes responding (Stop hook). Powered by `swarmdo hooks notify -d`.',
  },
  {
    name: 'notify-input',
    event: 'Notification',
    command: 'swarmdo hooks notify -d -m "Claude needs your input"',
    title: 'Desktop ping when Claude needs input',
    description: 'Fires a desktop notification when Claude is waiting for input or a permission decision (Notification hook).',
  },
  {
    name: 'memory-inject',
    event: 'UserPromptSubmit',
    command: 'swarmdo hooks memory-inject',
    title: 'Inject relevant memories into each prompt',
    description: 'On every prompt, semantically searches your stored memories (claude-memories/auto-memory/patterns) and injects the most relevant ones as context under a token budget (UserPromptSubmit hook). Powered by `swarmdo hooks memory-inject`. Opt-in: adds a small per-prompt search.',
  },
  {
    name: 'comms-inbox',
    event: 'UserPromptSubmit',
    command: 'swarmdo comms inbox --hook',
    title: 'Surface new cross-session messages each prompt',
    description: 'On every prompt, injects any unread messages other sessions sent to this one (multiplayer swarms) as context, then marks them read — so mail surfaces without polling (UserPromptSubmit hook). Powered by `swarmdo comms inbox --hook`. Opt-in.',
  },
  {
    name: 'command-guard',
    event: 'PreToolUse',
    matcher: 'Bash',
    command: 'swarmdo hooks guard-bash',
    title: 'Block dangerous bash commands before they run',
    description: 'Inspects every Bash tool call and hard-blocks a conservative denylist of destructive commands (rm -rf / , curl|sh, force-push to main, chmod 777, dd to a device, mkfs, fork bombs) via Claude Code’s PreToolUse `permissionDecision: "deny"`. Powered by `swarmdo hooks guard-bash`. Opt-in — the one guardrail that still fires under `--dangerously-skip-permissions`.',
  },
];

export function findRecipe(name: string): HookRecipe | undefined {
  const n = (name ?? '').trim().toLowerCase();
  return RECIPES.find((r) => r.name === n);
}

export function recipeNames(): string[] {
  return RECIPES.map((r) => r.name);
}

interface CommandHook { type: string; command: string; }
interface HookEntry { matcher?: string; hooks: CommandHook[]; }
type Settings = Record<string, unknown>;

/** Is this recipe's exact command already wired to its event? */
export function hasRecipe(settings: unknown, r: HookRecipe): boolean {
  const hooks = (settings as { hooks?: Record<string, unknown> } | null)?.hooks;
  const events = hooks?.[r.event];
  if (!Array.isArray(events)) return false;
  // Match on matcher too: the same command under a DIFFERENT matcher is a
  // distinct binding, so a matcher-scoped recipe isn't "already installed" just
  // because its command appears elsewhere (matcher-less recipes compare
  // undefined === undefined, unchanged).
  return events.some(
    (e) => e && typeof e === 'object' && (e as HookEntry).matcher === r.matcher &&
      Array.isArray((e as HookEntry).hooks) &&
      (e as HookEntry).hooks.some((h) => h?.command === r.command),
  );
}

export interface ApplyResult {
  settings: Settings;
  changed: boolean;
}

/** Additively merge a recipe into a settings object. Pure: returns a new object,
 * never mutates the input. Idempotent: a no-op if the recipe is already present. */
export function applyRecipe(settings: unknown, r: HookRecipe): ApplyResult {
  const next: Settings = settings && typeof settings === 'object' ? JSON.parse(JSON.stringify(settings)) : {};
  if (hasRecipe(next, r)) return { settings: next, changed: false };
  const hooks = (next.hooks && typeof next.hooks === 'object' ? next.hooks : {}) as Record<string, unknown>;
  const events = Array.isArray(hooks[r.event]) ? (hooks[r.event] as HookEntry[]) : [];
  const entry: HookEntry = { hooks: [{ type: 'command', command: r.command }] };
  if (r.matcher) entry.matcher = r.matcher;
  hooks[r.event] = [...events, entry];
  next.hooks = hooks;
  return { settings: next, changed: true };
}

/** Apply several recipes in sequence; reports which actually changed. */
export function applyRecipes(settings: unknown, recipes: HookRecipe[]): { settings: Settings; installed: string[]; skipped: string[] } {
  let cur: Settings = settings && typeof settings === 'object' ? JSON.parse(JSON.stringify(settings)) : {};
  const installed: string[] = [];
  const skipped: string[] = [];
  for (const r of recipes) {
    const res = applyRecipe(cur, r);
    cur = res.settings;
    (res.changed ? installed : skipped).push(r.name);
  }
  return { settings: cur, installed, skipped };
}
