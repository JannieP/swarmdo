# Providers, Plugins & MCP — User Guide

Three command groups that manage the **edges** of a swarmdo install: the **AI providers** (which models/keys are wired up), the **plugin registry** (the IPFS-distributed add-on catalog), and the **MCP server** (the process that exposes swarmdo's tools to Claude Code).

The three inspection commands below — `providers list`, `plugins list`, `mcp status` — are **read-only** and safe to run anytime. The `configure`/`install`/`toggle`/`start`/`stop` subcommands **mutate state** (write config, touch the filesystem, or start/stop a process); they are documented here from their `--help` text and were **not executed**. Output shown is from real runs on this repo.

---

## `providers list` — what models can I use?

List every AI provider swarmdo knows about, the models each exposes, and whether it's configured (via env key), available locally, or not set up.

```
$ swarmdo providers list
Providers
────────────────────────────────────────────────────────────
+-----------------+-----------+---------------------------+-------------------+
| Provider        | Type      | Models                    | Status            |
+-----------------+-----------+---------------------------+-------------------+
| Anthropic       | LLM       | claude-3.5-sonnet, opus   | Not configured    |
| OpenAI          | LLM       | gpt-4o, gpt-4-turbo       | Configured (env)  |
| OpenAI          | Embedding | text-embedding-3-small... | Configured (env)  |
| Google          | LLM       | gemini-pro, gemini-ultra  | Not configured    |
| Ollama          | LLM       | gpt-oss:120b-cloud, ll... | Not configured    |
| OpenRouter      | LLM       | any OpenRouter slug — ... | Not configured    |
| Transformers.js | Embedding | Xenova/all-MiniLM-L6-v2   | Available (local) |
| Agentic Flow    | Embedding | ONNX optimized            | Available (local) |
| Mock            | All       | mock-*                    | Dev only          |
+-----------------+-----------+---------------------------+-------------------+

Tip: Use "providers configure -p <name> -k <key>" to set API keys.
```

**Use it for:** confirming which keys are live before a run; seeing at a glance that local embedding backends (Transformers.js, Agentic Flow) work with no key. `Status` reads the environment — here `OPENAI_API_KEY` was present, so OpenAI shows `Configured (env)`.

---

## `providers configure` / `providers test` (mutating — not run)

- **`configure`** writes a provider's API key / default model / endpoint into config. Options: `-p/--provider` (required), `-k/--key`, `-m/--model`, `-e/--endpoint`. Example from help: `swarmdo providers configure -p openai -k sk-...`.
- **`test`** makes a live connectivity call to a provider (or `--all` configured providers). Options: `-p/--provider`, `-a/--all`. Example from help: `swarmdo providers test --all`.

**Use them for:** wiring a new key (`configure`), then verifying it authenticates (`test`). Both were skipped here — `configure` mutates config and `test` makes billable/network calls.

---

## `plugins list` — what's in the registry?

Resolve the IPFS/IPNS plugin registry and print the available plugins with version, type, download/rating stats, and trust level.

```
$ swarmdo plugins list
...
Registry discovered: 21 plugins available

Available Plugins
──────────────────────────────────────────────────────────────────────
+--------------------------------------+---------------+-------------+-----------+--------+----------+
| Plugin                               | Version       | Type        | Downloads | Rating | Trust    |
+--------------------------------------+---------------+-------------+-----------+--------+----------+
| @swarmdo/neural                      | 3.0.0         | core        |         0 |   0.0★ | Official |
| @swarmdo/security                    | 3.0.0         | command     |         0 |   0.0★ | Official |
| @swarmdo/embeddings                  | 3.0.0         | core        |         0 |   0.0★ | Official |
| @swarmdo/claims                      | 3.0.0         | core        |         0 |   0.0★ | Official |
| @swarmdo/performance                 | 3.0.0         | command     |         0 |   0.0★ | Official |
| @swarmdo/plugins                     | 3.0.0-alpha.2 | core        |         0 |   0.0★ | Official |
| @swarmdo/plugin-agentic-qe           | 3.0.0-alpha.5 | integration |         0 |   0.0★ | Official |
|  ... (20 rows total) ...             |               |             |           |        |          |
| @swarmdo/plugin-iot-cognitum         | 1.0.0-alpha.1 | integration |         0 |   0.0★ | Official |
+--------------------------------------+---------------+-------------+-----------+--------+----------+

(ratings: cached — cloud unavailable)
Source: swarmdo-official (demo)
Registry CID: bafybeiplugin9ae7f04092480a24c...
```

**Use it for:** browsing available add-ons before `plugins install`. Pair with `plugins search -q <term>` and `plugins info -n <name>` for detail.

**Known issues (observed on this run):**
- The banner says **"21 plugins available"** but the table lists **20** rows — the count and the table disagree.
- The live registry's **signature verification fails** (`Registry signature verification failed ... falling back to demo registry`), so the output is the bundled **demo** catalog, not the live registry — the footer honestly flags this as `Source: swarmdo-official (demo)` and `(ratings: cached — cloud unavailable)`.
- When output is piped (non-TTY), the `Discovering plugin registry via IPNS...` spinner is emitted as **~44 repeated text fragments** instead of animating in place, which floods logs. The `...` above stands in for that noise.

---

## `plugins install` / `uninstall` / `toggle` (mutating — not run)

- **`install`** fetches a plugin from the IPFS registry or a local path. Options: `-n/--name` (required), `-v/--version`, `-g/--global`, `-d/--dev`, `--verify` (checksum, default true), `-r/--registry`. Example: `swarmdo plugins install -n community-analytics`.
- **`uninstall`** removes an installed plugin. Options: `-n/--name` (required), `-f/--force`.
- **`toggle`** enables or disables an installed plugin. Options: `-n/--name` (required), `-e/--enable`, `-d/--disable`. Example: `swarmdo plugins toggle -n analytics --enable`.

**Note:** the enable/disable verb is **`toggle`**, not `enable`/`disable` as standalone subcommands. All three mutate installed state and were skipped here.

---

## `mcp status` — is the server up?

Report whether the MCP server (the process Claude Code talks to) is running, its PID, and transport.

```
$ swarmdo mcp status
MCP Server Status

+-----------+---------+
| Metric    |   Value |
+-----------+---------+
| Status    | Running |
| PID       |   49702 |
| Transport |   stdio |
+-----------+---------+
```

**Use it for:** a quick liveness check before debugging why a tool call isn't reaching swarmdo. For deeper checks use `mcp health`; to inspect config without spawning anything, `mcp doctor`.

---

## `mcp start` / `mcp stop` (starts/stops a process — not run)

- **`start`** launches the MCP server. From `mcp --help`: `mcp start -t http -p 8080` runs an HTTP server on a port; default transport is stdio.
- **`stop`** stops the server. Options: `-f/--force` (skip graceful shutdown).

**Known issue (observed):** `swarmdo mcp start --help` does **not** print usage — it ignores `--help` and **actually starts the server**, logging `INFO [swarmdo-mcp] Starting in stdio mode`. In a non-interactive shell it exits on stdin EOF, but in a real terminal this would hold the session open in stdio mode until interrupted. By contrast `mcp stop --help` prints its help correctly. Treat `mcp start` as launch-on-invoke regardless of flags.

---

## Workflows

| Goal | Command(s) |
|------|-----------|
| Which keys/models are live? | `providers list` |
| Wire a new key, then verify it | `providers configure -p <name> -k <key>` → `providers test -p <name>` |
| Browse / find add-ons | `plugins list` → `plugins search -q <term>` → `plugins info -n <name>` |
| Add or remove an add-on | `plugins install -n <name>` / `plugins uninstall -n <name>` |
| Turn an installed plugin on/off | `plugins toggle -n <name> --enable\|--disable` |
| Is the MCP server up? | `mcp status` (liveness) → `mcp health` (deeper) |
| Validate MCP config without spawning | `mcp doctor` |

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Provider shows `Not configured` | No env key set; run `providers configure -p <name> -k <key>` (or export the key). |
| `providers list` shows `Configured (env)` but calls fail | Key is present but invalid/expired — confirm with `providers test -p <name>`. |
| `plugins list` says `Source: swarmdo-official (demo)` / `(ratings: cached — cloud unavailable)` | Live registry signature didn't verify or the gateway was unreachable; you're seeing the bundled demo catalog, not live data. |
| `plugins list` count (banner) ≠ rows in table | Known discrepancy — trust the table rows, not the "N plugins available" banner. |
| `plugins list` floods logs with `Discovering ... IPNS` | Spinner isn't TTY-aware when piped; redirect/ignore the noise (the real table follows it). |
| `mcp start --help` starts the server instead of showing help | Known bug — `mcp start` ignores `--help`. Use `mcp --help` for the option summary; don't run `mcp start` unless you intend to launch. |
| `mcp status` shows `Running` but tools don't respond | Check `mcp health`; a stale PID can survive a crash. |

`providers list`, `plugins list`, and `mcp status` are read-only. Everything else in these groups writes config, changes installed plugins, or starts/stops a process — run those deliberately.
