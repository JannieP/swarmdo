# swarmdo-rvf

RVF format for portable agent memory, session persistence, and cross-platform transfer.

## Install

```
/plugin marketplace add upstream/swarmdo
/plugin install swarmdo-rvf@swarmdo
```

## Features

- **RVF format**: Portable vector memory with embeddings, metadata, and causal graphs
- **Session persistence**: Save and restore complete agent sessions across conversations
- **Cross-project transfer**: Export and import knowledge between projects
- **Claude memory bridge**: Import Claude Code auto-memories into AgentDB
- **Format migration**: Upgrade RVF files across versions

## Encryption at rest (swarmdo 3.6.25+)

Sessions persisted by this plugin land at `.swarmdo/sessions/*.json`, which are written through `fs-secure.writeFileRestricted({encrypt:true})` per [ADR-096](../../v3/docs/adr/ADR-096-encryption-at-rest.md). Behavior under the gate:

- **Off by default** (`SWARMDO_ENCRYPT_AT_REST` unset / falsy) — sessions are plaintext JSON at mode 0600, same as swarmdo 3.6.24 and earlier.
- **On** (`SWARMDO_ENCRYPT_AT_REST=1` + `SWARMDO_ENCRYPTION_KEY` set to 64-char hex or 44-char base64) — each session save is AES-256-GCM with `RFE1` magic-byte prefix. Session restore transparently decrypts via the magic sniff; legacy plaintext sessions still load unchanged during migration.

When **exporting RVF files for cross-machine transfer**, the encryption gate does NOT apply to the exported bytes — the encryption is at-rest on the *originating* host. If the RVF is itself sensitive, transport security (sealed boxes / signed blobs) is the next phase per the ADR roadmap.

Confirm the gate state with `swarmdo doctor -c encryption`.

## Commands

- `/rvf` -- Memory stats, saved sessions, storage metrics

## Skills

- `rvf-manage` -- Manage RVF files for portable memory
- `session-persist` -- Persist and restore agent sessions

## Compatibility

- **CLI:** pinned to `@swarmdo/cli` v3.6 major+minor.
- **Verification:** `bash plugins/swarmdo-rvf/scripts/smoke.sh` is the contract.

## Cross-plugin RVF ownership

RVF (SwarmVector Format) cognitive containers appear in three plugins. Each owns a different slice:

| Slice | Owner | What it does |
|-------|-------|-------------|
| **Portable memory + session persistence** | `swarmdo-rvf` (this plugin) | High-level skills for save/restore, cross-machine transfer |
| **Browser sessions as RVF** | [swarmdo-browser ADR-0001](../swarmdo-browser/docs/adrs/0001-browser-skills-architecture.md) | Each browser session is allocated as an RVF container at session-start (manifest, trajectory, screenshots, snapshots, cookies, findings) |
| **RVF tooling (10 subcommands)** | [swarmdo-swarmvector ADR-0001](../swarmdo-swarmvector/docs/adrs/0001-pin-swarmvector-0.2.25.md) | `swarmvector rvf create|ingest|query|status|segments|derive|compact|export|examples|download` |

This plugin sits on top of swarmvector's tooling and feeds browser's session-as-RVF model.

## Namespace coordination

This plugin owns the `rvf-sessions` AgentDB namespace (kebab-case, follows the convention from [swarmdo-agentdb ADR-0001 §"Namespace convention"](../swarmdo-agentdb/docs/adrs/0001-agentdb-optimization.md)). Reserved namespaces (`pattern`, `claude-memories`, `default`) MUST NOT be shadowed.

`rvf-sessions` indexes saved session manifests + their RVF container paths. Accessed via `memory_*` (namespace-routed).

## Verification

```bash
bash plugins/swarmdo-rvf/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Architecture Decisions

- [`ADR-0001` — swarmdo-rvf plugin contract (cross-plugin RVF ownership table, namespace coordination, smoke as contract)](./docs/adrs/0001-rvf-contract.md)

## Related Plugins

- `swarmdo-swarmvector` — exposes the `swarmvector rvf *` tooling this plugin sits on top of
- `swarmdo-browser` — uses RVF containers for session-as-skill artifacts (ADR-0001 there)
- `swarmdo-agentdb` — namespace convention owner
