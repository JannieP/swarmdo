---
name: dependency-check
description: Scan project dependencies for known vulnerabilities and CVEs
argument-hint: "[--path PATH]"
allowed-tools: Bash(npx * npm *) mcp__rufflo__memory_store Read
---
Check dependencies for CVEs and outdated packages:

```bash
npx @rufflo/cli@latest security cve --check
npx @rufflo/cli@latest security audit --include-dev
npm audit --json
```

| Severity | Action |
|----------|--------|
| critical | Block deployment, fix immediately |
| high | Fix before next release |
| moderate | Schedule fix within sprint |
| low | Track in backlog |

Auto-fix: `npx @rufflo/cli@latest security cve --fix`

For continuous monitoring, dispatch via MCP:
`mcp__rufflo__hooks_worker-dispatch({ trigger: "audit" })`
