"use strict";
/**
 * @rufvector/rufllm - Self-learning LLM orchestration
 *
 * RufLLM combines SONA adaptive learning with HNSW memory,
 * FastGRNN routing, and SIMD-optimized inference.
 *
 * @example
 * ```typescript
 * import { RufLLM, SessionManager, SonaCoordinator } from '@rufvector/rufllm';
 *
 * const llm = new RufLLM({ learningEnabled: true });
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
 * import { EphemeralAgent, FederatedCoordinator } from '@rufvector/rufllm';
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
 * import { LoraAdapter, LoraManager } from '@rufvector/rufllm';
 *
 * const adapter = new LoraAdapter({ rank: 8, alpha: 16 });
 * const output = adapter.forward(input);
 * ```
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = exports.hasSimdSupport = exports.version = void 0;
// Core types
__exportStar(require("./types"), exports);
// Main engine
__exportStar(require("./engine"), exports);
// SIMD operations
__exportStar(require("./simd"), exports);
// Session management
__exportStar(require("./session"), exports);
// Streaming support
__exportStar(require("./streaming"), exports);
// SONA learning system
__exportStar(require("./sona"), exports);
// Federated learning
__exportStar(require("./federated"), exports);
// LoRA adapters
__exportStar(require("./lora"), exports);
// Export/serialization
__exportStar(require("./export"), exports);
// Training pipeline
__exportStar(require("./training"), exports);
// Contrastive fine-tuning
__exportStar(require("./contrastive"), exports);
// Model downloader and registry
__exportStar(require("./models"), exports);
// Benchmarks for Claude Code use cases
__exportStar(require("./benchmarks"), exports);
// External Intelligence Providers (ADR-043)
__exportStar(require("./intelligence"), exports);
// Native bindings utilities
var native_1 = require("./native");
Object.defineProperty(exports, "version", { enumerable: true, get: function () { return native_1.version; } });
Object.defineProperty(exports, "hasSimdSupport", { enumerable: true, get: function () { return native_1.hasSimdSupport; } });
// Default export
var engine_1 = require("./engine");
Object.defineProperty(exports, "default", { enumerable: true, get: function () { return engine_1.RufLLM; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQWtERzs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCxhQUFhO0FBQ2IsMENBQXdCO0FBRXhCLGNBQWM7QUFDZCwyQ0FBeUI7QUFFekIsa0JBQWtCO0FBQ2xCLHlDQUF1QjtBQUV2QixxQkFBcUI7QUFDckIsNENBQTBCO0FBRTFCLG9CQUFvQjtBQUNwQiw4Q0FBNEI7QUFFNUIsdUJBQXVCO0FBQ3ZCLHlDQUF1QjtBQUV2QixxQkFBcUI7QUFDckIsOENBQTRCO0FBRTVCLGdCQUFnQjtBQUNoQix5Q0FBdUI7QUFFdkIsdUJBQXVCO0FBQ3ZCLDJDQUF5QjtBQUV6QixvQkFBb0I7QUFDcEIsNkNBQTJCO0FBRTNCLDBCQUEwQjtBQUMxQixnREFBOEI7QUFFOUIsZ0NBQWdDO0FBQ2hDLDJDQUF5QjtBQUV6Qix1Q0FBdUM7QUFDdkMsK0NBQTZCO0FBRTdCLDRDQUE0QztBQUM1QyxpREFBK0I7QUFFL0IsNEJBQTRCO0FBQzVCLG1DQUFtRDtBQUExQyxpR0FBQSxPQUFPLE9BQUE7QUFBRSx3R0FBQSxjQUFjLE9BQUE7QUFFaEMsaUJBQWlCO0FBQ2pCLG1DQUE2QztBQUFwQyxpR0FBQSxNQUFNLE9BQVciLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBydWZ2ZWN0b3IvcnVmbGxtIC0gU2VsZi1sZWFybmluZyBMTE0gb3JjaGVzdHJhdGlvblxuICpcbiAqIFJ1ZkxMTSBjb21iaW5lcyBTT05BIGFkYXB0aXZlIGxlYXJuaW5nIHdpdGggSE5TVyBtZW1vcnksXG4gKiBGYXN0R1JOTiByb3V0aW5nLCBhbmQgU0lNRC1vcHRpbWl6ZWQgaW5mZXJlbmNlLlxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBpbXBvcnQgeyBSdWZMTE0sIFNlc3Npb25NYW5hZ2VyLCBTb25hQ29vcmRpbmF0b3IgfSBmcm9tICdAcnVmdmVjdG9yL3J1ZmxsbSc7XG4gKlxuICogY29uc3QgbGxtID0gbmV3IFJ1ZkxMTSh7IGxlYXJuaW5nRW5hYmxlZDogdHJ1ZSB9KTtcbiAqIGNvbnN0IHNlc3Npb25zID0gbmV3IFNlc3Npb25NYW5hZ2VyKGxsbSk7XG4gKiBjb25zdCBzb25hID0gbmV3IFNvbmFDb29yZGluYXRvcigpO1xuICpcbiAqIC8vIFF1ZXJ5IHdpdGggc2Vzc2lvbiBjb250ZXh0XG4gKiBjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnMuY3JlYXRlKCk7XG4gKiBjb25zdCByZXNwb25zZSA9IHNlc3Npb25zLmNoYXQoc2Vzc2lvbi5pZCwgJ1doYXQgaXMgQUk/Jyk7XG4gKlxuICogLy8gVHJhY2sgbGVhcm5pbmcgdHJhamVjdG9yeVxuICogY29uc3QgdHJhamVjdG9yeSA9IG5ldyBUcmFqZWN0b3J5QnVpbGRlcigpXG4gKiAgIC5zdGFydFN0ZXAoJ3F1ZXJ5JywgJ1doYXQgaXMgQUk/JylcbiAqICAgLmVuZFN0ZXAocmVzcG9uc2UudGV4dCwgcmVzcG9uc2UuY29uZmlkZW5jZSlcbiAqICAgLmNvbXBsZXRlKCdzdWNjZXNzJyk7XG4gKlxuICogc29uYS5yZWNvcmRUcmFqZWN0b3J5KHRyYWplY3RvcnkpO1xuICogYGBgXG4gKlxuICogQGV4YW1wbGUgRmVkZXJhdGVkIExlYXJuaW5nXG4gKiBgYGB0eXBlc2NyaXB0XG4gKiBpbXBvcnQgeyBFcGhlbWVyYWxBZ2VudCwgRmVkZXJhdGVkQ29vcmRpbmF0b3IgfSBmcm9tICdAcnVmdmVjdG9yL3J1ZmxsbSc7XG4gKlxuICogLy8gQ2VudHJhbCBjb29yZGluYXRvclxuICogY29uc3QgY29vcmRpbmF0b3IgPSBuZXcgRmVkZXJhdGVkQ29vcmRpbmF0b3IoJ2Nvb3JkLTEnKTtcbiAqXG4gKiAvLyBFcGhlbWVyYWwgYWdlbnRzIHByb2Nlc3MgdGFza3MgYW5kIGV4cG9ydFxuICogY29uc3QgYWdlbnQgPSBuZXcgRXBoZW1lcmFsQWdlbnQoJ2FnZW50LTEnKTtcbiAqIGFnZW50LnByb2Nlc3NUYXNrKGVtYmVkZGluZywgMC45KTtcbiAqIGNvbnN0IGV4cG9ydERhdGEgPSBhZ2VudC5leHBvcnRTdGF0ZSgpO1xuICpcbiAqIC8vIEFnZ3JlZ2F0ZSBsZWFybmluZ1xuICogY29vcmRpbmF0b3IuYWdncmVnYXRlKGV4cG9ydERhdGEpO1xuICogYGBgXG4gKlxuICogQGV4YW1wbGUgTG9SQSBBZGFwdGVyc1xuICogYGBgdHlwZXNjcmlwdFxuICogaW1wb3J0IHsgTG9yYUFkYXB0ZXIsIExvcmFNYW5hZ2VyIH0gZnJvbSAnQHJ1ZnZlY3Rvci9ydWZsbG0nO1xuICpcbiAqIGNvbnN0IGFkYXB0ZXIgPSBuZXcgTG9yYUFkYXB0ZXIoeyByYW5rOiA4LCBhbHBoYTogMTYgfSk7XG4gKiBjb25zdCBvdXRwdXQgPSBhZGFwdGVyLmZvcndhcmQoaW5wdXQpO1xuICogYGBgXG4gKi9cblxuLy8gQ29yZSB0eXBlc1xuZXhwb3J0ICogZnJvbSAnLi90eXBlcyc7XG5cbi8vIE1haW4gZW5naW5lXG5leHBvcnQgKiBmcm9tICcuL2VuZ2luZSc7XG5cbi8vIFNJTUQgb3BlcmF0aW9uc1xuZXhwb3J0ICogZnJvbSAnLi9zaW1kJztcblxuLy8gU2Vzc2lvbiBtYW5hZ2VtZW50XG5leHBvcnQgKiBmcm9tICcuL3Nlc3Npb24nO1xuXG4vLyBTdHJlYW1pbmcgc3VwcG9ydFxuZXhwb3J0ICogZnJvbSAnLi9zdHJlYW1pbmcnO1xuXG4vLyBTT05BIGxlYXJuaW5nIHN5c3RlbVxuZXhwb3J0ICogZnJvbSAnLi9zb25hJztcblxuLy8gRmVkZXJhdGVkIGxlYXJuaW5nXG5leHBvcnQgKiBmcm9tICcuL2ZlZGVyYXRlZCc7XG5cbi8vIExvUkEgYWRhcHRlcnNcbmV4cG9ydCAqIGZyb20gJy4vbG9yYSc7XG5cbi8vIEV4cG9ydC9zZXJpYWxpemF0aW9uXG5leHBvcnQgKiBmcm9tICcuL2V4cG9ydCc7XG5cbi8vIFRyYWluaW5nIHBpcGVsaW5lXG5leHBvcnQgKiBmcm9tICcuL3RyYWluaW5nJztcblxuLy8gQ29udHJhc3RpdmUgZmluZS10dW5pbmdcbmV4cG9ydCAqIGZyb20gJy4vY29udHJhc3RpdmUnO1xuXG4vLyBNb2RlbCBkb3dubG9hZGVyIGFuZCByZWdpc3RyeVxuZXhwb3J0ICogZnJvbSAnLi9tb2RlbHMnO1xuXG4vLyBCZW5jaG1hcmtzIGZvciBDbGF1ZGUgQ29kZSB1c2UgY2FzZXNcbmV4cG9ydCAqIGZyb20gJy4vYmVuY2htYXJrcyc7XG5cbi8vIEV4dGVybmFsIEludGVsbGlnZW5jZSBQcm92aWRlcnMgKEFEUi0wNDMpXG5leHBvcnQgKiBmcm9tICcuL2ludGVsbGlnZW5jZSc7XG5cbi8vIE5hdGl2ZSBiaW5kaW5ncyB1dGlsaXRpZXNcbmV4cG9ydCB7IHZlcnNpb24sIGhhc1NpbWRTdXBwb3J0IH0gZnJvbSAnLi9uYXRpdmUnO1xuXG4vLyBEZWZhdWx0IGV4cG9ydFxuZXhwb3J0IHsgUnVmTExNIGFzIGRlZmF1bHQgfSBmcm9tICcuL2VuZ2luZSc7XG4iXX0=