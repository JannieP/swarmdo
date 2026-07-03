---
name: goals
description: List active horizons, check goal progress, and view research findings
---
$ARGUMENTS

Show goal and research status:

1. Call `mcp__swarmdo__memory_search` with namespace `horizons` and query `*` to list active horizons
2. For each horizon, show: objective, current milestone, progress %, target date, drift status
3. Call `mcp__swarmdo__memory_search` with namespace `research-synthesis` to list completed research reports
4. Show a summary table of horizons and research state
