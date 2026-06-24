# CLI Commands Migration Guide

> Migrating from V2 CLI (25 commands) to V3 CLI (7 commands)

## Overview

V3 CLI is streamlined with 7 core commands. Many V2 commands need migration or have been consolidated.

## Command Coverage

| Status | V2 Commands | V3 Commands |
|--------|-------------|-------------|
| ✅ Implemented | 7 | 7 |
| ❌ Missing | 18 | - |
| **Total** | 25 | 7 |

## Implemented Commands ✅

### agent
```bash
# V2
npx rufflo agent spawn --type coder --name my-coder
npx rufflo agent list --detailed
npx rufflo agent info <agentId>
npx rufflo agent terminate <agentId>

# V3 (same)
npx rufflo agent spawn --type coder --id my-coder
npx rufflo agent list --detailed
npx rufflo agent status <agentId>
npx rufflo agent terminate <agentId>
```

### memory
```bash
# V2
npx rufflo memory store --namespace default --content "data"
npx rufflo memory query --search "keyword" --limit 10
npx rufflo memory list --namespace default

# V3 (enhanced)
npx rufflo memory store --type episodic --content "data"
npx rufflo memory search --query "keyword" --search-type hybrid
npx rufflo memory list --type all --sort-by relevance
```

### swarm
```bash
# V2
npx rufflo swarm --strategy auto --max-agents 5

# V3 (enhanced)
npx rufflo swarm init --topology hierarchical-mesh --max-agents 15
npx rufflo swarm status --include-metrics
npx rufflo swarm scale --target 10 --strategy gradual
```

### hooks
```bash
# V2
npx rufflo hooks pre-edit --file src/app.ts
npx rufflo hooks post-edit --file src/app.ts --success true

# V3 (enhanced with learning)
npx rufflo hooks pre-edit src/app.ts
npx rufflo hooks post-edit src/app.ts --success true
npx rufflo hooks route "implement feature X"
npx rufflo hooks explain "implement feature X"
npx rufflo hooks pretrain
npx rufflo hooks metrics
```

### mcp
```bash
# V2
npx rufflo mcp start --port 3000 --transport stdio
npx rufflo mcp stop
npx rufflo mcp status

# V3 (same)
npx rufflo mcp start --port 3000 --transport stdio
npx rufflo mcp stop
npx rufflo mcp status
```

### config
```bash
# V2
npx rufflo config get orchestrator
npx rufflo config set orchestrator.maxAgents 10

# V3
npx rufflo config load --scope project
npx rufflo config save --create-backup
npx rufflo config validate --strict
```

### migrate
```bash
# V3 only
npx rufflo migrate status
npx rufflo migrate run --target all --backup
npx rufflo migrate verify
npx rufflo migrate rollback --backup-id <id>
```

## Missing Commands ❌

### Priority 1 - HIGH

#### init
```bash
# V2
npx rufflo init
npx rufflo init --minimal
npx rufflo init --flow-nexus

# V3 Migration needed:
# Add to v3/@rufflo/cli/src/commands/init.ts
export const initCommand = {
  command: 'init',
  description: 'Initialize Claude Code integration files',
  options: [
    { flags: '-f, --force', description: 'Overwrite existing files' },
    { flags: '-m, --minimal', description: 'Create minimal configuration' },
    { flags: '--flow-nexus', description: 'Initialize with Flow Nexus' }
  ],
  action: async (options) => {
    await createClaudeFlowConfig(options);
    await createDefaultAgents(options);
    if (!options.minimal) {
      await createHooksConfig(options);
      await createWorkflowTemplates(options);
    }
  }
};
```

#### start
```bash
# V2
npx rufflo start
npx rufflo start --daemon
npx rufflo start --port 3000

# V3 Migration needed:
# Add to v3/@rufflo/cli/src/commands/start.ts
export const startCommand = {
  command: 'start',
  description: 'Start the orchestration system',
  options: [
    { flags: '-d, --daemon', description: 'Run as daemon' },
    { flags: '-p, --port <port>', description: 'MCP server port' }
  ],
  action: async (options) => {
    const swarm = await initializeV3Swarm();
    await swarm.spawnAllAgents();
    if (options.port) {
      await startMCPServer({ port: options.port });
    }
  }
};
```

