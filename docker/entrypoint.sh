#!/bin/sh
# Seed config into SQLite (idempotent), then run the requested rigmy-api command.
# Default command (Dockerfile CMD): serve --host 0.0.0.0
set -e
rigmy-api seed
exec rigmy-api "$@"
