# Security & Compliance — User Guide

A suite of **read-only, deterministic** commands for the boring-but-critical parts of shipping: *what's vulnerable, what licenses am I shipping, what's in my supply chain, who is allowed to do what, who's working on which issue, and did a secret just leak into a log.*

Every command below is safe to run anytime — none mutate state or call a model. Output is from real runs on this repo (swarmdo `1.58.44`). Commands are shown as `swarmdo <cmd>`; in-repo the invocation is `node v3/@swarmdo/cli/bin/cli.js <cmd>`. The mutating siblings (`security scan --fix`, `security audit`, `claims grant/revoke`, `issues claim`) are described from their help text at the end and were **not** executed.

---

## `security scan` — what's vulnerable?

Scan code, dependencies, and containers for CVEs, secrets, and other findings, tallied by severity.

```
$ swarmdo security scan
Security Scan
──────────────────────────────────────────────────
... Scanning ....                                    Scan complete

+----------+----------------+---------------------------+-------------------------------------+
| Severity | Type           | Location                  | Description                         |
+----------+----------------+---------------------------+-------------------------------------+
| MEDIUM   | Dependency CVE | package.json:@opentele... | OpenTelemetry Core: Unbounded memor |
| ...      | ...            | ...                       | ...                                 |
+----------+----------------+---------------------------+-------------------------------------+
... and 90 more issues

+-------------- Scan Summary ---------------+
| Target: .                                 |
| Depth: standard                           |
| Type: all                                 |
|                                           |
| Critical: 2  High: 61  Medium: 46  Low: 1 |
| Total Issues: 110                         |
+-------------------------------------------+
```

**Use it for:** a pre-release vuln sweep; wiring `-o sarif` into code-scanning. Scans the dev tree by default (`-t .`), which is why the count is high — the *published* packages install clean. Narrow with `-t ./src` or `--type deps`. (See the ordering note in troubleshooting.)

---

## `license` — what am I shipping legally?

Audit every dependency license against an allow/deny policy — catch GPL/UNKNOWN before it ships.

```
$ swarmdo license
Licenses
  - MIT: 932
  - Apache-2.0: 85
  - ISC: 76
  - BSD-3-Clause: 36
  - BSD-2-Clause: 14
  ...
  - UNKNOWN: 3
  ...
license: 1171 deps, 0 violations
```

**Use it for:** license-compliance gates. Add `--allow MIT,Apache-2.0,ISC,BSD-3-Clause --ci` to fail CI on anything copyleft or unknown; `--deny GPL-3.0,AGPL-3.0` to block specific licenses; `--json` for a machine-readable report.

---

## `sbom` — what's in my supply chain?

Generate a CycloneDX (or SPDX) Software Bill of Materials from the npm lockfile.

```
$ swarmdo sbom
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.5",
  "version": 1,
  "metadata": {
    "component": {
      "type": "application",
      "name": "swarmdo",
      "version": "1.58.44"
    }
  },
  "components": [
    {
      "type": "library",
      "name": "@ai-sdk/google",
      "version": "3.0.88",
      "purl": "pkg:npm/%40ai-sdk/google@3.0.88",
      "scope": "optional",
      "hashes": [ ... ],
      "licenses": [ { "license": { "id": "Apache-2.0" } } ]
    },
    ...
  ]
}
```

**Use it for:** supply-chain attestation and vendor security reviews. `-o sbom.json` writes a file instead of stdout; `--spec spdx` emits SPDX; `--production` excludes dev-only deps.

---

## `claims list` — who's allowed to do what?

Show the claims-based authorization config: roles, their permission counts/previews, and the default claims granted to new principals.

```
$ swarmdo claims list
Claims Configuration
──────────────────────────────────────────────────

Roles
+-----------+--------+--------------------------------------------------+
| Role      | Claims | Preview                                          |
+-----------+--------+--------------------------------------------------+
| admin     | 1      | *                                                |
| developer | 5      | swarm:*, agent:*, memory:*, task:*, ...          |
| operator  | 4      | swarm:status, agent:list, memory:read, task:list |
| viewer    | 3      | *:list, *:status, *:read                         |
+-----------+--------+--------------------------------------------------+

Default Claims
  - swarm:create
  - swarm:status
  ...

Config: /Users/janpieterse/Projects/SwarmDo/.swarmdo/claims.json
```

