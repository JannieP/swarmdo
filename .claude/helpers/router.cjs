#!/usr/bin/env node
/**
 * Swarmdo Agent Router
 * Routes tasks to optimal agents based on learned patterns
 */

const AGENT_CAPABILITIES = {
  coder: ['code-generation', 'refactoring', 'debugging', 'implementation'],
  tester: ['unit-testing', 'integration-testing', 'coverage', 'test-generation'],
  reviewer: ['code-review', 'security-audit', 'quality-check', 'best-practices'],
  researcher: ['web-search', 'documentation', 'analysis', 'summarization'],
  architect: ['system-design', 'architecture', 'patterns', 'scalability'],
  'backend-dev': ['api', 'database', 'server', 'authentication'],
  'frontend-dev': ['ui', 'react', 'css', 'components'],
  devops: ['ci-cd', 'docker', 'deployment', 'infrastructure'],
};

const TASK_PATTERNS = {
  'implement|create|build|add|write code': 'coder',
  'test|spec|coverage|unit test|integration': 'tester',
  'review|audit|check|validate|security': 'reviewer',
  'research|find|search|documentation|explore': 'researcher',
  'design|architect|structure|plan': 'architect',
  'api|endpoint|server|backend|database': 'backend-dev',
  'ui|frontend|component|react|css|style': 'frontend-dev',
  'deploy|docker|ci|cd|pipeline|infrastructure': 'devops',
};

function routeTask(task) {
  const taskLower = task.toLowerCase();

  for (const [pattern, agent] of Object.entries(TASK_PATTERNS)) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(taskLower)) {
      return {
        agent,
        confidence: 0.8,
        reason: `Matched pattern: ${pattern}`,
      };
    }
  }

  return {
    agent: 'coder',
    confidence: 0.5,
    reason: 'Default routing - no specific pattern matched',
  };
}

// Mirror of src/agent-bridge/bridge.ts classifyPrompt (kept in sync by hand —
// this hook is standalone CommonJS and can't import the ESM engine). Decides
// whether a prompt warrants spinning up a bound-agent swarm, and which roles,
// so the UserPromptSubmit hook can tell the main agent to spawn + bridge agents
// (making Swarmdo used by default instead of sitting idle).
const AGENTIC_RE = /\b(implement|build|create|add(?:ing)?|develop|refactor\w*|migrat\w*|redesign|re-?architect\w*|architect\w*|feature|integrat\w*|overhaul|rewrite|port|scaffold|end-to-end|multi-file|test suite|coverage|audit|harden\w*|vulnerab\w*|cve|fix\w*|debug\w*|optimi[sz]e|performance)\b/i;
const TRIVIAL_RE = /\b(what|why|how|explain|describe|show|list|find|search|where|which|typo|readme|comment|one-?liner|quick question|rename|bump (?:the )?version|status|help)\b/i;
const ROLE_SIGNALS = [
  { re: /\b(security|vulnerab\w*|cve|auth\w*|inject\w*|xss|ssrf)\b/i, roles: ['security-auditor', 'coder', 'reviewer'] },
  { re: /\b(refactor\w*|migrat\w*|redesign|re-?architect\w*|overhaul|rewrite)\b/i, roles: ['system-architect', 'coder', 'reviewer'] },
  { re: /\b(perf\w*|optimi[sz]e|benchmark|latency|throughput)\b/i, roles: ['perf-analyzer', 'coder', 'tester'] },
  { re: /\b(test|coverage|tdd|spec)\b/i, roles: ['tester', 'coder', 'reviewer'] },
  { re: /\b(feature|implement|build|integrat\w*|end-to-end|api)\b/i, roles: ['researcher', 'system-architect', 'coder', 'tester', 'reviewer'] },
];
function classifyAgentic(task) {
  const p = (task || '').trim();
  if (!p) return { requiresAgents: false, roles: [] };
  if (!AGENTIC_RE.test(p)) return { requiresAgents: false, roles: [] };
  if (TRIVIAL_RE.test(p) && p.length < 40) return { requiresAgents: false, roles: [] };
  let roles = ['coder'];
  for (const s of ROLE_SIGNALS) {
    if (s.re.test(p)) { roles = s.roles; break; }
  }
  return { requiresAgents: true, roles };
}

module.exports = { routeTask, classifyAgentic, AGENT_CAPABILITIES, TASK_PATTERNS };

// CLI - only run when executed directly
if (require.main === module) {
  const task = process.argv.slice(2).join(' ');
  if (task) {
    const result = routeTask(task);
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('Usage: router.js <task description>');
    console.log('\nAvailable agents:', Object.keys(AGENT_CAPABILITIES).join(', '));
  }
}
