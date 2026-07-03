/** @swarmvector/tiny-dancer - ESM wrapper (re-exports the full native surface via the CJS entry). */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const mod = require("./index.cjs");
export default mod;
export const { hello, score, version, trainRouter, Router } = mod;
