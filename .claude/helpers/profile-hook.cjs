#!/usr/bin/env node
/**
 * profile-hook.cjs — SessionStart nudge to pick a swarmdo capability profile.
 *
 * Deployed by `swarmdo init`. Emits a one-time SessionStart additionalContext
 * asking the agent to offer a profile choice when swarmdo.config.json has no
 * `profile.active`. Pure fs, no CLI boot, always exits 0 (never blocks a
 * session). Silent once a profile is chosen. See `swarmdo profile`.
 */
const fs = require('fs');
const path = require('path');
try {
  const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(dir, 'swarmdo.config.json'), 'utf8')); } catch (_e) { /* no config yet */ }
  const active = cfg && cfg.profile && cfg.profile.active;
  if (!active) {
    const msg = '[SWARMDO] No session capability profile is set for this project. '
      + 'Run `swarmdo profile list` and offer the user a one-time choice (recommended: smart). '
      + 'Apply their pick with `swarmdo profile use <name>` (accepts `default`). '
      + 'Present it with AskUserQuestion near the top of your first reply; once chosen it will not ask again.';
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: msg } }) + '\n');
  }
} catch (_e) { /* never block session start */ }
process.exit(0);
