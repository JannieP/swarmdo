//! Error types for Swarmvector

use thiserror::Error;

/// Result type alias for Swarmvector operations
pub type Result<T> = std::result::Result<T, SwarmvectorError>;

/// Main error type for Swarmvector
#[derive(Error, Debug)]
pub enum SwarmvectorError {
    /// Vector dimension mismatch
    #[error("Dimension mismatch: expected {expected}, got {actual}")]
    DimensionMismatch {
        /// Expected dimension
        expected: usize,
        /// Actual dimension
        actual: usize,
    },

    /// Vector not found
    #[error("Vector not found: {0}")]
    VectorNotFound(String),

    /// Invalid parameter
    #[error("Invalid parameter: {0}")]
    InvalidParameter(String),

    /// Invalid input
    #[error("Invalid input: {0}")]
    InvalidInput(String),

    /// Invalid dimension
    #[error("Invalid dimension: {0}")]
    InvalidDimension(String),

    /// Storage error
    #[error("Storage error: {0}")]
    StorageError(String),

    /// Model loading error
    #[error("Model loading error: {0}")]
    ModelLoadError(String),

    /// Model inference error
    #[error("Model inference error: {0}")]
    ModelInferenceError(String),

    /// Index error
    #[error("Index error: {0}")]
    IndexError(String),

    /// Serialization error
    #[error("Serialization error: {0}")]
    SerializationError(String),

    /// IO error
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    /// Database error
    #[error("Database error: {0}")]
    DatabaseError(String),

    /// Invalid path error
    #[error("Invalid path: {0}")]
    InvalidPath(String),

    /// Other errors
    #[error("Internal error: {0}")]
    Internal(String),
}

#[cfg(feature = "storage")]
impl From<redb::Error> for SwarmvectorError {
    fn from(err: redb::Error) -> Self {
        SwarmvectorError::DatabaseError(err.to_string())
    }
}

#[cfg(feature = "storage")]
impl From<redb::DatabaseError> for SwarmvectorError {
    fn from(err: redb::DatabaseError) -> Self {
        SwarmvectorError::DatabaseError(err.to_string())
    }
}

#[cfg(feature = "storage")]
impl From<redb::StorageError> for SwarmvectorError {
    fn from(err: redb::StorageError) -> Self {
        SwarmvectorError::DatabaseError(err.to_string())
    }
}

#[cfg(feature = "storage")]
impl From<redb::TableError> for SwarmvectorError {
    fn from(err: redb::TableError) -> Self {
        SwarmvectorError::DatabaseError(err.to_string())
    }
}

#[cfg(feature = "storage")]
impl From<redb::TransactionError> for SwarmvectorError {
    fn from(err: redb::TransactionError) -> Self {
        SwarmvectorError::DatabaseError(err.to_string())
    }
}

#[cfg(feature = "storage")]
impl From<redb::CommitError> for SwarmvectorError {
    fn from(err: redb::CommitError) -> Self {
        SwarmvectorError::DatabaseError(err.to_string())
    }
}