#### status
```bash
# V2
npx rufflo status
npx rufflo status --watch
npx rufflo status --json
npx rufflo status --health-check

# V3 Migration needed:
# Add to v3/@rufflo/cli/src/commands/status.ts
export const statusCommand = {
  command: 'status',
  description: 'Show enhanced system status',
  options: [
    { flags: '-w, --watch', description: 'Watch mode' },
    { flags: '-i, --interval <seconds>', description: 'Update interval' },
    { flags: '--json', description: 'Output in JSON format' },
    { flags: '--health-check', description: 'Perform health checks' }
  ],
  action: async (options) => {
    const status = await getSystemStatus();
    if (options.healthCheck) {
      status.health = await performHealthChecks();
    }
    if (options.watch) {
      await watchStatus(status, options.interval);
    } else {
      displayStatus(status, options.json);
    }
  }
};
```

#### task
```bash
# V2
npx rufflo task create --type implementation --description "Build feature"
npx rufflo task list --status running
npx rufflo task status <taskId>
npx rufflo task cancel <taskId>
npx rufflo task assign <taskId> --agent <agentId>

# V3 Migration needed:
# Add to v3/@rufflo/cli/src/commands/task.ts
export const taskCommand = {
  command: 'task',
  description: 'Manage tasks',
  subcommands: [
    {
      command: 'create',
      options: [
        { flags: '-t, --type <type>', description: 'Task type' },
        { flags: '-d, --description <desc>', description: 'Task description' },
        { flags: '-p, --priority <priority>', description: 'Task priority' },
        { flags: '-a, --assign <agentId>', description: 'Assign to agent' }
      ]
    },
    { command: 'list', options: [{ flags: '-s, --status <status>' }] },
    { command: 'status', args: '<taskId>' },
    { command: 'cancel', args: '<taskId>' },
    { command: 'assign', args: '<taskId>', options: [{ flags: '--agent <agentId>' }] }
  ]
};
```

#### session
```bash
# V2
npx rufflo session list
npx rufflo session save --description "Checkpoint"
npx rufflo session restore <sessionId>
npx rufflo session delete <sessionId>
npx rufflo session export --include-memory
npx rufflo session import <file>

# V3 Migration needed:
# Add to v3/@rufflo/cli/src/commands/session.ts
export const sessionCommand = {
  command: 'session',
  description: 'Manage Rufflo sessions',
  subcommands: [
    { command: 'list', options: [{ flags: '-a, --active' }] },
    { command: 'save', options: [{ flags: '-d, --description <desc>' }] },
    { command: 'restore', args: '<sessionId>' },
    { command: 'delete', args: '<sessionId>' },
    { command: 'export', options: [{ flags: '--include-memory' }] },
    { command: 'import', args: '<file>' }
  ]
};
```

### Priority 2 - MEDIUM

#### hive
```bash
# V2
npx rufflo hive --topology mesh --consensus quorum --max-agents 8
npx rufflo hive-mind init
npx rufflo hive-mind status
npx rufflo hive-mind spawn --type queen
npx rufflo hive-mind task --description "Task"
npx rufflo hive-mind wizard
npx rufflo hive-mind pause
npx rufflo hive-mind resume
npx rufflo hive-mind stop

# V3 Migration needed:
# Add to v3/@rufflo/cli/src/commands/hive.ts
export const hiveCommand = {
  command: 'hive',
  description: 'Hive Mind multi-agent coordination',
  options: [
    { flags: '--topology <type>', description: 'Topology: mesh, hierarchical, ring, star' },
    { flags: '--consensus <type>', description: 'Consensus: quorum, unanimous, weighted' },
    { flags: '--max-agents <n>', description: 'Maximum agents' }
  ],
  subcommands: [
    { command: 'init' },
    { command: 'status' },
    { command: 'spawn', options: [{ flags: '-t, --type <type>' }] },
    { command: 'task', options: [{ flags: '-d, --description <desc>' }] },
    { command: 'wizard' },
    { command: 'pause' },
    { command: 'resume' },
    { command: 'stop' }
  ]
};
```

#### sparc
```bash
# V2
npx rufflo sparc modes
npx rufflo sparc info <mode>
npx rufflo sparc run --mode specification
npx rufflo sparc tdd --sequential
npx rufflo sparc workflow --dry-run

# V3 Migration needed:
# Add to v3/@rufflo/cli/src/commands/sparc.ts
export const sparcCommand = {
  command: 'sparc',
  description: 'SPARC methodology commands',
  subcommands: [
    { command: 'modes', description: 'List SPARC modes' },
    { command: 'info', args: '<mode>' },
    { command: 'run', options: [{ flags: '-m, --mode <mode>' }] },
    { command: 'tdd', options: [{ flags: '--sequential' }] },
    { command: 'workflow', options: [{ flags: '--dry-run' }] }
  ]
};
```

