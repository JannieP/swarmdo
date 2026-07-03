---
name: audit
description: Run a security audit on the project
---
$ARGUMENTS
Run a Swarmdo security audit. Accepts optional flags:

Usage: /audit [--depth quick|standard|full] [--path <dir>] [--fix]

Defaults to `--depth standard` on the current project root. Parse the depth from $ARGUMENTS (quick, standard, or full).

Steps:
1. `npx @swarmdo/cli@latest security scan --depth DEPTH`
2. `npx @swarmdo/cli@latest security cve --check`
3. `npx @swarmdo/cli@latest security report --format markdown`

Store findings in memory for pattern training:
`npx @swarmdo/cli@latest memory store --namespace security --key "audit-YYYY-MM-DD" --value "FINDINGS_SUMMARY"`
