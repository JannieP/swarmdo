#!/bin/bash
# Capture hook guidance for Claude visibility
GUIDANCE_FILE=".swarmdo/last-guidance.txt"
mkdir -p .swarmdo

case "$1" in
  "route")
    echo "" > "$GUIDANCE_FILE"  # deprecated (#138): agentic-flow guidance removed
    ;;
  "pre-edit")
    echo "" > "$GUIDANCE_FILE"  # deprecated (#138): agentic-flow guidance removed
    ;;
esac
