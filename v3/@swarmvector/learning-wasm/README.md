# @swarmvector/learning-wasm

Ultra-fast MicroLoRA adaptation for WebAssembly - rank-2 LoRA with <100us latency for per-operator learning.

## Features

- **MicroLoRA**: Lightweight Low-Rank Adaptation for neural networks
- **Sub-100us Latency**: Optimized for real-time adaptation
- **Rank-2 LoRA**: Minimal memory footprint with effective learning
- **WASM Optimized**: Built with Rust for maximum performance in browsers and Node.js

## Installation

```bash
npm install @swarmvector/learning-wasm
```

## Usage

```javascript
import init, { MicroLoraAdapter } from '@swarmvector/learning-wasm';

await init();

// Create a MicroLoRA adapter
const adapter = new MicroLoraAdapter(inputDim, outputDim, rank);

// Apply adaptation
const result = adapter.forward(input);

// Update weights based on feedback
adapter.update(gradient, learningRate);
```

## Performance

- Adaptation latency: <100 microseconds
- Memory overhead: Minimal (rank-2 matrices only)
- Browser compatible: Works in all modern browsers
- Node.js compatible: Full support for server-side usage

## License

MIT OR Apache-2.0

## Links

- [GitHub Repository](the upstream project (see NOTICE))
- [Documentation](https://swarmdo.com)
