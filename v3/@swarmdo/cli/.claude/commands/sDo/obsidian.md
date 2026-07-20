---
description: Toggle the dual-plane Obsidian memory integration (on|off|status)
argument-hint: "[on|off|status] (default: status)"
allowed-tools: Bash(npx swarmdo obsidian:*), Bash(node v3/@swarmdo/cli/bin/cli.js obsidian:*)
---

# /obsidian — turn the Obsidian memory integration on/off

Toggle swarmdo's **dual-plane Obsidian memory integration** for this project —
the memory vector DB rendered as an editable Obsidian markdown vault (one note
per entry + `INDEX.md`, live `[[wikilinks]]`), synced back with re-embedding.

Resolve the swarmdo CLI as `npx swarmdo` if installed, else
`node v3/@swarmdo/cli/bin/cli.js`.

Run: `swarmdo obsidian $ARGUMENTS` (defaults to `status` when no argument is given).

- **on** — enables it and exports the current memory into a vault (default
  `./vault`). The user then edits notes in Obsidian and syncs back with
  `swarmdo memory import -i <vault> -f obsidian --watch` (live sync).
- **off** — disables it (the vault files are kept on disk).
- **status** — shows on/off + the vault path + note count.

After running, tell the user the vault path and the one-line sync command
(`swarmdo memory import -i <vault> -f obsidian --watch`).
