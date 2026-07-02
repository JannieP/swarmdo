#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-explicit-any -- pre-existing catch(error: any) handlers; outside scope of CWE-78 fix */
// POC: FastMCP server with stdio transport and 2 basic tools
import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { execFileSync } from 'child_process';
// Security: All shell-outs use execFileSync with argv arrays (shell: false) to
// prevent OS command injection via tool parameters (CWE-78).
const NPX_EXEC_OPTS = { shell: false };
console.error('🚀 Starting FastMCP POC Server (stdio transport)...');
// Create server
const server = new FastMCP({
    name: 'fastmcp-poc',
    version: '0.1.0'
});
// Tool 1: Memory Store
server.addTool({
    name: 'memory_store',
    description: 'Store a value in persistent memory',
    parameters: z.object({
        key: z.string().min(1).describe('Memory key'),
        value: z.string().describe('Value to store'),
        namespace: z.string().optional().default('default').describe('Memory namespace'),
        ttl: z.number().positive().optional().describe('Time-to-live in seconds')
    }),
    execute: async ({ key, value, namespace, ttl }) => {
        try {
            const args = ['claude-flow@alpha', 'memory', 'store', key, value, '--namespace', namespace];
            if (ttl)
                args.push('--ttl', String(ttl));
            execFileSync('npx', args, { ...NPX_EXEC_OPTS, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
            // Return as text content (fastmcp requirement)
            return JSON.stringify({
                success: true,
                key,
                namespace,
                size: value.length,
                ttl,
                timestamp: new Date().toISOString(),
                message: 'Memory stored successfully'
            }, null, 2);
        }
        catch (error) {
            throw new Error(`Failed to store memory: ${error.message}`);
        }
    }
});
// Tool 2: Memory Retrieve
server.addTool({
    name: 'memory_retrieve',
    description: 'Retrieve a value from persistent memory',
    parameters: z.object({
        key: z.string().min(1).describe('Memory key'),
        namespace: z.string().optional().default('default').describe('Memory namespace')
    }),
    execute: async ({ key, namespace }) => {
        try {
            const result = execFileSync('npx', ['claude-flow@alpha', 'memory', 'retrieve', key, '--namespace', namespace], { ...NPX_EXEC_OPTS, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
            // Return as text content (fastmcp requirement)
            return JSON.stringify({
                success: true,
                key,
                namespace,
                value: result.trim(),
                timestamp: new Date().toISOString()
            }, null, 2);
        }
        catch (error) {
            throw new Error(`Failed to retrieve memory: ${error.message}`);
        }
    }
});
console.error('📦 Registered 2 tools: memory_store, memory_retrieve');
console.error('🔌 Starting stdio transport...');
// Start with stdio transport
server.start({ transportType: 'stdio' }).then(() => {
    console.error('✅ FastMCP POC server running on stdio');
}).catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});
//# sourceMappingURL=poc-stdio.js.map