/**
 * @swarmvector/swarmllm - Self-learning LLM orchestration
 *
 * SwarmLLM combines SONA adaptive learning with HNSW memory,
 * FastGRNN routing, and SIMD-optimized inference.
 *
 * @example
 * ```typescript
 * import { SwarmLLM, SessionManager, SonaCoordinator } from '@swarmvector/swarmllm';
 *
 * const llm = new SwarmLLM({ learningEnabled: true });
 * const sessions = new SessionManager(llm);
 * const sona = new SonaCoordinator();
 *
 * // Query with session context
 * const session = sessions.create();
 * const response = sessions.chat(session.id, 'What is AI?');
 *
 * // Track learning trajectory
 * const trajectory = new TrajectoryBuilder()
 *   .startStep('query', 'What is AI?')
 *   .endStep(response.text, response.confidence)
 *   .complete('success');
 *
 * sona.recordTrajectory(trajectory);
 * ```
 *
 * @example Federated Learning
 * ```typescript
 * import { EphemeralAgent, FederatedCoordinator } from '@swarmvector/swarmllm';
 *
 * // Central coordinator
 * const coordinator = new FederatedCoordinator('coord-1');
 *
 * // Ephemeral agents process tasks and export
 * const agent = new EphemeralAgent('agent-1');
 * agent.processTask(embedding, 0.9);
 * const exportData = agent.exportState();
 *
 * // Aggregate learning
 * coordinator.aggregate(exportData);
 * ```
 *
 * @example LoRA Adapters
 * ```typescript
 * import { LoraAdapter, LoraManager } from '@swarmvector/swarmllm';
 *
 * const adapter = new LoraAdapter({ rank: 8, alpha: 16 });
 * const output = adapter.forward(input);
 * ```
 */
export * from './types';
export * from './engine';
export * from './simd';
export * from './session';
export * from './streaming';
export * from './sona';
export * from './federated';
export * from './lora';
export * from './export';
export * from './training';
export * from './contrastive';
export * from './models';
export * from './benchmarks';
export * from './intelligence';
export { version, hasSimdSupport } from './native';
export { SwarmLLM as default } from './engine';
//# sourceMappingURL=index.d.ts.map