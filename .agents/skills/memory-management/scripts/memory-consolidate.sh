#!/bin/bash
# Memory Management - Consolidate Script
# Optimize and consolidate memory

set -e

echo "Running memory consolidation..."
npx @swarmdo/cli hooks worker dispatch --trigger consolidate

echo "Memory consolidation complete"
npx @swarmdo/cli memory stats
