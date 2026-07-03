"use strict";
/**
 * @swarmvector/router - CommonJS wrapper
 *
 * Swarmdo in-repo fork of the upstream vector router. Loads the bundled native
 * binding and re-exports its HNSW VectorDb + DistanceMetric.
 */
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { platform, arch } = require("node:os");

const TRIPLE = {
  "linux-x64": "linux-x64-gnu",
  "linux-arm64": "linux-arm64-gnu",
  "darwin-x64": "darwin-x64",
  "darwin-arm64": "darwin-arm64",
  "win32-x64": "win32-x64-msvc",
};

function loadNativeBinding() {
  const key = `${platform()}-${arch()}`;
  const triple = TRIPLE[key];
  const errors = [];
  if (triple) {
    const local = join(__dirname, "platforms", triple, "swarmvector-router.node");
    if (existsSync(local)) {
      try {
        return require(local);
      } catch (e) {
        errors.push(`bundled: ${e.message}`);
      }
    }
    try {
      return require(`@swarmvector/router-${triple}`);
    } catch (e) {
      errors.push(`@swarmvector/router-${triple}: ${e.message}`);
    }
  }
  throw new Error(
    `@swarmvector/router: no native binding for ${key}.\n` + errors.join("\n")
  );
}

const nativeBinding = loadNativeBinding();
module.exports = nativeBinding;
if (nativeBinding.VectorDb && !nativeBinding.VectorDB) {
  module.exports.VectorDB = nativeBinding.VectorDb;
}
module.exports.default = nativeBinding;
