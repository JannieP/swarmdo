"use strict";
/**
 * @swarmvector/sona - CommonJS wrapper
 *
 * Swarmdo in-repo fork of the upstream SONA engine. Loads the bundled native
 * napi binding and re-exports SonaEngine.
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
    const local = join(__dirname, "platforms", triple, "swarmvector-sona.node");
    if (existsSync(local)) {
      try {
        return require(local);
      } catch (e) {
        errors.push(`bundled: ${e.message}`);
      }
    }
    try {
      return require(`@swarmvector/sona-${triple}`);
    } catch (e) {
      errors.push(`@swarmvector/sona-${triple}: ${e.message}`);
    }
  }
  throw new Error(
    `@swarmvector/sona: no native binding for ${key}.\n` + errors.join("\n")
  );
}

const nativeBinding = loadNativeBinding();
module.exports = nativeBinding;
module.exports.default = nativeBinding;
