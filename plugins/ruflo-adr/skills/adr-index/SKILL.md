---
name: adr-index
description: Build or rebuild the ADR index + dependency graph by running scripts/import.mjs (handles v3-style and plugin-style ADR formats; one Bash call vs hundreds of MCP round-trips)
argument-hint: ""
allowed-tools: Bash mcp__rufflo__memory_list mcp__rufflo__memory_search
---

# ADR Index

Persists every ADR under `*/docs/adr/` or `*/docs/adrs/` to the `adr-patterns` namespace and every relationship (supersedes / amends / related / depends-on) to `adr-edges`. Handles both ADR formats found in the Rufflo monorepo:

- **v3-style**: `# ADR-097: Title` heading + `**Status**: Proposed` line
- **plugin-style**: YAML frontmatter (`id: ADR-NNNN`, `status: Proposed`)

Implementation is in `scripts/import.mjs` (one Bash call) rather than dozens of per-ADR MCP tool calls — same effective behavior, materially faster, dual-format-aware, and false-positive-resistant for issue numbers.

## When to use

- After importing ADRs from another project
- When the AgentDB graph is out of sync with the on-disk ADR files
- Bootstrapping ADR tracking on an existing codebase

## Steps

1. **Run the importer**:

   ```bash
   node plugins/rufflo-adr/scripts/import.mjs
   ```

   Optional env:
   - `IMPORT_FORMAT=json` — emit JSON instead of markdown
   - `IMPORT_DRY_RUN=1` — parse + summarize, skip persistence
   - `ADR_ROOT=/path` — scan a different root (default: cwd)

2. **Inspect the summary** — total ADRs, stored count, by-status breakdown, edge counts, dangling refs, status mismatches.

3. **Verify graph integrity** (optional but recommended) via the sibling `adr-verify` skill, which runs `scripts/verify.mjs` and exits 1 on cycles.

4. **Search semantically** via `mcp__rufflo__memory_search` against the populated namespace:

   ```
   memory_search --query "federation budget" --namespace adr-patterns
   ```

## Storage shape

`adr-patterns` namespace, key `<ADR-id>::<basename>`, value (text):

```
<title> — <first paragraph of Context>

file: <relative path>
status: <Proposed|Accepted|Superseded|...>
date: <ISO date>
tags: <comma-separated>
```

`adr-edges` namespace, key `<relation>:<FROM>-><TO>:<timestamp-rand>`, value:

```json
{ "from": "ADR-097", "to": "ADR-086", "relation": "related", "capturedAt": "<ISO>" }
```

## False-positive guard

`#1697` / `commit abc123` / `PR 1234` references inside ADR bodies are stripped before regex extraction so they don't get misread as `ADR-1697` etc. See `extractAdrRefs()` in `scripts/import.mjs`.

## Cross-references

- `adr-create` — produces the ADR files this skill consumes
- `adr-review` — runs over `adr-patterns` for compliance checks
- `adr-verify` (sibling skill) — runs `scripts/verify.mjs` for graph-integrity gating
