/**
 * TriggerDetector - Detects background worker triggers in prompts
 * Target: < 5ms detection latency
 */
import { WorkerTrigger, TriggerConfig, DetectedTrigger, WorkerPriority } from './types.js';
declare const TRIGGER_CONFIGS: Map<WorkerTrigger, TriggerConfig>;
export declare class TriggerDetector {
    private cooldowns;
    /**
     * Detect all triggers in a prompt
     * Target: < 5ms latency
     */
    detect(prompt: string): DetectedTrigger[];
    /**
     * Check if a trigger is on cooldown
     */
    isOnCooldown(trigger: WorkerTrigger): boolean;
    /**
     * Set cooldown for a trigger
     */
    private setCooldown;
    /**
     * Clear cooldown for a trigger (for testing)
     */
    clearCooldown(trigger: WorkerTrigger): void;
    /**
     * Clear all cooldowns
     */
    clearAllCooldowns(): void;
    /**
     * Get remaining cooldown time for a trigger
     */
    getCooldownRemaining(trigger: WorkerTrigger): number;
    /**
     * Get config for a specific trigger
     */
    getConfig(trigger: WorkerTrigger): TriggerConfig | undefined;
    /**
     * Get all trigger configs
     */
    getAllConfigs(): Map<WorkerTrigger, TriggerConfig>;
    /**
     * Register a custom trigger dynamically
     */
    registerTrigger(config: {
        keyword: string;
        priority?: WorkerPriority;
        description?: string;
        timeout?: number;
        cooldown?: number;
        topicExtractor?: RegExp;
    }): void;
    /**
     * Check if a string contains any trigger keywords
     * Faster than full detect() when you just need boolean check
     */
    hasTriggers(prompt: string): boolean;
    /**
     * Get trigger stats
     */
    getStats(): {
        triggers: WorkerTrigger[];
        cooldowns: Record<string, number>;
    };
}
export declare function getTriggerDetector(): TriggerDetector;
export { TRIGGER_CONFIGS };
//# sourceMappingURL=trigger-detector.d.ts.map