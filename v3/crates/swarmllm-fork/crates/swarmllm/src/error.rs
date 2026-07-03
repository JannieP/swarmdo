//! Error types for SwarmLLM
//!
//! This module defines the error hierarchy for the SwarmLLM crate,
//! providing detailed error information for debugging and handling.

use thiserror::Error;

/// Result type alias for SwarmLLM operations
pub type Result<T> = std::result::Result<T, SwarmLLMError>;

/// Main error type for SwarmLLM
#[derive(Error, Debug)]
pub enum SwarmLLMError {
    /// Storage-related errors
    #[error("Storage error: {0}")]
    Storage(String),

    /// Session management errors
    #[error("Session error: {0}")]
    Session(String),

    /// KV cache errors
    #[error("KV cache error: {0}")]
    KvCache(String),

    /// Paged attention errors
    #[error("Paged attention error: {0}")]
    PagedAttention(String),

    /// Adapter management errors
    #[error("Adapter error: {0}")]
    Adapter(String),

    /// Policy store errors
    #[error("Policy error: {0}")]
    Policy(String),

    /// Witness log errors
    #[error("Witness log error: {0}")]
    WitnessLog(String),

    /// SONA learning errors
    #[error("SONA error: {0}")]
    Sona(String),

    /// Configuration errors
    #[error("Configuration error: {0}")]
    Config(String),

    /// Resource exhaustion
    #[error("Out of memory: {0}")]
    OutOfMemory(String),

    /// Invalid operation
    #[error("Invalid operation: {0}")]
    InvalidOperation(String),

    /// Not found
    #[error("Not found: {0}")]
    NotFound(String),

    /// Serialization errors
    #[error("Serialization error: {0}")]
    Serialization(String),

    /// IO errors
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// Swarmvector errors
    #[error("Swarmvector error: {0}")]
    Swarmvector(String),

    /// Backend inference errors
    #[error("Backend error: {0}")]
    Backend(String),

    /// Model loading errors
    #[error("Model error: {0}")]
    Model(String),

    /// Tokenization errors
    #[error("Tokenization error: {0}")]
    Tokenization(String),

    /// Generation errors
    #[error("Generation error: {0}")]
    Generation(String),

    /// Metal GPU errors (macOS only)
    #[error("Metal error: {0}")]
    Metal(String),

    /// Shader compilation errors
    #[error("Shader error: {0}")]
    Shader(String),

    /// GGUF format errors
    #[error("GGUF error: {0}")]
    Gguf(String),

    /// Quantization errors
    #[error("Quantization error: {0}")]
    Quantization(String),

    /// Not implemented errors
    #[error("Not implemented: {0}")]
    NotImplemented(String),

    /// Hybrid pipeline errors
    #[error("Hybrid pipeline error: {0}")]
    HybridPipeline(String),

    /// Core ML errors (macOS only)
    #[error("Core ML error: {0}")]
    CoreML(String),
}

impl From<swarmvector_core::SwarmvectorError> for SwarmLLMError {
    fn from(err: swarmvector_core::SwarmvectorError) -> Self {
        SwarmLLMError::Swarmvector(err.to_string())
    }
}

impl From<serde_json::Error> for SwarmLLMError {
    fn from(err: serde_json::Error) -> Self {
        SwarmLLMError::Serialization(err.to_string())
    }
}
