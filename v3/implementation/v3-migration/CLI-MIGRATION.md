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
npx swarmdo agent spawn --type coder --name my-coder
npx swarmdo agent list --detailed
npx swarmdo agent info <agentId>
npx swarmdo agent terminate <agentId>

# V3 (same)
npx swarmdo agent spawn --type coder --id my-coder
npx swarmdo agent list --detailed
npx swarmdo agent status <agentId>
npx swarmdo agent terminate <agentId>
```

### memory
```bash
# V2
npx swarmdo memory store --namespace default --content "data"
npx swarmdo memory query --search "keyword" --limit 10
npx swarmdo memory list --namespace default

# V3 (enhanced)
npx swarmdo memory store --type episodic --content "data"
npx swarmdo memory search --query "keyword" --search-type hybrid
npx swarmdo memory list --type all --sort-by relevance
```

### swarm
```bash
# V2
npx swarmdo swarm --strategy auto --max-agents 5

# V3 (enhanced)
npx swarmdo swarm init --topology hierarchical-mesh --max-agents 15
npx swarmdo swarm status --include-metrics
npx swarmdo swarm scale --target 10 --strategy gradual
```

### hooks
```bash
# V2
npx swarmdo hooks pre-edit --file src/app.ts
npx swarmdo hooks post-edit --file src/app.ts --success true

# V3 (enhanced with learning)
npx swarmdo hooks pre-edit src/app.ts
npx swarmdo hooks post-edit src/app.ts --success true
npx swarmdo hooks route "implement feature X"
npx swarmdo hooks explain "implement feature X"
npx swarmdo hooks pretrain
npx swarmdo hooks metrics
```

### mcp
```bash
# V2
npx swarmdo mcp start --port 3000 --transport stdio
npx swarmdo mcp stop
npx swarmdo mcp status

# V3 (same)
npx swarmdo mcp start --port 3000 --transport stdio
npx swarmdo mcp stop
npx swarmdo mcp status
```

### config
```bash
# V2
npx swarmdo config get orchestrator
npx swarmdo config set orchestrator.maxAgents 10

# V3
npx swarmdo config load --scope project
npx swarmdo config save --create-backup
npx swarmdo config validate --strict
```

### migrate
```bash
# V3 only
npx swarmdo migrate status
npx swarmdo migrate run --target all --backup
npx swarmdo migrate verify
npx swarmdo migrate rollback --backup-id <id>
```

## Missing Commands ❌

### Priority 1 - HIGH

#### init
```bash
# V2
npx swarmdo init
npx swarmdo init --minimal
npx swarmdo init --flow-nexus

# V3 Migration needed:
# Add to v3/@swarmdo/cli/src/commands/init.ts
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
npx swarmdo start
npx swarmdo start --daemon
npx swarmdo start --port 3000

# V3 Migration needed:
# Add to v3/@swarmdo/cli/src/commands/start.ts
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
npx swarmdo status
npx swarmdo status --watch
npx swarmdo status --json
npx swarmdo status --health-check

# V3 Migration needed:
# Add to v3/@swarmdo/cli/src/commands/status.ts
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
npx swarmdo task create --type implementation --description "Build feature"
npx swarmdo task list --status running
npx swarmdo task status <taskId>
npx swarmdo task cancel <taskId>
npx swarmdo task assign <taskId> --agent <agentId>

# V3 Migration needed:
# Add to v3/@swarmdo/cli/src/commands/task.ts
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
npx swarmdo session list
npx swarmdo session save --description "Checkpoint"
npx swarmdo session restore <sessionId>
npx swarmdo session delete <sessionId>
npx swarmdo session export --include-memory
npx swarmdo session import <file>

# V3 Migration needed:
# Add to v3/@swarmdo/cli/src/commands/session.ts
export const sessionCommand = {
  command: 'session',
  description: 'Manage Swarmdo sessions',
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
npx swarmdo hive --topology mesh --consensus quorum --max-agents 8
npx swarmdo hive-mind init
npx swarmdo hive-mind status
npx swarmdo hive-mind spawn --type queen
npx swarmdo hive-mind task --description "Task"
npx swarmdo hive-mind wizard
npx swarmdo hive-mind pause
npx swarmdo hive-mind resume
npx swarmdo hive-mind stop

# V3 Migration needed:
# Add to v3/@swarmdo/cli/src/commands/hive.ts
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
npx swarmdo sparc modes
npx swarmdo sparc info <mode>
npx swarmdo sparc run --mode specification
npx swarmdo sparc tdd --sequential
npx swarmdo sparc workflow --dry-run

# V3 Migration needed:
# Add to v3/@swarmdo/cli/src/commands/sparc.ts
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
npx swarmdo monitor
npx swarmdo monitor --interval 2
npx swarmdo monitor --compact
npx swarmdo monitor --focus agents

# V3 Migration needed:
# Add to v3/@swarmdo/cli/src/commands/monitor.ts
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
npx swarmdo github init
npx swarmdo github gh-coordinator
npx swarmdo github pr-manager
npx swarmdo github issue-tracker
npx swarmdo github release-manager
npx swarmdo github repo-architect
npx swarmdo github sync-coordinator

# V3 Migration needed:
# Add to v3/@swarmdo/cli/src/commands/github.ts
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
npx swarmdo neural init
npx swarmdo neural init --force --target .claude/agents/neural

# V3: Replaced by hooks pretrain
npx swarmdo hooks pretrain
```

#### goal
```bash
# V2
npx swarmdo goal init

# V3: Replaced by hooks system
npx swarmdo hooks pretrain --include-goap
```

#### claude
```bash
# V2
npx swarmdo claude spawn --tools View,Edit,Bash --mode full

# V3 Migration needed:
# Add to v3/@swarmdo/cli/src/commands/claude.ts
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
npx swarmdo workflow create --name "my-workflow"
npx swarmdo workflow execute <workflow>
npx swarmdo workflow list

# V3 Migration needed:
# Add to v3/@swarmdo/cli/src/commands/workflow.ts
```

#### repl
```bash
# V2
npx swarmdo repl

# V3 Migration needed:
# Add to v3/@swarmdo/cli/src/commands/repl.ts
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
npx swarmdo version
npx swarmdo version --short

# V3 Migration needed:
# Add version flag to CLI root
```

#### completion
```bash
# V2
npx swarmdo completion bash
npx swarmdo completion --install

# V3 Migration needed:
# Add to v3/@swarmdo/cli/src/commands/completion.ts
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
