/**
 * Hooks Integration for Background Workers
 * Integrates with Claude Code's hook system and SDK
 */
import { WorkerDispatchService } from './dispatch-service.js';
import { ContextInjection } from './types.js';
export type HookEvent = 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure' | 'UserPromptSubmit' | 'SessionStart' | 'SessionEnd' | 'Notification';
export interface HookInput {
    hook_event_name: string;
    session_id: string;
    transcript_path?: string;
    cwd?: string;
    [key: string]: unknown;
}
export interface UserPromptSubmitInput extends HookInput {
    hook_event_name: 'UserPromptSubmit';
    prompt: string;
}
export interface HookOutput {
    continue?: boolean;
    suppressOutput?: boolean;
    decision?: 'approve' | 'block';
    systemMessage?: string;
    reason?: string;
    hookSpecificOutput?: {
        hookEventName: string;
        additionalContext?: string;
        [key: string]: unknown;
    };
}
export type HookCallback = (input: HookInput, toolUseId: string | undefined, options: {
    signal: AbortSignal;
}) => Promise<HookOutput>;
/**
 * UserPromptSubmit hook for background worker dispatch
 * Detects triggers and spawns workers in background
 */
export declare const userPromptSubmitWorkerHook: HookCallback;
/**
 * Context injection hook
 * Searches completed worker results and injects relevant context
 */
export declare const contextInjectionHook: HookCallback;
/**
 * Session start hook - restore worker context
 */
export declare const sessionStartWorkerHook: HookCallback;
/**
 * Session end hook - cleanup and persist
 */
export declare const sessionEndWorkerHook: HookCallback;
/**
 * Get relevant worker context for a prompt
 */
export declare function getRelevantWorkerContext(prompt: string, sessionId?: string): Promise<ContextInjection | null>;
/**
 * Get all worker hooks for SDK integration
 */
export declare function getWorkerHooks(): Partial<Record<HookEvent, Array<{
    hooks: HookCallback[];
}>>>;
/**
 * Generate hooks configuration for .claude/settings.json
 */
export declare function generateHooksConfig(): object;
/**
 * Worker event emitter for external integration
 */
export declare class WorkerEventBridge {
    private dispatcher;
    constructor();
    private setupEventForwarding;
    private emit;
    /**
     * Get dispatcher for direct access
     */
    getDispatcher(): WorkerDispatchService;
}
//# sourceMappingURL=hooks-integration.d.ts.map