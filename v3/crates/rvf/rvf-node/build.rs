// Swarmdo fork: emit platform napi linker flags so `cargo build` links the
// cdylib against N-API symbols resolved by the Node host at load time.
fn main() {
    napi_build::setup();
}
