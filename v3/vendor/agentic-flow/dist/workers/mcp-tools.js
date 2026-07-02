/**
 * MCP Tools for Background Workers
 * Exposes worker functionality via MCP protocol
 */
import { getWorkerDispatchService } from './dispatch-service.js';
import { getTriggerDetector } from './trigger-detector.js';
import { getWorkerRegistry } from './worker-registry.js';
import { getResourceGovernor } from './resource-governor.js';
/**
 * Worker dispatch tool
 */
export const workerDispatchTool = {
    name: 'worker_dispatch',
    description: 'Dispatch a background worker to run silently while conversation continues',
    inputSchema: {
        type: 'object',
        properties: {
            trigger: {
                type: 'string',
                description: 'Worker trigger type',
                enum: ['ultralearn', 'optimize', 'consolidate', 'predict', 'audit', 'map', 'preload', 'deepdive', 'document', 'refactor', 'benchmark', 'testgaps']
            },
            topic: {
                type: 'string',
                description: 'Optional topic or focus area for the worker'
            },
            sessionId: {
                type: 'string',
                description: 'Session identifier'
            }
        },
        required: ['trigger', 'sessionId']
    },
    async execute(params) {
        const { trigger, topic, sessionId } = params;
        const dispatcher = getWorkerDispatchService();
        const workerId = await dispatcher.dispatch(trigger, topic || null, sessionId);
        return {
            success: true,
            workerId,
            trigger,
            topic,
            message: `Background worker spawned: ${trigger}${topic ? ` for "${topic}"` : ''}`
        };
    }
};
/**
 * Worker status tool
 */
export const workerStatusTool = {
    name: 'worker_status',
    description: 'Get status of background workers',
    inputSchema: {
        type: 'object',
        properties: {
            workerId: {
                type: 'string',
                description: 'Specific worker ID to check (optional)'
            },
            sessionId: {
                type: 'string',
                description: 'Filter by session ID (optional)'
            },
            activeOnly: {
                type: 'boolean',
                description: 'Only show active workers'
            }
        }
    },
    async execute(params) {
        const { workerId, sessionId, activeOnly } = params;
        const registry = getWorkerRegistry();
        const governor = getResourceGovernor();
        if (workerId) {
            const worker = registry.get(workerId);
            if (!worker) {
                return { success: false, error: 'Worker not found' };
            }
            return { success: true, worker };
        }
        const workers = activeOnly
            ? registry.getActive(sessionId)
            : registry.getAll({ sessionId, limit: 20 });
        const stats = governor.getStats();
        const availability = governor.getAvailability();
        return {
            success: true,
            workers,
            stats: {
                activeWorkers: stats.activeWorkers,
                availableSlots: availability.availableSlots,
                totalSlots: availability.totalSlots
            }
        };
    }
};
/**
 * Worker cancel tool
 */
export const workerCancelTool = {
    name: 'worker_cancel',
    description: 'Cancel a running background worker',
    inputSchema: {
        type: 'object',
        properties: {
            workerId: {
                type: 'string',
                description: 'Worker ID to cancel'
            }
        },
        required: ['workerId']
    },
    async execute(params) {
        const { workerId } = params;
        const dispatcher = getWorkerDispatchService();
        const cancelled = dispatcher.cancel(workerId);
        return {
            success: cancelled,
            workerId,
            message: cancelled ? 'Worker cancelled' : 'Could not cancel worker'
        };
    }
};
/**
 * Worker triggers list tool
 */
export const workerTriggersTool = {
    name: 'worker_triggers',
    description: 'List available background worker triggers and their status',
    inputSchema: {
        type: 'object',
        properties: {}
    },
    async execute() {
        const detector = getTriggerDetector();
        const configs = detector.getAllConfigs();
        const stats = detector.getStats();
        const triggers = Array.from(configs.entries()).map(([keyword, config]) => ({
            keyword,
            description: config.description,
            priority: config.priority,
            maxAgents: config.maxAgents,
            timeout: config.timeout,
            cooldownRemaining: stats.cooldowns[keyword] || 0
        }));
        return {
            success: true,
            triggers,
            cooldowns: stats.cooldowns
        };
    }
};
/**
 * Worker results tool
 */
