/** @swarmvector/attention - ESM wrapper (re-exports the full native surface via the CJS entry). */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const mod = require("./index.cjs");
export default mod;
export const { info, version, DecayType, MiningStrategy, AttentionType, benchmarkAttention, batchAttentionCompute, computeAttentionAsync, parallelAttentionCompute, batchFlashAttentionCompute, computeFlashAttentionAsync, computeHyperbolicAttentionAsync, expMap, logMap, mobiusAddition, poincareDistance, projectToPoincareBall, InfoNceLoss, AdamOptimizer, HyperbolicAttention, InBatchMiner, MoEAttention, EdgeFeaturedAttention, LearningRateScheduler, LocalContrastiveLoss, MultiHeadAttention, DotProductAttention, LocalGlobalAttention, HardNegativeMiner, LinearAttention, AdamWOptimizer, TemperatureAnnealing, SpectralRegularization, CurriculumScheduler, FlashAttention, SgdOptimizer, StreamProcessor, GraphRoPeAttention, DualSpaceAttention } = mod;
