#!/bin/bash
set -e
npm install
# Pipe newlines to accept all default prompts (e.g. "add constraint without truncating")
printf '\n\n\n\n\n' | npx drizzle-kit push --force
