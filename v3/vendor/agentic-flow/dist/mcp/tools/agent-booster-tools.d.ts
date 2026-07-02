/**
 * Agent Booster MCP Tools
 *
 * Ultra-fast code editing (352x faster than cloud APIs, $0 cost)
 * Uses Agent Booster's local WASM engine for sub-millisecond transformations
 */
import type { MCPTool } from './sona-tools.js';
type MorphApplyResponse = {
    output: string;
    success: boolean;
    latency: number;
    tokens?: {
        input: number;
        output: number;
    };
    confidence: number;
    strategy: string;
    error?: string;
    metadata?: any;
};
/**
 * Agent Booster MCP Tools
 */
export declare const agentBoosterMCPTools: MCPTool[];
/**
 * Agent Booster MCP Tool Handlers
 */
export declare const agentBoosterMCPHandlers: {
    /**
     * Edit a single file with Agent Booster
     */
    agent_booster_edit_file: (params: {
        target_filepath: string;
        instructions: string;
        code_edit: string;
        language?: string;
    }) => Promise<MorphApplyResponse>;
    /**
     * Apply multiple edits in batch
     */
    agent_booster_batch_edit: (params: {
        edits: Array<{
            target_filepath: string;
            instructions: string;
            code_edit: string;
            language?: string;
        }>;
    }) => Promise<{
        results: MorphApplyResponse[];
        summary: any;
    }>;
    /**
     * Parse markdown and apply edits
     */
    agent_booster_parse_markdown: (params: {
        markdown: string;
    }) => Promise<{
        results: MorphApplyResponse[];
        summary: any;
    }>;
};
/**
 * Get Agent Booster statistics
 */
export declare function getAgentBoosterStats(): {
    engine: string;
    version: string;
    performance: {
        avgLatency: string;
        speedup: string;
        costSavings: string;
    };
    features: {
        local: boolean;
        offline: boolean;
        privacy: string;
        languages: string[];
    };
};
export {};
//# sourceMappingURL=agent-booster-tools.d.ts.map