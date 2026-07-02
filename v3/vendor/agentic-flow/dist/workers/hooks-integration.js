/**
 * Hooks Integration for Background Workers
 * Integrates with Claude Code's hook system and SDK
 */
import { getWorkerDispatchService } from './dispatch-service.js';
import { getTriggerDetector } from './trigger-detector.js';
import { getWorkerRegistry } from './worker-registry.js';
import { getResourceGovernor } from './resource-governor.js';
/**
 * UserPromptSubmit hook for background worker dispatch
 * Detects triggers and spawns workers in background
 */
export const userPromptSubmitWorkerHook = async (input, _toolUseId, { signal }) => {
    if (input.hook_event_name !== 'UserPromptSubmit')
        return {};
    const { prompt, session_id } = input;
    if (!prompt)
        return {};
    try {
        const detector = getTriggerDetector();
        // Fast check if any triggers present
        if (!detector.hasTriggers(prompt)) {
            return {};
        }
        const dispatcher = getWorkerDispatchService();
        const { triggers, workerIds } = await dispatcher.dispatchFromPrompt(prompt, session_id);
        if (triggers.length === 0) {
            return {};
        }
        // Format message for user feedback
        const workerList = triggers.map((t, i) => `${t.keyword}${t.topic ? `: "${t.topic}"` : ''}`).join(', ');
        return {
            hookSpecificOutput: {
                hookEventName: 'UserPromptSubmit',
                additionalContext: `\u26A1 Background workers spawned: ${workerList}`,
                workersSpawned: workerIds,
                triggers: triggers.map(t => t.keyword)
            }
        };
    }
    catch (error) {
        // Silent failure - don't block conversation
        console.warn('Worker dispatch hook error:', error);
        return {};
    }
};
/**
 * Context injection hook
 * Searches completed worker results and injects relevant context
 */
export const contextInjectionHook = async (input, _toolUseId, { signal }) => {
    if (input.hook_event_name !== 'UserPromptSubmit')
        return {};
    const { prompt, session_id } = input;
    if (!prompt)
        return {};
    try {
        const context = await getRelevantWorkerContext(prompt, session_id);
        if (!context || context.context.length === 0) {
            return {};
        }
        return {
            hookSpecificOutput: {
                hookEventName: 'UserPromptSubmit',
                additionalContext: formatContextForInjection(context),
                backgroundContext: context
            }
        };
    }
    catch (error) {
        // Silent failure
        return {};
    }
};
/**
 * Session start hook - restore worker context
 */
export const sessionStartWorkerHook = async (input, _toolUseId, { signal }) => {
    if (input.hook_event_name !== 'SessionStart')
        return {};
    const { session_id } = input;
    try {
        const registry = getWorkerRegistry();
        const activeWorkers = registry.getActive(session_id);
        const completedWorkers = registry.getAll({
            sessionId: session_id,
            status: 'complete',
            limit: 10
        });
        if (activeWorkers.length === 0 && completedWorkers.length === 0) {
            return {};
        }
        const message = [
            activeWorkers.length > 0 ? `${activeWorkers.length} active workers` : '',
            completedWorkers.length > 0 ? `${completedWorkers.length} completed` : ''
        ].filter(Boolean).join(', ');
        return {
            hookSpecificOutput: {
                hookEventName: 'SessionStart',
                additionalContext: `Background workers: ${message}`,
                activeWorkers: activeWorkers.map(w => w.id),
                completedWorkers: completedWorkers.map(w => w.id)
            }
        };
    }
    catch (error) {
        return {};
    }
};
/**
 * Session end hook - cleanup and persist
 */
export const sessionEndWorkerHook = async (input, _toolUseId, { signal }) => {
    if (input.hook_event_name !== 'SessionEnd')
        return {};
    const { session_id } = input;
    try {
        const governor = getResourceGovernor();
        const registry = getWorkerRegistry();
        // Cancel any running workers for this session
        const activeWorkers = governor.getActiveWorkers()
            .filter(w => w.sessionId === session_id);
        for (const worker of activeWorkers) {
            governor.forceCleanup(worker.id);
        }
        // Cleanup old records
        registry.cleanup(24 * 60 * 60 * 1000); // 24 hours
        return {};
    }
    catch (error) {
        return {};
    }
};
/**
 * Get relevant worker context for a prompt
 */
