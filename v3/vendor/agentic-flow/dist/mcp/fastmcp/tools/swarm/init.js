// Swarm init tool implementation using FastMCP
import { z } from 'zod';
import { spawnSync } from 'child_process';
// Security: Allowed values for validation (defense in depth beyond Zod)
const VALID_TOPOLOGIES = new Set(['mesh', 'hierarchical', 'ring', 'star']);
const VALID_STRATEGIES = new Set(['balanced', 'specialized', 'adaptive']);
const MAX_AGENTS_LIMIT = 100;
export const swarmInitTool = {
    name: 'swarm_init',
    description: 'Initialize a multi-agent swarm with specified topology',
    parameters: z.object({
        topology: z.enum(['mesh', 'hierarchical', 'ring', 'star'])
            .describe('Swarm topology'),
        maxAgents: z.number()
            .positive()
            .optional()
            .default(8)
            .describe('Maximum number of agents'),
        strategy: z.enum(['balanced', 'specialized', 'adaptive'])
            .optional()
            .default('balanced')
            .describe('Agent distribution strategy')
    }),
    execute: async ({ topology, maxAgents, strategy }, { onProgress, auth }) => {
        try {
            // Security: Defense in depth - validate even though Zod should have validated
            if (!VALID_TOPOLOGIES.has(topology)) {
                throw new Error(`Invalid topology: ${topology}`);
            }
            if (!VALID_STRATEGIES.has(strategy)) {
                throw new Error(`Invalid strategy: ${strategy}`);
            }
            // Security: Sanitize and bound maxAgents
            const safeMaxAgents = Math.min(Math.max(1, Math.floor(Number(maxAgents) || 8)), MAX_AGENTS_LIMIT);
            // Security: Use spawnSync with argument array to prevent command injection
            const args = [
                'claude-flow@alpha',
                'swarm',
                'init',
                '--topology', topology,
                '--max-agents', String(safeMaxAgents),
                '--strategy', strategy
            ];
            const result = spawnSync('npx', args, {
                encoding: 'utf-8',
                maxBuffer: 10 * 1024 * 1024,
                timeout: 60000
            });
            if (result.error) {
                throw result.error;
            }
            if (result.status !== 0) {
                throw new Error(result.stderr || 'Command failed');
            }
            return {
                success: true,
                topology,
                maxAgents: safeMaxAgents,
                strategy,
                result: (result.stdout || '').trim(),
                userId: auth?.userId,
                timestamp: new Date().toISOString()
            };
        }
        catch (error) {
            // Security: Don't expose internal error details to clients
            throw new Error('Failed to initialize swarm. Check server logs for details.');
        }
    }
};
//# sourceMappingURL=init.js.map