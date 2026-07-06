/**
 * V3 CLI Task Command
 * Task management for Swarmdo
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { Command, CommandContext, CommandResult } from '../types.js';
import { output } from '../output.js';
import { select, confirm, input, multiSelect } from '../prompt.js';
import { callMCPTool, MCPClientError } from '../mcp-client.js';

// Task types
const TASK_TYPES = [
  { value: 'implementation', label: 'Implementation', hint: 'Feature implementation' },
  { value: 'bug-fix', label: 'Bug Fix', hint: 'Fix a bug or issue' },
  { value: 'refactoring', label: 'Refactoring', hint: 'Code refactoring' },
  { value: 'testing', label: 'Testing', hint: 'Write or update tests' },
  { value: 'documentation', label: 'Documentation', hint: 'Documentation updates' },
  { value: 'research', label: 'Research', hint: 'Research and analysis' },
  { value: 'review', label: 'Review', hint: 'Code review' },
  { value: 'optimization', label: 'Optimization', hint: 'Performance optimization' },
  { value: 'security', label: 'Security', hint: 'Security audit or fix' },
  { value: 'custom', label: 'Custom', hint: 'Custom task type' }
];

// Task priorities
const TASK_PRIORITIES = [
  { value: 'critical', label: 'Critical', hint: 'Highest priority' },
  { value: 'high', label: 'High', hint: 'Important task' },
  { value: 'normal', label: 'Normal', hint: 'Standard priority' },
  { value: 'low', label: 'Low', hint: 'Lower priority' }
];

// Format task status with color
function formatStatus(status: string): string {
  switch (status) {
    case 'completed':
      return output.success(status);
    case 'running':
    case 'in_progress':
      return output.info(status);
    case 'pending':
    case 'queued':
      return output.warning(status);
    case 'failed':
    case 'cancelled':
      return output.error(status);
    default:
      return status;
  }
}

// Format priority with color
function formatPriority(priority: string): string {
  switch (priority) {
    case 'critical':
      return output.error(priority);
    case 'high':
      return output.warning(priority);
    case 'normal':
      return priority;
    case 'low':
      return output.dim(priority);
    default:
      return priority;
  }
}

// Create subcommand
const createCommand: Command = {
  name: 'create',
  aliases: ['new', 'add'],
  description: 'Create a new task',
  options: [
    {
      name: 'type',
      short: 't',
      description: 'Task type',
      type: 'string',
      choices: TASK_TYPES.map(t => t.value)
    },
    {
      name: 'description',
      short: 'd',
      description: 'Task description',
      type: 'string'
    },
    {
      name: 'priority',
      short: 'p',
      description: 'Task priority',
      type: 'string',
      choices: TASK_PRIORITIES.map(p => p.value),
      default: 'normal'
    },
    {
      name: 'assign',
      short: 'a',
      description: 'Assign to agent(s)',
      type: 'string'
    },
    {
      name: 'tags',
      description: 'Comma-separated tags',
      type: 'string'
    },
    {
      name: 'parent',
      description: 'Parent task ID',
      type: 'string'
    },
    {
      name: 'dependencies',
      description: 'Comma-separated task IDs that must complete first',
      type: 'string'
    },
    {
      name: 'timeout',
      description: 'Task timeout in seconds',
      type: 'number',
      default: 300
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    let taskType = ctx.flags.type as string;
    let description = ctx.flags.description as string;
    let priority = ctx.flags.priority as string;

    // Interactive mode
    if (!taskType && ctx.interactive) {
      taskType = await select({
        message: 'Select task type:',
        options: TASK_TYPES
      });
    }

    if (!description && ctx.interactive) {
      description = await input({
        message: 'Task description:',
        validate: (v) => v.length > 0 || 'Description is required'
      });
    }

    if (!taskType || !description) {
      output.printError('Task type and description are required');
      output.printInfo('Use --type and --description flags, or run in interactive mode');
      return { success: false, exitCode: 1 };
    }

    if (!priority && ctx.interactive) {
      priority = await select({
        message: 'Select priority:',
        options: TASK_PRIORITIES,
        default: 'normal'
      });
    }

    // Parse tags and dependencies
    const tags = ctx.flags.tags ? (ctx.flags.tags as string).split(',').map(t => t.trim()) : [];
    const dependencies = ctx.flags.dependencies
      ? (ctx.flags.dependencies as string).split(',').map(d => d.trim())
      : [];

    output.writeln();
    output.printInfo(`Creating ${taskType} task...`);

    try {
      const result = await callMCPTool<{
        taskId: string;
        type: string;
        description: string;
        priority: string;
        status: string;
        createdAt: string;
        assignedTo?: string[];
        tags: string[];
      }>('task_create', {
        type: taskType,
        description,
        priority: priority || 'normal',
        assignedTo: ctx.flags.assign ? [ctx.flags.assign] : undefined,
        parentId: ctx.flags.parent,
        dependencies,
        tags,
        timeout: ctx.flags.timeout,
        metadata: {
          source: 'cli',
          createdBy: 'user'
        }
      });

      // Handler-level rejections (e.g. dependency validation) come back as
      // {success:false, error} rather than a thrown MCPClientError — without
      // this check the CLI printed a "Task created" banner over an empty row.
      const rejection = result as unknown as { success?: boolean; error?: string };
      if (rejection.success === false || !result.taskId) {
        output.printError(`Failed to create task: ${rejection.error ?? 'unknown error'}`);
        return { success: false, exitCode: 1 };
      }

      output.writeln();
      output.printSuccess(`Task created: ${result.taskId}`);
      output.writeln();

      output.printTable({
        columns: [
          { key: 'property', header: 'Property', width: 15 },
          { key: 'value', header: 'Value', width: 40 }
        ],
        data: [
          { property: 'ID', value: result.taskId },
          { property: 'Type', value: result.type },
          { property: 'Description', value: result.description },
          { property: 'Priority', value: formatPriority(result.priority) },
          { property: 'Status', value: formatStatus(result.status) },
          { property: 'Assigned To', value: result.assignedTo?.join(', ') || 'Unassigned' },
          { property: 'Tags', value: result.tags?.join(', ') || 'None' }, // #1863 — guard undefined array
          { property: 'Created', value: new Date(result.createdAt).toLocaleString() }
        ]
      });

      if (ctx.flags.format === 'json') {
        output.printJson(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to create task: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

// List subcommand
const listCommand: Command = {
  name: 'list',
  aliases: ['ls'],
  description: 'List tasks',
  options: [
    {
      name: 'status',
      short: 's',
      description: 'Filter by status',
      type: 'string',
      choices: ['pending', 'running', 'completed', 'failed', 'cancelled', 'all']
    },
    {
      name: 'type',
      short: 't',
      description: 'Filter by task type',
      type: 'string'
    },
    {
      name: 'priority',
      short: 'p',
      description: 'Filter by priority',
      type: 'string'
    },
    {
      name: 'agent',
      short: 'a',
      description: 'Filter by assigned agent',
      type: 'string'
    },
    {
      name: 'limit',
      short: 'l',
      description: 'Maximum number of tasks to show',
      type: 'number',
      default: 20
    },
    {
      name: 'all',
      description: 'Show all tasks including completed',
      type: 'boolean',
      default: false
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const status = ctx.flags.all ? 'all' : (ctx.flags.status as string) || 'pending,running';
    const limit = ctx.flags.limit as number;

    try {
      const result = await callMCPTool<{
        tasks: Array<{
          id: string;
          type: string;
          description: string;
          priority: string;
          status: string;
          assignedTo?: string[];
          progress: number;
          createdAt: string;
        }>;
        total: number;
      }>('task_list', {
        status,
        type: ctx.flags.type,
        priority: ctx.flags.priority,
        agentId: ctx.flags.agent,
        limit,
        offset: 0
      });

      if (ctx.flags.format === 'json') {
        output.printJson(result);
        return { success: true, data: result };
      }

      output.writeln();
      output.writeln(output.bold('Tasks'));
      output.writeln();

      if (result.tasks.length === 0) {
        output.printInfo('No tasks found matching criteria');
        return { success: true, data: result };
      }

      output.printTable({
        columns: [
          { key: 'id', header: 'ID', width: 15 },
          { key: 'type', header: 'Type', width: 15 },
          { key: 'description', header: 'Description', width: 30 },
          { key: 'priority', header: 'Priority', width: 10 },
          { key: 'status', header: 'Status', width: 12 },
          { key: 'progress', header: 'Progress', width: 10 }
        ],
        data: result.tasks.map(t => ({
          id: t.id,
          type: t.type,
          description: t.description.length > 27
            ? t.description.slice(0, 27) + '...'
            : t.description,
          priority: formatPriority(t.priority),
          status: formatStatus(t.status),
          progress: `${t.progress}%`
        }))
      });

      output.writeln();
      output.printInfo(`Showing ${result.tasks.length} of ${result.total} tasks`);

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to list tasks: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

// Status subcommand (get task details)
const statusCommand: Command = {
  name: 'status',
  aliases: ['info', 'get'],
  description: 'Get task status and details',
  options: [
    {
      name: 'id',
      description: 'Task ID',
      type: 'string'
    },
    {
      name: 'logs',
      description: 'Include execution logs',
      type: 'boolean',
      default: false
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    let taskId = ctx.args[0] || ctx.flags.id as string;

    if (!taskId && ctx.interactive) {
      taskId = await input({
        message: 'Enter task ID:',
        validate: (v) => v.length > 0 || 'Task ID is required'
      });
    }

    if (!taskId) {
      output.printError('Task ID is required');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        id: string;
        type: string;
        description: string;
        priority: string;
        status: string;
        progress: number;
        assignedTo?: string[];
        parentId?: string;
        dependencies: string[];
        dependents: string[];
        tags: string[];
        createdAt: string;
        startedAt?: string;
        completedAt?: string;
        result?: unknown;
        error?: string;
        logs?: Array<{ timestamp: string; level: string; message: string }>;
        metrics?: {
          executionTime: number;
          retries: number;
          tokensUsed: number;
        };
      }>('task_status', {
        taskId,
        includeLogs: ctx.flags.logs,
        includeMetrics: true
      });

      if (ctx.flags.format === 'json') {
        output.printJson(result);
        return { success: true, data: result };
      }

      output.writeln();
      output.printBox(
        [
          `Type:        ${result.type}`,
          `Status:      ${formatStatus(result.status)}`,
          `Priority:    ${formatPriority(result.priority)}`,
          `Progress:    ${result.progress}%`,
          '',
          `Description: ${result.description}`
        ].join('\n'),
        `Task: ${result.id}`
      );

      // Assignment info
      output.writeln();
      output.writeln(output.bold('Assignment'));
      output.printTable({
        columns: [
          { key: 'property', header: 'Property', width: 15 },
          { key: 'value', header: 'Value', width: 40 }
        ],
        data: [
          // #1863 — tasks created via task_create or loaded from an older
          // store schema may not have these arrays populated; guard each
          // `.join()` so `task status` never throws "Cannot read properties
          // of undefined (reading 'join')".
          { property: 'Assigned To', value: result.assignedTo?.join(', ') || 'Unassigned' },
          { property: 'Parent Task', value: result.parentId || 'None' },
          { property: 'Dependencies', value: result.dependencies?.join(', ') || 'None' },
          { property: 'Dependents', value: result.dependents?.join(', ') || 'None' },
          { property: 'Tags', value: result.tags?.join(', ') || 'None' }
        ]
      });

      // Timeline
      output.writeln();
      output.writeln(output.bold('Timeline'));
      output.printTable({
        columns: [
          { key: 'event', header: 'Event', width: 15 },
          { key: 'time', header: 'Time', width: 30 }
        ],
        data: [
          { event: 'Created', time: new Date(result.createdAt).toLocaleString() },
          { event: 'Started', time: result.startedAt ? new Date(result.startedAt).toLocaleString() : '-' },
          { event: 'Completed', time: result.completedAt ? new Date(result.completedAt).toLocaleString() : '-' }
        ]
      });

      // Metrics
      if (result.metrics) {
        output.writeln();
        output.writeln(output.bold('Metrics'));
        output.printTable({
          columns: [
            { key: 'metric', header: 'Metric', width: 20 },
            { key: 'value', header: 'Value', width: 20, align: 'right' }
          ],
          data: [
            { metric: 'Execution Time', value: `${(result.metrics.executionTime / 1000).toFixed(2)}s` },
            { metric: 'Retries', value: result.metrics.retries },
            { metric: 'Tokens Used', value: result.metrics.tokensUsed.toLocaleString() }
          ]
        });
      }

      // Error if failed
      if (result.status === 'failed' && result.error) {
        output.writeln();
        output.printError(`Error: ${result.error}`);
      }

      // Logs if requested
      if (ctx.flags.logs && result.logs && result.logs.length > 0) {
        output.writeln();
        output.writeln(output.bold('Execution Logs'));
        for (const log of result.logs.slice(-20)) {
          const time = new Date(log.timestamp).toLocaleTimeString();
          const level = log.level === 'error' ? output.error(`[${log.level}]`) :
                        log.level === 'warn' ? output.warning(`[${log.level}]`) :
                        output.dim(`[${log.level}]`);
          output.writeln(`  ${output.dim(time)} ${level} ${log.message}`);
        }
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to get task status: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

// Cancel subcommand
const cancelCommand: Command = {
  name: 'cancel',
  aliases: ['abort', 'stop'],
  description: 'Cancel a running task',
  options: [
    {
      name: 'force',
      short: 'f',
      description: 'Force cancel without confirmation',
      type: 'boolean',
      default: false
    },
    {
      name: 'reason',
      short: 'r',
      description: 'Cancellation reason',
      type: 'string'
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const taskId = ctx.args[0];
    const force = ctx.flags.force as boolean;
    const reason = ctx.flags.reason as string;

    if (!taskId) {
      output.printError('Task ID is required');
      return { success: false, exitCode: 1 };
    }

    if (!force && ctx.interactive) {
      const confirmed = await confirm({
        message: `Are you sure you want to cancel task ${taskId}?`,
        default: false
      });

      if (!confirmed) {
        output.printInfo('Operation cancelled');
        return { success: true };
      }
    }

    try {
      const result = await callMCPTool<{
        taskId: string;
        cancelled: boolean;
        previousStatus: string;
        cancelledAt: string;
      }>('task_cancel', {
        taskId,
        reason: reason || 'Cancelled by user via CLI'
      });

      output.writeln();
      output.printSuccess(`Task ${taskId} cancelled`);
      output.printInfo(`Previous status: ${result.previousStatus}`);

      if (ctx.flags.format === 'json') {
        output.printJson(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to cancel task: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

// Assign subcommand
const assignCommand: Command = {
  name: 'assign',
  description: 'Assign a task to agent(s)',
  options: [
    {
      name: 'agent',
      short: 'a',
      description: 'Agent ID(s) to assign (comma-separated)',
      type: 'string'
    },
    {
      name: 'unassign',
      description: 'Remove current assignment',
      type: 'boolean',
      default: false
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const taskId = ctx.args[0];
    const agentIds = ctx.flags.agent as string;
    const unassign = ctx.flags.unassign as boolean;

    if (!taskId) {
      output.printError('Task ID is required');
      return { success: false, exitCode: 1 };
    }

    if (!agentIds && !unassign) {
      // Interactive agent selection
      if (ctx.interactive) {
        try {
          const agents = await callMCPTool<{
            agents: Array<{ id: string; type: string; status: string }>;
          }>('agent_list', { status: 'active,idle' });

          if (agents.agents.length === 0) {
            output.printWarning('No available agents');
            return { success: false, exitCode: 1 };
          }

          const selectedAgents = await multiSelect({
            message: 'Select agent(s) to assign:',
            options: agents.agents.map(a => ({
              value: a.id,
              label: a.id,
              hint: `${a.type} - ${a.status}`
            })),
            required: true
          });

          if (selectedAgents.length === 0) {
            output.printInfo('No agents selected');
            return { success: true };
          }

          // Continue with assignment
          const result = await callMCPTool<{
            taskId: string;
            assignedTo: string[];
            previouslyAssigned: string[];
          }>('task_assign', {
            taskId,
            agentIds: selectedAgents
          });

          output.writeln();
          output.printSuccess(`Task ${taskId} assigned to ${result.assignedTo.join(', ')}`);

          return { success: true, data: result };
        } catch (error) {
          if (error instanceof Error && error.message === 'User cancelled') {
            output.printInfo('Operation cancelled');
            return { success: true };
          }
          throw error;
        }
      }

      output.printError('Agent ID is required. Use --agent flag or run in interactive mode');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        taskId: string;
        assignedTo: string[];
        previouslyAssigned: string[];
      }>('task_assign', {
        taskId,
        agentIds: unassign ? [] : agentIds.split(',').map(id => id.trim()),
        unassign
      });

      output.writeln();
      if (unassign) {
        output.printSuccess(`Task ${taskId} unassigned`);
      } else {
        output.printSuccess(`Task ${taskId} assigned to ${result.assignedTo.join(', ')}`);
      }

      if (ctx.flags.format === 'json') {
        output.printJson(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to assign task: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

// Retry subcommand
const retryCommand: Command = {
  name: 'retry',
  aliases: ['rerun'],
  description: 'Retry a failed task',
  options: [
    {
      name: 'reset-state',
      description: 'Reset task state completely',
      type: 'boolean',
      default: false
    }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const taskId = ctx.args[0];
    const resetState = ctx.flags['reset-state'] as boolean;

    if (!taskId) {
      output.printError('Task ID is required');
      return { success: false, exitCode: 1 };
    }

    try {
      const result = await callMCPTool<{
        taskId: string;
        newTaskId: string;
        previousStatus: string;
        status: string;
      }>('task_retry', {
        taskId,
        resetState
      });

      output.writeln();
      output.printSuccess(`Task ${taskId} retried`);
      output.printInfo(`New task ID: ${result.newTaskId}`);
      output.printInfo(`Status: ${formatStatus(result.status)}`);

      if (ctx.flags.format === 'json') {
        output.printJson(result);
      }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) {
        output.printError(`Failed to retry task: ${error.message}`);
      } else {
        output.printError(`Unexpected error: ${String(error)}`);
      }
      return { success: false, exitCode: 1 };
    }
  }
};

// Sprint 3 Move 6' — drain the pending queue through the real LLM wire.
// Closes the audit's "no worker picks up tasks" finding: previously
// task_create stored a record nothing ever executed. `task dispatch` runs
// each pending task on its assigned agent via executeAgentTask and writes the
// result back.
const dispatchCommand: Command = {
  name: 'dispatch',
  aliases: ['work', 'drain'],
  description: 'Execute pending tasks on their assigned agents (real LLM call) and write results back',
  options: [
    { name: 'max', short: 'm', type: 'number', description: 'Max tasks to run this pass', default: 10 },
    { name: 'dry-run', type: 'boolean', description: 'Show what would run without executing', default: false },
    { name: 'no-auto-assign', type: 'boolean', description: 'Only run tasks with an explicit assignee (skip auto-assign to a spawned agent)', default: false },
    { name: 'format', type: 'string', description: 'Output format: text | json', default: 'text' },
  ],
  examples: [
    { command: 'swarmdo task dispatch', description: 'Run up to 10 pending tasks on their agents' },
    { command: 'swarmdo task dispatch --dry-run', description: 'List what would run' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const { dispatchPendingTasks } = await import('../mcp-tools/task-dispatcher.js');
    const max = Number(ctx.flags.max ?? 10);
    const dryRun = ctx.flags['dry-run'] === true;
    const autoAssign = ctx.flags['no-auto-assign'] !== true;
    const json = ctx.flags.format === 'json';

    const summary = await dispatchPendingTasks({ max, dryRun, autoAssign });

    if (json) {
      output.printJson(summary);
      return { success: true, data: summary };
    }

    output.writeln();
    output.writeln(output.bold(dryRun ? 'Task Dispatch (dry-run)' : 'Task Dispatch'));
    output.writeln(output.dim('─'.repeat(50)));
    output.printInfo(`${summary.pending} pending / ${summary.scanned} total · dispatched ${summary.dispatched}`);
    if (!dryRun) {
      output.printInfo(`${output.success(String(summary.completed))} completed · ${summary.failed} failed · ${summary.skipped} skipped`);
    }
    for (const o of summary.outcomes) {
      const tag = o.status === 'completed' ? output.success('✓') : o.status === 'failed' ? output.error('✗') : output.dim('•');
      output.writeln(`  ${tag} ${o.taskId}${o.agentId ? ` → ${o.agentId}` : ''}${o.reason ? ` (${o.reason})` : ''}${o.durationMs ? ` ${o.durationMs}ms` : ''}`);
    }
    if (summary.skipped > 0 && summary.completed === 0 && summary.failed === 0) {
      output.writeln();
      output.printWarning('Nothing executed. Spawn an agent first: swarmdo agent spawn -t coder');
    }
    output.writeln();
    return { success: true, data: summary };
  },
};

// Ready subcommand — the beads-style "what can run NOW" query (task-deps.ts)
const readyCommand: Command = {
  name: 'ready',
  description: 'List tasks ready to run now (pending, all dependencies completed) and what blocks the rest',
  options: [
    { name: 'json', description: 'Machine-readable output', type: 'boolean', default: false }
  ],
  examples: [
    { command: 'swarmdo task ready', description: 'Show ready vs blocked work' }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const { loadTaskStore } = await import('../mcp-tools/task-tools.js');
    const { readyTasks, blockedTasks } = await import('../mcp-tools/task-deps.js');
    const store = loadTaskStore(ctx.cwd);
    const ready = readyTasks(store);
    const blocked = blockedTasks(store);

    if (ctx.flags.json === true) {
      output.printJson({
        ready: ready.map(t => t.taskId),
        blocked: blocked.map(b => ({ taskId: b.task.taskId, waitingOn: b.waitingOn, missing: b.missing })),
      });
      return { success: true, data: { ready, blocked } };
    }

    output.writeln();
    output.writeln(output.bold(`Ready (${ready.length})`));
    if (ready.length === 0) {
      output.writeln(output.dim('  nothing ready — create tasks or complete blockers'));
    }
    for (const t of ready) {
      output.writeln(`  ${output.success('●')} ${t.taskId}  [${t.priority}] ${t.description.slice(0, 70)}`);
    }
    if (blocked.length > 0) {
      output.writeln();
      output.writeln(output.bold(`Blocked (${blocked.length})`));
      for (const b of blocked) {
        const missingNote = b.missing.length ? ` (missing: ${b.missing.join(', ')})` : '';
        output.writeln(`  ${output.dim('○')} ${b.task.taskId} ⇐ waiting on ${b.waitingOn.join(', ')}${missingNote}`);
      }
    }
    output.writeln();
    return { success: true, data: { ready, blocked } };
  }
};

// Graph subcommand — flat annotated dependency view
const graphCommand: Command = {
  name: 'graph',
  aliases: ['deps'],
  description: 'Show the task dependency graph (every task with its dependencies and their states)',
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const { loadTaskStore } = await import('../mcp-tools/task-tools.js');
    const { renderDepGraph } = await import('../mcp-tools/task-deps.js');
    const store = loadTaskStore(ctx.cwd);
    const lines = renderDepGraph(store);
    output.writeln();
    if (lines.length === 0) {
      output.printInfo('no tasks in the store');
    } else {
      for (const line of lines) output.writeln(`  ${line}`);
    }
    output.writeln();
    return { success: true };
  }
};

// parse-prd subcommand — decompose a PRD/spec doc into the task DAG (Task Master
// parity). The LLM decomposition lives in ../task/parse-prd.ts (injectable +
// unit-tested); this layer gates the billable call and creates the linked tasks.
const parsePrdCommand: Command = {
  name: 'parse-prd',
  aliases: ['parse', 'from-spec'],
  description: 'Decompose a PRD/spec markdown file into an ordered, dependency-linked task list (billable claude call; dry-run without --confirm)',
  options: [
    { name: 'file', short: 'f', description: 'path to the PRD/spec markdown (or pass as the first argument)', type: 'string' },
    { name: 'confirm', description: 'actually decompose (billable claude call) and create tasks; omit for a dry-run plan', type: 'boolean', default: false },
    { name: 'max-tasks', description: 'cap on the number of tasks (default 20)', type: 'number', default: 20 },
    { name: 'type', short: 't', description: 'task type for created tasks', type: 'string', choices: TASK_TYPES.map(t => t.value), default: 'implementation' },
    { name: 'model', description: 'model for the decomposition call (default sonnet)', type: 'string', default: 'sonnet' },
    { name: 'max-budget-usd', description: 'spend ceiling for the decomposition call (default 1)', type: 'number', default: 1 },
    { name: 'timeout-secs', description: 'decomposition call timeout (default 180)', type: 'number', default: 180 },
    { name: 'json', description: 'machine-readable output', type: 'boolean', default: false },
  ],
  examples: [
    { command: 'swarmdo task parse-prd spec.md', description: 'Dry-run: show the plan without spending' },
    { command: 'swarmdo task parse-prd spec.md --confirm', description: 'Decompose the spec and create linked tasks' },
    { command: 'swarmdo task parse-prd docs/prd.md --max-tasks 12 --confirm', description: 'Cap the decomposition at 12 tasks' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const file = (ctx.flags.file as string) || ctx.args[0];
    if (!file) {
      output.printError('a PRD/spec file is required — pass it as the first argument or via --file');
      return { success: false, exitCode: 1 };
    }
    let prd: string;
    try {
      prd = readFileSync(file, 'utf8');
    } catch {
      output.printError(`cannot read file: ${file}`);
      return { success: false, exitCode: 1 };
    }
    if (!prd.trim()) {
      output.printError(`file is empty: ${file}`);
      return { success: false, exitCode: 1 };
    }

    const maxTasks = (ctx.flags['max-tasks'] as number) || 20;
    const taskType = (ctx.flags.type as string) || 'implementation';
    const model = (ctx.flags.model as string) || 'sonnet';
    const maxBudgetUsd = (ctx.flags['max-budget-usd'] as number) ?? 1;
    const timeoutMs = ((ctx.flags['timeout-secs'] as number) || 180) * 1000;

    // Dry-run plan (no billable call) unless --confirm — same gate as `repair`.
    if (ctx.flags.confirm !== true) {
      output.writeln(output.bold('task parse-prd — plan (dry-run, nothing executed)'));
      output.printList([
        `Spec file: ${file} (${prd.length.toLocaleString()} chars)`,
        `Model: ${model} · budget ceiling: $${maxBudgetUsd.toFixed(2)} · timeout: ${timeoutMs / 1000}s`,
        `Will create up to ${maxTasks} '${taskType}' tasks, dependency-linked, into the task DAG`,
      ]);
      output.printInfo('re-run with --confirm to decompose (billable claude call) and create tasks');
      return { success: true, exitCode: 0 };
    }

    const headlessFlag = (process.env.SWARMDO_HEADLESS ?? '').toLowerCase();
    if (headlessFlag === '0' || headlessFlag === 'false' || headlessFlag === 'off') {
      output.printError('SWARMDO_HEADLESS forbids billable headless claude runs on this host');
      return { success: false, exitCode: 1 };
    }
    try {
      execSync('claude --version', { stdio: 'pipe', timeout: 10_000 });
    } catch {
      output.printError('claude CLI not found on PATH — parse-prd needs Claude Code installed');
      return { success: false, exitCode: 1 };
    }

    output.printInfo(`Decomposing ${file} with ${model}…`);
    const { decomposePrd } = await import('../task/parse-prd.js');
    const result = decomposePrd(prd, { model, maxBudgetUsd, timeoutMs, cwd: ctx.cwd || process.cwd(), maxTasks });

    if (result.tasks.length === 0) {
      output.printError(`no tasks produced${result.warnings.length ? ` — ${result.warnings.join('; ')}` : ''}`);
      return { success: false, exitCode: 1 };
    }

    // Create in topological order, mapping each local ref → its created task id
    // so dependencies resolve to real ids the DAG can gate on.
    const refToId = new Map<string, string>();
    const created: Array<{ ref: string; id: string; title: string; dependsOn: string[] }> = [];
    for (const t of result.tasks) {
      const deps = t.dependsOn.map(r => refToId.get(r)).filter((x): x is string => !!x);
      try {
        const res = await callMCPTool<{ taskId: string; success?: boolean; error?: string }>('task_create', {
          type: taskType,
          description: t.title,
          priority: t.priority,
          dependencies: deps,
          tags: ['parse-prd'],
          metadata: { source: 'parse-prd', specFile: file, detail: t.description, localRef: t.ref },
        });
        const rej = res as unknown as { success?: boolean; error?: string };
        if (rej.success === false || !res.taskId) {
          output.printError(`failed to create task '${t.title}': ${rej.error ?? 'unknown error'}`);
          continue;
        }
        refToId.set(t.ref, res.taskId);
        created.push({ ref: t.ref, id: res.taskId, title: t.title, dependsOn: deps });
      } catch (e) {
        output.printError(`failed to create task '${t.title}': ${e instanceof MCPClientError ? e.message : String(e)}`);
      }
    }

    if (ctx.flags.json === true) {
      output.printJson({ created, warnings: result.warnings, costUsd: result.costUsd, specFile: file });
      return { success: created.length > 0, exitCode: created.length > 0 ? 0 : 1, data: created };
    }

    output.writeln();
    output.printSuccess(`Created ${created.length} task(s) from ${file}`);
    output.printTable({
      columns: [
        { key: 'id', header: 'Task ID', width: 24 },
        { key: 'title', header: 'Title', width: 42 },
        { key: 'deps', header: 'Depends on', width: 20 },
      ],
      data: created.map(c => ({ id: c.id, title: c.title, deps: c.dependsOn.length ? `${c.dependsOn.length} task(s)` : '—' })),
    });
    if (result.costUsd != null) output.printInfo(`Decomposition cost: $${result.costUsd.toFixed(4)}`);
    if (result.warnings.length) {
      output.writeln(output.dim('Notes:'));
      for (const w of result.warnings) output.writeln(output.dim(`  • ${w}`));
    }
    output.printInfo("Next: 'swarmdo task ready' (what can start now) or 'swarmdo task graph' (the DAG).");
    return { success: true, data: created };
  },
};

// Main task command
export const taskCommand: Command = {
  name: 'task',
  description: 'Task management commands',
  subcommands: [createCommand, parsePrdCommand, listCommand, statusCommand, cancelCommand, assignCommand, retryCommand, dispatchCommand, readyCommand, graphCommand],
  options: [],
  examples: [
    { command: 'swarmdo task create -t implementation -d "Add user auth"', description: 'Create a task' },
    { command: 'swarmdo task list', description: 'List pending/running tasks' },
    { command: 'swarmdo task list --all', description: 'List all tasks' },
    { command: 'swarmdo task status task-123', description: 'Get task details' },
    { command: 'swarmdo task cancel task-123', description: 'Cancel a task' },
    { command: 'swarmdo task assign task-123 --agent coder-1', description: 'Assign task to agent' },
    { command: 'swarmdo task retry task-123', description: 'Retry a failed task' }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    // Show help if no subcommand
    output.writeln();
    output.writeln(output.bold('Task Management Commands'));
    output.writeln();
    output.writeln('Usage: swarmdo task <subcommand> [options]');
    output.writeln();
    output.writeln('Subcommands:');
    output.printList([
      `${output.highlight('create')}  - Create a new task`,
      `${output.highlight('list')}    - List tasks`,
      `${output.highlight('status')}  - Get task details`,
      `${output.highlight('cancel')}  - Cancel a running task`,
      `${output.highlight('assign')}  - Assign task to agent(s)`,
      `${output.highlight('retry')}   - Retry a failed task`,
      `${output.highlight('ready')}   - List ready vs dependency-blocked tasks`,
      `${output.highlight('graph')}   - Show the dependency graph`
    ]);
    output.writeln();
    output.writeln('Run "swarmdo task <subcommand> --help" for subcommand help');

    return { success: true };
  }
};

export default taskCommand;
