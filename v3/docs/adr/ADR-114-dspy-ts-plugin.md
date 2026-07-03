# ADR-114 — Adopt DSPy.ts as a Swarmdo plugin for declarative prompt-program optimization

**Status**: Proposed (2026-05-11)
**Date**: 2026-05-11
**Authors**: claude (drafted with the upstream author)
**Related**: ADR-026 (3-tier model routing) · ADR-112 (MCP tool discoverability) · ADR-098 (plugin capability sync + token/performance/intelligence optimization) · ADR-G008 (optimizer promotion rule — "win twice to promote") · ADR-G009 (headless testing harness — Claude Code as evaluator) · SwarmVector / ReasoningBank intelligence pipeline (RETRIEVE → JUDGE → DISTILL → CONSOLIDATE) · [`dspy.ts`](the upstream project (see NOTICE)) ([npm](https://www.npmjs.com/package/dspy.ts))
**Supersedes**: nothing

## Context

Swarmdo today learns *between* tasks: the SwarmVector / ReasoningBank pipeline retrieves prior patterns, judges outcomes, distills learnings via LoRA, and consolidates with EWC++. Agent definitions, hook routing tables, and the model-routing tiers (ADR-026) are largely static — the *prompts* an agent runs with are hand-authored markdown, and there is no mechanism to *optimize a prompt against a measurable objective*.

`dspy.ts` ("DS.js — Declarative Self-learning JavaScript", `upstream/dspy.ts`, 248★, MIT, TypeScript) is the TypeScript port of Stanford's [DSPy](https://github.com/stanfordnlp/dspy). Its model:

- **Signatures** — typed `input → output` contracts (e.g. `{ question: string } → { answer: string }`).
- **Modules / Pipelines** — `Predict`, `ChainOfThought`, `ReAct` (with reflexion), `Retrieve`, composed into pipelines.
- **Optimizers** — `BootstrapFewShot`, `MIPROv2`, `GEPA`: given a `metric` and a small `trainset`, `compile()` tunes the prompt text and few-shot demonstrations automatically — no hand-crafted prompt strings.
- **Substrate** — *AgentDB-first*: optimizer trials, ReAct reflexions, LM-response caches, and traces all persist to a real vector store (HNSW search, RaBitQ quantization, ReasoningBank), so a second `compile()` (or a second agent run) warm-starts from what the first one learned.

The key observation: **`dspy.ts` is built on the same substrate swarmdo already ships** (`agentdb`, ReasoningBank, HNSW, RaBitQ). Integrating it is not bolting on a foreign dependency with its own storage and lifecycle — it is wiring a complementary capability onto infrastructure that is already present.

### What this would give swarmdo that it does not have

| Capability | Today in swarmdo | With a `dspy` plugin |
|---|---|---|
| Optimize a prompt against a metric | — (prompts are hand-authored) | `BootstrapFewShot` / `MIPROv2` / `GEPA` `compile()` |
| Typed LM-program contracts | implicit (free-text agent prompts) | `Signature` (input/output types, validated) |
| Few-shot demo selection | manual / ad-hoc | bootstrapped from a trainset, persisted |
| Reusable "compiled" agent behaviours | — | a compiled module is an artifact you can store, version, and re-load |
| Reflexion loops (ReAct + self-critique) | partial (intelligence JUDGE step) | first-class `ReAct` module with reflexion |

### The overlap risk

`dspy.ts` and swarmdo's intelligence system *both* lean on AgentDB + ReasoningBank, and both are "self-learning". Without a sharp boundary, this becomes two systems doing fuzzily-similar things, confusing both Claude (which tool to call — see ADR-112) and contributors (where does this logic live?).

The boundary we draw:

- **DSPy = compile-time, task-scoped.** "Given *this* signature + *this* metric + *these* examples, produce an optimized module for *this* task." The output is an artifact. It is offline-ish (you run `compile()` deliberately).
- **Swarmdo intelligence = run-time, cross-task.** "Across *all* tasks this agent has ever done, what patterns predict success here?" It is always-on, ambient, and not tied to a single signature/metric.

A DSPy-compiled module can *write into* ReasoningBank (its trials are patterns), and swarmdo intelligence can *retrieve* those — but they are not the same loop, and the plugin must not re-implement the intelligence pipeline.

## Decision

**Adopt `dspy.ts` as an optional Swarmdo plugin — `@swarmdo/plugin-dspy` — that wraps the published `dspy.ts` npm package and exposes declarative prompt-program optimization through MCP tools, a slash skill, and an optional agent-loop hook. It shares swarmdo's AgentDB instance rather than standing up its own store.**

### Plugin surface

**MCP tools** (descriptions to follow the ADR-112 "use this over native when?" rule):

| Tool | Purpose | Native/internal overlap to disambiguate |
|---|---|---|
| `dspy_signature_define` | Register a typed `input → output` signature (persisted to AgentDB under a `dspy/signatures` namespace). | none |
| `dspy_module_build` | Wrap a signature in a module (`Predict` / `ChainOfThought` / `ReAct` / `Retrieve` / pipeline). | none |
| `dspy_compile` | Run an optimizer (`BootstrapFewShot` / `MIPROv2` / `GEPA`) against a metric + trainset; persist trials + the optimized module. | **vs. `Task` / hand-editing an agent prompt** — use `dspy_compile` when you have a metric and examples and want the prompt tuned for you. |
| `dspy_run` | Execute a (compiled or raw) module against an input. | **vs. `agent_execute`** — use `dspy_run` for a single typed LM call inside a known signature; use `agent_execute` for open-ended agent work. |
| `dspy_module_load` / `dspy_module_list` | Re-load a previously compiled module by id; list compiled artifacts. | **vs. `memory_retrieve`** — these return executable modules, not raw text. |
| `dspy_eval` | Score a module against a holdout set (regression check for a compiled artifact). | none |

**Skill**: `/dspy` — guided workflow: define a signature → pick a module → supply a metric + a few examples → `compile()` → report the optimized module id + before/after metric. Mirrors the `dspy.ts` quick-start.

**Hook (opt-in, default off)**: an `AgentPromptCompile` hook that, when an agent definition opts in (`dspy: { signature, metric, trainset }` in its frontmatter), runs `dspy_compile` once and caches the optimized prompt — so agents can be *born optimized*. This is gated and off by default because it adds a real cost (LM calls during compile) and must not surprise users.

**Storage**: the plugin receives swarmdo's AgentDB handle via the plugin context. It uses dedicated namespaces (`dspy/signatures`, `dspy/modules`, `dspy/trials`) so its data is inspectable and prunable independently, and so the `agentdb-curator` consolidation pipeline can see DSPy trials as candidate patterns.

### What the plugin explicitly does NOT do

- It does **not** re-implement the SwarmVector intelligence pipeline (RETRIEVE/JUDGE/DISTILL/CONSOLIDATE). It writes trials into ReasoningBank; consolidation is the curator's job.
- It does **not** become a required dependency of any core package. `@swarmdo/cli` and the core packages must build and run with the plugin absent (the runtime pattern is `await import('@swarmdo/plugin-dspy').catch(() => null)` — and per ADR-114's own guard, the published `package.json` must not declare it as a hard dep of anything).
- It does **not** introduce a second LM-provider abstraction. `dspy.ts`'s `configureLM` is bridged to swarmdo's existing provider config (`@swarmdo/providers`) so there is one place to set keys/models.

### Versioning & packaging constraints (carried over from the #1902/#1903/#1904 lessons and `scripts/audit-plugin-packages.mjs`)

- The plugin pins `dspy.ts` as a normal `dependencies` entry (it *is* published, so this is fine) and pins it to a `^`-range against a published version.
- `@swarmdo/*` references in the plugin's `package.json` are `peerDependenciesMeta.optional` with `>=X.Y.Z-0` ranges (so prerelease publishes resolve).
- `exports` / `main` / `module` must point at files the build actually emits — the `plugin-package-audit` CI job (check D) will enforce this.
- Listed in the IPFS plugin registry with the correct published version; `discovery.ts` `demoPluginRegistry` fallback kept in sync.

## Consequences

### Positive

- **New capability with low integration cost.** Prompt-program optimization is a genuine gap; `dspy.ts` is AgentDB-native, so there is no impedance mismatch on storage, caching, or learning.
- **Fits the "self-learning" narrative.** Compiled-then-warm-started modules are a concrete, demonstrable form of self-improvement that complements (rather than duplicates) the ambient intelligence loop.
- **Typed LM contracts.** Signatures give agent authors a way to declare input/output shapes that are validated — a step toward less "free-text prompt as the only artifact".
- **Dogfoods the plugin packaging guard.** A new plugin built *after* `scripts/audit-plugin-packages.mjs` lands is a clean test of whether the guard actually prevents the #1902/#1903/#1904 class for greenfield plugins.
- **First-party, MIT, same author.** No third-party licensing or maintenance-risk concerns; the package and swarmdo move together.

### Negative

- **Conceptual-overlap maintenance burden.** Keeping the DSPy/intelligence boundary sharp is ongoing work — code review must reject PRs that drift the plugin toward re-implementing the intelligence pipeline, and tool descriptions must keep disambiguating `dspy_run` vs `agent_execute`, `dspy_module_load` vs `memory_retrieve` (ADR-112).
- **Another package to keep version-aligned** with the `agentdb` line (if `dspy.ts` and swarmdo pin different `agentdb` majors, the shared-handle story breaks). Mitigated by both being first-party.
- **`compile()` has real cost.** Optimizers make many LM calls. The opt-in hook and the `/dspy` skill must surface estimated cost before running, and `compile()` results must be cached aggressively (it already supports a fuzzy AgentDB cache via `CachingLM`).
- **Surface-area creep.** ~7 new MCP tools on top of ~285 — every one needs an ADR-112-compliant description or it just adds noise.

### Neutral

- The plugin is opt-in; users who don't install it see no change. The "is this worth it?" bet is therefore low-downside — worst case, an unused plugin in the registry.
- DSPy is a well-known paradigm (Stanford origin); adopting the TS port is following an external standard rather than inventing one.
- This ADR records the *decision to build*; the plugin's own internal design (exact module bridging, hook semantics, namespace layout) is left to a follow-up implementation PR and may produce a sub-ADR if non-obvious trade-offs arise.

## Links

- `dspy.ts` — the upstream project (see NOTICE) · https://www.npmjs.com/package/dspy.ts
- Stanford DSPy — https://github.com/stanfordnlp/dspy
- ADR-026 — 3-tier model routing (the routing layer DSPy modules would call through)
- ADR-098 — plugin capability sync + token/performance/intelligence optimization (how a `dspy` plugin advertises its capabilities; complements rather than overlaps the intelligence optimizer)
- ADR-112 — MCP tool discoverability (every new `dspy_*` tool description must comply)
- ADR-G008 — optimizer promotion rule, "win twice to promote" (bears directly on when a DSPy-`compile()`'d module is allowed to replace the current one; reuse this rule rather than inventing a DSPy-specific one)
- ADR-G009 — headless testing harness, Claude Code as the evaluator (the natural way to run `dspy_eval` / `compile()` metrics that need a judging LM)
- `scripts/audit-plugin-packages.mjs` — plugin packaging guard the `@swarmdo/plugin-dspy` package must pass (#1902/#1903/#1904)

> Causal edges (AgentDB): `ADR-114 depends-on ADR-G008` (promotion semantics), `ADR-114 depends-on ADR-G009` (eval harness), `ADR-114 relates-to ADR-098` (capability registration), `ADR-114 relates-to ADR-026` / `ADR-112` (must comply).
