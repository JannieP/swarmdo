# Context Tools — User Guide

A small suite of **deterministic** commands that shape content *before* it reaches an LLM: **bundle** a repo into one context blob, **compact** noisy command output, **survive** context compaction, and **compress** a memory file. The goal is the same across all four — spend fewer tokens, lose less signal.

`pack`, `compact`, and `compact-snapshot read` are read-only. `compact-snapshot write` and `compress` **mutate** state (write a digest / rewrite a file), so they are called out below. Output shown is from real runs on this repo; where a command errored, the error is shown as-is rather than faked.

---

## `pack` — bundle a repo into one context blob

Bundle a repo (or a subset) into a single AI-friendly blob (md / xml / json / plain) with a directory tree + token counts. Deterministic; prints to stdout unless `-o` is given.

```
$ swarmdo pack v3/@swarmdo/cli/src/commands --include 'env.ts'
# Repository context

## Files

    └── env.ts

## Contents

### env.ts

  (each file's body follows here in a fenced code block — e.g. ```typescript …)
```

The real output continues with the full source of `env.ts` inside a fenced block; it's truncated above so this guide's own fences stay intact. Useful flags (from `pack --help`): `--include`/`--exclude` (comma-separated globs), `--style md|xml|json|plain`, `--tokens` (per-file + total token estimate, no bundle), `--redact` (mask secrets first), `-o <file>` (write instead of stdout), `--no-tree`, `--no-gitignore`, `--max-file-size <KiB>`.

**⚠ Known issue — a single file path does not work.** Passing a file directly is reported as "no files matched", even when the file exists and is not gitignored:

```
$ swarmdo pack v3/@swarmdo/cli/src/commands/env.ts
[ERROR] no files matched — check the path, --include/--exclude, or .gitignore
$ echo $?
1
```

The argument is treated as a *directory* to walk; a file path yields nothing and the misleading error suggests the path is wrong (it isn't). **Workaround:** point `pack` at the parent directory and narrow with `--include`, as in the working example above.

**Use it for:** handing a whole module to an LLM in one paste; a `--tokens` budget check before you do.

---

## `compact` — squeeze noisy command output

Compress noisy build/test/log output (strip ANSI, fold `node_modules` stack frames, collapse repeated lines, optionally head+tail-window long runs) before it reaches an LLM. Reads stdin, or wraps a command with `-- <cmd>`.

```
$ printf 'PASS 10 tests\nFAIL 1 test at foo.ts:3\n... 500 lines of noise ...\n' \
    | swarmdo compact
compacted: 3→3 lines, 65B→65B (−0%)
PASS 10 tests
FAIL 1 test at foo.ts:3
... 500 lines of noise ...
```

Honest note: on this tiny 3-line input `compact` is a **no-op** (−0%) — there is nothing repetitive, no ANSI, and no long run to fold, so it passes the text straight through and says so on stderr. The savings show up on genuinely noisy output. The intended shape (from `compact --help`) is `npm test 2>&1 | swarmdo compact`, or `swarmdo compact --window 40:20 -- pnpm install` to keep only the first 40 + last 20 lines of a long log. Exit code propagates when wrapping a command.

**Use it for:** trimming CI/test/install logs to the signal before pasting them into a prompt.

---

## `compact-snapshot` — survive context compaction

Capture a working-state digest (recently edited files, uncommitted changes, branch) so an agent can re-ground after context compaction instead of re-exploring. Two modes: `write` (capture) and `read` (print + consume; `--keep` prints without consuming).

```
$ swarmdo compact-snapshot --help
swarmdo compact-snapshot
Capture/restore a working-state digest that survives context compaction — recent edits, uncommitted changes, branch — so an agent re-grounds instead of re-exploring

OPTIONS:
      --keep                on read, print the digest without consuming it

EXAMPLES:
  $ swarmdo compact-snapshot write
    Snapshot working state (wire to a PreCompact hook)
  $ swarmdo compact-snapshot read
    Print + consume the digest (wire to the first post-compaction prompt)
```

`write` and `read` mutate state (write / delete the digest file under `.swarmdo/data/`), so they are not exercised here — only `--help` is shown. Note the modes are exactly **`write`** and **`read`**: there is *no* `restore` subcommand (`compact-snapshot restore` errors with `unknown mode "restore" (use write | read)`), despite "restore" appearing in the description.

**Use it for:** wiring `write` to a PreCompact hook and `read` to the first post-compaction prompt, so a long agent session keeps its bearings.

---

## `compress` — caveman-compress a memory file

Rewrite a memory file (CLAUDE.md, todos, notes) into caveman-speak to cut input tokens while preserving substance; a backup is kept. **This overwrites the target file**, so it is documented from `--help` only and not run here.

```
$ swarmdo compress --help
swarmdo compress
Caveman-compress a memory file to save tokens (substance preserved, backup kept)

OPTIONS:
      --check               Detection only — report file type and compressibility, no tokens spent

EXAMPLES:
  $ swarmdo compress CLAUDE.md
    Compress a memory file (backup saved as CLAUDE.original.md)
  $ swarmdo compress notes.md --check
    Just report whether the file would compress
```

The `--check` flag is the safe, read-only entry point — it reports whether a file *would* compress without touching it or spending tokens. A real compress writes a `FILE.original.md` backup alongside the rewritten file, so it is reversible.

**Use it for:** shrinking a large, stable memory file (`--check` first; then compress, keeping the backup).

---

## Workflows

| Goal | Command(s) |
|------|-----------|
| Hand a whole module to an LLM in one blob | `pack <dir> --include '*.ts'` (point at a **dir**, not a file) |
| Budget-check before pasting | `pack <dir> --tokens` |
| Keep secrets out of a bundle | `pack <dir> --redact` |
| Trim a noisy test/build log | `<cmd> 2>&1 \| compact` (or `compact --window H:T -- <cmd>`) |
| Re-ground an agent after compaction | `compact-snapshot write` (PreCompact) → `compact-snapshot read` (after) |
| Shrink a stable memory file | `compress <file> --check`, then `compress <file>` |

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `pack file.ts` → "no files matched" (exit 1) | Known issue: `pack` walks the arg as a directory. Use the **parent dir** + `--include 'file.ts'`. |
| `pack` bundle is empty / missing files | Files may be caught by `.gitignore` (use `--no-gitignore`), your `--include`/`--exclude` globs, or the `--max-file-size` cap (default 512 KiB). |
| `compact` reports `−0%` | Expected on small / non-repetitive input — nothing to fold. Savings appear on large, noisy, or ANSI-heavy output. |
| `compact-snapshot restore` → `unknown mode` | There is no `restore` mode — only `write` and `read`. |
| `compact-snapshot read` prints nothing | No digest captured yet — run `compact-snapshot write` first. |

`pack` and `compact` are read-only and safe to wire into hooks/CI. `compact-snapshot write` and `compress` write state — read their `--help` (and use `compress --check`) before wiring them anywhere.
