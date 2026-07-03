//! Comprehensive test suite for SwarmLLM
//!
//! This module organizes all unit tests for the SwarmLLM crate.

mod activation_tests;
mod attention_tests;
mod generation_tests;
mod gguf_tests;
mod witness_log_tests;

// Basic lib configuration tests (moved from lib.rs)
use crate::SwarmLLMConfig;

#[test]
fn test_config_default() {
    let config = SwarmLLMConfig::default();
    assert_eq!(config.max_sessions, 1000);
    assert_eq!(config.embedding_dim, 768);
}
