#!/usr/bin/env node
/**
 * Swarmdo Hook Handler (Cross-Platform)
 * Dispatches hook events to the appropriate helper modules.
 */

const path = require('path');
const fs = require('fs');

const helpersDir = __dirname;

function safeRequire(modulePath) {
  try {
    if (fs.existsSync(modulePath)) {
      const origLog = console.log;
      const origError = console.error;
      console.log = () => {};
      console.error = () => {};
      try {
        const mod = require(modulePath);
        return mod;
      } finally {
        console.log = origLog;
        console.error = origError;
      }
    }
  } catch (e) {
    // silently fail
  }
  return null;
}

const router = safeRequire(path.join(helpersDir, 'router.cjs'));
const session = safeRequire(path.join(helpersDir, 'session.cjs'));
const memory = safeRequire(path.join(helpersDir, 'memory.cjs'));
const intelligence = safeRequire(path.join(helpersDir, 'intelligence.cjs'));

// ── Intelligence timeout protection (fixes #1530, #1531) ───────────────────
var INTELLIGENCE_TIMEOUT_MS = 3000;
// Race the (possibly-async) work against a real timeout.
//
// The previous implementation called `fn()` and then `clearTimeout(timer)`
// immediately — but if `fn()` returns a *pending* promise (async work), the
// timer was cancelled before the work settled and the promise resolved with the
// still-pending promise, so the timeout protected nothing. This version only
// settles when the work resolves OR the timeout fires, whichever comes first,
// and clears the timer afterwards.
//
// LIMITATION (be honest): a *synchronous* CPU-bound `fn` (e.g. the current
// intelligence.init(), which does blocking fs reads) cannot be interrupted by
// any in-process timer — the event loop is blocked, so the timeout callback
// can't run until `fn` already returned. The real guard for that case lives in
// intelligence.cjs (MAX_DATA_FILE_SIZE / MAX_GRAPH_NODES caps). This util only
// bounds work that yields to the event loop (async I/O, dynamic import, etc.).
function runWithTimeout(fn, label) {
  var timer;
  var timeout = new Promise(function(resolve) {
    timer = setTimeout(function() {
      process.stderr.write("[WARN] " + label + " timed out after " + INTELLIGENCE_TIMEOUT_MS + "ms, skipping\n");
      resolve(null);
    }, INTELLIGENCE_TIMEOUT_MS);
  });
  // Promise.resolve().then(fn) turns a synchronous throw into a rejection so it
  // is handled here rather than escaping the Promise constructor.
  var work = Promise.resolve().then(fn).catch(function() { return null; });
  return Promise.race([work, timeout]).then(function(result) {
    clearTimeout(timer);
    return result;
  });
}


const [,, command, ...args] = process.argv;

// Read stdin — Claude Code sends hook data as JSON via stdin
// Uses a timeout to prevent hanging when stdin is in an ambiguous state
// (not TTY, not a proper pipe) which happens with Claude Code hook invocations.
async function readStdin() {
  if (process.stdin.isTTY) return '';
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => {
      process.stdin.removeAllListeners();
      process.stdin.pause();
      resolve(data);
    }, 500);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { clearTimeout(timer); resolve(data); });
    process.stdin.on('error', () => { clearTimeout(timer); resolve(data); });
    process.stdin.resume();
  });
}

