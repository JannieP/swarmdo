# Rufvector Metrics

[![Crates.io](https://img.shields.io/crates/v/rufvector-metrics.svg)](https://crates.io/crates/rufvector-metrics)
[![Documentation](https://docs.rs/rufvector-metrics/badge.svg)](https://docs.rs/rufvector-metrics)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/rust-1.77%2B-orange.svg)](https://www.rust-lang.org)

**Prometheus-compatible metrics collection for Rufvector vector databases.**

`rufvector-metrics` provides comprehensive observability with counters, gauges, histograms, and exporters for monitoring Rufvector performance and health. Part of the [Rufvector](https://github.com/ruvnet/rufvector) ecosystem.

## Why Rufvector Metrics?

- **Prometheus Native**: Direct Prometheus integration
- **Zero Overhead**: Lazy initialization, minimal impact
- **Comprehensive**: Operation latencies, throughput, memory
- **Customizable**: Add custom metrics for your use case
- **Standard Format**: OpenMetrics-compatible output

## Features

### Core Metrics

- **Operation Counters**: Insert, search, delete counts
- **Latency Histograms**: p50, p95, p99 latencies
- **Throughput Gauges**: Queries per second
- **Memory Metrics**: Heap usage, vector memory
- **Index Metrics**: HNSW stats, quantization info

### Advanced Features

- **Custom Labels**: Add context to metrics
- **Metric Groups**: Enable/disable metric categories
- **JSON Export**: Alternative to Prometheus format
- **Time Series**: Historical metric tracking

## Installation

Add `rufvector-metrics` to your `Cargo.toml`:

```toml
[dependencies]
rufvector-metrics = "0.1.1"
```

## Quick Start

### Initialize Metrics

```rust
use rufvector_metrics::{Metrics, MetricsConfig};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize metrics with default config
    let metrics = Metrics::new(MetricsConfig::default())?;

    // Or with custom config
    let config = MetricsConfig {
        namespace: "rufvector".to_string(),
        enable_histograms: true,
        histogram_buckets: vec![0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0],
        ..Default::default()
    };
    let metrics = Metrics::new(config)?;

    Ok(())
}
```

### Record Metrics

```rust
use rufvector_metrics::Metrics;

// Record operation
metrics.record_insert(1);
metrics.record_search(latency_ms);
metrics.record_delete(1);

// Record batch operations
metrics.record_batch_insert(count, latency_ms);
metrics.record_batch_search(count, latency_ms);

// Update gauges
metrics.set_vector_count(10000);
metrics.set_memory_usage(1024 * 1024 * 500); // 500MB
```

### Export Metrics

```rust
use rufvector_metrics::Metrics;

// Get Prometheus format
let prometheus_output = metrics.export_prometheus()?;
println!("{}", prometheus_output);

// Get JSON format
let json_output = metrics.export_json()?;
println!("{}", json_output);
```

### HTTP Endpoint

```rust
use rufvector_metrics::{Metrics, MetricsServer};

// Start metrics server on /metrics endpoint
let server = MetricsServer::new(metrics, 9090)?;
server.start().await?;

// Access at http://localhost:9090/metrics
```

## Available Metrics

```
# Counters
rufvector_inserts_total            # Total insert operations
rufvector_searches_total           # Total search operations
rufvector_deletes_total            # Total delete operations
rufvector_errors_total             # Total errors by type

# Histograms
rufvector_insert_latency_seconds   # Insert latency
rufvector_search_latency_seconds   # Search latency
rufvector_delete_latency_seconds   # Delete latency

# Gauges
rufvector_vector_count             # Current vector count
rufvector_memory_bytes             # Memory usage
rufvector_index_size_bytes         # Index size
rufvector_collection_count         # Number of collections

# Index metrics
rufvector_hnsw_levels              # HNSW graph levels
rufvector_hnsw_nodes               # HNSW node count
rufvector_hnsw_ef_construction     # EF construction parameter
```

## API Overview

### Core Types

```rust
// Metrics configuration
pub struct MetricsConfig {
    pub namespace: String,
    pub enable_histograms: bool,
    pub enable_process_metrics: bool,
    pub histogram_buckets: Vec<f64>,
    pub labels: HashMap<String, String>,
}

// Metrics handle
pub struct Metrics { /* ... */ }
```

### Metrics Operations

```rust
impl Metrics {
    pub fn new(config: MetricsConfig) -> Result<Self>;

    // Record operations
    pub fn record_insert(&self, count: u64);
    pub fn record_search(&self, latency_ms: f64);
    pub fn record_delete(&self, count: u64);
    pub fn record_error(&self, error_type: &str);

    // Update gauges
    pub fn set_vector_count(&self, count: u64);
    pub fn set_memory_usage(&self, bytes: u64);

    // Export
    pub fn export_prometheus(&self) -> Result<String>;
    pub fn export_json(&self) -> Result<String>;
}
```

## Grafana Dashboard

Example Grafana queries:

```promql
# Request rate
rate(rufvector_searches_total[5m])

# p99 latency
histogram_quantile(0.99, rate(rufvector_search_latency_seconds_bucket[5m]))

# Memory usage
rufvector_memory_bytes / 1024 / 1024  # MB

# Error rate
rate(rufvector_errors_total[5m]) / rate(rufvector_searches_total[5m])
```

## Related Crates

- **[rufvector-core](../rufvector-core/)** - Core vector database engine
- **[rufvector-server](../rufvector-server/)** - REST API server

## Documentation

- **[Main README](../../README.md)** - Complete project overview
- **[API Documentation](https://docs.rs/rufvector-metrics)** - Full API reference
- **[GitHub Repository](https://github.com/ruvnet/rufvector)** - Source code

## License

**MIT License** - see [LICENSE](../../LICENSE) for details.

---

<div align="center">

**Part of [Rufvector](https://github.com/ruvnet/rufvector) - Built by [rUv](https://ruv.io)**

[![Star on GitHub](https://img.shields.io/github/stars/ruvnet/rufvector?style=social)](https://github.com/ruvnet/rufvector)

[Documentation](https://docs.rs/rufvector-metrics) | [Crates.io](https://crates.io/crates/rufvector-metrics) | [GitHub](https://github.com/ruvnet/rufvector)

</div>