**Use it for:** auditing permissions before granting access; confirming role scopes. Filter with `-u <user>` / `-r <role>` / `--resource`. Check a single permission with `claims check -c swarm:create`; mutate with the `grant`/`revoke` siblings below.

---

## `issues list` — who's working on what?

List agent/human **issue claims** (ADR-016 collaborative human-agent workflow) — who has claimed which issue.

```
$ swarmdo issues list
[INFO] No claims found
```

On this repo there are no active issue claims, so the list is empty and exits `0`. (The empty-state message says "claims" — meaning *issue* claims, not the `claims` authz system; see troubleshooting.) Filter with `-s <status>` or `-m` (mine only).

**Use it for:** seeing who's on what before you `issues claim` a task; `issues board` gives a visual view, `issues stealable` lists up-for-grabs work.

---

## `redact` — did a secret just leak?

Detect and mask secrets (API keys, tokens, private keys) in a stream **before** it reaches an LLM, log, or memory. Deterministic, zero tokens.

```
$ printf 'token=ghp_ABCdef0123456789ABCdef0123456789ABCd\n' | swarmdo redact
token=ghp[REDACTED]
redact: 1 secret redacted (github-pat:1)
```

It masked the GitHub PAT, kept the first 3 chars (`ghp`) by default, and reported the pattern that matched (`github-pat`). The summary prints to stderr, so piping stdout stays clean.

**Use it for:** sanitizing output before it hits memory or a model. `--scan` turns it into a CI gate (exit 1 on any secret, no rewrite); `--sarif` emits code-scanning alerts; `--keep 0` full-masks; `--allow` skips known false positives.

---

## Related mutating commands (not run here)

Described from `--help` only — each changes state or auto-fixes, so run deliberately:

| Command | What it does (from help) |
|---------|--------------------------|
| `security scan --fix` | Same scan, but auto-fixes vulnerabilities where possible. |
| `security audit` | Audit-log management: `--action log/list/export/clear` (`clear` wipes the trail). |
| `claims grant -c <claim> -r <role>` | Grant a claim to a user/role; optional `--scope global/namespace/resource`, `--expires 24h/7d`. |
| `claims revoke -c <claim> -r <role>` | Revoke a claim from a user/role. |
| `issues claim <n> --agent <a>` | Claim an issue for an agent — the write-path counterpart to `issues list`. |

---

## Workflows

| Question | Command(s) |
|----------|-----------|
| Am I about to ship a known CVE? | `security scan` (→ `-o sarif` in CI) |
| Any copyleft / unknown licenses? | `license --allow MIT,Apache-2.0,ISC,BSD-3-Clause --ci` |
| What's in my supply chain? | `sbom -o sbom.json` (`--spec spdx` for SPDX) |
| Who can do what? | `claims list` → `claims check -c <claim>` |
| Who's working on which issue? | `issues list` / `issues board` |
| Is a secret leaking into logs/output? | `<cmd> \| redact --scan` (CI gate) |
| Full pre-release compliance pass | `security scan` + `license --ci` + `sbom` |

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `security scan` reports 100+ issues | It scans the dev tree by default; the *published* packages install clean. Narrow with `-t ./src` or `--type deps`. |
| Scan preview shows only MEDIUM rows | The truncated text table is not severity-sorted, so the 2 Critical / 61 High counted in the summary sit past the first 20 rows shown. Use `-o json` / `sarif` for the full ranked list. |
| `license` shows `UNKNOWN: 3` | Packages with no SPDX id in their metadata; treated as violations under `--allow` unless you pass `--allow-unknown`. |
| `issues list` prints `No claims found` | Empty state — no ADR-016 issue claims exist yet. "claims" here means *issue* claims, not the `claims` authorization system. |
| `redact` missed a secret | The high-entropy `keyword=value` fallback is on by default; tune `--threshold`, or use `--allow` to skip false positives. |

All read-only, all local, no model calls — safe to wire into hooks/CI.
