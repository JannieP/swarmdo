import type { RouterExample } from "./routerExamples";

// Examples that showcase Swarmdo MCP capabilities — agents, memory,
// intelligence, dev tools, and the WASM gallery.
export const mcpExamples: RouterExample[] = [
	{
		title: "Spawn a coding swarm",
		prompt:
			"Spawn a hierarchical swarm with 5 agents (architect, coder, tester, reviewer, security-auditor) to refactor a Python CLI tool to TypeScript. Use swarmdo__swarm_init then swarmdo__agent_spawn for each role.",
		followUps: [
			{
				title: "Show progress",
				prompt: "Use swarmdo__progress_summary to show the swarm's current state.",
			},
			{
				title: "Add tests",
				prompt: "Spawn a tester agent to write integration tests for the swarm output.",
			},
		],
	},
	{
		title: "Save & recall memory",
		prompt:
			"Use swarmdo__memory_store to save: namespace='preferences', key='editor_theme', value='solarized-dark'. Then swarmdo__memory_search query='theme' to verify.",
		followUps: [
			{
				title: "List entries",
				prompt: "List all entries in the 'preferences' namespace using swarmdo__memory_list.",
			},
			{
				title: "Semantic search",
				prompt: "Find related memories with swarmvector__hooks_recall query='editor settings'.",
			},
		],
	},
	{
		title: "Route a task",
		prompt:
			"Use swarmvector__hooks_route on the task: 'add OAuth2 to a SvelteKit API'. Tell me which agent type and topology you'd recommend.",
		followUps: [
			{
				title: "Spawn the agent",
				prompt: "Spawn the recommended agent with swarmdo__agent_spawn.",
			},
			{
				title: "Track trajectory",
				prompt: "Begin a trajectory with swarmvector__hooks_trajectory_begin to record the work.",
			},
		],
	},
	{
		title: "Analyze a diff",
		prompt:
			"Use swarmdo__analyze_diff to assess risk and swarmdo__analyze_diff-reviewers to suggest reviewers for the PR at github.com/ruvnet/swarmdo/pull/1687.",
		followUps: [
			{
				title: "Repo metrics",
				prompt: "Get repository metrics with swarmdo__github_repo_analyze for ruvnet/swarmdo.",
			},
			{
				title: "Open issues",
				prompt: "List recent issues with swarmdo__github_issue_track for ruvnet/swarmdo.",
			},
		],
	},
	{
		title: "System health check",
		prompt:
			"Run swarmdo__system_status, swarmdo__performance_metrics, and swarmdo__performance_bottleneck. Summarize anything concerning.",
		followUps: [
			{
				title: "Optimize",
				prompt: "Use swarmdo__performance_optimize on the slowest component identified.",
			},
			{
				title: "Benchmark",
				prompt: "Run swarmdo__performance_benchmark with --suite=all.",
			},
		],
	},
	{
		title: "Browse WASM gallery",
		prompt:
			"Show me the templates in the WASM gallery (browser-side rvagent server) and explain what each one does.",
		followUps: [
			{
				title: "Load a template",
				prompt: "Load the most popular template into the local WASM MCP server.",
			},
		],
	},
	{
		title: "Plan with GOAP",
		prompt:
			"Use the goal-planner pattern: I want to migrate a Postgres schema with zero downtime. Decompose into swarmdo agents and tasks.",
		followUps: [
			{
				title: "Risk analysis",
				prompt: "Run swarmdo__analyze_file-risk on the migration file.",
			},
		],
	},
	{
		title: "Train neural pattern",
		prompt:
			"Use swarmvector__neural_train to learn from this successful pattern: 'JWT auth with refresh tokens — store refresh in httpOnly cookie, access in memory'.",
		followUps: [
			{
				title: "Predict",
				prompt: "Use swarmvector__neural_predict for the task 'add session-based auth'.",
			},
		],
	},
];
