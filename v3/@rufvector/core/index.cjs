"use strict";
/**
 * @rufvector/core - CommonJS wrapper
 *
 * Rufflo in-repo fork of @rufvector/core. Loads the bundled native redb+HNSW
 * vector engine. Default on-disk store is `vector.db` (baked into the Rust crate).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistanceMetric = void 0;
const { platform, arch } = require("node:os");
const { join } = require("node:path");

/** Distance metric for similarity calculation */
var DistanceMetric;
(function (DistanceMetric) {
  DistanceMetric["Euclidean"] = "euclidean";
  DistanceMetric["Cosine"] = "cosine";
  DistanceMetric["DotProduct"] = "dot";
})(DistanceMetric || (exports.DistanceMetric = DistanceMetric = {}));

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
    // 1) bundled binary shipped inside this package
    try {
      return require(join(__dirname, "platforms", triple, "rufvector.node"));
    } catch (e) {
      errors.push(`bundled: ${e.message}`);
    }
    // 2) platform package (for future multi-platform publishing)
    try {
      return require(`@rufvector/core-${triple}`);
    } catch (e) {
      errors.push(`@rufvector/core-${triple}: ${e.message}`);
    }
  }
  throw new Error(
    `@rufvector/core: no native binding for ${key}.\n` + errors.join("\n")
  );
}

const nativeBinding = loadNativeBinding();

// Optional attention sidecar (forked separately); absence is fine.
let attention = null;
try {
  attention = require("@rufvector/attention");
} catch {
  /* optional */
}

module.exports = nativeBinding;
if (nativeBinding.VectorDb && !nativeBinding.VectorDB) {
  module.exports.VectorDB = nativeBinding.VectorDb;
}
module.exports.default = nativeBinding;
module.exports.DistanceMetric = DistanceMetric;
if (attention) {
  module.exports.attention = attention;
}
