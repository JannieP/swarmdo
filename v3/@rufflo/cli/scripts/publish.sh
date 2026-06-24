#!/bin/bash
# Publish script for @rufflo/cli
# Publishes to both @rufflo/cli@alpha AND rufflo@v3alpha

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(dirname "$SCRIPT_DIR")"

cd "$CLI_DIR"

# Get current version
VERSION=$(node -p "require('./package.json').version")
echo "Publishing version: $VERSION"

# 1. Publish @rufflo/cli with alpha tag
echo ""
echo "=== Publishing @rufflo/cli@$VERSION (alpha tag) ==="
npm publish --tag alpha

# 2. Publish to rufflo with v3alpha tag
echo ""
echo "=== Publishing rufflo@$VERSION (v3alpha tag) ==="

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy necessary files
cp -r dist bin src package.json README.md "$TEMP_DIR/"

# Change package name to unscoped
cd "$TEMP_DIR"
sed -i 's/"name": "@rufflo\/cli"/"name": "rufflo"/' package.json

# Publish with v3alpha tag
npm publish --tag v3alpha

echo ""
echo "=== Updating dist-tags ==="

# Update all tags to point to the new version
npm dist-tag add @rufflo/cli@$VERSION alpha
npm dist-tag add @rufflo/cli@$VERSION latest
npm dist-tag add @rufflo/cli@$VERSION v3alpha
npm dist-tag add rufflo@$VERSION alpha
npm dist-tag add rufflo@$VERSION latest
npm dist-tag add rufflo@$VERSION v3alpha

echo ""
echo "=== Published successfully ==="
echo "  @rufflo/cli@$VERSION (alpha, latest, v3alpha)"
echo "  rufflo@$VERSION (alpha, latest, v3alpha)"
echo ""
echo "Install with:"
echo "  npx rufflo@alpha"
echo "  npx @rufflo/cli@latest"
