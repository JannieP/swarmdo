# Examples Swarm Strategy

## Common Swarm Patterns

### Research Swarm

#### Using MCP Tools
```javascript
// Initialize research swarm
mcp__swarmdo__swarm_init({
  "topology": "mesh",
  "maxAgents": 6,
  "strategy": "adaptive"
})

// Spawn research agents
mcp__swarmdo__agent_spawn({
  "type": "researcher",
  "name": "AI Trends Researcher",
  "capabilities": ["web-search", "analysis", "synthesis"]
})

// Orchestrate research
mcp__swarmdo__coordination_orchestrate({
  "task": "research AI trends",
  "strategy": "parallel",
  "priority": "medium"
})

// Monitor progress
mcp__swarmdo__swarm_status({
  "swarmId": "research-swarm"
})
```

#### Using CLI (Fallback)
```bash
npx swarmdo swarm "research AI trends" \
  --strategy research \
  --mode distributed \
  --max-agents 6 \
  --parallel
```

### Development Swarm

#### Using MCP Tools
```javascript
// Initialize development swarm
mcp__swarmdo__swarm_init({
  "topology": "hierarchical",
  "maxAgents": 8,
  "strategy": "balanced"
})

// Spawn development team
const devAgents = [
  { type: "architect", name: "API Designer" },
  { type: "coder", name: "Backend Developer" },
  { type: "tester", name: "API Tester" },
  { type: "documenter", name: "API Documenter" }
]

devAgents.forEach(agent => {
  mcp__swarmdo__agent_spawn({
    "type": agent.type,
    "name": agent.name,
    "swarmId": "dev-swarm"
  })
})

// Orchestrate development
mcp__swarmdo__coordination_orchestrate({
  "task": "build REST API",
  "strategy": "sequential",
  "dependencies": ["design", "implement", "test", "document"]
})

// Enable monitoring
mcp__swarmdo__swarm_status({
  "swarmId": "dev-swarm",
  "interval": 5000
})
```

#### Using CLI (Fallback)
```bash
npx swarmdo swarm "build REST API" \
  --strategy development \
  --mode hierarchical \
  --monitor \
  --output sqlite
```

### Analysis Swarm

#### Using MCP Tools
```javascript
// Initialize analysis swarm
mcp__swarmdo__swarm_init({
  "topology": "mesh",
  "maxAgents": 5,
  "strategy": "adaptive"
})

// Spawn analysis agents
mcp__swarmdo__agent_spawn({
  "type": "analyst",
  "name": "Code Analyzer",
  "capabilities": ["static-analysis", "complexity-analysis"]
})

mcp__swarmdo__agent_spawn({
  "type": "analyst",
  "name": "Security Analyzer",
  "capabilities": ["security-scan", "vulnerability-detection"]
})

// Parallel analysis execution
mcp__swarmdo__coordination_orchestrate({
  "tasks": [
    { "id": "analyze-code", "command": "analyze codebase structure" },
    { "id": "analyze-security", "command": "scan for vulnerabilities" },
    { "id": "analyze-performance", "command": "identify bottlenecks" }
  ]
})

// Generate comprehensive report
mcp__swarmdo__performance_report({
  "format": "detailed",
  "timeframe": "current"
})
```

#### Using CLI (Fallback)
```bash
npx swarmdo swarm "analyze codebase" \
  --strategy analysis \
  --mode mesh \
  --parallel \
  --timeout 300
```

## Error Handling Examples

```javascript
// Setup fault tolerance
mcp__swarmdo__coordination_consensus({
  "agentId": "all",
  "strategy": "auto-recovery"
})

// Handle errors gracefully
try {
  await mcp__swarmdo__coordination_orchestrate({
    "task": "complex operation",
    "strategy": "parallel"
  })
} catch (error) {
  // Check swarm health
  const status = await mcp__swarmdo__swarm_status({})
  
  // Log error patterns
  await mcp__swarmdo__error_analysis({
    "logs": [error.message]
  })
}
```
