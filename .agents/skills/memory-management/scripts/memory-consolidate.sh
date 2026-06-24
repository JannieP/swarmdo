#!/bin/bash
# Memory Management - Consolidate Script
# Optimize and consolidate memory

set -e

echo "Running memory consolidation..."
npx @rufflo/cli hooks worker dispatch --trigger consolidate

echo "Memory consolidation complete"
npx @rufflo/cli memory stats
