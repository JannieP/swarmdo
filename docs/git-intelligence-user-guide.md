# Git & Code Intelligence — User Guide

A suite of **deterministic, zero-token** commands that mine your **git history** and **import graph** to answer questions an LLM would otherwise burn tokens guessing at: *what's risky to change, who owns it, what changes together, what depends on what, and what tests a diff impacts.*

All are read-only and safe to run anytime. Output below is from real runs on this repo.

---

## `standup` — what did I do?

Recall commits since your last working day (weekend-aware: Monday reaches back to Friday).

```
$ swarmdo standup
Standup for JannieP (since yesterday)
Wednesday, 2026-07-22  —  5 commits, +897/-48
  8b86064c3  fix(memory): distill redaction + project-scoped session resolution…
  5385d935d  feat(memory): swarmdo memory distill — L0→L1 transcript distillation…
```

**Use it for:** standup notes, "where was I", changelog seeds.

---

## `hotspots` — what's risky to change?

Rank files by change-risk mined from history: **churn × recency × author-spread**. High-risk files are the ones worth refactoring or adding tests to.

```
$ swarmdo hotspots --since 30d
rank  risk    commits  churn   authors  file
   1  5993.77      305     908        2  package.json  (today)
   5  2276.89       97    3418        2  docs/USERGUIDE.md  (today)
```

**Use it for:** picking refactor/test targets; onboarding ("what churns").

---

## `ownership` — who owns it? (bus factor)

Per-file authorship concentration + **bus factor** — the key-person risk. `bus 1 / own 100%` means one person holds all the knowledge.

```
$ swarmdo ownership
Repo truck factor: 1  ⚠ single point of knowledge
rank  bus  own%   owner    file
   1    1   100%  rUv      …/system-metrics.json  ⚠ key-person
```

**Use it for:** finding knowledge silos; deciding who to pair/review.

---

## `coupling` — what changes together?

Rank file **pairs** that co-change in history (temporal coupling) — the empirical complement to the import graph.

```
$ swarmdo coupling
rank  degree  shared  files
   2    100%     276   package.json  ↔  swarmdo/package.json
```

**Use it for:** spotting implicit contracts ("touch A, you'll touch B").

---

## `hidden-coupling` — coupling with NO import edge

The pairs that change together but have **no import edge** — the logical coupling `affected` can't see (config pairs, sibling manifests, generated artifacts).

```
$ swarmdo hidden-coupling
rank  shared  files (co-change, no import edge)
   2     276   package.json  ⇢  swarmdo/package.json
```

**Use it for:** catching "forgot to update the other file" classes of bug.

---

## `cycles` — circular imports

Find circular import dependencies (madge `--circular` style) — the cause of TDZ / undefined-export bugs.

```
$ swarmdo cycles
cycle 2 (5 files):
  …/mcp-tools/neural-tools.ts
  …/memory/intelligence.ts
  …/memory/memory-bridge.ts
  …/memory/memory-initializer.ts
  …/memory/rabitq-index.ts
```

**Use it for:** untangling import loops before they bite. *(This run found a real cycle in the memory subsystem.)*

---

## `affected` — what tests should I run?

List files (and **test files**) a change could break, via the import graph — run only the tests your diff impacts (nx/turbo-style).

```
$ swarmdo affected --staged
Affected by 1 changed file(s):
  …/__tests__/mcp-tools-deep.test.ts
  …/__tests__/memory-search-unified-2246.test.ts
```

**Use it for:** fast pre-commit test selection. Pair with `--json` in CI.

---

## `codegraph` — where is it defined, what depends on it?

A queryable index of exported symbols + the import graph — "where things live and what depends on what" without grep+read.

```
$ swarmdo codegraph stats
codegraph: 10230 symbols, 2440 files, 9830 imports (4987 internal)
  interface: 3609 · function: 2811 · const: 1604 · class: 839 …
```

Then `codegraph query <symbol>`, `codegraph importers <file>`, `codegraph imports <file>`.

**Use it for:** impact analysis, "who imports this", finding definitions.

---

## Workflows

| Question | Command(s) |
|----------|-----------|
| What should I refactor / add tests to? | `hotspots` → `ownership` (risk + who) |
| What tests must I run for this diff? | `affected --staged` (or `--json` in CI) |
| Is there a knowledge silo? | `ownership` (bus factor) |
| What will break if I change X? | `codegraph importers X` + `affected` |
| Where are the import loops? | `cycles` |
| What changes together (that I might forget)? | `coupling` + `hidden-coupling` |
| What did I do since Friday? | `standup` |

All deterministic, all local, no model calls — safe to wire into hooks/CI.
