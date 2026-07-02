#!/usr/bin/env node
/**
 * CLI Commands for Background Workers
 * Provides CLI interface for worker management
 */
import { Command } from 'commander';
import { getWorkerDispatchService, getTriggerDetector, getWorkerRegistry, getResourceGovernor, customWorkerManager, formatWorkerInfo, formatPresetList, WORKER_PRESETS, listPhaseExecutors } from '../../workers/index.js';
export function createWorkersCommand() {
    const workers = new Command('workers')
        .description('Background worker management - non-blocking tasks that run silently')
        .addHelpCommand(true) // Enable 'workers help <subcommand>'
        .action(() => {
        // Default action when no subcommand provided - show help
        workers.outputHelp();
    });
    // Dispatch command
    workers
        .command('dispatch <prompt>')
        .description('Detect triggers in prompt and dispatch background workers')
        .option('-s, --session <id>', 'Session ID', `session-${Date.now()}`)
        .option('-j, --json', 'Output as JSON')
        .action(async (prompt, options) => {
        try {
            const dispatcher = getWorkerDispatchService();
            const { triggers, workerIds } = await dispatcher.dispatchFromPrompt(prompt, options.session);
            if (options.json) {
                console.log(JSON.stringify({ triggers, workerIds }, null, 2));
            }
            else {
                if (triggers.length === 0) {
                    console.log('No triggers detected in prompt');
                    return;
                }
                console.log('\n\u26A1 Background Workers Spawned:\n');
                for (let i = 0; i < triggers.length; i++) {
                    const trigger = triggers[i];
                    const workerId = workerIds[i];
                    console.log(`  \u2022 ${trigger.keyword}: ${workerId}`);
                    if (trigger.topic) {
                        console.log(`    Topic: "${trigger.topic}"`);
                    }
                }
                console.log(`\nUse 'workers status' to monitor progress\n`);
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // Dispatch-prompt command (hook-optimized, silent background dispatch)
    workers
        .command('dispatch-prompt <prompt>')
        .description('Dispatch workers from prompt (hook-optimized, silent)')
        .option('-s, --session <id>', 'Session ID', `session-${Date.now()}`)
        .option('-j, --json', 'Output as JSON')
        .action(async (prompt, options) => {
        try {
            const detector = getTriggerDetector();
            // Fast check if any triggers present
            if (!detector.hasTriggers(prompt)) {
                if (options.json) {
                    console.log(JSON.stringify({ dispatched: false, triggers: [], workerIds: [] }));
                }
                return;
            }
            const dispatcher = getWorkerDispatchService();
            const { triggers, workerIds } = await dispatcher.dispatchFromPrompt(prompt, options.session);
            if (options.json) {
                console.log(JSON.stringify({
                    dispatched: workerIds.length > 0,
                    triggers: triggers.map(t => t.keyword),
                    workerIds
                }));
            }
            else if (workerIds.length > 0) {
                // Minimal output for hook context
                console.log(`\u26A1 ${triggers.map(t => t.keyword).join(', ')}`);
            }
        }
        catch {
            // Silent failure for hooks - never block conversation
            if (options.json) {
                console.log(JSON.stringify({ dispatched: false, triggers: [], workerIds: [], error: true }));
            }
        }
    });
    // Status command
    workers
        .command('status [workerId]')
        .description('Get worker status')
        .option('-s, --session <id>', 'Filter by session')
        .option('-a, --active', 'Show only active workers')
        .option('-j, --json', 'Output as JSON')
        .action(async (workerId, options) => {
        try {
            const registry = getWorkerRegistry();
            const governor = getResourceGovernor();
            if (workerId) {
                // Single worker status
                const worker = registry.get(workerId);
                if (!worker) {
                    console.error(`Worker not found: ${workerId}`);
                    process.exit(1);
                }
                if (options.json) {
                    console.log(JSON.stringify(worker, null, 2));
                }
                else {
                    displayWorkerDetails(worker);
                }
            }
            else {
                // All workers status
                const workers = options.active
                    ? registry.getActive(options.session)
                    : registry.getAll({ sessionId: options.session, limit: 20 });
                if (options.json) {
                    console.log(JSON.stringify(workers, null, 2));
                }
                else {
                    displayWorkerDashboard(workers, governor.getStats());
                }
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // Cancel command
    workers
        .command('cancel <workerId>')
        .description('Cancel a running worker')
        .action(async (workerId) => {
        try {
            const dispatcher = getWorkerDispatchService();
            const cancelled = dispatcher.cancel(workerId);
            if (cancelled) {
                console.log(`\u2705 Worker ${workerId} cancelled`);
            }
            else {
                console.log(`\u274C Could not cancel ${workerId} - may not be running`);
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // List triggers command
    workers
        .command('triggers')
        .description('List all available trigger keywords')
        .option('-j, --json', 'Output as JSON')
        .action(async (options) => {
        try {
            const detector = getTriggerDetector();
            const configs = detector.getAllConfigs();
            const stats = detector.getStats();
            if (options.json) {
                const triggers = Array.from(configs.entries()).map(([keyword, config]) => ({
                    keyword,
                    ...config,
                    topicExtractor: config.topicExtractor?.source
                }));
                console.log(JSON.stringify({ triggers, cooldowns: stats.cooldowns }, null, 2));
            }
            else {
                console.log('\n\u26A1 Available Background Worker Triggers:\n');
                console.log('\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510');
                console.log('\u2502 Trigger      \u2502 Priority \u2502 Description                            \u2502');
                console.log('\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524');
                Array.from(configs.entries()).forEach(([keyword, config]) => {
                    const cooldown = stats.cooldowns[keyword];
                    const cooldownStr = cooldown ? ` (${Math.ceil(cooldown / 1000)}s)` : '';
                    console.log(`\u2502 ${keyword.padEnd(12)} \u2502 ${config.priority.padEnd(8)} \u2502 ${config.description.slice(0, 38).padEnd(38)} \u2502`);
                });
                console.log('\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n');
                console.log('Usage: Include trigger word in your prompt');
                console.log('Example: "ultralearn how authentication works"\n');
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // Stats command
    workers
        .command('stats')
        .description('Get worker statistics')
        .option('-t, --timeframe <period>', 'Timeframe: 1h, 24h, 7d', '24h')
        .option('-j, --json', 'Output as JSON')
        .action(async (options) => {
        try {
            const registry = getWorkerRegistry();
            const governor = getResourceGovernor();
            // Get stats with fallbacks for when db isn't available
            let registryStats = { total: 0, byStatus: {}, byTrigger: {}, avgDuration: 0 };
            try {
                registryStats = registry.getStats(options.timeframe) || registryStats;
            }
            catch {
                // Database not available - use defaults
            }
            let resourceStats = { activeWorkers: 0, memoryUsage: { heapUsed: 0 } };
            try {
                resourceStats = governor.getStats() || resourceStats;
            }
            catch {
                // Resource governor not available
            }
            let availability = { usedSlots: 0, totalSlots: 10 };
            try {
                availability = governor.getAvailability() || availability;
            }
            catch {
                // Availability not available
            }
            const stats = {
                ...registryStats,
                resources: resourceStats,
                availability
            };
            if (options.json) {
                console.log(JSON.stringify(stats, null, 2));
            }
            else {
                displayStats(stats, options.timeframe);
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // Results command - view actual analysis data
    workers
        .command('results [workerId]')
        .description('View worker analysis results (files analyzed, patterns found, etc.)')
        .option('-s, --session <id>', 'Filter by session')
        .option('-t, --trigger <type>', 'Filter by trigger type')
        .option('-j, --json', 'Output as JSON')
        .action(async (workerId, options) => {
        try {
            const registry = getWorkerRegistry();
            if (workerId) {
                // Single worker results
                const worker = registry.get(workerId);
                if (!worker) {
                    console.error(`Worker not found: ${workerId}`);
                    process.exit(1);
                }
                if (options.json) {
                    console.log(JSON.stringify({
                        workerId: worker.id,
                        trigger: worker.trigger,
                        topic: worker.topic,
                        status: worker.status,
                        results: worker.results || {}
                    }, null, 2));
                }
                else {
                    displayWorkerResults(worker);
                }
            }
            else {
                // All completed workers with results
                const workers = registry.getAll({
                    sessionId: options.session,
                    status: 'complete',
                    limit: 20
                }).filter(w => w.results && Object.keys(w.results).length > 0);
                if (options.trigger) {
                    const filtered = workers.filter(w => w.trigger === options.trigger);
                    workers.length = 0;
                    workers.push(...filtered);
                }
                if (options.json) {
                    console.log(JSON.stringify(workers.map(w => ({
                        workerId: w.id,
                        trigger: w.trigger,
                        topic: w.topic,
                        results: w.results
                    })), null, 2));
                }
                else {
                    displayResultsSummary(workers);
                }
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // Cleanup command
    workers
        .command('cleanup')
        .description('Cleanup old worker records')
        .option('-a, --age <hours>', 'Max age in hours', '24')
        .action(async (options) => {
        try {
            const registry = getWorkerRegistry();
            const maxAge = parseInt(options.age) * 60 * 60 * 1000;
            const cleaned = registry.cleanup(maxAge);
            console.log(`\u2705 Cleaned up ${cleaned} old worker records`);
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // ============================================================================
    // Custom Worker Commands
    // ============================================================================
    // List presets command
    workers
        .command('presets')
        .description('List available custom worker presets')
        .option('-j, --json', 'Output as JSON')
        .action(async (options) => {
        try {
            if (options.json) {
                console.log(JSON.stringify(WORKER_PRESETS, null, 2));
            }
            else {
                console.log(formatPresetList());
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // List phases command
    workers
        .command('phases')
        .description('List available phase executors for custom workers')
        .option('-j, --json', 'Output as JSON')
        .action(async (options) => {
        try {
            const phases = listPhaseExecutors();
            if (options.json) {
                console.log(JSON.stringify({ phases }, null, 2));
            }
            else {
                console.log('\n\u26A1 Available Phase Executors:\n');
                const categories = {
                    'Discovery': phases.filter(p => p.includes('discovery')),
                    'Analysis': phases.filter(p => p.includes('analysis')),
                    'Pattern': phases.filter(p => p.includes('extraction') || p.includes('detection')),
                    'Build': phases.filter(p => p.includes('graph')),
                    'Learning': phases.filter(p => ['vectorization', 'embedding-generation', 'pattern-storage', 'sona-training'].includes(p)),
                    'Output': phases.filter(p => ['summarization', 'report-generation', 'indexing'].includes(p))
                };
                for (const [category, categoryPhases] of Object.entries(categories)) {
                    if (categoryPhases.length > 0) {
                        console.log(`  ${category}:`);
                        categoryPhases.forEach(p => console.log(`    \u2022 ${p}`));
                    }
                }
                console.log('\nUse these phases in custom worker definitions.\n');
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // Create custom worker from preset
    workers
        .command('create <name>')
        .description('Create a custom worker from a preset')
        .option('-p, --preset <preset>', 'Preset to use', 'quick-scan')
        .option('-t, --triggers <triggers>', 'Comma-separated trigger keywords')
        .option('-d, --description <desc>', 'Worker description')
        .option('-j, --json', 'Output as JSON')
        .action(async (name, options) => {
        try {
            const triggers = options.triggers?.split(',').map(t => t.trim()) || [name];
            const worker = customWorkerManager.registerPreset(options.preset, {
                name,
                triggers,
                description: options.description
            });
            if (options.json) {
                console.log(JSON.stringify({
                    created: true,
                    name: worker.definition.name,
                    preset: options.preset,
                    triggers: [name, ...triggers]
                }, null, 2));
            }
            else {
                console.log(`\n\u2705 Created custom worker: ${name}\n`);
                console.log(formatWorkerInfo(worker));
                console.log(`\nUse trigger "${name}" or any of: ${triggers.join(', ')}\n`);
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // Run custom worker
    workers
        .command('run <nameOrTrigger>')
        .description('Run a custom worker by name or trigger')
        .option('-t, --topic <topic>', 'Topic to analyze')
        .option('-s, --session <id>', 'Session ID', `session-${Date.now()}`)
        .option('-j, --json', 'Output as JSON')
        .action(async (nameOrTrigger, options) => {
        try {
            const worker = customWorkerManager.get(nameOrTrigger);
            if (!worker) {
                // Check if it's a preset
                if (WORKER_PRESETS[nameOrTrigger]) {
                    console.log(`"${nameOrTrigger}" is a preset. Create a worker first:`);
                    console.log(`  workers create my-worker --preset ${nameOrTrigger}`);
                    process.exit(1);
                }
                console.error(`Custom worker not found: ${nameOrTrigger}`);
                console.log('Available workers:', customWorkerManager.list().map(w => w.definition.name).join(', ') || 'none');
                console.log('Available presets:', customWorkerManager.listPresets().join(', '));
                process.exit(1);
            }
            console.log(`\n\u26A1 Running custom worker: ${worker.definition.name}\n`);
            const context = {
                workerId: `custom-${Date.now()}`,
                sessionId: options.session || `session-${Date.now()}`,
                trigger: nameOrTrigger,
                topic: options.topic || null,
                startTime: Date.now(),
                signal: new AbortController().signal,
                onProgress: () => { },
                onMemoryDeposit: () => { }
            };
            const results = await worker.execute(context);
            if (options.json) {
                console.log(JSON.stringify(results, null, 2));
            }
            else {
                console.log(`Status: ${results.success ? '\u2705 Success' : '\u274C Failed'}`);
                console.log(`Files Analyzed: ${results.data.files_analyzed || 0}`);
                console.log(`Patterns Found: ${results.data.patterns_found || 0}`);
                console.log(`Bytes Processed: ${(results.data.bytes_processed / 1024).toFixed(1)} KB`);
                console.log(`Execution Time: ${results.data.executionTimeMs}ms`);
                if (results.data.sample_patterns && Array.isArray(results.data.sample_patterns)) {
                    console.log('\nSample Patterns:');
                    results.data.sample_patterns.slice(0, 5).forEach((p) => {
                        console.log(`  \u2022 ${p.slice(0, 80)}`);
                    });
                }
                if (results.data.errors && Array.isArray(results.data.errors)) {
                    console.log('\nErrors:');
                    results.data.errors.forEach((e) => console.log(`  \u26A0 ${e}`));
                }
                console.log();
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // List custom workers
    workers
        .command('custom')
        .description('List registered custom workers')
        .option('-j, --json', 'Output as JSON')
        .action(async (options) => {
        try {
            const workers = customWorkerManager.list();
            if (options.json) {
                console.log(JSON.stringify(workers.map(w => ({
                    name: w.definition.name,
                    description: w.definition.description,
                    triggers: [w.definition.name, ...(w.definition.triggers || [])],
                    phases: w.definition.phases.map(p => p.type)
                })), null, 2));
            }
            else {
                if (workers.length === 0) {
                    console.log('\nNo custom workers registered.\n');
                    console.log('Create one: workers create my-worker --preset quick-scan');
                    console.log('Load from config: workers load-config ./workers.yaml\n');
                    return;
                }
                console.log(`\n\u26A1 Custom Workers (${workers.length}):\n`);
                for (const worker of workers) {
                    console.log(`  ${worker.definition.name}`);
                    console.log(`    ${worker.definition.description}`);
                    console.log(`    Triggers: ${[worker.definition.name, ...(worker.definition.triggers || [])].join(', ')}`);
                    console.log(`    Phases: ${worker.definition.phases.map(p => p.type).join(' \u2192 ')}`);
                    console.log();
                }
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // Load custom workers from config file
    workers
        .command('load-config [path]')
        .description('Load custom workers from a YAML/JSON config file')
        .option('-j, --json', 'Output as JSON')
        .action(async (configPath, options) => {
        try {
            const count = await customWorkerManager.loadFromConfig(configPath);
            if (options.json) {
                console.log(JSON.stringify({
                    loaded: count,
                    workers: customWorkerManager.list().map(w => w.definition.name)
                }, null, 2));
            }
            else {
                if (count === 0) {
                    console.log('\nNo config file found.');
                    console.log('Expected: workers.yaml, workers.yml, or workers.json');
                    console.log('Or specify path: workers load-config ./my-workers.yaml\n');
                    return;
                }
                console.log(`\n\u2705 Loaded ${count} custom worker(s)\n`);
                customWorkerManager.list().forEach(w => {
                    console.log(`  \u2022 ${w.definition.name}: ${w.definition.description}`);
                });
                console.log();
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // Generate example config
    workers
        .command('init-config')
        .description('Generate an example workers.yaml config file')
        .option('-o, --output <path>', 'Output path', 'workers.yaml')
        .action(async (options) => {
        try {
            const fs = await import('fs/promises');
            const config = customWorkerManager.generateExampleConfig();
            await fs.writeFile(options.output, config);
            console.log(`\n\u2705 Created ${options.output}\n`);
            console.log('Edit the file to customize your workers, then run:');
            console.log(`  workers load-config ${options.output}\n`);
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // Inject context command (for hook usage)
    workers
        .command('inject-context <prompt>')
        .description('Search for relevant background worker results to inject as context')
        .option('-s, --session <id>', 'Session ID')
        .option('-j, --json', 'Output as JSON')
        .action(async (prompt, options) => {
        try {
            // Search completed workers for relevant results
            const registry = getWorkerRegistry();
            const completed = registry.getAll({
                sessionId: options.session,
                status: 'complete',
                limit: 50
            });
            // Simple keyword matching for now
            const keywords = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            const relevant = completed.filter(w => {
                const workerText = `${w.trigger} ${w.topic || ''}`.toLowerCase();
                return keywords.some(kw => workerText.includes(kw));
            });
            if (relevant.length === 0) {
                // No context to inject
                return;
            }
            const context = relevant.slice(0, 3).map(w => ({
                source: 'background-worker',
                type: w.trigger,
                topic: w.topic,
                memoryKeys: w.resultKeys,
                completedAt: w.completedAt
            }));
            if (options.json) {
                console.log(JSON.stringify({ context }, null, 2));
            }
            else {
                console.log('<background-context>');
                console.log(JSON.stringify(context, null, 2));
                console.log('</background-context>');
            }
        }
        catch (error) {
            // Silent failure for hook usage
            if (options.json) {
                console.log(JSON.stringify({ context: [] }));
            }
        }
    });
    // ============================================================================
    // Native RuVector Worker Commands
    // ============================================================================
    // Native worker run command
    workers
        .command('native <type>')
        .description('Run native ruvector worker (security, analysis, learning)')
        .option('-p, --path <dir>', 'Working directory', process.cwd())
        .option('-j, --json', 'Output as JSON')
        .action(async (type, options) => {
        try {
            const { nativeRunner, listNativePhases } = await import('../../workers/ruvector-native-integration.js');
            let result;
            switch (type) {
                case 'security':
                    result = await nativeRunner.runSecurityScan(options.path);
                    break;
                case 'analysis':
                    result = await nativeRunner.runFullAnalysis(options.path);
                    break;
                case 'learning':
                    result = await nativeRunner.runLearning(options.path);
                    break;
                case 'phases':
                    const phases = listNativePhases();
                    if (options.json) {
                        console.log(JSON.stringify({ phases }, null, 2));
                    }
                    else {
                        console.log('\n\u26A1 Native RuVector Phases:\n');
                        phases.forEach(p => console.log(`  \u2022 ${p}`));
                        console.log();
                    }
                    return;
                default:
                    console.error(`Unknown native worker type: ${type}`);
                    console.log('Available: security, analysis, learning, phases');
                    process.exit(1);
            }
            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
            }
            else {
                console.log(`\n\u26A1 Native Worker: ${type}\n`);
                console.log('\u2550'.repeat(50));
                console.log(`Status: ${result.success ? '\u2705 Success' : '\u274C Failed'}`);
                console.log(`Phases: ${result.phases.join(' \u2192 ')}`);
                console.log(`\n\uD83D\uDCCA Metrics:`);
                console.log(`  Files Analyzed:    ${result.metrics.filesAnalyzed}`);
                console.log(`  Patterns Found:    ${result.metrics.patternsFound}`);
                console.log(`  Embeddings:        ${result.metrics.embeddingsGenerated}`);
                console.log(`  Vectors Stored:    ${result.metrics.vectorsStored}`);
                console.log(`  Duration:          ${result.metrics.durationMs}ms`);
                if (result.metrics.onnxLatencyMs) {
                    console.log(`  ONNX Latency:      ${result.metrics.onnxLatencyMs}ms`);
                }
                if (result.metrics.throughputOpsPerSec) {
                    console.log(`  Throughput:        ${result.metrics.throughputOpsPerSec.toFixed(1)} ops/s`);
                }
                // Show security findings if present
                if (result.data['security-scan']?.data?.vulnerabilities) {
                    const vulns = result.data['security-scan'].data.vulnerabilities;
                    const summary = result.data['security-scan'].data.summary;
                    console.log(`\n\uD83D\uDD12 Security Findings:`);
                    console.log(`  High: ${summary?.high || 0} | Medium: ${summary?.medium || 0} | Low: ${summary?.low || 0}`);
                    if (vulns.length > 0) {
                        console.log('\n  Top Issues:');
                        vulns.slice(0, 5).forEach((v) => {
                            console.log(`    \u2022 [${v.severity}] ${v.type} in ${v.file.split('/').pop()}:${v.line}`);
                        });
                    }
                }
                // Show complexity if present
                if (result.data['complexity-analysis']?.data?.topFiles) {
                    const complexity = result.data['complexity-analysis'].data;
                    console.log(`\n\uD83D\uDCC8 Complexity Analysis:`);
                    console.log(`  Avg Complexity: ${complexity.avgComplexity}`);
                    console.log(`  Total Lines:    ${complexity.totalLines}`);
                }
                console.log('\n' + '\u2550'.repeat(50) + '\n');
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // ============================================================================
    // Benchmark and Integration Commands
    // ============================================================================
    // Benchmark command
    workers
        .command('benchmark')
        .description('Run worker system performance benchmarks')
        .option('-t, --type <type>', 'Benchmark type: all, trigger-detection, registry, agent-selection, cache, concurrent, memory-keys', 'all')
        .option('-i, --iterations <count>', 'Number of iterations', '1000')
        .option('-j, --json', 'Output as JSON')
        .action(async (options) => {
        try {
            const { workerBenchmarks } = await import('../../workers/worker-benchmarks.js');
            const iterations = parseInt(options.iterations);
            if (options.type === 'all') {
                const suite = await workerBenchmarks.runFullSuite();
                if (options.json) {
                    console.log(JSON.stringify(suite, null, 2));
                }
            }
            else {
                let result;
                switch (options.type) {
                    case 'trigger-detection':
                        result = await workerBenchmarks.benchmarkTriggerDetection(iterations);
                        break;
                    case 'registry':
                        result = await workerBenchmarks.benchmarkRegistryOperations(Math.min(500, iterations));
                        break;
                    case 'agent-selection':
                        result = await workerBenchmarks.benchmarkAgentSelection(iterations);
                        break;
                    case 'cache':
                        result = await workerBenchmarks.benchmarkModelCache(Math.min(100, iterations));
                        break;
                    case 'concurrent':
                        result = await workerBenchmarks.benchmarkConcurrentWorkers(10);
                        break;
                    case 'memory-keys':
                        result = await workerBenchmarks.benchmarkMemoryKeyGeneration(iterations * 5);
                        break;
                    default:
                        console.error(`Unknown benchmark type: ${options.type}`);
                        process.exit(1);
                }
                if (options.json) {
                    console.log(JSON.stringify(result, null, 2));
                }
                else {
                    const status = result.passed ? '\u2705' : '\u274C';
                    console.log(`\n${status} ${result.name}`);
                    console.log(`   Operation: ${result.operation}`);
                    console.log(`   Count: ${result.count.toLocaleString()}`);
                    console.log(`   Avg: ${result.avgTimeMs.toFixed(3)}ms | p95: ${result.p95Ms.toFixed(3)}ms`);
                    console.log(`   Throughput: ${result.throughput.toFixed(0)} ops/s`);
                    console.log(`   Memory \u0394: ${result.memoryDeltaMB.toFixed(2)}MB\n`);
                }
            }
        }
        catch (error) {
            console.error('Benchmark error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // Integration stats command
    workers
        .command('integration')
        .description('View worker-agent integration statistics')
        .option('-j, --json', 'Output as JSON')
        .action(async (options) => {
        try {
            const { workerAgentIntegration, getIntegrationStats } = await import('../../workers/worker-agent-integration.js');
            const stats = getIntegrationStats();
            const metrics = workerAgentIntegration.getAgentMetrics();
            if (options.json) {
                console.log(JSON.stringify({ stats, agentMetrics: metrics }, null, 2));
            }
            else {
                console.log('\n\u26A1 Worker-Agent Integration Stats\n');
                console.log('\u2550'.repeat(40));
                console.log(`Total Agents:       ${stats.totalAgents}`);
                console.log(`Tracked Agents:     ${stats.trackedAgents}`);
                console.log(`Total Feedback:     ${stats.totalFeedback}`);
                console.log(`Avg Quality Score:  ${stats.avgQualityScore.toFixed(2)}`);
                console.log(`\nModel Cache Stats`);
                console.log('\u2500'.repeat(20));
                console.log(`Hits:     ${stats.modelCacheStats.hits.toLocaleString()}`);
                console.log(`Misses:   ${stats.modelCacheStats.misses.toLocaleString()}`);
                console.log(`Hit Rate: ${stats.modelCacheStats.hitRate}`);
                if (metrics.length > 0) {
                    console.log(`\n\uD83D\uDCCA Agent Performance\n`);
                    for (const m of metrics) {
                        console.log(`  ${m.agentName}:`);
                        console.log(`    Latency: ${m.avgLatencyMs.toFixed(0)}ms (p95: ${m.p95LatencyMs.toFixed(0)}ms)`);
                        console.log(`    Success: ${(m.successRate * 100).toFixed(1)}%`);
                        console.log(`    Quality: ${m.qualityScore.toFixed(2)}`);
                        console.log(`    Count:   ${m.executionCount}`);
                    }
                }
                console.log();
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    // Agent recommendation command
    workers
        .command('agents <trigger>')
        .description('Get recommended agents for a worker trigger')
        .option('-j, --json', 'Output as JSON')
        .action(async (trigger, options) => {
        try {
            const { workerAgentIntegration } = await import('../../workers/worker-agent-integration.js');
            const recommendations = workerAgentIntegration.getRecommendedAgents(trigger);
            const selection = workerAgentIntegration.selectBestAgent(trigger);
            if (options.json) {
                console.log(JSON.stringify({ trigger, recommendations, selection }, null, 2));
            }
            else {
                console.log(`\n\u26A1 Agent Recommendations for "${trigger}"\n`);
                console.log(`Primary Agents:  ${recommendations.primary.join(', ') || 'none'}`);
                console.log(`Fallback Agents: ${recommendations.fallback.join(', ') || 'none'}`);
                console.log(`Pipeline:        ${recommendations.phases.join(' \u2192 ')}`);
                console.log(`Memory Pattern:  ${recommendations.memoryPattern}`);
                console.log(`\n\uD83C\uDFAF Best Selection:`);
                console.log(`  Agent:      ${selection.agent}`);
                console.log(`  Confidence: ${(selection.confidence * 100).toFixed(0)}%`);
                console.log(`  Reason:     ${selection.reasoning}\n`);
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });
    return workers;
}
function displayWorkerDetails(worker) {
    const statusIcon = getStatusIcon(worker.status);
    const duration = worker.completedAt
        ? ((worker.completedAt - worker.startedAt) / 1000).toFixed(1)
        : worker.startedAt
            ? ((Date.now() - worker.startedAt) / 1000).toFixed(1)
            : '0';
    console.log('\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
    console.log(`\u2551 ${statusIcon} Worker: ${worker.id.padEnd(30)} \u2551`);
    console.log('\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563');
    console.log(`\u2551 Trigger: ${worker.trigger.padEnd(31)} \u2551`);
    if (worker.topic) {
        console.log(`\u2551 Topic: ${worker.topic.slice(0, 33).padEnd(33)} \u2551`);
    }
    console.log(`\u2551 Status: ${worker.status.padEnd(32)} \u2551`);
    console.log(`\u2551 Progress: ${worker.progress}%`.padEnd(42) + ' \u2551');
    if (worker.currentPhase) {
        console.log(`\u2551 Phase: ${worker.currentPhase.padEnd(33)} \u2551`);
    }
    console.log(`\u2551 Duration: ${duration}s`.padEnd(42) + ' \u2551');
    console.log(`\u2551 Memory Deposits: ${worker.memoryDeposits}`.padEnd(42) + ' \u2551');
    if (worker.error) {
        console.log(`\u2551 Error: ${worker.error.slice(0, 33).padEnd(33)} \u2551`);
    }
    console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n');
}
function displayWorkerDashboard(workers, resourceStats) {
    console.log('\n\u250C\u2500 Background Workers Dashboard \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510');
    if (workers.length === 0) {
        console.log('\u2502 No workers found                        \u2502');
        console.log('\u2502                                         \u2502');
        console.log('\u2502 Use trigger words in prompts:           \u2502');
        console.log('\u2502   \u2022 ultralearn <topic>                 \u2502');
        console.log('\u2502   \u2022 optimize                           \u2502');
        console.log('\u2502   \u2022 audit <scope>                      \u2502');
        console.log('\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n');
        return;
    }
    for (const worker of workers) {
        const icon = getStatusIcon(worker.status);
        const progress = worker.status === 'running' ? ` (${worker.progress}%)` : '';
        const line = `\u2502 ${icon} ${worker.trigger.padEnd(12)}: ${worker.status}${progress}`;
        console.log(line.padEnd(42) + '\u2502');
        if (worker.currentPhase) {
            console.log(`\u2502   \u2514\u2500 ${worker.currentPhase}`.padEnd(42) + '\u2502');
        }
    }
    console.log('\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524');
    console.log(`\u2502 Active: ${resourceStats.activeWorkers}/${10}`.padEnd(42) + '\u2502');
    console.log(`\u2502 Memory: ${(resourceStats.memoryUsage.heapUsed / 1024 / 1024).toFixed(0)}MB`.padEnd(42) + '\u2502');
    console.log('\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518\n');
}
function displayStats(stats, timeframe) {
    console.log(`\n\u26A1 Worker Statistics (${timeframe})\n`);
    console.log(`Total Workers: ${stats.total ?? 0}`);
    console.log(`Average Duration: ${((stats.avgDuration ?? 0) / 1000).toFixed(1)}s`);
    if (stats.byStatus && Object.keys(stats.byStatus).length > 0) {
        console.log('\nBy Status:');
        for (const [status, count] of Object.entries(stats.byStatus)) {
            if (count > 0) {
                console.log(`  ${getStatusIcon(status)} ${status}: ${count}`);
            }
        }
    }
    if (stats.byTrigger && Object.keys(stats.byTrigger).length > 0) {
        console.log('\nBy Trigger:');
        for (const [trigger, count] of Object.entries(stats.byTrigger)) {
            console.log(`  \u2022 ${trigger}: ${count}`);
        }
    }
    console.log('\nResource Availability:');
    const usedSlots = stats.availability?.usedSlots ?? 0;
    const totalSlots = stats.availability?.totalSlots ?? 10;
    const heapUsed = stats.resources?.memoryUsage?.heapUsed ?? 0;
    console.log(`  Slots: ${usedSlots}/${totalSlots}`);
    console.log(`  Memory: ${(heapUsed / 1024 / 1024).toFixed(0)}MB`);
    console.log();
}
function displayWorkerResults(worker) {
    console.log('\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
    console.log(`\u2551 \uD83D\uDCCA Worker Results: ${worker.trigger.padEnd(27)} \u2551`);
    console.log('\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563');
    if (worker.topic) {
        console.log(`\u2551 Topic: ${worker.topic.slice(0, 40).padEnd(40)} \u2551`);
    }
    const results = worker.results || {};
    if (results.files_analyzed !== undefined) {
        console.log(`\u2551 Files Analyzed: ${String(results.files_analyzed).padEnd(31)} \u2551`);
    }
    if (results.patterns_found !== undefined) {
        console.log(`\u2551 Patterns Found: ${String(results.patterns_found).padEnd(31)} \u2551`);
    }
    if (results.bytes_processed !== undefined) {
        const kb = (results.bytes_processed / 1024).toFixed(1);
        console.log(`\u2551 Bytes Processed: ${(kb + ' KB').padEnd(30)} \u2551`);
    }
    // Show sample patterns if available
    if (results.sample_patterns && Array.isArray(results.sample_patterns) && results.sample_patterns.length > 0) {
        console.log('\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563');
        console.log('\u2551 Sample Patterns:'.padEnd(49) + ' \u2551');
        for (const pattern of results.sample_patterns.slice(0, 3)) {
            const truncated = String(pattern).slice(0, 45);
            console.log(`\u2551   \u2022 ${truncated.padEnd(42)} \u2551`);
        }
    }
    // Show other results
    const otherKeys = Object.keys(results).filter(k => !['files_analyzed', 'patterns_found', 'bytes_processed', 'sample_patterns', 'topic', 'phases'].includes(k));
    if (otherKeys.length > 0) {
        console.log('\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563');
        for (const key of otherKeys.slice(0, 5)) {
            const val = JSON.stringify(results[key]).slice(0, 35);
            console.log(`\u2551 ${key}: ${val.padEnd(45 - key.length)} \u2551`);
        }
    }
    console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D\n');
}
function displayResultsSummary(workers) {
    if (workers.length === 0) {
        console.log('\nNo workers with results found.');
        console.log('Run workers first: agentic-flow workers dispatch "ultralearn authentication"\n');
        return;
    }
    console.log('\n\uD83D\uDCCA Worker Analysis Results\n');
    let totalFiles = 0;
    let totalPatterns = 0;
    let totalBytes = 0;
    for (const worker of workers) {
        const results = worker.results || {};
        const files = results.files_analyzed || 0;
        const patterns = results.patterns_found || 0;
        const bytes = results.bytes_processed || 0;
        totalFiles += files;
        totalPatterns += patterns;
        totalBytes += bytes;
        const topic = worker.topic ? ` "${worker.topic.slice(0, 20)}"` : '';
        console.log(`  \u2022 ${worker.trigger}${topic}:`);
        console.log(`      ${files} files, ${patterns} patterns, ${(bytes / 1024).toFixed(1)} KB`);
    }
    console.log('\n  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
    console.log(`  Total: ${totalFiles} files, ${totalPatterns} patterns, ${(totalBytes / 1024).toFixed(1)} KB\n`);
}
function getStatusIcon(status) {
    switch (status) {
        case 'complete': return '\u2705';
        case 'running': return '\uD83D\uDD04';
        case 'queued': return '\uD83D\uDCA4';
        case 'failed': return '\u274C';
        case 'cancelled': return '\u23F9\uFE0F';
        case 'timeout': return '\u23F1\uFE0F';
        default: return '\u2022';
    }
}
export default createWorkersCommand;
// CLI entry point when run directly
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
    const workers = createWorkersCommand();
    workers.parse(process.argv);
}
//# sourceMappingURL=workers.js.map