export async function getRelevantWorkerContext(prompt, sessionId) {
    const registry = getWorkerRegistry();
    // Get completed workers
    const completed = registry.getAll({
        sessionId,
        status: 'complete',
        limit: 50
    });
    if (completed.length === 0) {
        return null;
    }
    // Simple keyword matching for relevance
    const keywords = prompt.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3);
    const scored = [];
    for (const worker of completed) {
        const workerText = `${worker.trigger} ${worker.topic || ''}`.toLowerCase();
        let score = 0;
        for (const keyword of keywords) {
            if (workerText.includes(keyword)) {
                score += 1;
            }
        }
        // Boost recent workers
        const age = Date.now() - (worker.completedAt || worker.createdAt);
        const ageHours = age / (60 * 60 * 1000);
        if (ageHours < 1)
            score += 0.5;
        else if (ageHours < 24)
            score += 0.2;
        if (score > 0) {
            scored.push({ worker, score });
        }
    }
    if (scored.length === 0) {
        return null;
    }
    // Sort by score and take top 3
    scored.sort((a, b) => b.score - a.score);
    const relevant = scored.slice(0, 3);
    return {
        context: relevant.map(({ worker, score }) => ({
            source: 'background-worker',
            type: worker.trigger,
            content: worker.topic || worker.trigger,
            score: Math.min(1, score / keywords.length)
        })),
        source: 'background-worker',
        confidence: relevant[0].score / keywords.length
    };
}
/**
 * Format context for injection into prompt
 */
function formatContextForInjection(context) {
    const lines = context.context.map(c => `- ${c.type}${c.content !== c.type ? `: ${c.content}` : ''} (${Math.round(c.score * 100)}% relevant)`);
    return `Background analysis available:\n${lines.join('\n')}`;
}
/**
 * Get all worker hooks for SDK integration
 */
export function getWorkerHooks() {
    return {
        UserPromptSubmit: [
            { hooks: [userPromptSubmitWorkerHook, contextInjectionHook] }
        ],
        SessionStart: [
            { hooks: [sessionStartWorkerHook] }
        ],
        SessionEnd: [
            { hooks: [sessionEndWorkerHook] }
        ]
    };
}
/**
 * Generate hooks configuration for .claude/settings.json
 */
export function generateHooksConfig() {
    return {
        hooks: {
            UserPromptSubmit: [
                {
                    hooks: [
                        {
                            type: 'command',
                            command: 'npx agentic-flow workers dispatch "$USER_PROMPT" --session "$SESSION_ID" --json 2>/dev/null || true',
                            timeout: 5000,
                            background: true
                        }
                    ]
                }
            ],
            SessionEnd: [
                {
                    hooks: [
                        {
                            type: 'command',
                            command: 'npx agentic-flow workers cleanup --age 24',
                            timeout: 3000
                        }
                    ]
                }
            ]
        }
    };
}
/**
 * Worker event emitter for external integration
 */
export class WorkerEventBridge {
    dispatcher;
    constructor() {
        this.dispatcher = getWorkerDispatchService();
        this.setupEventForwarding();
    }
    setupEventForwarding() {
        this.dispatcher.on('worker:spawned', (data) => {
            this.emit('spawned', data);
        });
        this.dispatcher.on('worker:progress', (data) => {
            this.emit('progress', data);
        });
        this.dispatcher.on('worker:complete', (data) => {
            this.emit('complete', data);
        });
        this.dispatcher.on('worker:error', (data) => {
            this.emit('error', data);
        });
        this.dispatcher.on('worker:deposit', (data) => {
            this.emit('deposit', data);
        });
    }
    emit(event, data) {
        // Emit to console for hook consumption
        console.log(JSON.stringify({
            type: 'worker-event',
            event,
            data,
            timestamp: Date.now()
        }));
    }
    /**
     * Get dispatcher for direct access
     */
    getDispatcher() {
        return this.dispatcher;
    }
}
//# sourceMappingURL=hooks-integration.js.map