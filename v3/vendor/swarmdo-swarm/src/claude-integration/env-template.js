/**
 * Environment variable template for swarmdo-swarm projects
 */

const envTemplate = `# swarmdo-swarm Configuration
NODE_ENV=development

# Git Integration
SWARMDO_SWARM_AUTO_COMMIT=true
SWARMDO_SWARM_AUTO_PUSH=false
SWARMDO_SWARM_COMMIT_PREFIX=feat
SWARMDO_SWARM_GIT_AUTHOR=swarmdo-swarm

# Agent Reports
SWARMDO_SWARM_GENERATE_REPORTS=true
SWARMDO_SWARM_REPORT_DIR=.swarmdo-swarm/agent-reports

# Memory & Learning
SWARMDO_SWARM_MEMORY_PERSIST=true
SWARMDO_SWARM_NEURAL_LEARNING=true

# Performance Tracking
SWARMDO_SWARM_PERFORMANCE_TRACKING=true
SWARMDO_SWARM_TELEMETRY_ENABLED=true

# Hook Configuration
SWARMDO_SWARM_HOOKS_ENABLED=true
SWARMDO_SWARM_HOOK_DEBUG=false

# Coordination
SWARMDO_SWARM_COORDINATION_MODE=adaptive
SWARMDO_SWARM_AUTO_INIT=true

# Remote Execution
SWARMDO_SWARM_REMOTE_EXECUTION=true
SWARMDO_SWARM_REMOTE_READY=true
`;

module.exports = { envTemplate };