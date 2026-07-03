// Swarmdo fork: emit the platform napi linker flags (macOS `-undefined
// dynamic_lookup`, etc.) so `cargo build --features napi` links the cdylib
// against N-API symbols resolved by the Node host at load time. Upstream builds
// sona via the napi CLI (which injects these flags); we build it in-workspace
// with plain cargo, so we need napi_build::setup() like the core crate does.
fn main() {
    napi_build::setup();
}
