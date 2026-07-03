# Local Development Configuration

## Environment Variables

```bash
SWARMDO_CONFIG=./swarmdo.config.json
SWARMDO_LOG_LEVEL=info
SWARMDO_MEMORY_BACKEND=hybrid
SWARMDO_MEMORY_PATH=./data/memory
SWARMDO_MCP_PORT=3000
SWARMDO_MCP_TRANSPORT=stdio
```

## Plugin Registry Maintenance (IPFS/Pinata)

Registry CID stored in: `v3/@swarmdo/cli/src/plugins/store/discovery.ts`
Gateway: `https://gateway.pinata.cloud/ipfs/{CID}`

Steps to add a plugin:
1. Fetch current registry: `curl -s "https://gateway.pinata.cloud/ipfs/$(grep LIVE_REGISTRY_CID v3/@swarmdo/cli/src/plugins/store/discovery.ts | cut -d"'" -f2)" > /tmp/registry.json`
2. Add plugin entry to `plugins` array, increment `totalPlugins`, update category counts
3. Upload: `curl -X POST "https://api.pinata.cloud/pinning/pinJSONToIPFS" -H "Authorization: Bearer $PINATA_JWT" -H "Content-Type: application/json" -d @/tmp/registry.json`
4. Update `LIVE_REGISTRY_CID` in discovery.ts and the `demoPluginRegistry` fallback

Security: NEVER hardcode API keys. Source from .env at runtime. NEVER commit .env.

## Doctor Health Checks

`npx swarmdo@v3alpha doctor` checks: Node 20+, npm 9+, git, config, daemon, memory DB, API keys, MCP servers, disk space, TypeScript.

## Hooks Quick Reference

```bash
npx swarmdo@v3alpha hooks pre-task --description "[task]"
npx swarmdo@v3alpha hooks post-task --task-id "[id]" --success true
npx swarmdo@v3alpha hooks session-start --session-id "[id]"
npx swarmdo@v3alpha hooks route --task "[task]"
npx swarmdo@v3alpha hooks worker list
```

## Intelligence System (SwarmVector)

4-step pipeline: RETRIEVE (HNSW) → JUDGE (verdicts) → DISTILL (LoRA) → CONSOLIDATE (EWC++)

Components: SONA (<0.05ms), MoE (8 experts), HNSW (~1.9x-4.7x measured), Flash Attention (unverified (no benchmark))
