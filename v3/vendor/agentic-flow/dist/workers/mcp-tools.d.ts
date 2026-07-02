/**
 * MCP Tools for Background Workers
 * Exposes worker functionality via MCP protocol
 */
interface MCPTool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
    execute: (params: Record<string, unknown>, context?: any) => Promise<unknown>;
}
/**
 * Worker dispatch tool
 */
export declare const workerDispatchTool: MCPTool;
/**
 * Worker status tool
 */
export declare const workerStatusTool: MCPTool;
/**
 * Worker cancel tool
 */
export declare const workerCancelTool: MCPTool;
/**
 * Worker triggers list tool
 */
export declare const workerTriggersTool: MCPTool;
/**
 * Worker results tool
 */
export declare const workerResultsTool: MCPTool;
/**
 * Worker detect triggers tool
 */
export declare const workerDetectTool: MCPTool;
/**
 * Worker stats tool
 */
export declare const workerStatsTool: MCPTool;
/**
 * Worker context inject tool
 */
export declare const workerContextTool: MCPTool;
/**
 * Get all MCP tools
 */
export declare function getWorkerMCPTools(): MCPTool[];
/**
 * Register tools with MCP server
 */
export declare function registerWorkerTools(server: any): void;
export {};
//# sourceMappingURL=mcp-tools.d.ts.map