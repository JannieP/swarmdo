#!/bin/bash
# Publish script for @swarmdo/cli
# Publishes to both @swarmdo/cli@alpha AND swarmdo@v3alpha

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(dirname "$SCRIPT_DIR")"

cd "$CLI_DIR"

# Get current version
VERSION=$(node -p "require('./package.json').version")
echo "Publishing version: $VERSION"

# 1. Publish @swarmdo/cli with alpha tag
echo ""
echo "=== Publishing @swarmdo/cli@$VERSION (alpha tag) ==="
npm publish --tag alpha

# 2. Publish to swarmdo with v3alpha tag
echo ""
echo "=== Publishing swarmdo@$VERSION (v3alpha tag) ==="

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy necessary files
cp -r dist bin src package.json README.md "$TEMP_DIR/"

# Change package name to unscoped
cd "$TEMP_DIR"
sed -i 's/"name": "@swarmdo\/cli"/"name": "swarmdo"/' package.json

# Publish with v3alpha tag
npm publish --tag v3alpha

echo ""
echo "=== Updating dist-tags ==="

# Update all tags to point to the new version
npm dist-tag add @swarmdo/cli@$VERSION alpha
npm dist-tag add @swarmdo/cli@$VERSION latest
npm dist-tag add @swarmdo/cli@$VERSION v3alpha
npm dist-tag add swarmdo@$VERSION alpha
npm dist-tag add swarmdo@$VERSION latest
npm dist-tag add swarmdo@$VERSION v3alpha

echo ""
echo "=== Published successfully ==="
echo "  @swarmdo/cli@$VERSION (alpha, latest, v3alpha)"
echo "  swarmdo@$VERSION (alpha, latest, v3alpha)"
echo ""
echo "Install with:"
echo "  npx swarmdo@alpha"
echo "  npx @swarmdo/cli@latest"
