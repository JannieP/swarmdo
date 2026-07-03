/**
 * Healthcare Clinical Plugin - Bridges Barrel Export
 *
 * @module @swarmdo/plugin-healthcare-clinical/bridges
 */

export {
  HealthcareHNSWBridge,
  createHNSWBridge,
  PatientEmbeddingGenerator,
} from './hnsw-bridge.js';

export {
  HealthcareGNNBridge,
  createGNNBridge,
} from './gnn-bridge.js';
