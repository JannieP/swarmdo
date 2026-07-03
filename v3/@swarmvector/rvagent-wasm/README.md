# rvagent-wasm

WASM bindings for rvAgent — run AI agents entirely in the browser or Node.js.

## Features

- **WasmAgent** — Full agent execution in browser/Node.js with conversation history
- **WasmMcpServer** — MCP JSON-RPC server running in the browser (no backend required)
- **Virtual Filesystem** — In-memory file operations for sandboxed execution
- **Gallery System** — Built-in agent templates with RVF container export
- **Zero Dependencies** — Runs entirely client-side via WebAssembly

## Installation

```bash
# Build from source
cd crates/rvAgent/rvagent-wasm
wasm-pack build --target web

# Or use the pre-built package
npm install rvagent-wasm  # (Not yet published)
```

## Usage

### WasmAgent

```javascript
import init, { WasmAgent } from 'rvagent-wasm';

await init();

// Create an agent
const agent = new WasmAgent(JSON.stringify({
  model: "anthropic:claude-sonnet-4-20250514",
  name: "my-agent",
  instructions: "You are a helpful coding assistant.",
  max_turns: 50
}));

// Connect a model provider (calls your LLM API)
agent.set_model_provider(async (messagesJson) => {
  const messages = JSON.parse(messagesJson);
  const response = await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ messages })
  });
  return (await response.json()).content;
});

// Send a prompt
const result = await agent.prompt("Write a hello world function");
console.log(result.response);

// Execute tools directly
agent.execute_tool('{"tool": "write_file", "path": "hello.js", "content": "console.log(\"Hello!\");"}');

// Check state
console.log(agent.turn_count());      // 1
console.log(agent.file_count());      // 1
console.log(agent.get_todos());       // []
```

### WasmMcpServer

Run an MCP server entirely in the browser:

```javascript
import init, { WasmMcpServer } from 'rvagent-wasm';

await init();

const mcp = new WasmMcpServer("rvagent-wasm");

// Handle MCP JSON-RPC requests
const response = mcp.handle_request(JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {}
}));

// List available tools
const tools = mcp.list_tools();

// Call a tool
const result = mcp.call_tool("write_file", JSON.stringify({
  path: "demo.txt",
  content: "Hello from WASM!"
}));
```

### Gallery System

Access built-in agent templates:

```javascript
// List all templates
const templates = mcp.handle_request(JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "gallery/list",
  params: {}
}));

// Search templates
const searchResults = mcp.handle_request(JSON.stringify({
  jsonrpc: "2.0",
  id: 2,
  method: "gallery/search",
  params: { query: "coding assistant" }
}));

// Load a template
const loaded = mcp.handle_request(JSON.stringify({
  jsonrpc: "2.0",
  id: 3,
  method: "gallery/load",
  params: { id: "claude-code" }
}));
```

## Available Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file from virtual filesystem |
| `write_file` | Write file to virtual filesystem |
| `edit_file` | Apply string replacement to a file |
| `list_files` | List all files in virtual filesystem |
| `write_todos` | Manage todo list |

**Note:** OS-level tools (`execute`, `glob`, `grep`) are intentionally omitted as they require system access unavailable in the browser sandbox.

## MCP Methods

| Method | Description |
|--------|-------------|
| `initialize` | Initialize MCP connection |
| `ping` | Health check |
| `tools/list` | List available tools |
| `tools/call` | Execute a tool |
| `resources/list` | List virtual filesystem as resources |
| `prompts/list` | List prompts from active template |
| `gallery/list` | List all agent templates |
| `gallery/search` | Search templates by query |
| `gallery/get` | Get template details |
| `gallery/load` | Load template as active config |
| `gallery/configure` | Apply config overrides |
| `gallery/categories` | List template categories |

## API Reference

### WasmAgent

| Method | Description |
|--------|-------------|
| `new(configJson)` | Create agent from JSON config |
| `set_model_provider(callback)` | Set JS callback for LLM calls |
| `prompt(input)` | Send prompt, get response (async) |
| `execute_tool(toolJson)` | Execute a tool directly |
| `get_state()` | Get conversation state as JSON |
| `get_todos()` | Get todo list as JSON |
| `get_tools()` | Get available tools |
| `reset()` | Clear state and start fresh |
| `version()` | Get crate version |
| `name()` | Get agent name |
| `model()` | Get model identifier |
| `turn_count()` | Get current turn count |
| `is_stopped()` | Check if agent is stopped |
| `file_count()` | Get virtual filesystem file count |

### WasmMcpServer

| Method | Description |
|--------|-------------|
| `new(name)` | Create MCP server |
| `handle_request(json)` | Handle JSON-RPC request |
| `list_tools()` | Get available tools as JSON |
| `call_tool(name, paramsJson)` | Call tool by name |
| `gallery()` | Get gallery info |
| `is_initialized()` | Check initialization status |
| `name()` | Get server name |
| `version()` | Get server version |

## Building

```bash
# Install wasm-pack
cargo install wasm-pack

# Build for web
wasm-pack build --target web

# Build for Node.js
wasm-pack build --target nodejs

# Run tests
cargo test
wasm-pack test --headless --chrome
```

## Security

- Request size limit: 100 KB
- Path length limit: 256 characters
- Content length limit: 1 MB
- Path traversal (`..`) blocked
- Todo count limit: 1000 items

## Architecture

```
rvagent-wasm/
├── src/
│   ├── lib.rs        # WasmAgent — main agent type
│   ├── backends.rs   # WasmStateBackend — virtual filesystem
│   ├── bridge.rs     # JsModelProvider — JS interop
│   ├── gallery.rs    # WasmGallery — template system
│   ├── mcp.rs        # WasmMcpServer — MCP protocol
│   ├── rvf.rs        # RVF container support
│   └── tools.rs      # Tool definitions and executor
└── pkg/              # Built WASM package
    ├── rvagent_wasm.js
    ├── rvagent_wasm.d.ts
    └── rvagent_wasm_bg.wasm
```

## Related Crates

| Crate | Description |
|-------|-------------|
| `rvagent-core` | Agent state, graph, config |
| `rvagent-backends` | Backend protocol + implementations |
| `rvagent-tools` | Full tool implementations |
| `rvagent-mcp` | Native MCP client/server |
| `rvagent-cli` | Terminal UI |

## License

MIT OR Apache-2.0
