# Swarmvector Metrics

[![Crates.io](https://img.shields.io/crates/v/swarmvector-metrics.svg)](https://crates.io/crates/swarmvector-metrics)
[![Documentation](https://docs.rs/swarmvector-metrics/badge.svg)](https://docs.rs/swarmvector-metrics)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Rust](https://img.shields.io/badge/rust-1.77%2B-orange.svg)](https://www.rust-lang.org)

**Prometheus-compatible metrics collection for Swarmvector vector databases.**

`swarmvector-metrics` provides comprehensive observability with counters, gauges, histograms, and exporters for monitoring Swarmvector performance and health. Part of the [Swarmvector](the upstream project (see NOTICE)) ecosystem.

## Why Swarmvector Metrics?

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

Add `swarmvector-metrics` to your `Cargo.toml`:

```toml
[dependencies]
swarmvector-metrics = "0.1.1"
```

## Quick Start

### Initialize Metrics

```rust
use swarmvector_metrics::{Metrics, MetricsConfig};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize metrics with default config
    let metrics = Metrics::new(MetricsConfig::default())?;

    // Or with custom config
    let config = MetricsConfig {
        namespace: "swarmvector".to_string(),
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
use swarmvector_metrics::Metrics;

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
use swarmvector_metrics::Metrics;

// Get Prometheus format
let prometheus_output = metrics.export_prometheus()?;
println!("{}", prometheus_output);

// Get JSON format
let json_output = metrics.export_json()?;
println!("{}", json_output);
```

### HTTP Endpoint

```rust
use swarmvector_metrics::{Metrics, MetricsServer};

// Start metrics server on /metrics endpoint
let server = MetricsServer::new(metrics, 9090)?;
server.start().await?;

// Access at http://localhost:9090/metrics
```

## Available Metrics

```
# Counters
swarmvector_inserts_total            # Total insert operations
swarmvector_searches_total           # Total search operations
swarmvector_deletes_total            # Total delete operations
swarmvector_errors_total             # Total errors by type

# Histograms
swarmvector_insert_latency_seconds   # Insert latency
swarmvector_search_latency_seconds   # Search latency
swarmvector_delete_latency_seconds   # Delete latency

# Gauges
swarmvector_vector_count             # Current vector count
swarmvector_memory_bytes             # Memory usage
swarmvector_index_size_bytes         # Index size
swarmvector_collection_count         # Number of collections

# Index metrics
swarmvector_hnsw_levels              # HNSW graph levels
swarmvector_hnsw_nodes               # HNSW node count
swarmvector_hnsw_ef_construction     # EF construction parameter
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
rate(swarmvector_searches_total[5m])

# p99 latency
histogram_quantile(0.99, rate(swarmvector_search_latency_seconds_bucket[5m]))

# Memory usage
swarmvector_memory_bytes / 1024 / 1024  # MB

# Error rate
rate(swarmvector_errors_total[5m]) / rate(swarmvector_searches_total[5m])
```

## Related Crates

- **[swarmvector-core](../swarmvector-core/)** - Core vector database engine
- **[swarmvector-server](../swarmvector-server/)** - REST API server

## Documentation

- **[Main README](../../README.md)** - Complete project overview
- **[API Documentation](https://docs.rs/swarmvector-metrics)** - Full API reference
- **[GitHub Repository](the upstream project (see NOTICE))** - Source code

## License

**MIT License** - see [LICENSE](../../LICENSE) for details.

---

<div align="center">

**Part of [Swarmvector](the upstream project (see NOTICE)) - Built by [the upstream author](https://swarmdo.com)**

[![Star on GitHub](https://img.shields.io/github/stars/upstream/swarmvector?style=social)](the upstream project (see NOTICE))

[Documentation](https://docs.rs/swarmvector-metrics) | [Crates.io](https://crates.io/crates/swarmvector-metrics) | [GitHub](the upstream project (see NOTICE))

</div>
