#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$HOME/.bun/bin:$PATH"
export ANTHROPIC_API_KEY="xxx"
export ANTHROPIC_BASE_URL=""
exec bun "$SCRIPT_DIR/dist/cli.js" --model claude-sonnet-4-5-20250929 "$@"
