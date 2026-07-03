/**
 * Hyperbolic Reasoning Plugin - Bridges Barrel Export
 *
 * @module @swarmdo/plugin-hyperbolic-reasoning/bridges
 */

export {
  HyperbolicBridge,
  createHyperbolicBridge,
} from './hyperbolic-bridge.js';
export type { WasmModuleStatus } from './hyperbolic-bridge.js';

export {
  GnnBridge,
  createGnnBridge,
} from './gnn-bridge.js';
export type {
  GnnConfig,
  Graph,
  GnnResult,
  EntailmentPrediction,
} from './gnn-bridge.js';
