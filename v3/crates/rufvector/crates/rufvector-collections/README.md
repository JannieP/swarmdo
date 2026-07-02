# Rufvector Collections

[![Crates.io](https://img.shields.io/crates/v/rufvector-collections.svg)](https://crates.io/crates/rufvector-collections)
[![Documentation](https://docs.rs/rufvector-collections/badge.svg)](https://docs.rs/rufvector-collections)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/rust-1.77%2B-orange.svg)](https://www.rust-lang.org)

**High-performance collection management for Rufvector vector databases.**

`rufvector-collections` provides multi-tenant collection support with isolated namespaces, schema management, and collection-level configuration. Part of the [Rufvector](https://github.com/ruvnet/rufvector) ecosystem.

## Why Rufvector Collections?

- **Multi-Tenant**: Isolated collections with separate namespaces
- **Schema Support**: Define and enforce vector schemas
- **Collection Configs**: Per-collection settings for dimensions, metrics
- **Thread-Safe**: Concurrent access with DashMap
- **Metadata Support**: Rich collection metadata and tagging

## Features

### Core Capabilities

- **Collection CRUD**: Create, read, update, delete collections
- **Namespace Isolation**: Logical separation between collections
- **Schema Validation**: Enforce vector dimensions and types
- **Metadata Management**: Tags, descriptions, custom properties
- **Alias Support**: Human-readable names for collections

### Advanced Features

- **Collection Groups**: Organize collections hierarchically
- **Access Control**: Collection-level permissions (planned)
- **Versioning**: Collection schema versioning
- **Migration**: Tools for collection migration
- **Statistics**: Per-collection metrics and stats

## Installation

Add `rufvector-collections` to your `Cargo.toml`:

```toml
[dependencies]
rufvector-collections = "0.1.1"
```

## Quick Start

### Create a Collection

```rust
use rufvector_collections::{CollectionManager, CollectionConfig, Schema};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create collection manager
    let manager = CollectionManager::new()?;

    // Define collection schema
    let schema = Schema {
        dimensions: 384,
        distance_metric: DistanceMetric::Cosine,
        vector_type: VectorType::Float32,
    };

    // Create collection with config
    let config = CollectionConfig {
        name: "documents".to_string(),
        schema,
        description: Some("Document embeddings".to_string()),
        metadata: serde_json::json!({
            "model": "text-embedding-3-small",
            "created_by": "data-pipeline"
        }),
        ..Default::default()
    };

    let collection = manager.create_collection(config)?;
    println!("Created collection: {}", collection.id);

    Ok(())
}
```

### Manage Collections

```rust
use rufvector_collections::CollectionManager;

let manager = CollectionManager::new()?;

// List all collections
for collection in manager.list_collections()? {
    println!("{}: {} vectors", collection.name, collection.count);
}

// Get collection by name
let docs = manager.get_collection("documents")?;

// Update collection metadata
manager.update_collection("documents", |c| {
    c.metadata["last_updated"] = serde_json::json!(chrono::Utc::now());
})?;

// Delete collection
manager.delete_collection("old_collection")?;
```

### Collection Aliases

```rust
// Create alias for collection
manager.create_alias("docs", "documents_v2")?;

// Swap alias to new collection (zero-downtime migration)
manager.swap_alias("docs", "documents_v3")?;

// Access via alias
let collection = manager.get_collection_by_alias("docs")?;
```

## API Overview

### Core Types

```rust
// Collection configuration
pub struct CollectionConfig {
    pub name: String,
    pub schema: Schema,
    pub description: Option<String>,
    pub metadata: serde_json::Value,
    pub replicas: usize,
    pub shards: usize,
}

// Vector schema
pub struct Schema {
    pub dimensions: usize,
    pub distance_metric: DistanceMetric,
    pub vector_type: VectorType,
}

// Collection info
pub struct Collection {
    pub id: Uuid,
    pub name: String,
    pub schema: Schema,
    pub count: usize,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub metadata: serde_json::Value,
}
```

### Manager Operations

```rust
impl CollectionManager {
    pub fn new() -> Result<Self>;
    pub fn create_collection(&self, config: CollectionConfig) -> Result<Collection>;
    pub fn get_collection(&self, name: &str) -> Result<Option<Collection>>;
    pub fn list_collections(&self) -> Result<Vec<Collection>>;
    pub fn update_collection<F>(&self, name: &str, f: F) -> Result<Collection>;
    pub fn delete_collection(&self, name: &str) -> Result<bool>;
    pub fn create_alias(&self, alias: &str, collection: &str) -> Result<()>;
    pub fn delete_alias(&self, alias: &str) -> Result<bool>;
}
```

## Related Crates

- **[rufvector-core](../rufvector-core/)** - Core vector database engine
- **[rufvector-server](../rufvector-server/)** - REST API server
- **[rufvector-filter](../rufvector-filter/)** - Metadata filtering

## Documentation

- **[Main README](../../README.md)** - Complete project overview
- **[API Documentation](https://docs.rs/rufvector-collections)** - Full API reference
- **[GitHub Repository](https://github.com/ruvnet/rufvector)** - Source code

## License

**MIT License** - see [LICENSE](../../LICENSE) for details.

---

<div align="center">

**Part of [Rufvector](https://github.com/ruvnet/rufvector) - Built by [rUv](https://ruv.io)**

[![Star on GitHub](https://img.shields.io/github/stars/ruvnet/rufvector?style=social)](https://github.com/ruvnet/rufvector)

[Documentation](https://docs.rs/rufvector-collections) | [Crates.io](https://crates.io/crates/rufvector-collections) | [GitHub](https://github.com/ruvnet/rufvector)

</div>
