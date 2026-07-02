// Agent spawn tool implementation using FastMCP
import { z } from 'zod';
import { spawnSync } from 'child_process';
// Security: Validate input to prevent command injection
function sanitizeInput(input) {
    // Remove any shell metacharacters
    return input.replace(/[;&|`$(){}[\]<>\\'"!#*?~\n\r]/g, '');
}
function validateCapability(cap) {
    // Only allow alphanumeric, hyphens, and underscores
    return /^[a-zA-Z0-9_-]+$/.test(cap);
}
function validateName(name) {
    // Only allow alphanumeric, hyphens, underscores, and dots (max 64 chars)
    return /^[a-zA-Z0-9_.-]{1,64}$/.test(name);
}
export const agentSpawnTool = {
    name: 'agent_spawn',
    description: 'Spawn a new agent in the swarm',
    parameters: z.object({
        type: z.enum(['researcher', 'coder', 'analyst', 'optimizer', 'coordinator'])
            .describe('Agent type'),
        capabilities: z.array(z.string())
            .optional()
            .describe('Agent capabilities'),
        name: z.string()
            .optional()
            .describe('Custom agent name')
    }),
    execute: async ({ type, capabilities, name }, { onProgress, auth }) => {
        try {
            // Security: Build command using argument array to prevent injection
            const args = ['claude-flow@alpha', 'agent', 'spawn', '--type', type];
            // Validate and add capabilities
            if (capabilities && capabilities.length > 0) {
                const validCaps = capabilities.filter(validateCapability);
                if (validCaps.length !== capabilities.length) {
                    throw new Error('Invalid capability format. Only alphanumeric, hyphens, and underscores allowed.');
                }
                args.push('--capabilities', validCaps.join(','));
            }
            // Validate and add name
            if (name) {
                if (!validateName(name)) {
                    throw new Error('Invalid agent name. Only alphanumeric, hyphens, underscores, and dots allowed (max 64 chars).');
                }
                args.push('--name', name);
            }
            // Security: Use spawnSync with argument array instead of string interpolation
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
                type,
                capabilities,
                name,
                result: (result.stdout || '').trim(),
                userId: auth?.userId,
                timestamp: new Date().toISOString()
            };
        }
        catch (error) {
            // Security: Don't expose internal error details
            const safeMessage = error.message?.includes('Invalid')
                ? error.message
                : 'Failed to spawn agent. Check server logs for details.';
            throw new Error(safeMessage);
        }
    }
};
//# sourceMappingURL=spawn.js.map