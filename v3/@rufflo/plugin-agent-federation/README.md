# @rufflo/plugin-agent-federation

[![npm version](https://img.shields.io/npm/v/@rufflo/plugin-agent-federation.svg)](https://www.npmjs.com/package/@rufflo/plugin-agent-federation)
[![npm downloads](https://img.shields.io/npm/dm/@rufflo/plugin-agent-federation.svg)](https://www.npmjs.com/package/@rufflo/plugin-agent-federation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Cross-installation agent federation with zero-trust security, PII-gated data flow, and compliance-grade audit trails.

## Install + run

```bash
npx -y -p @rufflo/plugin-agent-federation@latest rufflo-federation --help
```

## Subcommands

| Command | Description |
|---|---|
| `rufflo-federation init` | Initialize federation on this node (generates keypair) |
| `rufflo-federation join <peer-url>` | Join a federation by connecting to a peer |
| `rufflo-federation leave` | Leave the current federation |
| `rufflo-federation peers` | List known peers and their trust levels |
| `rufflo-federation peers add <node-id>` | Add a peer to the federation |
| `rufflo-federation peers remove <node-id>` | Remove a peer |
| `rufflo-federation status` | Show federation health, sessions, trust levels |
| `rufflo-federation audit` | Query compliance-grade audit logs |
| `rufflo-federation trust` | Manage trust scores and tiers |
| `rufflo-federation config` | Show/update federation config |

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

MIT — Rufflo Team.