async function main() {
  // Global safety timeout: hooks must NEVER hang (#1530, #1531)
  var safetyTimer = setTimeout(function() {
    process.stderr.write("[WARN] Hook handler global timeout (5s), forcing exit\n");
    process.exit(0);
  }, 5000);
  safetyTimer.unref();

  let stdinData = '';
  try { stdinData = await readStdin(); } catch (e) { /* ignore stdin errors */ }

  let hookInput = {};
  if (stdinData.trim()) {
    try { hookInput = JSON.parse(stdinData); } catch (e) { /* ignore parse errors */ }
  }

  // Merge stdin data into prompt resolution: prefer stdin fields, then env vars.
  // NEVER fall back to argv args — shell glob expansion of braces in bash output
  // creates junk files (#1342). Use env vars or stdin only.
  // Normalize snake_case/camelCase: Claude Code sends tool_input/tool_name (snake_case)
  var toolInput = hookInput.toolInput || hookInput.tool_input || {};
  var toolName = hookInput.toolName || hookInput.tool_name || '';

  // `toolInput` is an object (e.g. {command:"ls"}) — falling back to it
  // directly bound `prompt` to the object and tripped `.toLowerCase()` /
  // `.substring()` on every Bash hook (#1944). Use the `.command` field.
  var prompt = hookInput.prompt || hookInput.command || toolInput.command
    || process.env.PROMPT || process.env.TOOL_INPUT_command || '';

const handlers = {
  'route': () => {
    if (intelligence && intelligence.getContext) {
      try {
        const ctx = intelligence.getContext(prompt);
        if (ctx) console.log(ctx);
      } catch (e) { /* non-fatal */ }
    }
    if (router && router.routeTask) {
      const result = router.routeTask(prompt);
      var output = [];
      output.push('[INFO] Routing task: ' + (prompt.substring(0, 80) || '(no prompt)'));
      output.push('');
      output.push('+------------------- Primary Recommendation -------------------+');
      output.push('| Agent: ' + result.agent.padEnd(53) + '|');
      output.push('| Confidence: ' + (result.confidence * 100).toFixed(1) + '%' + ' '.repeat(44) + '|');
      output.push('| Reason: ' + result.reason.substring(0, 53).padEnd(53) + '|');
      output.push('+--------------------------------------------------------------+');
      console.log(output.join('\n'));
    } else {
      console.log('[INFO] Router not available, using default routing');
    }
    // Agentic prompts → remind the main agent to actually USE Swarmdo: spawn
    // Claude Code agents AND bridge them so Swarmdo tracks the work and
    // auto-forms a swarm. Advisory + fully guarded — never breaks the prompt.
    try {
      if (router && router.classifyAgentic) {
        const intent = router.classifyAgentic(prompt);
        if (intent.requiresAgents) {
          const roles = intent.roles.join(', ');
          console.log('');
          console.log('[SWARMDO] Agentic task — use the swarm: after you spawn Claude Code agents,');
          console.log('  register each so Swarmdo tracks them and auto-forms a swarm from your config:');
          console.log('    swarmdo agent bridge register -n <agent-name> -t <role> -s <session>');
          console.log('  suggested roles: ' + roles + '   ·   then: swarmdo agent bridge list / swarm status');
        }
      }
    } catch (e) { /* advisory only — never break the prompt */ }
  },

  'pre-bash': () => {
    // String() wrap is belt-and-suspenders for #2017: even if a future regression
    // re-binds `prompt` or `hookInput.command` to a non-string, `.toLowerCase()`
    // can no longer throw a TypeError that the global try/catch would swallow.
    var cmd = String(hookInput.command || toolInput.command || prompt || '').toLowerCase();
    var dangerous = ['rm -rf /', 'format c:', 'del /s /q c:\\', ':(){:|:&};:'];
    for (var i = 0; i < dangerous.length; i++) {
      if (cmd.includes(dangerous[i])) {
        console.error('[BLOCKED] Dangerous command detected: ' + dangerous[i]);
        process.exit(1);
      }
    }
    console.log('[OK] Command validated');
  },

  'post-edit': () => {
    if (session && session.metric) {
      try { session.metric('edits'); } catch (e) { /* no active session */ }
    }
    if (intelligence && intelligence.recordEdit) {
      try {
        var file = hookInput.file_path || toolInput.file_path
          || process.env.TOOL_INPUT_file_path || args[0] || '';
        intelligence.recordEdit(file);
      } catch (e) { /* non-fatal */ }
    }
    console.log('[OK] Edit recorded');
  },

  'session-restore': async () => {
    if (session) {
      var existing = session.restore && session.restore();
      if (!existing) {
        session.start && session.start();
      }
    } else {
      console.log('[OK] Session restored: session-' + Date.now());
    }
    // Initialize intelligence (with timeout — #1530)
    if (intelligence && intelligence.init) {
      var initResult = await runWithTimeout(function() { return intelligence.init(); }, 'intelligence.init()');
      if (initResult && initResult.nodes > 0) {
        console.log('[INTELLIGENCE] Loaded ' + initResult.nodes + ' patterns, ' + initResult.edges + ' edges');
      }
    }
  },

  'session-end': async () => {
    // Consolidate intelligence (with timeout — #1530)
    if (intelligence && intelligence.consolidate) {
      var consResult = await runWithTimeout(function() { return intelligence.consolidate(); }, 'intelligence.consolidate()');
      if (consResult && consResult.entries > 0) {
        var msg = '[INTELLIGENCE] Consolidated: ' + consResult.entries + ' entries, ' + consResult.edges + ' edges';
        if (consResult.newEntries > 0) msg += ', ' + consResult.newEntries + ' new';
        msg += ', PageRank recomputed';
        console.log(msg);
      }
    }
    if (session && session.end) {
      session.end();
    } else {
      console.log('[OK] Session ended');
    }
  },

  'pre-task': () => {
    if (session && session.metric) {
      try { session.metric('tasks'); } catch (e) { /* no active session */ }
    }
    if (router && router.routeTask && prompt) {
      var result = router.routeTask(prompt);
      console.log('[INFO] Task routed to: ' + result.agent + ' (confidence: ' + result.confidence + ')');
    } else {
      console.log('[OK] Task started');
    }
  },

  'post-task': () => {
    if (intelligence && intelligence.feedback) {
      try {
        intelligence.feedback(true);
      } catch (e) { /* non-fatal */ }
    }
    console.log('[OK] Task completed');
  },

  'compact-manual': () => {
    console.log('PreCompact Guidance:');
    console.log('IMPORTANT: Review CLAUDE.md in project root for:');
    console.log('   - Available agents and concurrent usage patterns');
    console.log('   - Swarm coordination strategies (hierarchical, mesh, adaptive)');
    console.log('   - Critical concurrent execution rules (1 MESSAGE = ALL OPERATIONS)');
    console.log('Ready for compact operation');
  },

  'compact-auto': () => {
    console.log('Auto-Compact Guidance (Context Window Full):');
    console.log('CRITICAL: Before compacting, ensure you understand:');
    console.log('   - All agents available in .claude/agents/ directory');
    console.log('   - Concurrent execution patterns from CLAUDE.md');
    console.log('   - Swarm coordination strategies for complex tasks');
    console.log('Apply GOLDEN RULE: Always batch operations in single messages');
    console.log('Auto-compact proceeding with full agent context');
  },

  'status': () => {
    console.log('[OK] Status check');
  },

  'stats': () => {
    if (intelligence && intelligence.stats) {
      intelligence.stats(args.includes('--json'));
    } else {
      console.log('[WARN] Intelligence module not available. Run session-restore first.');
    }
  },
};

if (command && handlers[command]) {
    try {
      await Promise.resolve(handlers[command]());
    } catch (e) {
      console.log('[WARN] Hook ' + command + ' encountered an error: ' + e.message);
    }
  } else if (command) {
    console.log('[OK] Hook: ' + command);
  } else {
    console.log('Usage: hook-handler.cjs <route|pre-bash|post-edit|session-restore|session-end|pre-task|post-task|compact-manual|compact-auto|status|stats>');
  }
}

// Only dispatch hooks when run directly (node hook-handler.cjs ...). When
// require()'d by a test, just expose the internals so they can be unit-tested
// without triggering stdin reads / process.exit.
if (require.main === module) {
  main().catch(function(e) {
    console.log('[WARN] Hook handler error: ' + e.message);
  }).finally(function() {
    // Ensure clean exit for Claude Code hooks
    process.exit(0);
  });
}

module.exports = { runWithTimeout: runWithTimeout, INTELLIGENCE_TIMEOUT_MS: INTELLIGENCE_TIMEOUT_MS };
