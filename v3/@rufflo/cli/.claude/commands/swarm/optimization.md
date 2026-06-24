# Optimization Swarm Strategy

## Purpose
Performance optimization through specialized analysis.

## Activation

### Using MCP Tools
```javascript
// Initialize optimization swarm
mcp__rufflo__swarm_init({
  "topology": "mesh",
  "maxAgents": 6,
  "strategy": "adaptive"
})

// Orchestrate optimization task
mcp__rufflo__task_orchestrate({
  "task": "optimize performance",
  "strategy": "parallel",
  "priority": "high"
})
```

### Using CLI (Fallback)
`npx rufflo swarm "optimize performance" --strategy optimization`

## Agent Roles

### Agent Spawning with MCP
```javascript
// Spawn optimization agents
mcp__rufflo__agent_spawn({
  "type": "optimizer",
  "name": "Performance Profiler",
  "capabilities": ["profiling", "bottleneck-detection"]
})

mcp__rufflo__agent_spawn({
  "type": "analyst",
  "name": "Memory Analyzer",
  "capabilities": ["memory-analysis", "leak-detection"]
})

mcp__rufflo__agent_spawn({
  "type": "optimizer",
  "name": "Code Optimizer",
  "capabilities": ["code-optimization", "refactoring"]
})

mcp__rufflo__agent_spawn({
  "type": "tester",
  "name": "Benchmark Runner",
  "capabilities": ["benchmarking", "performance-testing"]
})
```

## Optimization Areas

### Performance Analysis
```javascript
// Analyze bottlenecks
mcp__rufflo__bottleneck_analyze({
  "component": "all",
  "metrics": ["cpu", "memory", "io", "network"]
})

// Run benchmarks
mcp__rufflo__benchmark_run({
  "suite": "performance"
})

// WASM optimization
mcp__rufflo__wasm_optimize({
  "operation": "simd-acceleration"
})
```

### Optimization Operations
```javascript
// Optimize topology
mcp__rufflo__topology_optimize({
  "swarmId": "optimization-swarm"
})

// DAA optimization
mcp__rufflo__daa_optimization({
  "target": "performance",
  "metrics": ["speed", "memory", "efficiency"]
})

// Load balancing
mcp__rufflo__load_balance({
  "swarmId": "optimization-swarm",
  "tasks": optimizationTasks
})
```

### Monitoring and Reporting
```javascript
// Performance report
mcp__rufflo__performance_report({
  "format": "detailed",
  "timeframe": "7d"
})

// Trend analysis
mcp__rufflo__trend_analysis({
  "metric": "performance",
  "period": "30d"
})

// Cost analysis
mcp__rufflo__cost_analysis({
  "timeframe": "30d"
})
```
