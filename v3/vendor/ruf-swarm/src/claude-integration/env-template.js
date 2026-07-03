/**
 * Environment variable template for ruf-swarm projects
 */

const envTemplate = `# ruf-swarm Configuration
NODE_ENV=development

# Git Integration
RUF_SWARM_AUTO_COMMIT=true
RUF_SWARM_AUTO_PUSH=false
RUF_SWARM_COMMIT_PREFIX=feat
RUF_SWARM_GIT_AUTHOR=ruf-swarm

# Agent Reports
RUF_SWARM_GENERATE_REPORTS=true
RUF_SWARM_REPORT_DIR=.ruf-swarm/agent-reports

# Memory & Learning
RUF_SWARM_MEMORY_PERSIST=true
RUF_SWARM_NEURAL_LEARNING=true

# Performance Tracking
RUF_SWARM_PERFORMANCE_TRACKING=true
RUF_SWARM_TELEMETRY_ENABLED=true

# Hook Configuration
RUF_SWARM_HOOKS_ENABLED=true
RUF_SWARM_HOOK_DEBUG=false

# Coordination
RUF_SWARM_COORDINATION_MODE=adaptive
RUF_SWARM_AUTO_INIT=true

# Remote Execution
RUF_SWARM_REMOTE_EXECUTION=true
RUF_SWARM_REMOTE_READY=true
`;

module.exports = { envTemplate };