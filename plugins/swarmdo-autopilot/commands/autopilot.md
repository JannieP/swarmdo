---
name: autopilot
description: Enable, configure, or disable autonomous task completion
---
$ARGUMENTS
Manage Swarmdo autopilot for autonomous /loop-driven task completion.

Usage:
- `/autopilot enable` -- Enable autopilot and start the completion loop
- `/autopilot disable` -- Disable autopilot, let agents stop
- `/autopilot config --max-iterations 50 --timeout 30` -- Set limits
- `/autopilot reset` -- Reset iteration counter and restart timer
- `/autopilot learn` -- Discover success patterns from completed tasks
- `/autopilot history KEYWORD` -- Search past completion episodes

Parse $ARGUMENTS to determine the subcommand. If no arguments, show status via `autopilot_status`.

After enabling, start a `/loop` with the `autopilot-loop` skill to begin autonomous iteration. Use `ScheduleWakeup` at 270s delay for cache-warm scheduling.
