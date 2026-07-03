# 🚀 SwarmLLM v2.0 - High-Performance LLM Inference for Apple Silicon

[![Crates.io](https://img.shields.io/crates/v/swarmllm.svg)](https://crates.io/crates/swarmllm)
[![npm](https://img.shields.io/npm/v/@aspect/swarmllm.svg)](https://www.npmjs.com/package/@aspect/swarmllm)
[![Documentation](https://img.shields.io/badge/docs-swarmdo.com-blue)](https://swarmdo.com)
[![License](https://img.shields.io/badge/license-MIT%2FApache--2.0-green)](LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/aspect/swarmvector/ci.yml?branch=main)](https://github.com/aspect/swarmvector/actions)
[![Discord](https://img.shields.io/discord/1234567890?logo=discord&label=discord)](https://discord.gg/ruv)

<p align="center">
  <img src="https://swarmdo.com" alt="SwarmLLM" width="200"/>
  <br/>
  <strong>Run Large Language Models locally on your Mac with maximum performance</strong>
  <br/>
  <a href="https://swarmdo.com">Website</a> •
  <a href="https://swarmdo.com">Documentation</a> •
  <a href="https://discord.gg/ruv">Discord</a> •
  <a href="https://twitter.com/raboruv">Twitter</a>
</p>

---

## What is SwarmLLM?

**SwarmLLM** is a blazing-fast LLM inference engine built in Rust, specifically optimized for Apple Silicon Macs (M1/M2/M3/M4). It lets you run AI models like Llama, Mistral, Phi, and Gemma directly on your laptop — no cloud, no API costs, complete privacy.

### Why SwarmLLM?

- **🔥 Fast** — 40+ tokens/second on M4 Pro with optimized Metal shaders
- **🍎 Apple Silicon Native** — Uses Metal GPU, Apple Neural Engine (ANE), and ARM NEON
- **🔒 Private** — Everything runs locally, your data never leaves your device
- **📦 Easy** — One command to install, one line to run
- **🌐 Cross-Platform** — Works in Rust, Node.js, and browsers via WebAssembly

---

## ✨ Key Features

### Core Capabilities

| Feature | Description |
|---------|-------------|
| **Multi-Backend Support** | Metal GPU, Core ML (ANE), CPU with NEON SIMD |
| **Quantization** | Q4, Q5, Q8 quantized models (4-8x memory savings) |
| **GGUF Support** | Load models directly from Hugging Face in GGUF format |
| **Streaming** | Real-time token-by-token generation |
| **Continuous Batching** | Efficient multi-request handling |
| **KV Cache** | Optimized key-value cache with paged attention |
| **Speculative Decoding** | 1.5-2x speedup with draft models |

### v2.0 New Features

| Feature | Improvement |
|---------|-------------|
| **Apple Neural Engine** | 38 TOPS dedicated ML acceleration on M4 Pro |
| **Hybrid GPU+ANE Pipeline** | Best of both worlds for optimal throughput |
| **Flash Attention v2** | 2.5-7.5x faster attention computation |
| **SONA Learning** | Self-optimizing neural architecture for adaptive inference |
| **Swarmvector Integration** | Built-in vector embeddings for RAG applications |

---

## 🚀 Quickstart

### Rust (Cargo)

```bash
# Add to Cargo.toml
cargo add swarmllm --features inference-metal
```

```rust
use swarmllm::{Engine, GenerateParams};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load a model (downloads automatically from Hugging Face)
    let engine = Engine::from_pretrained("microsoft/Phi-3-mini-4k-instruct-gguf")?;

    // Generate text
    let response = engine.generate(
        "Explain quantum computing in simple terms:",
        GenerateParams::default()
    )?;

    println!("{}", response);
    Ok(())
}
```

### Node.js (npm)

```bash
npm install @aspect/swarmllm
```

```javascript
import { SwarmLLM } from '@aspect/swarmllm';

// Initialize with a model
const llm = await SwarmLLM.fromPretrained('microsoft/Phi-3-mini-4k-instruct-gguf');

// Generate text
const response = await llm.generate('Explain quantum computing in simple terms:');
console.log(response);

// Or stream tokens
for await (const token of llm.stream('Write a haiku about coding:')) {
    process.stdout.write(token);
}
```

### CLI

```bash
# Install CLI
cargo install swarmllm-cli

# Run interactively
swarmllm chat --model microsoft/Phi-3-mini-4k-instruct-gguf

# One-shot generation
swarmllm generate "What is the meaning of life?" --model phi-3
```

---

<details>
<summary><h2>📚 Tutorials</h2></summary>

### Tutorial 1: Building a Local Chatbot

Create a simple chatbot that runs entirely on your Mac:

```rust
use swarmllm::{Engine, GenerateParams, ChatMessage};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let engine = Engine::from_pretrained("meta-llama/Llama-3.2-1B-Instruct-GGUF")?;

    let mut history = vec![];

    loop {
        print!("You: ");
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;

        history.push(ChatMessage::user(&input));

        let response = engine.chat(&history, GenerateParams {
            max_tokens: 512,
            temperature: 0.7,
            ..Default::default()
        })?;

        println!("AI: {}", response);
        history.push(ChatMessage::assistant(&response));
    }
}
```

### Tutorial 2: Streaming Responses in Node.js

Build a real-time streaming API:

```javascript
import { SwarmLLM } from '@aspect/swarmllm';
import express from 'express';

const app = express();
const llm = await SwarmLLM.fromPretrained('phi-3-mini');

app.get('/stream', async (req, res) => {
    const prompt = req.query.prompt;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');

    for await (const token of llm.stream(prompt)) {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
});

app.listen(3000);
```

### Tutorial 3: RAG with Swarmvector

Combine SwarmLLM with Swarmvector for retrieval-augmented generation:

```rust
use swarmllm::Engine;
use swarmvector_core::{VectorDb, HnswConfig};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize vector database
    let db = VectorDb::new(HnswConfig::default())?;

    // Initialize LLM
    let llm = Engine::from_pretrained("phi-3-mini")?;

    // Add documents (embeddings generated automatically)
    db.add_document("doc1", "SwarmLLM is a fast LLM inference engine.")?;
    db.add_document("doc2", "It supports Metal GPU acceleration.")?;

    // Query and generate
    let query = "What is SwarmLLM?";
    let context = db.search(query, 3)?;

    let prompt = format!(
        "Context:\n{}\n\nQuestion: {}\nAnswer:",
        context.iter().map(|d| d.text.as_str()).collect::<Vec<_>>().join("\n"),
        query
    );

    let response = llm.generate(&prompt, Default::default())?;
    println!("{}", response);
    Ok(())
}
```

### Tutorial 4: Browser-Based Inference (WebAssembly)

Run models directly in the browser:

```html
<!DOCTYPE html>
<html>
<head>
    <script type="module">
        import init, { SwarmLLM } from 'https://unpkg.com/@aspect/swarmllm-wasm/swarmllm.js';

        async function main() {
            await init();

            const llm = await SwarmLLM.fromUrl('/models/phi-3-mini-q4.gguf');

            const output = document.getElementById('output');

            for await (const token of llm.stream('Write a poem about the web:')) {
                output.textContent += token;
            }
        }

        main();
    </script>
</head>
<body>
    <pre id="output"></pre>
</body>
</html>
```

</details>

---

<details>
<summary><h2>🔧 Advanced Usage</h2></summary>

### Custom Model Configuration

Fine-tune model loading for your specific hardware:

```rust
use swarmllm::{Engine, ModelConfig, ComputeBackend, Quantization};

let engine = Engine::builder()
    .model_path("/path/to/model.gguf")
    .backend(ComputeBackend::Metal)          // Use Metal GPU
    .quantization(Quantization::Q4K)          // 4-bit quantization
    .context_length(8192)                     // Max context
    .num_gpu_layers(32)                       // Layers on GPU
    .use_flash_attention(true)                // Enable Flash Attention
    .build()?;
```

### Apple Neural Engine (ANE) Configuration

Leverage the dedicated ML accelerator on Apple Silicon:

```rust
use swarmllm::{Engine, CoreMLBackend, ComputeUnits};

// Create Core ML backend with ANE
let backend = CoreMLBackend::new()?
    .with_compute_units(ComputeUnits::CpuAndNeuralEngine)  // Use ANE
    .with_tokenizer(tokenizer);

// Load Core ML model
backend.load_model("model.mlmodelc", ModelConfig::default())?;

// Generate (uses ANE for MLP, GPU for attention)
let response = backend.generate("Hello", GenerateParams::default())?;
```

### Hybrid GPU + ANE Pipeline

Maximize throughput with intelligent workload distribution:

```rust
use swarmllm::kernels::{should_use_ane_matmul, get_ane_recommendation};

// Check if ANE is beneficial for your matrix size
let recommendation = get_ane_recommendation(batch_size, hidden_dim, vocab_size);

if recommendation.use_ane {
    println!("Using ANE: {} (confidence: {:.0}%)",
             recommendation.reason,
             recommendation.confidence * 100.0);
}
```

### Continuous Batching Server

Build a high-throughput inference server:

```rust
use swarmllm::serving::{
    ContinuousBatchScheduler, KvCacheManager, InferenceRequest, SchedulerConfig
};

let config = SchedulerConfig {
    max_batch_size: 32,
    max_tokens_per_batch: 4096,
    preemption_mode: PreemptionMode::Swap,
    ..Default::default()
};

let mut scheduler = ContinuousBatchScheduler::new(config);
let mut kv_cache = KvCacheManager::new(KvCachePoolConfig::default());

// Add requests
scheduler.add_request(InferenceRequest::new(tokens, params));

// Process batches
while let Some(batch) = scheduler.schedule() {
    // Execute batch inference
    let outputs = engine.forward_batch(&batch)?;

    // Update scheduler with results
    scheduler.update(outputs);
}
```

### Speculative Decoding

Speed up generation with draft models:

```rust
use swarmllm::speculative::{SpeculativeDecoder, SpeculativeConfig};

let config = SpeculativeConfig {
    draft_model: "phi-3-mini-draft",    // Small, fast model
    target_model: "phi-3-medium",        // Large, accurate model
    num_speculative_tokens: 4,           // Tokens to speculate
    temperature: 0.8,
};

let decoder = SpeculativeDecoder::new(config)?;

// 1.5-2x faster than standard decoding
let response = decoder.generate("Explain relativity:", params)?;
```

### Custom Tokenizer

Use custom tokenizers for specialized models:

```rust
use swarmllm::tokenizer::{SwarmTokenizer, TokenizerConfig};

// Load from HuggingFace
let tokenizer = SwarmTokenizer::from_pretrained("meta-llama/Llama-3.2-1B")?;

// Or from local file
let tokenizer = SwarmTokenizer::from_file("./tokenizer.json")?;

// Encode/decode
let tokens = tokenizer.encode("Hello, world!")?;
let text = tokenizer.decode(&tokens)?;

// With chat template
let formatted = tokenizer.apply_chat_template(&[
    ChatMessage::system("You are a helpful assistant."),
    ChatMessage::user("What is 2+2?"),
])?;
```

### Memory Optimization

Optimize for large models on limited memory:

```rust
use swarmllm::{Engine, MemoryConfig};

let engine = Engine::builder()
    .model_path("llama-70b.gguf")
    .memory_config(MemoryConfig {
        max_memory_gb: 24.0,           // Limit memory usage
        offload_to_cpu: true,          // Offload layers to CPU
        use_mmap: true,                // Memory-map model file
        kv_cache_dtype: DType::F16,    // Half-precision KV cache
    })
    .build()?;
```

### Embeddings for RAG

Generate embeddings for retrieval applications:

```rust
use swarmllm::Engine;

let engine = Engine::from_pretrained("nomic-embed-text-v1.5")?;

// Single embedding
let embedding = engine.embed("What is machine learning?")?;

// Batch embeddings
let embeddings = engine.embed_batch(&[
    "Document 1 content",
    "Document 2 content",
    "Document 3 content",
])?;

// Cosine similarity
let similarity = swarmvector_core::cosine_similarity(&embedding, &embeddings[0]);
```

### Node.js Advanced Configuration

```javascript
import { SwarmLLM, ModelConfig, ComputeBackend } from '@aspect/swarmllm';

const llm = await SwarmLLM.create({
    modelPath: './models/phi-3-mini-q4.gguf',
    backend: ComputeBackend.Metal,
    contextLength: 8192,
    numGpuLayers: 32,
    flashAttention: true,

    // Callbacks
    onToken: (token) => process.stdout.write(token),
    onProgress: (progress) => console.log(`Loading: ${progress}%`),
});

// Structured output (JSON mode)
const result = await llm.generate('List 3 colors', {
    responseFormat: 'json',
    schema: {
        type: 'object',
        properties: {
            colors: { type: 'array', items: { type: 'string' } }
        }
    }
});

console.log(JSON.parse(result)); // { colors: ['red', 'blue', 'green'] }
```

</details>

---

## 📊 Performance Benchmarks

Tested on M4 Pro (14-core CPU, 20-core GPU, 38 TOPS ANE):

### Model Inference Speed

| Model | Size | Quantization | Tokens/sec | Memory |
|-------|------|--------------|------------|--------|
| Phi-3 Mini | 3.8B | Q4_K_M | 52 t/s | 2.4 GB |
| Llama 3.2 | 1B | Q4_K_M | 78 t/s | 0.8 GB |
| Llama 3.2 | 3B | Q4_K_M | 45 t/s | 2.1 GB |
| Mistral 7B | 7B | Q4_K_M | 28 t/s | 4.2 GB |
| Gemma 2 | 9B | Q4_K_M | 22 t/s | 5.8 GB |

### 🔥 ANE vs NEON Matrix Multiply (NEW in v2.0)

| Dimension | ANE | NEON | Speedup |
|-----------|-----|------|---------|
| 768×768 | 400 µs | 104 ms | **261x** |
| 1024×1024 | 1.2 ms | 283 ms | **243x** |
| 1536×1536 | 3.4 ms | 1,028 ms | **306x** |
| 2048×2048 | 8.5 ms | 4,020 ms | **473x** |
| 3072×3072 | 28.2 ms | 15,240 ms | **541x** |
| 4096×4096 | 66.1 ms | 65,428 ms | **989x** |

### Hybrid Pipeline Performance

| Mode | seq=128 | seq=512 | vs NEON |
|------|---------|---------|---------|
| **Pure ANE** | 35.9 ms | 112.9 ms | **460x faster** |
| Hybrid | 862 ms | 3,195 ms | 19x faster |
| Pure NEON | 16,529 ms | 66,539 ms | baseline |

### Activation Functions (SiLU/GELU)

| Size | NEON | ANE | Winner |
|------|------|-----|--------|
| 32×4096 | 70 µs | 152 µs | NEON 2.2x |
| 64×4096 | 141 µs | 303 µs | NEON 2.1x |
| 128×4096 | 284 µs | 613 µs | NEON 2.2x |

**Auto-dispatch** correctly routes: ANE for matmul ≥768 dims, NEON for activations.

### Quantization Performance

| Dimension | Encode | Hamming Distance |
|-----------|--------|------------------|
| 128-dim | 0.1 µs | <0.1 µs |
| 384-dim | 0.3 µs | <0.1 µs |
| 768-dim | 0.5 µs | <0.1 µs |
| 1536-dim | 1.0 µs | <0.1 µs |

*Benchmarks run with Criterion.rs, 50 samples per test, M4 Pro 48GB.*

---

## 🔌 Supported Models

SwarmLLM supports any model in GGUF format. Popular options:

- **Llama 3.2** (1B, 3B) — Meta's latest efficient models
- **Phi-3** (Mini, Small, Medium) — Microsoft's powerful small models
- **Mistral 7B** — Excellent quality-to-size ratio
- **Gemma 2** (2B, 9B, 27B) — Google's open models
- **Qwen 2.5** (0.5B-72B) — Alibaba's multilingual models
- **DeepSeek Coder** — Specialized for code generation

Download models from [Hugging Face](https://huggingface.co/models?library=gguf).

---

## 🛠️ Installation

### Rust

```toml
[dependencies]
swarmllm = { version = "2.0", features = ["inference-metal"] }

# Or with all features
swarmllm = { version = "2.0", features = ["inference-metal", "coreml", "speculative"] }
```

Available features:
- `inference-metal` — Metal GPU acceleration (recommended for Mac)
- `inference-cuda` — CUDA acceleration (for NVIDIA GPUs)
- `coreml` — Apple Neural Engine via Core ML
- `speculative` — Speculative decoding support
- `async-runtime` — Async/await support with Tokio

### Node.js

```bash
npm install @aspect/swarmllm
# or
yarn add @aspect/swarmllm
# or
pnpm add @aspect/swarmllm
```

### From Source

```bash
git clone https://github.com/aspect/swarmvector
cd swarmvector/crates/swarmllm
cargo build --release --features inference-metal
```

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- 🐛 [Report bugs](https://github.com/aspect/swarmvector/issues/new?template=bug_report.md)
- 💡 [Request features](https://github.com/aspect/swarmvector/issues/new?template=feature_request.md)
- 📖 [Improve docs](https://github.com/aspect/swarmvector/tree/main/docs)

---

## 📄 License

SwarmLLM is dual-licensed under MIT and Apache 2.0. See [LICENSE-MIT](LICENSE-MIT) and [LICENSE-APACHE](LICENSE-APACHE).

---

<p align="center">
  Made with ❤️ by <a href="https://swarmdo.com">swarmdo.com</a>
  <br/>
  <sub>Part of the <a href="https://github.com/aspect/swarmvector">Swarmvector</a> ecosystem</sub>
</p>
