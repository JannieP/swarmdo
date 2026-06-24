# Rufflo + GitHub Copilot

Expose Rufflo's MCP tools (vector memory, `agent_run`, `task dispatch`, embeddings,
hooks, swarm) to GitHub Copilot. Both supported surfaces are **MCP-based** —
Rufflo already ships an MCP server (`rufflo mcp start`), so this is configuration,
not new code.

> **Why not a Copilot Extension / GitHub App (`@rufflo` in chat)?** Copilot
> Extensions only run in Copilot **Ask** mode, not agent mode — they can't drive
> the agent loop. MCP works in agent mode *and* with the cloud coding agent, so
> that's the path. ([GitHub Docs](https://docs.github.com/en/copilot/concepts/agents/coding-agent/mcp-and-coding-agent))

---

## Surface 1 — VS Code Copilot agent mode (recommended, ~2 min)

VS Code agent mode reads MCP servers from `.vscode/mcp.json` (root key is
`servers`, **not** `mcpServers`).

1. Copy [`docs/integrations/github-copilot/mcp.json`](./github-copilot/mcp.json)
   to `.vscode/mcp.json` in your project:

   ```jsonc
   {
     "servers": {
       "rufflo": {
         "type": "stdio",
         "command": "npx",
         "args": ["-y", "rufflo", "mcp", "start", "--tools-profile", "lean"],
         "env": { "ANTHROPIC_API_KEY": "${input:rufflo_anthropic_key}" }
       }
     },
     "inputs": [
       { "id": "rufflo_anthropic_key", "type": "promptString",
         "description": "Anthropic API key for Rufflo agent execution", "password": true }
     ]
   }
   ```

2. Open Copilot Chat → switch the mode dropdown to **Agent** (MCP tools are
   invisible in Ask/Edit mode).
3. The `rufflo` tools appear in the tool picker. Try: *"search my Rufflo memory
   for auth patterns"* or *"run a coder agent to draft a test."*

**Why `--tools-profile lean`?** Copilot's tool picker degrades as the surface
grows. `lean` exposes ~60 focused tools (memory, agent, swarm, hooks, agentdb,
embeddings) instead of all ~265 — sharper selection, lower context cost. Use
`balanced` or `full` if you need the rest. (See `rufflo mcp start --help`.)

> **Secrets:** never hard-code the key — the `${input:…}` form prompts once and
> stores it in VS Code's secret storage. Memory/search/embedding tools work with
> no key at all; only agent **execution** needs one.

---

## Surface 2 — Copilot cloud coding agent

The autonomous Copilot coding agent (the one that opens PRs) accepts an MCP
config in your repository settings: **Settings → Copilot → Coding agent → MCP
configuration**. Use the same server definition (stdio or, for a hosted setup,
`http`). Secrets are supplied via `COPILOT_MCP_*` repository secrets. This lets
the cloud agent call Rufflo's memory/search/dispatch tools inside its loop.

See [GitHub Docs — MCP and the coding agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/mcp-and-coding-agent).

---

## Verify

```bash
# The server answers a tools/list JSON-RPC frame on stdio:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npx -y rufflo mcp start --tools-profile lean
# → a JSON-RPC response listing ~60 lean-profile tools.
```

If you see the tool list, Copilot will too. The same server backs Claude Code,
Cursor, and any MCP-capable client — one config shape everywhere.

## Sources

- [VS Code — MCP servers](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
- [GitHub Docs — MCP and the coding agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/mcp-and-coding-agent)
- [GitHub Docs — extend Copilot Chat with MCP](https://docs.github.com/copilot/customizing-copilot/using-model-context-protocol/extending-copilot-chat-with-mcp)
