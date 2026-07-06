---
description: Edit the swarmdo statusline — pick segments via checklist or preset
argument-hint: "[full|compact|minimal|custom|show|reset] or comma list (e.g. project,model,swarm)"
allowed-tools: Bash(npx swarmdo statusline:*), Bash(node v3/@swarmdo/cli/bin/cli.js statusline:*), AskUserQuestion
---

# /statusline — configure the swarmdo statusline

Configure which segments the swarmdo statusline shows. The selection is stored
in `.swarmdo/statusline.json` (this project) and takes effect on the next
statusline refresh — no regeneration needed. `SWARMDO_STATUSLINE` env, if set,
overrides the file.

Resolve the swarmdo CLI as `npx swarmdo` if installed, else
`node v3/@swarmdo/cli/bin/cli.js` (this repo). Call it `$CLI` below.

## Input

`$ARGUMENTS`

## Behavior

**If the argument is `show`** — run `$CLI statusline show`, relay the checklist
and the preview verbatim.

**If the argument is `reset`** — run `$CLI statusline reset --yes`, confirm to
the user what it fell back to.

**If the argument is `full`, `compact`, or `minimal`** — run
`$CLI statusline --preset <arg>` and show the preview it prints.

**If the argument is a comma list of segments** — validate against the segment
names below, then run `$CLI statusline --segments <list>` and show the preview.

**If the argument is `custom` or empty** — present the checklist inside Claude
Code using the AskUserQuestion tool, then apply:

1. First run `$CLI statusline show --json` to learn the currently active
   segments; use them as the recommended/selected hints below.
2. Ask ONE AskUserQuestion call with THREE multiSelect questions (options max 4
   each), so the user ticks exactly what they want:
   - Question "Header left" (header: "Header"): options `version` (Swarmdo
     version badge), `project` (project name), `branch` (git branch + change
     counts), `model` (active Claude model).
   - Question "Header right" (header: "Metrics"): options `duration` (session
     wall-clock), `context` (context-window %), `cost` (session $).
   - Question "Detail rows" (header: "Rows"): options `domains` (DDD progress
     row), `swarm` (agents/hooks/CVE/memory row), `architecture` (ADRs/DDD/
     security row), `agentdb` (vectors/size/tests row).
   Mark each option that is currently active by appending " (currently on)" to
   its description. The user can skip a whole question to drop that group.
3. Combine every selected value from the three questions into one comma list,
   preserving this canonical order: version, project, branch, model, duration,
   context, cost, domains, swarm, architecture, agentdb.
4. If the user selected nothing at all, keep at least `project,model` and say
   so.
5. Run `$CLI statusline --segments <list>` and show the user the preview the
   command prints, plus where the config was written.

Never edit `.swarmdo/statusline.json` by hand when the CLI is available — the
command validates names and renders the preview.
