# swarm-spawn

Spawn agents in the swarm.

## Usage
```bash
npx swarmdo swarm spawn [options]
```

## Options
- `--type <type>` - Agent type
- `--count <n>` - Number to spawn
- `--capabilities <list>` - Agent capabilities

## Examples
```bash
npx swarmdo swarm spawn --type coder --count 3
npx swarmdo swarm spawn --type researcher --capabilities "web-search,analysis"
```
