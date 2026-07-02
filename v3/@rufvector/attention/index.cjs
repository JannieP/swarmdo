"use strict";
/** @rufvector/attention - CommonJS wrapper. Rufflo in-repo fork; loads the bundled native binding. */
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { platform, arch } = require("node:os");
const TRIPLE = { "linux-x64": "linux-x64-gnu", "linux-arm64": "linux-arm64-gnu", "darwin-x64": "darwin-x64", "darwin-arm64": "darwin-arm64", "win32-x64": "win32-x64-msvc" };
function loadNativeBinding() {
  const key = platform() + "-" + arch();
  const triple = TRIPLE[key];
  const errors = [];
  if (triple) {
    const local = join(__dirname, "platforms", triple, "rufvector-attention.node");
    if (existsSync(local)) { try { return require(local); } catch (e) { errors.push("bundled: " + e.message); } }
    try { return require("@rufvector/attention-" + triple); } catch (e) { errors.push("@rufvector/attention-" + triple + ": " + e.message); }
  }
  throw new Error("@rufvector/attention: no native binding for " + key + ".\n" + errors.join("\n"));
}
const nativeBinding = loadNativeBinding();

// Compatibility shim: rufflo (neural.ts, ruvector-training.ts, and the
// attention-integration.ts wrapper classes) call `.computeRaw(query, keys,
// values)` on attention mechanisms, but the native classes expose the
// identical operation as `.compute`. Alias computeRaw -> compute on every
// exported class prototype that has `compute` but not `computeRaw`, so this
// fork is a drop-in for rufflo's expected surface.
for (const key of Object.keys(nativeBinding)) {
  const exported = nativeBinding[key];
  if (typeof exported === "function" && exported.prototype) {
    const proto = exported.prototype;
    if (
      typeof proto.compute === "function" &&
      typeof proto.computeRaw !== "function"
    ) {
      proto.computeRaw = proto.compute;
    }
  }
}

module.exports = nativeBinding;
module.exports.default = nativeBinding;
