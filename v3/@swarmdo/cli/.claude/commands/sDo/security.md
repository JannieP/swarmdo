---
description: Scan this project's security and refresh the statusline Security segment
argument-hint: "[scan|full|cve|audit|report] (default: scan)"
allowed-tools: Bash(npx swarmdo security:*), Bash(node v3/@swarmdo/cli/bin/cli.js security:*)
---

# /security — scan security posture + refresh the statusline

Run the swarmdo security scanner and refresh the `Security` element of the
statusline. The statusline reads the cached result from
`.swarmdo/security/last-scan.json`; a scan rewrites it with a fresh `scannedAt`
plus current counts, so the `Security ●…` indicator stops showing `STALE` and
reflects reality (`●CLEAN` when clean, `●VULN` when critical/high are present).

Resolve the swarmdo CLI as `npx swarmdo` if installed, else
`node v3/@swarmdo/cli/bin/cli.js` (this repo). Call it `$CLI` below.

## Input

`$ARGUMENTS`

## Behavior

Pick the mode from the first argument (default `scan` when empty):

- `scan` (default) — run `$CLI security scan` (standard depth).
- `full` — run `$CLI security scan --depth full` for the complete finding list.
- `cve` — run `$CLI security cve` (dependency-CVE audit only).
- `audit` — run `$CLI security audit`.
- `report` — run `$CLI security report` (summarize the last scan, no re-scan).

Then:

1. Report the summary counts — critical / high / medium / total — from the
   scanner output.
2. Confirm the statusline `Security` element refreshed: it now shows `●CLEAN`
   (no critical/high) or `●VULN` (critical/high present) and no longer `●STALE`.
   The change lands on the next statusline render — no regeneration needed.
3. If any critical or high findings exist, list the top few (severity, package,
   short description) and point at `$CLI security scan --depth full` for the rest.

`.swarmdo/security/last-scan.json` is per-project, so run this in each project
whose statusline you want current. This command only scans and reports — it does
not modify code or dependencies.
