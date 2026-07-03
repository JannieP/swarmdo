# @swarmdo/plugin-agent-federation

[![npm version](https://img.shields.io/npm/v/@swarmdo/plugin-agent-federation.svg)](https://www.npmjs.com/package/@swarmdo/plugin-agent-federation)
[![npm downloads](https://img.shields.io/npm/dm/@swarmdo/plugin-agent-federation.svg)](https://www.npmjs.com/package/@swarmdo/plugin-agent-federation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Cross-installation agent federation with zero-trust security, PII-gated data flow, and compliance-grade audit trails.

## Install + run

```bash
npx -y -p @swarmdo/plugin-agent-federation@latest swarmdo-federation --help
```

## Subcommands

| Command | Description |
|---|---|
| `swarmdo-federation init` | Initialize federation on this node (generates keypair) |
| `swarmdo-federation join <peer-url>` | Join a federation by connecting to a peer |
| `swarmdo-federation leave` | Leave the current federation |
| `swarmdo-federation peers` | List known peers and their trust levels |
| `swarmdo-federation peers add <node-id>` | Add a peer to the federation |
| `swarmdo-federation peers remove <node-id>` | Remove a peer |
| `swarmdo-federation status` | Show federation health, sessions, trust levels |
| `swarmdo-federation audit` | Query compliance-grade audit logs |
| `swarmdo-federation trust` | Manage trust scores and tiers |
| `swarmdo-federation config` | Show/update federation config |

## Configuration via `.env`

```bash
FEDERATION_NODE_NAME=my-node           # default: hostname
FEDERATION_BIND_HOST=0.0.0.0           # default: 0.0.0.0
FEDERATION_BIND_PORT=8443              # default: 8443
FEDERATION_TRUST_LEVEL=untrusted       # default: untrusted
```

## Tests

325 unit tests covering audit, routing, discovery, plugin lifecycle.

```bash
npm test
```

## License

MIT — Swarmdo Team.