export const workerResultsTool = {
    name: 'worker_results',
    description: 'Get results from a completed background worker',
    inputSchema: {
        type: 'object',
        properties: {
            workerId: {
                type: 'string',
                description: 'Worker ID to get results from'
            }
        },
        required: ['workerId']
    },
    async execute(params) {
        const { workerId } = params;
        const registry = getWorkerRegistry();
        const worker = registry.get(workerId);
        if (!worker) {
            return { success: false, error: 'Worker not found' };
        }
        if (worker.status !== 'complete') {
            return {
                success: false,
                status: worker.status,
                progress: worker.progress,
                error: 'Worker has not completed yet'
            };
        }
        const metrics = registry.getMetrics(workerId);
        return {
            success: true,
            worker: {
                id: worker.id,
                trigger: worker.trigger,
                topic: worker.topic,
                status: worker.status,
                duration: (worker.completedAt - worker.startedAt) / 1000,
                memoryDeposits: worker.memoryDeposits,
                resultKeys: worker.resultKeys
            },
            metrics
        };
    }
};
/**
 * Worker detect triggers tool
 */
export const workerDetectTool = {
    name: 'worker_detect',
    description: 'Detect background worker triggers in a prompt without dispatching',
    inputSchema: {
        type: 'object',
        properties: {
            prompt: {
                type: 'string',
                description: 'Prompt to analyze for triggers'
            }
        },
        required: ['prompt']
    },
    async execute(params) {
        const { prompt } = params;
        const detector = getTriggerDetector();
        const triggers = detector.detect(prompt);
        return {
            success: true,
            hasTriggers: triggers.length > 0,
            triggers: triggers.map(t => ({
                keyword: t.keyword,
                topic: t.topic,
                priority: t.config.priority
            }))
        };
    }
};
/**
 * Worker stats tool
 */
export const workerStatsTool = {
    name: 'worker_stats',
    description: 'Get aggregated statistics about background workers',
    inputSchema: {
        type: 'object',
        properties: {
            timeframe: {
                type: 'string',
                description: 'Timeframe for stats',
                enum: ['1h', '24h', '7d']
            }
        }
    },
    async execute(params) {
        const { timeframe = '24h' } = params;
        const registry = getWorkerRegistry();
        const governor = getResourceGovernor();
        const registryStats = registry.getStats(timeframe);
        const resourceStats = governor.getStats();
        const availability = governor.getAvailability();
        return {
            success: true,
            timeframe,
            stats: {
                total: registryStats.total,
                byStatus: registryStats.byStatus,
                byTrigger: registryStats.byTrigger,
                avgDuration: registryStats.avgDuration,
                activeWorkers: resourceStats.activeWorkers,
                memoryUsageMB: resourceStats.memoryUsage.heapUsed / (1024 * 1024),
                availability: {
                    used: availability.usedSlots,
                    available: availability.availableSlots,
                    total: availability.totalSlots
                }
            }
        };
    }
};
/**
 * Worker context inject tool
 */
export const workerContextTool = {
    name: 'worker_context',
    description: 'Get relevant background worker results for context injection',
    inputSchema: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'Query to find relevant worker results'
            },
            sessionId: {
                type: 'string',
                description: 'Session ID to filter results'
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results'
            }
        },
        required: ['query']
    },
    async execute(params) {
        const { query, sessionId, limit = 5 } = params;
        const registry = getWorkerRegistry();
        const completed = registry.getAll({
            sessionId,
            status: 'complete',
            limit: 50
        });
        // Simple keyword matching
        const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const scored = [];
        for (const worker of completed) {
            const workerText = `${worker.trigger} ${worker.topic || ''}`.toLowerCase();
            let score = 0;
            for (const keyword of keywords) {
                if (workerText.includes(keyword)) {
                    score += 1;
                }
            }
            if (score > 0) {
                scored.push({ worker, score });
            }
        }
        scored.sort((a, b) => b.score - a.score);
        const relevant = scored.slice(0, limit);
        return {
            success: true,
            results: relevant.map(({ worker, score }) => ({
                workerId: worker.id,
                trigger: worker.trigger,
                topic: worker.topic,
                relevance: score / Math.max(keywords.length, 1),
                memoryKeys: worker.resultKeys,
                completedAt: worker.completedAt
            }))
        };
    }
};
/**
 * Get all MCP tools
 */
export function getWorkerMCPTools() {
    return [
        workerDispatchTool,
        workerStatusTool,
        workerCancelTool,
        workerTriggersTool,
        workerResultsTool,
        workerDetectTool,
        workerStatsTool,
        workerContextTool
    ];
}
/**
 * Register tools with MCP server
 */
export function registerWorkerTools(server) {
    const tools = getWorkerMCPTools();
    for (const tool of tools) {
        server.tool(tool.name, tool.description, tool.inputSchema, tool.execute);
    }
}
//# sourceMappingURL=mcp-tools.js.map