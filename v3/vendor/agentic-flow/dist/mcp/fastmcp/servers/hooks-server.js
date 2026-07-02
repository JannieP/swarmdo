#!/usr/bin/env node
/**
 * FastMCP Hook Server - Intelligent agent routing and self-learning
 *
 * 19 tools total:
 * - 10 hook tools (pre/post edit, command, routing, etc.)
 * - 9 intelligence tools (SONA, attention, trajectory, patterns)
 *
 * RuVector Intelligence Features:
 * - @rufvector/sona: Micro-LoRA (~0.05ms), EWC++, Trajectory tracking
 * - @rufvector/attention: MoE, Flash, Hyperbolic, Graph attention
 * - ruvector core: HNSW indexing (150x faster)
 */
import { FastMCP } from 'fastmcp';
import { allHookTools, hookTools, intelligenceTools } from '../tools/hooks/index.js';
console.error('🧠 Starting FastMCP Hook Server with RuVector Intelligence...');
console.error(`📦 Loading ${allHookTools.length} tools (${hookTools.length} hooks + ${intelligenceTools.length} intelligence)`);
// Create server
const server = new FastMCP({
    name: 'agentic-flow-hooks',
    version: '2.0.0'
});
// Register all hook tools (includes intelligence tools)
for (const tool of allHookTools) {
    server.addTool({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        execute: async (args) => {
            const result = await tool.execute(args, {
                onProgress: (update) => {
                    console.error(`[${tool.name}] ${update.message} (${Math.round(update.progress * 100)}%)`);
                }
            });
            return JSON.stringify(result, null, 2);
        }
    });
    // Mark intelligence tools differently
    const isIntelligence = tool.name.startsWith('intelligence_');
    const marker = isIntelligence ? '⚡' : '✓';
    console.error(`  ${marker} Registered: ${tool.name}`);
}
console.error('');
console.error('✅ Hook Tools (10):');
console.error('   hook_pre_edit, hook_post_edit, hook_pre_command, hook_post_command');
console.error('   hook_route, hook_explain, hook_pretrain, hook_build_agents');
console.error('   hook_metrics, hook_transfer');
console.error('');
console.error('⚡ Intelligence Tools (9):');
console.error('   intelligence_route (SONA + MoE + HNSW)');
console.error('   intelligence_trajectory_start/step/end (learning)');
console.error('   intelligence_pattern_store/search (ReasoningBank)');
console.error('   intelligence_stats, intelligence_learn, intelligence_attention');
console.error('');
console.error('🔌 Starting stdio transport...');
// Start server
server.start({ transportType: 'stdio' }).then(() => {
    console.error('✅ Hook Server running on stdio with RuVector Intelligence');
}).catch((error) => {
    console.error('❌ Failed to start:', error);
    process.exit(1);
});
//# sourceMappingURL=hooks-server.js.map