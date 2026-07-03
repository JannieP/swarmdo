//! Model Architectures for SwarmLLM
//!
//! This module contains model architecture implementations optimized for
//! various hardware targets including Apple Neural Engine (ANE), Metal GPU,
//! and CPU.
//!
//! ## Available Models
//!
//! | Model | Architecture | Params | ANE Optimized | Use Case |
//! |-------|--------------|--------|---------------|----------|
//! | SwarmLTRA-Small | Qwen 0.5B | 500M | Yes | Edge inference, mobile |
//! | SwarmLTRA-Medium | Qwen2.5-3B | 3B | Yes | Balanced quality/performance |
//!
//! ## Model Selection Guide
//!
//! ```text
//! Model Size vs Performance:
//!
//!   SwarmLTRA-Small (0.5B)  ████████░░  Good quality, fast inference
//!                                      ANE: 38 TOPS, ~200 tok/s
//!
//!   SwarmLTRA-Medium (3B)   ██████████  High quality, moderate speed
//!                                      GPU/ANE: ~50-80 tok/s, SONA learning
//!
//!   Phi-3 (3B)            ██████████  High quality, moderate speed
//!                                      GPU: Metal, ~50 tok/s
//!
//!   Qwen 1.8B             █████████░  Balanced quality/speed
//!                                      GPU: Metal, ~80 tok/s
//! ```
//!
//! ## Usage
//!
//! ### SwarmLTRA-Small (0.5B)
//!
//! ```rust,ignore
//! use swarmllm::models::swarmltra::{SwarmLtraConfig, SwarmLtraModel};
//!
//! // Create model with default Qwen 0.5B config
//! let config = SwarmLtraConfig::default();
//! let model = SwarmLtraModel::new(&config)?;
//!
//! // Run inference
//! let logits = model.forward(&input_ids, &positions, None)?;
//! ```
//!
//! ### SwarmLTRA-Medium (3B)
//!
//! ```rust,ignore
//! use swarmllm::models::swarmltra_medium::{SwarmLtraMediumConfig, SwarmLtraMediumModel};
//!
//! // Create base variant
//! let config = SwarmLtraMediumConfig::base();
//! let mut model = SwarmLtraMediumModel::new(&config)?;
//!
//! // Enable SONA learning hooks at layers 8, 16, 24
//! model.enable_sona_with_hooks(&[8, 16, 24])?;
//!
//! // Run inference with paged attention
//! let logits = model.forward(&input_ids, &positions)?;
//! ```

pub mod openmythos;
pub mod rdt;
pub mod swarmltra;
pub mod swarmltra_medium;
pub mod sampling;

// Re-export OpenMythos types (Rust/Candle port of kyegomez/OpenMythos)
#[cfg(feature = "candle")]
pub use openmythos::{MythosConfig, OpenMythos};

// Re-export sampling utilities
pub use sampling::{Sampler, SamplingConfig};

// Re-export Recurrent-Depth Transformer types (ADR-latest)
pub use rdt::{
    validate_rdt_metadata, DepthStats, DepthTelemetry, RdtCompatibilityError, RdtConfig,
    RDT_ARCHITECTURES, RDT_RECURRENCE_KEYS,
};

// Re-export SwarmLTRA-Small types
pub use swarmltra::{
    AneDispatcher,
    AneOptimization,
    MemoryLayout,
    QuantizationType,
    SwarmLtraAttention,
    // Configuration
    SwarmLtraConfig,
    SwarmLtraDecoderLayer,
    SwarmLtraMLP,
    // Model components
    SwarmLtraModel,
    // Utilities
    SwarmLtraModelInfo,
};

// Re-export SwarmLTRA-Medium types
pub use swarmltra_medium::{
    SwarmLtraMediumAttention,
    // Configuration
    SwarmLtraMediumConfig,
    SwarmLtraMediumDecoderLayer,
    SwarmLtraMediumMLP,
    // Model components
    SwarmLtraMediumModel,
    // Utilities
    SwarmLtraMediumModelInfo,
    SwarmLtraMediumQuant,
    SwarmLtraMediumVariant,
    SonaHookConfig,
};
