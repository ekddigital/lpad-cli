#!/usr/bin/env bash
# lpad — EKD Digital Launchpad CLI uninstaller

set -uo pipefail

LPAD_INSTALL_DIR="${LPAD_INSTALL_DIR:-$HOME/.local/bin}"
LPAD_BIN="${LPAD_INSTALL_DIR}/lpad"

if [[ -f "$LPAD_BIN" ]]; then
  rm -f "$LPAD_BIN"
  echo "OK: removed $LPAD_BIN"
else
  echo "WARN: binary not found at $LPAD_BIN"
fi

echo "Note: shell rc files are not edited automatically."
