"use strict";
/** @rufvector/graph-node - CommonJS wrapper. Rufflo in-repo fork; loads the bundled native binding. */
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { platform, arch } = require("node:os");
const TRIPLE = { "linux-x64": "linux-x64-gnu", "linux-arm64": "linux-arm64-gnu", "darwin-x64": "darwin-x64", "darwin-arm64": "darwin-arm64", "win32-x64": "win32-x64-msvc" };
function loadNativeBinding() {
  const key = platform() + "-" + arch();
  const triple = TRIPLE[key];
  const errors = [];
  if (triple) {
    const local = join(__dirname, "platforms", triple, "rufvector-graph-node.node");
    if (existsSync(local)) { try { return require(local); } catch (e) { errors.push("bundled: " + e.message); } }
    try { return require("@rufvector/graph-node-" + triple); } catch (e) { errors.push("@rufvector/graph-node-" + triple + ": " + e.message); }
  }
  throw new Error("@rufvector/graph-node: no native binding for " + key + ".\n" + errors.join("\n"));
}
const nativeBinding = loadNativeBinding();
module.exports = nativeBinding;
module.exports.default = nativeBinding;
