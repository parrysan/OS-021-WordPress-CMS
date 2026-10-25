#!/usr/bin/env bash
# Agent write path: logged, risky writes wait for human approval, drafts + trash by default.
# See wp_write.py and src/wp/README.md.
set -euo pipefail
command -v python3 >/dev/null || { echo "python3 required" >&2; exit 1; }
exec python3 "$(cd "$(dirname "$0")" && pwd)/wp_write.py" "$@"
