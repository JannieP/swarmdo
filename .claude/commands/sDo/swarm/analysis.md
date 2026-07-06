# Analysis Swarm Strategy

## Purpose
Comprehensive analysis through distributed agent coordination.

## Activation

### Using MCP Tools
```javascript
// Initialize analysis swarm
mcp__swarmdo__swarm_init({
  "topology": "mesh",
  "maxAgents": 6,
  "strategy": "adaptive"
})

// Orchestrate analysis task
mcp__swarmdo__task_orchestrate({
  "task": "analyze system performance",
  "strategy": "parallel",
  "priority": "medium"
})
```

### Using CLI (Fallback)
`npx swarmdo swarm "analyze system performance" --strategy analysis`

## Agent Roles

### Agent Spawning with MCP
```javascript
// Spawn analysis agents
mcp__swarmdo__agent_spawn({
  "type": "analyst",
  "name": "Data Collector",
  "capabilities": ["metrics", "logging", "monitoring"]
})

mcp__swarmdo__agent_spawn({
  "type": "analyst",
  "name": "Pattern Analyzer",
  "capabilities": ["pattern-recognition", "anomaly-detection"]
})

mcp__swarmdo__agent_spawn({
  "type": "documenter",
  "name": "Report Generator",
  "capabilities": ["reporting", "visualization"]
})

mcp__swarmdo__agent_spawn({
  "type": "coordinator",
  "name": "Insight Synthesizer",
  "capabilities": ["synthesis", "correlation"]
})
```

## Coordination Modes
- Mesh: For exploratory analysis
- Pipeline: For sequential processing
- Hierarchical: For complex systems

## Analysis Operations
```javascript
// Run performance analysis
mcp__swarmdo__performance_report({
  "format": "detailed",
  "timeframe": "24h"
})

// Identify bottlenecks
mcp__swarmdo__bottleneck_analyze({
  "component": "api",
  "metrics": ["response-time", "throughput"]
})

// Pattern recognition
mcp__swarmdo__pattern_recognize({
  "data": performanceData,
  "patterns": ["anomaly", "trend", "cycle"]
})
```

## Status Monitoring
```javascript
// Monitor analysis progress
mcp__swarmdo__task_status({
  "taskId": "analysis-task-001"
})

// Get analysis results
mcp__swarmdo__task_results({
  "taskId": "analysis-task-001"
})
```
