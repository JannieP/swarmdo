#!/bin/bash
# Setup MCP server for Swarmdo

echo "🚀 Setting up Swarmdo MCP server..."

# Check if claude command exists
if ! command -v claude &> /dev/null; then
    echo "❌ Error: Claude Code CLI not found"
    echo "Please install Claude Code first"
    exit 1
fi

# Add MCP server
echo "📦 Adding Swarmdo MCP server..."
claude mcp add swarmdo npx swarmdo mcp start

echo "✅ MCP server setup complete!"
echo "🎯 You can now use mcp__swarmdo__ tools in Claude Code"
