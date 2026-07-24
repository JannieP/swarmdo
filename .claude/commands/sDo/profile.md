---
description: Choose or switch the session capability profile (ultra/smart/light/minimal)
argument-hint: "[list|status|use <name>|<name>] — bare opens the chooser"
allowed-tools: Bash(npx swarmdo profile:*), Bash(node v3/@swarmdo/cli/bin/cli.js profile:*)
---

# /sDo:profile — pick how much swarmdo you want this session

A **profile** is a one-word answer for how many of swarmdo's tools are on:

| | Profile | What you get |
|---|---------|--------------|
| 🦾 | **ultra** | Everything on — ULTRA thoroughness, harness, neural routing, local SwarmLLM, efficiency skills. Max capability + cost. |
| 🧠 | **smart** ★ | The intelligence layer without the heaviest fan-out — harness + neural routing. The recommended daily driver. |
| 🪶 | **light** | Just the light tools — harness + ponytail (minimal-by-default) + efficiency skills. Fast, cheap. |
| 🔩 | **minimal** | Bare — plain Claude, no swarmdo flavor injected. Air-gapped / low-power. |

Resolve the swarmdo CLI as `npx swarmdo` if installed, else `node v3/@swarmdo/cli/bin/cli.js`.

## What to do

**If `$ARGUMENTS` names a subcommand or profile** (e.g. `use ultra`, `light`, `status`, `list`):
run `swarmdo profile $ARGUMENTS` (bare profile name → `swarmdo profile use <name>`). Then report the result.

**If `$ARGUMENTS` is empty** (the chooser):
1. Run `swarmdo profile list` to show the current ladder + which is active.
2. Ask the user which profile they want with **AskUserQuestion** — offer the four
   tiers, put **🧠 smart (Recommended)** first, and let them keep the current one.
3. Apply their pick with `swarmdo profile use <name>` (accepts `default` → smart).

## After applying

Tell the user what changed and that **session levers written to `.claude/settings.json` env
(SWARMDO_ULTRA / HARNESS / ROUTER_NEURAL / PONYTAIL) take effect on the NEXT session** —
Claude Code caches settings at session start. The statusline profile + efficiency skills are
live immediately. A `.swarmdo/profile.env` is also written so Codex CLI / Copilot CLI / pi can
`source` the same mode.