#### monitor
```bash
# V2
npx rufflo monitor
npx rufflo monitor --interval 2
npx rufflo monitor --compact
npx rufflo monitor --focus agents

# V3 Migration needed:
# Add to v3/@rufflo/cli/src/commands/monitor.ts
export const monitorCommand = {
  command: 'monitor',
  description: 'Start live monitoring dashboard',
  options: [
    { flags: '-i, --interval <seconds>', description: 'Update interval' },
    { flags: '-c, --compact', description: 'Compact view' },
    { flags: '--focus <component>', description: 'Focus on component' }
  ],
  action: async (options) => {
    const dashboard = createDashboard(options);
    await dashboard.start();
  }
};
```

#### github
```bash
# V2
npx rufflo github init
npx rufflo github gh-coordinator
npx rufflo github pr-manager
npx rufflo github issue-tracker
npx rufflo github release-manager
npx rufflo github repo-architect
npx rufflo github sync-coordinator

# V3 Migration needed:
# Add to v3/@rufflo/cli/src/commands/github.ts
export const githubCommand = {
  command: 'github',
  description: 'GitHub workflow automation',
  subcommands: [
    { command: 'init' },
    { command: 'gh-coordinator' },
    { command: 'pr-manager' },
    { command: 'issue-tracker' },
    { command: 'release-manager' },
    { command: 'repo-architect' },
    { command: 'sync-coordinator' }
  ],
  options: [
    { flags: '--auto-approve', description: 'Auto-approve permissions' },
    { flags: '--dry-run', description: 'Preview only' }
  ]
};
```

### Priority 3 - LOW

#### neural
```bash
# V2
npx rufflo neural init
npx rufflo neural init --force --target .claude/agents/neural

# V3: Replaced by hooks pretrain
npx rufflo hooks pretrain
```

#### goal
```bash
# V2
npx rufflo goal init

# V3: Replaced by hooks system
npx rufflo hooks pretrain --include-goap
```

#### claude
```bash
# V2
npx rufflo claude spawn --tools View,Edit,Bash --mode full

# V3 Migration needed:
# Add to v3/@rufflo/cli/src/commands/claude.ts
export const claudeCommand = {
  command: 'claude',
  description: 'Spawn Claude instances',
  subcommands: [
    {
      command: 'spawn',
      options: [
        { flags: '-t, --tools <tools>', description: 'Allowed tools' },
        { flags: '-m, --mode <mode>', description: 'Dev mode' },
        { flags: '--parallel', description: 'Enable parallel execution' }
      ]
    }
  ]
};
```

#### workflow
```bash
# V2
npx rufflo workflow create --name "my-workflow"
npx rufflo workflow execute <workflow>
npx rufflo workflow list

# V3 Migration needed:
# Add to v3/@rufflo/cli/src/commands/workflow.ts
```

#### repl
```bash
# V2
npx rufflo repl

# V3 Migration needed:
# Add to v3/@rufflo/cli/src/commands/repl.ts
export const replCommand = {
  command: 'repl',
  description: 'Start interactive REPL mode',
  action: async () => {
    const rl = createInterface({ input: stdin, output: stdout });
    // REPL loop
  }
};
```

#### version
```bash
# V2
npx rufflo version
npx rufflo version --short

# V3 Migration needed:
# Add version flag to CLI root
```

#### completion
```bash
# V2
npx rufflo completion bash
npx rufflo completion --install

# V3 Migration needed:
# Add to v3/@rufflo/cli/src/commands/completion.ts
```

## Implementation Plan

### Phase 1 (Week 1-2): Core Commands
1. `init` - Project initialization
2. `start` - System startup
3. `status` - System status
4. `task` - Task management
5. `session` - Session management

### Phase 2 (Week 3-4): Feature Commands
1. `hive` - Hive-mind mode
2. `sparc` - SPARC methodology
3. `monitor` - Live dashboard
4. `github` - GitHub integration

### Phase 3 (Week 5-6): Utilities
1. `workflow` - Workflow management
2. `claude` - Claude spawning
3. `repl` - Interactive mode
4. `version` - Version info
5. `completion` - Shell completion
