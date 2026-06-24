#!/bin/bash
# Setup MCP server for Rufflo

echo "🚀 Setting up Rufflo MCP server..."

# Check if claude command exists
if ! command -v claude &> /dev/null; then
    echo "❌ Error: Claude Code CLI not found"
    echo "Please install Claude Code first"
    exit 1
fi

# Add MCP server
echo "📦 Adding Rufflo MCP server..."
claude mcp add rufflo npx rufflo mcp start

echo "✅ MCP server setup complete!"
echo "🎯 You can now use mcp__rufflo__ tools in Claude Code"
