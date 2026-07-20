---
description: Toggle the local SwarmLLM inference backend (on|off|status)
argument-hint: "[on|off|status] (default: status)"
allowed-tools: Bash(npx swarmdo llm:*), Bash(node v3/@swarmdo/cli/bin/cli.js llm:*)
---

# /llm — turn the local SwarmLLM backend on/off

Toggle swarmdo's native local-inference engine **SwarmLLM** (MicroLoRA / SONA /
HNSW — local, air-gapped, sub-cent per call; ADR-086) for this project.

Resolve the swarmdo CLI as `npx swarmdo` if installed, else
`node v3/@swarmdo/cli/bin/cli.js`.

Run: `swarmdo llm $ARGUMENTS` (defaults to `status` when no argument is given).

- **on** — enables it (persists `llm.enabled` in `swarmdo.config.json`); the
  statusline then shows a `🧬 LLM` indicator while it is on.
- **off** — disables it (the statusline icon is hidden).
- **status** — shows on/off **and** whether the WASM backend is actually
  available in this environment.

After running, tell the user the on/off state. If it is `on` but `status`
reports the backend unavailable, note that `@swarmvector/swarmllm-wasm` must be
installed and initializing for calls to work.
